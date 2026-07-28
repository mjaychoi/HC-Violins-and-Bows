import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { assertClientBelongsToOrg } from '../clientScope';

jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn((error: unknown) => {
      throw error;
    }),
  },
}));

function createAuth(supabase: unknown): AuthContext {
  return {
    user: { id: 'user-a' } as AuthContext['user'],
    accessToken: 'token',
    orgId: 'org-a',
    role: 'admin',
    userSupabase: supabase as AuthContext['userSupabase'],
    isTestBypass: true,
  };
}

describe('assertClientBelongsToOrg', () => {
  it('allows null client_id', async () => {
    const auth = createAuth({});
    await expect(
      assertClientBelongsToOrg(auth, 'org-a', null)
    ).resolves.toEqual({ ok: true });
  });

  it('rejects invalid UUID format with 400', async () => {
    const auth = createAuth({});
    await expect(
      assertClientBelongsToOrg(auth, 'org-a', 'not-a-uuid')
    ).resolves.toEqual({
      ok: false,
      error: 'Invalid client_id format',
      status: 400,
    });
  });

  it('returns generic not-found for foreign-org client without leaking existence', async () => {
    const foreignClientId = '123e4567-e89b-12d3-a456-426614174099';
    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    const auth = createAuth(supabase);
    const result = await assertClientBelongsToOrg(
      auth,
      'org-a',
      foreignClientId
    );

    expect(result).toEqual({
      ok: false,
      error: 'Client not found in organization',
      status: 400,
    });
    expect(JSON.stringify(result)).not.toContain('org-b');
  });

  it('accepts same-org client', async () => {
    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: '123e4567-e89b-12d3-a456-426614174001' },
          error: null,
        }),
      })),
    };

    const auth = createAuth(supabase);
    await expect(
      assertClientBelongsToOrg(
        auth,
        'org-a',
        '123e4567-e89b-12d3-a456-426614174001'
      )
    ).resolves.toEqual({ ok: true });
  });
});
