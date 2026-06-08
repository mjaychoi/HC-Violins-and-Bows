// Required env vars (only needed when rate limiting is active):
//   UPSTASH_REDIS_REST_URL   – Upstash Redis REST endpoint
//   UPSTASH_REDIS_REST_TOKEN – Upstash Redis REST token
//
// When either var is absent the module loads successfully and all limiters
// are disabled (every applyRateLimit call returns { limited: false }).

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let redis: Redis | null = null;
try {
  redis = Redis.fromEnv();
} catch {
  // Intentionally silent at module load — missing env vars in non-production
  // environments (local dev, test) are expected. Routes will pass through.
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[rateLimit] Redis.fromEnv() failed — rate limiting disabled. ' +
        'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.'
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
  if (!limiter) return { limited: false };
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
