// Required env vars (only needed when rate limiting is active):
//   UPSTASH_REDIS_REST_URL   – Upstash Redis REST endpoint
//   UPSTASH_REDIS_REST_TOKEN – Upstash Redis REST token
//
// Failure-mode contract (do not weaken without an explicit policy change):
//   A. Production + missing Upstash credentials
//      → fail-closed (all requests limited) unless RATE_LIMITING_DISABLED=true
//   B. RATE_LIMITING_DISABLED=true
//      → explicit emergency disable; requests are allowed
//   C. Limiter returns success: false
//      → limited=true, optional retryAfterSeconds from reset timestamp
//   D. limiter.limit() throws (runtime Redis/Upstash exception)
//      → fail-open (request allowed); sanitized error is logged
//   E. Development/test without Upstash
//      → limiters are null; requests are allowed
//
// Production enforcement is distributed via Upstash Redis. Process-local
// Maps/counters are not an authoritative rate-limit backend.
//
// Ordinary production deploys must pass `npm run check:env` so missing
// Upstash configuration fails before a successful build. Do not set
// RATE_LIMITING_DISABLED=true as a substitute for Upstash credentials.

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logError, logWarn } from '@/utils/logger';

// Pre-check env vars so Redis.fromEnv() is never called (and never logs
// its own "Unable to find environment variable" warning) when Upstash is
// not configured.
const hasUpstashEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const rateLimitingDisabled = process.env.RATE_LIMITING_DISABLED === 'true';

// In production without Upstash, fail closed (block all) unless operator
// has explicitly set RATE_LIMITING_DISABLED=true to allow fail-open.
export const RATE_LIMIT_FAIL_CLOSED =
  !hasUpstashEnv &&
  process.env.NODE_ENV === 'production' &&
  !rateLimitingDisabled;

export const RATE_LIMIT_POLICIES = {
  auth: { limit: 5, window: '1m' },
  export: { limit: 3, window: '1m' },
  search: { limit: 30, window: '1m' },
  mutation: { limit: 15, window: '1m' },
  upload: { limit: 8, window: '1m' },
  destructive: { limit: 4, window: '1m' },
} as const;

export const RATE_LIMIT_ROUTE_KEYS = {
  salesExport: 'sales:export',
  clientsList: 'clients:list',
  clientsFilterOptions: 'clients:filter-options',
  clientsAnalytics: 'clients:analytics',
  instrumentsList: 'instruments:list',
  invoicesPdf: 'invoices:pdf',
  connectionsCreate: 'connections:create',
} as const;

let redis: Redis | null = null;
if (hasUpstashEnv) {
  try {
    redis = Redis.fromEnv();
  } catch (err) {
    console.error(
      '[rateLimit] Redis.fromEnv() failed — rate limiting disabled. ' +
        'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
      sanitizeLimiterError(err)
    );
  }
} else if (process.env.NODE_ENV === 'production') {
  if (rateLimitingDisabled) {
    console.warn(
      '[rateLimit] RATE_LIMITING_DISABLED=true — rate limiting explicitly disabled in production.'
    );
  } else {
    console.error(
      '[rateLimit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set in production ' +
        '— all requests will be rate limited (fail-closed). ' +
        'Set RATE_LIMITING_DISABLED=true to allow requests through without rate limiting.'
    );
  }
}

function createSlidingWindowRateLimit(
  limit: number,
  window: `${number}${'s' | 'm' | 'h' | 'd'}`
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
  });
}

export const authRateLimit = createSlidingWindowRateLimit(
  RATE_LIMIT_POLICIES.auth.limit,
  RATE_LIMIT_POLICIES.auth.window
);
export const exportRateLimit = createSlidingWindowRateLimit(
  RATE_LIMIT_POLICIES.export.limit,
  RATE_LIMIT_POLICIES.export.window
);
export const searchRateLimit = createSlidingWindowRateLimit(
  RATE_LIMIT_POLICIES.search.limit,
  RATE_LIMIT_POLICIES.search.window
);
// General write mutations (invoice/sales/maintenance RPC + composite creates)
export const mutationRateLimit = createSlidingWindowRateLimit(
  RATE_LIMIT_POLICIES.mutation.limit,
  RATE_LIMIT_POLICIES.mutation.window
);
// Multipart/file uploads (storage + bytes)
export const uploadRateLimit = createSlidingWindowRateLimit(
  RATE_LIMIT_POLICIES.upload.limit,
  RATE_LIMIT_POLICIES.upload.window
);
// Destructive deletes with storage/DB cleanup
export const destructiveMutationRateLimit = createSlidingWindowRateLimit(
  RATE_LIMIT_POLICIES.destructive.limit,
  RATE_LIMIT_POLICIES.destructive.window
);

