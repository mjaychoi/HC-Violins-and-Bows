import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

function createSlidingWindowRateLimit(
  limit: number,
  window: `${number}${'s' | 'm' | 'h' | 'd'}`
): Ratelimit {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
  });
}

export const authRateLimit = createSlidingWindowRateLimit(5, '1m');
export const exportRateLimit = createSlidingWindowRateLimit(3, '1m');
export const searchRateLimit = createSlidingWindowRateLimit(30, '1m');
