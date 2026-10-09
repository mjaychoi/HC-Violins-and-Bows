import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { assertInvoiceItemInstrumentsBelongToOrg } from '../instrumentScope';

jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn((error: unknown) => {
      throw error;
    }),
  },
}));

const SAME_ORG_INSTRUMENT = '123e4567-e89b-12d3-a456-426614174001';
const FOREIGN_INSTRUMENT = '123e4567-e89b-12d3-a456-426614174099';
const RANDOM_INSTRUMENT = '223e4567-e89b-12d3-a456-426614174088';

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

function item(instrumentId: string) {
  return {
    instrument_id: instrumentId,
    description: 'Violin',
    qty: 1,
    rate: 1500,
    amount: 1500,
    image_url: null,
    display_order: 0,
  };
}

function instrumentLookup(foundIds: string[]) {
  return {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: foundIds.map(id => ({ id })),
        error: null,
      }),
    })),
  };
}

describe('assertInvoiceItemInstrumentsBelongToOrg', () => {
  it('allows missing or empty items', async () => {
    const auth = createAuth({});
    await expect(
      assertInvoiceItemInstrumentsBelongToOrg(auth, 'org-a', undefined)
    ).resolves.toEqual({ ok: true });
    await expect(
      assertInvoiceItemInstrumentsBelongToOrg(auth, 'org-a', [])
    ).resolves.toEqual({ ok: true });
  });

  it('rejects invalid UUID format with 400', async () => {
    const auth = createAuth({});
    await expect(
      assertInvoiceItemInstrumentsBelongToOrg(auth, 'org-a', [
        item('not-a-uuid'),
      ])
    ).resolves.toEqual({
      ok: false,
      error: 'Invoice items contain invalid instrument_id values',
      status: 400,
    });
  });

  it('returns the same 400 for a foreign-org instrument and a random id', async () => {
    const supabase = instrumentLookup([]);
    const auth = createAuth(supabase);
    const foreign = await assertInvoiceItemInstrumentsBelongToOrg(
      auth,
      'org-a',
      [item(FOREIGN_INSTRUMENT)]
    );
    const random = await assertInvoiceItemInstrumentsBelongToOrg(
      auth,
      'org-a',
      [item(RANDOM_INSTRUMENT)]
    );

    expect(foreign).toEqual({
      ok: false,
      error:
        'One or more invoice item instruments were not found in organization',
      status: 400,
    });
    expect(random).toEqual(foreign);
    expect(JSON.stringify(foreign)).not.toContain('org-b');
  });

  it('accepts same-org instruments', async () => {
    const supabase = instrumentLookup([SAME_ORG_INSTRUMENT]);
    const auth = createAuth(supabase);
    await expect(
      assertInvoiceItemInstrumentsBelongToOrg(auth, 'org-a', [
        item(SAME_ORG_INSTRUMENT),
      ])
    ).resolves.toEqual({ ok: true });
  });
});
