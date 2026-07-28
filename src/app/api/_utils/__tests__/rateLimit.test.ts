// Tests for rateLimit.ts — F3/F8 production-readiness fixes:
//   F8: module must not throw at import when Upstash env vars are absent
//   F3: applyRateLimit helper must return { limited } correctly and fail open

// Mock upstash packages before any imports so the module can load in Jest's
// CommonJS environment without ESM transform issues.
jest.mock('@upstash/redis', () => ({
  Redis: { fromEnv: jest.fn().mockReturnValue({}) },
}));

jest.mock('@upstash/ratelimit', () => {
  const mockLimit = jest.fn().mockResolvedValue({ success: true });
  const MockRatelimit = jest
    .fn()
    .mockImplementation(() => ({ limit: mockLimit }));
  (MockRatelimit as any).slidingWindow = jest.fn().mockReturnValue({});
  return { Ratelimit: MockRatelimit };
});

import { applyRateLimit } from '../rateLimit';
import type { Ratelimit } from '@upstash/ratelimit';

// ── F8: safe import without env vars ─────────────────────────────────────────

describe('rateLimit module (F8)', () => {
  it('loads without throwing when Upstash env vars are absent', () => {
    expect(() => require('../rateLimit')).not.toThrow();
  });

  it('exports authRateLimit, exportRateLimit, searchRateLimit and applyRateLimit', () => {
    const mod = require('../rateLimit');
    expect('authRateLimit' in mod).toBe(true);
    expect('exportRateLimit' in mod).toBe(true);
    expect('searchRateLimit' in mod).toBe(true);
    expect('mutationRateLimit' in mod).toBe(true);
    expect('uploadRateLimit' in mod).toBe(true);
    expect('destructiveMutationRateLimit' in mod).toBe(true);
    expect('applyRateLimit' in mod).toBe(true);
    expect('applyScopedRateLimit' in mod).toBe(true);
    expect('buildRateLimitKey' in mod).toBe(true);
  });
});

// ── F3: applyRateLimit helper ─────────────────────────────────────────────────

