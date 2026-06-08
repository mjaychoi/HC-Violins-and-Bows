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
    expect('applyRateLimit' in mod).toBe(true);
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
    });
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
