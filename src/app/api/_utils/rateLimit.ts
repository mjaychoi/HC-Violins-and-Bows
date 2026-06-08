// Required env vars (only needed when rate limiting is active):
//   UPSTASH_REDIS_REST_URL   – Upstash Redis REST endpoint
//   UPSTASH_REDIS_REST_TOKEN – Upstash Redis REST token
//
// When either var is absent the module loads successfully and all limiters
// are disabled.  In production, missing Upstash config causes fail-closed
// behavior (all requests are rate-limited) unless RATE_LIMITING_DISABLED=true
// is set to explicitly opt out.

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

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

let redis: Redis | null = null;
if (hasUpstashEnv) {
  try {
    redis = Redis.fromEnv();
  } catch (err) {
    console.error(
      '[rateLimit] Redis.fromEnv() failed — rate limiting disabled. ' +
        'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
      err
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

export const authRateLimit = createSlidingWindowRateLimit(5, '1m');
export const exportRateLimit = createSlidingWindowRateLimit(3, '1m');
export const searchRateLimit = createSlidingWindowRateLimit(30, '1m');

/**
 * Apply a rate limiter to a request identified by `key`.
 * Returns `{ limited: false }` immediately when the limiter is disabled
 * (Redis env vars absent) so callers don't need to null-check.
 * On unexpected errors the request is allowed through and the error is logged.
 */
export async function applyRateLimit(
  limiter: Ratelimit | null,
  key: string
): Promise<{ limited: boolean }> {
  if (!limiter) return { limited: RATE_LIMIT_FAIL_CLOSED };
  try {
    const { success } = await limiter.limit(key);
    return { limited: !success };
  } catch (err) {
    console.error(
      '[rateLimit] limiter.limit() threw unexpectedly — allowing request through',
      err
    );
    return { limited: false };
  }
}