describe('applyRateLimit (F3)', () => {
  it('returns { limited: false } when limiter is null (Redis unavailable)', async () => {
    expect(await applyRateLimit(null, 'user-123')).toEqual({ limited: false });
  });

  it('returns { limited: false } when limiter.limit() returns success: true', async () => {
    const mockLimiter = {
      limit: jest.fn().mockResolvedValue({ success: true, remaining: 29 }),
    } as unknown as Ratelimit;

    const result = await applyRateLimit(mockLimiter, 'user-123');
    expect(result).toEqual({ limited: false });
    expect(mockLimiter.limit).toHaveBeenCalledWith('user-123');
  });

  it('returns { limited: true } when limiter.limit() returns success: false', async () => {
    const mockLimiter = {
      limit: jest.fn().mockResolvedValue({ success: false, remaining: 0 }),
    } as unknown as Ratelimit;

    expect(await applyRateLimit(mockLimiter, 'user-123')).toEqual({
      limited: true,
      retryAfterSeconds: undefined,
    });
  });

  it('includes retryAfterSeconds when limiter returns reset timestamp', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const mockLimiter = {
      limit: jest
        .fn()
        .mockResolvedValue({ success: false, remaining: 0, reset: 1_030_000 }),
    } as unknown as Ratelimit;

    expect(await applyRateLimit(mockLimiter, 'user-123')).toEqual({
      limited: true,
      retryAfterSeconds: 30,
    });
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('fails open — returns { limited: false } when limiter.limit() throws', async () => {
    const mockLimiter = {
      limit: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
    } as unknown as Ratelimit;

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const result = await applyRateLimit(mockLimiter, 'user-123');
    consoleSpy.mockRestore();

    expect(result).toEqual({ limited: false });
  });

  it('passes the key argument through to limiter.limit()', async () => {
    const mockLimiter = {
      limit: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as Ratelimit;

    await applyRateLimit(mockLimiter, 'org-abc:user-xyz');
    expect(mockLimiter.limit).toHaveBeenCalledWith('org-abc:user-xyz');
  });
});

describe('buildRateLimitKey and applyScopedRateLimit', () => {
  const { buildRateLimitKey, applyScopedRateLimit } =
    require('../rateLimit') as typeof import('../rateLimit');

  it('builds org-scoped keys with method and route', () => {
    expect(
      buildRateLimitKey({
        orgId: 'org-a',
        userId: 'user-1',
        method: 'POST',
        routeKey: 'invoices',
      })
    ).toBe('org-a:user-1:POST:invoices');
  });

  it('uses IP fallback only when orgId is absent', () => {
    expect(
      buildRateLimitKey({
        orgId: null,
        userId: 'user-1',
        method: 'POST',
        routeKey: 'invoices',
        ip: '203.0.113.10',
      })
    ).toBe('ip:203.0.113.10:POST:invoices');
  });

  it('keeps different orgs, users, and routes on separate keys', async () => {
    const mockLimiter = {
      limit: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as Ratelimit;

    await applyScopedRateLimit(mockLimiter, {
      orgId: 'org-a',
      userId: 'user-1',
      method: 'POST',
      routeKey: 'sales',
    });
    await applyScopedRateLimit(mockLimiter, {
      orgId: 'org-b',
      userId: 'user-1',
      method: 'POST',
      routeKey: 'sales',
    });
    await applyScopedRateLimit(mockLimiter, {
      orgId: 'org-a',
      userId: 'user-2',
      method: 'POST',
      routeKey: 'sales',
    });
    await applyScopedRateLimit(mockLimiter, {
      orgId: 'org-a',
      userId: 'user-1',
      method: 'PATCH',
      routeKey: 'sales',
    });

    expect(mockLimiter.limit).toHaveBeenNthCalledWith(
      1,
      'org-a:user-1:POST:sales'
    );
    expect(mockLimiter.limit).toHaveBeenNthCalledWith(
      2,
      'org-b:user-1:POST:sales'
    );
    expect(mockLimiter.limit).toHaveBeenNthCalledWith(
      3,
      'org-a:user-2:POST:sales'
    );
    expect(mockLimiter.limit).toHaveBeenNthCalledWith(
      4,
      'org-a:user-1:PATCH:sales'
    );
  });
});

// ── Production fail-closed enforcement ───────────────────────────────────────

describe('production fail-closed enforcement', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalDisabled = process.env.RATE_LIMITING_DISABLED;
  const setNodeEnv = (value: typeof process.env.NODE_ENV) => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value,
      configurable: true,
      writable: true,
    });
  };

  let consoleSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.RATE_LIMITING_DISABLED;
    jest.resetModules();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    warnSpy.mockRestore();
    setNodeEnv(originalNodeEnv);
    if (originalUpstashUrl !== undefined) {
      process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl;
    } else {
      delete process.env.UPSTASH_REDIS_REST_URL;
    }
    if (originalUpstashToken !== undefined) {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken;
    } else {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
    if (originalDisabled !== undefined) {
      process.env.RATE_LIMITING_DISABLED = originalDisabled;
    } else {
      delete process.env.RATE_LIMITING_DISABLED;
    }
    jest.resetModules();
  });

  it('dev/test env without Upstash: RATE_LIMIT_FAIL_CLOSED is false, null limiter allows through', async () => {
    // NODE_ENV stays 'test'; no Upstash vars
    jest.resetModules();
    const mod = require('../rateLimit');
    expect(mod.RATE_LIMIT_FAIL_CLOSED).toBe(false);
    expect(await mod.applyRateLimit(null, 'user-123')).toEqual({
      limited: false,
    });
  });

  it('production without Upstash and no opt-out: RATE_LIMIT_FAIL_CLOSED is true, null limiter blocks', async () => {
    setNodeEnv('production');
    jest.resetModules();
    const mod = require('../rateLimit');
    expect(mod.RATE_LIMIT_FAIL_CLOSED).toBe(true);
    expect(await mod.applyRateLimit(null, 'user-123')).toEqual({
      limited: true,
    });
  });

  it('production with RATE_LIMITING_DISABLED=true: RATE_LIMIT_FAIL_CLOSED is false, null limiter allows through', async () => {
    setNodeEnv('production');
    process.env.RATE_LIMITING_DISABLED = 'true';
    jest.resetModules();
    const mod = require('../rateLimit');
    expect(mod.RATE_LIMIT_FAIL_CLOSED).toBe(false);
    expect(await mod.applyRateLimit(null, 'user-123')).toEqual({
      limited: false,
    });
  });

  it('production with Upstash configured: RATE_LIMIT_FAIL_CLOSED is false, limiters are non-null', () => {
    setNodeEnv('production');
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    jest.resetModules();
    const mod = require('../rateLimit');
    expect(mod.RATE_LIMIT_FAIL_CLOSED).toBe(false);
    expect(mod.authRateLimit).not.toBeNull();
    expect(mod.exportRateLimit).not.toBeNull();
    expect(mod.searchRateLimit).not.toBeNull();
  });
});