export type RateLimitScope = {
  orgId?: string | null;
  userId: string;
  method: string;
  routeKey: string;
  ip?: string | null;
};

export function buildRateLimitKey(scope: RateLimitScope): string {
  if (scope.orgId) {
    return `${scope.orgId}:${scope.userId}:${scope.method}:${scope.routeKey}`;
  }

  if (scope.ip) {
    return `ip:${scope.ip}:${scope.method}:${scope.routeKey}`;
  }

  return `${scope.userId}:${scope.method}:${scope.routeKey}`;
}

/**
 * Trusted-proxy client IP for rate-limit fallback only.
 *
 * Uses the first `x-forwarded-for` hop, matching existing authenticated
 * API routes. Later hops are ignored so a client cannot append a spoofed
 * address and select its own bucket. When organization context is present,
 * `buildRateLimitKey` prefers org/user and this value is unused.
 */
export function extractClientIp(
  headers: { get(name: string): string | null } | null | undefined
): string | undefined {
  const firstHop = headers?.get('x-forwarded-for')?.split(',')[0]?.trim();
  return firstHop || undefined;
}

export type RateLimitDecision = {
  limited: boolean;
  retryAfterSeconds?: number;
};

type RateLimitFailureMode =
  | 'limit_exceeded'
  | 'missing_upstash_fail_closed'
  | 'limiter_disabled'
  | 'limiter_exception_fail_open';

function sanitizeLimiterError(err: unknown): {
  name?: string;
  message: string;
} {
  const name = err instanceof Error ? err.name : undefined;
  const raw = err instanceof Error ? err.message : 'unknown_error';
  const message = raw
    .replace(/https?:\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(
      /(token|password|secret|key|authorization)=[^\s&]+/gi,
      '$1=[redacted]'
    );
  return { name, message };
}

function getLimiterPolicyName(limiter: Ratelimit | null): string {
  if (!limiter) return 'disabled';
  if (limiter === authRateLimit) return 'auth';
  if (limiter === exportRateLimit) return 'export';
  if (limiter === searchRateLimit) return 'search';
  if (limiter === mutationRateLimit) return 'mutation';
  if (limiter === uploadRateLimit) return 'upload';
  if (limiter === destructiveMutationRateLimit) return 'destructive';
  return 'custom';
}

function logRateLimitEvent(params: {
  policy: string;
  routeKey?: string;
  method?: string;
  retryAfterSeconds?: number;
  failureMode: RateLimitFailureMode;
}): void {
  logWarn('Rate limit denied request', 'rateLimit', {
    policy: params.policy,
    routeKey: params.routeKey,
    method: params.method,
    allowed: false,
    retryAfterSeconds: params.retryAfterSeconds ?? null,
    failureMode: params.failureMode,
  });
}

/**
 * Apply a rate limiter to a request identified by `key`.
 * Returns `{ limited: false }` immediately when the limiter is disabled
 * (Redis env vars absent) so callers don't need to null-check — except in
 * production fail-closed mode, which returns `{ limited: true }`.
 * On unexpected errors the request is allowed through and a sanitized
 * error is logged (fail-open). Do not log the Redis key: it contains
 * org/user identifiers.
 */
export async function applyRateLimit(
  limiter: Ratelimit | null,
  key: string
): Promise<RateLimitDecision> {
  if (!limiter) return { limited: RATE_LIMIT_FAIL_CLOSED };
  try {
    const result = await limiter.limit(key);
    if (result.success) {
      return { limited: false };
    }

    const retryAfterSeconds =
      typeof result.reset === 'number'
        ? Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
        : undefined;

    return { limited: true, retryAfterSeconds };
  } catch (err) {
    const sanitized = sanitizeLimiterError(err);
    logError(
      '[rateLimit] limiter.limit() threw unexpectedly — allowing request through',
      sanitized,
      'rateLimit',
      { failureMode: 'limiter_exception_fail_open', policy: 'custom' }
    );
    return { limited: false };
  }
}

export async function applyScopedRateLimit(
  limiter: Ratelimit | null,
  scope: RateLimitScope
): Promise<RateLimitDecision> {
  const decision = await applyRateLimit(limiter, buildRateLimitKey(scope));

  if (decision.limited) {
    logRateLimitEvent({
      policy: getLimiterPolicyName(limiter),
      routeKey: scope.routeKey,
      method: scope.method,
      retryAfterSeconds: decision.retryAfterSeconds,
      failureMode: limiter ? 'limit_exceeded' : 'missing_upstash_fail_closed',
    });
  }

  return decision;
}

export function tooManyRequestsApiResult(): {
  payload: { error: string; success: false };
  status: 429;
} {
  return {
    payload: { error: 'Too many requests', success: false },
    status: 429,
  };
}
