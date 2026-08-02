/**
 * @jest-environment node
 */

import { SUPABASE_AUTH_STORAGE_KEY } from '@/lib/supabase-auth-cookie';

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

import { createClient } from '@supabase/supabase-js';
import {
  getAccessTokenFromCookies,
  getMiddlewareCookieAuth,
} from '@/lib/supabase-middleware-auth';

function cookieStore(entries: Array<{ name: string; value: string }>): {
  getAll: () => Array<{ name: string; value: string }>;
} {
  return { getAll: () => entries };
}

describe('supabase-middleware-auth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Isolate from leaked host env. Production code prefers SUPABASE_URL /
    // SUPABASE_ANON_KEY over NEXT_PUBLIC_* equivalents, so both must be set
    // (or cleared) for deterministic assertions.
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
    };
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null when no session cookie is present', async () => {
    await expect(getMiddlewareCookieAuth(cookieStore([]))).resolves.toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('returns null for malformed session cookies without throwing', async () => {
    await expect(
      getMiddlewareCookieAuth(
        cookieStore([{ name: SUPABASE_AUTH_STORAGE_KEY, value: '%7Bnot-json' }])
      )
    ).resolves.toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('reads access tokens from chunked cookies', () => {
    const {
      serializeSupabaseAuthCookieChunks,
    } = require('@/lib/supabase-auth-cookie');
    // Force multi-chunk storage by exceeding the 3500-char chunk size.
    const largeToken = `tok-${'a'.repeat(4000)}`;
    const raw = JSON.stringify({ access_token: largeToken });
    const chunks = serializeSupabaseAuthCookieChunks(raw);
    expect(chunks.length).toBeGreaterThan(1);

    const token = getAccessTokenFromCookies(cookieStore(chunks));
    expect(token).toBe(largeToken);
  });

  it('returns null when getUser rejects an expired/invalid token', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid JWT' },
    });

    const raw = encodeURIComponent(
      JSON.stringify({
        access_token: 'expired-token',
        expires_at: 1,
      })
    );

    await expect(
      getMiddlewareCookieAuth(
        cookieStore([{ name: SUPABASE_AUTH_STORAGE_KEY, value: raw }])
      )
    ).resolves.toBeNull();
  });

  it('returns identity for a valid cookie-backed session', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const raw = encodeURIComponent(
      JSON.stringify({ access_token: 'valid-token' })
    );

    await expect(
      getMiddlewareCookieAuth(
        cookieStore([{ name: SUPABASE_AUTH_STORAGE_KEY, value: raw }])
      )
    ).resolves.toEqual({
      accessToken: 'valid-token',
      userId: 'user-1',
    });

    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
        }),
      })
    );
  });

  it('fails closed when public supabase env is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    const raw = encodeURIComponent(
      JSON.stringify({ access_token: 'valid-token' })
    );

    await expect(
      getMiddlewareCookieAuth(
        cookieStore([{ name: SUPABASE_AUTH_STORAGE_KEY, value: raw }])
      )
    ).resolves.toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
});
