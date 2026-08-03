/**
 * Permanent regression coverage for instrument sale_transition HTTP contract.
 * Covers sell, unsell/refund, fail-closed direct Sold changes, and auth gates.
 */
import { executeInstrumentPatch } from '../executeInstrumentPatch';
import { resetInstrumentApiContractCacheForTests } from '../instrumentApiContract';

jest.mock('@/utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logDebug: jest.fn(),
  logPerformance: jest.fn(),
  logApiRequest: jest.fn(),
}));

jest.mock('@/utils/auditLog', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn((err: unknown) => {
      throw err ?? new Error('supabase error');
    }),
  },
}));

const INSTRUMENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const UPDATED_AT = '2024-01-02T00:00:00Z';
const CLIENT_ID = '123e4567-e89b-12d3-a456-426614174111';

function baseInstrument(overrides: Record<string, unknown> = {}) {
  return {
    id: INSTRUMENT_ID,
    maker: 'Stradivarius',
    type: 'Violin',
    subtype: 'Classical',
    serial_number: 'SN12345',
    year: 1700,
    ownership: null,
    size: null,
    weight: null,
    note: null,
    price: 1500,
    cost_price: null,
    consignment_price: null,
    certificate: false,
    status: 'Available',
    reserved_reason: null,
    reserved_by_user_id: null,
    reserved_connection_id: null,
    org_id: 'org-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
    ...overrides,
  };
}

function instrumentStateRow(
  status: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    status,
    reserved_reason: null,
    reserved_by_user_id: null,
    reserved_connection_id: null,
    ...overrides,
  };
}

function makeAuth(overrides: Record<string, unknown> = {}) {
  const userSupabase = {
    from: jest.fn(),
    rpc: jest.fn(),
  };

  return {
    user: { id: 'admin-user' },
    accessToken: 'token',
    orgId: 'org-1',
    clientId: null,
    role: 'admin',
    isTestBypass: false,
    ...overrides,
    userSupabase:
      (overrides.userSupabase as typeof userSupabase | undefined) ??
      userSupabase,
  };
}

function mockProbeThenSaleRpc(
  auth: ReturnType<typeof makeAuth>,
  rpcResult: Record<string, unknown>
) {
  auth.userSupabase.rpc
    .mockResolvedValueOnce({
      data: null,
      error: { message: 'instrument row not found for probe' },
    })
    .mockResolvedValueOnce({
      data: rpcResult,
      error: null,
    });
}

function mockCurrentInstrumentState(
  auth: ReturnType<typeof makeAuth>,
  status: string
) {
  auth.userSupabase.from.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: instrumentStateRow(status),
      error: null,
    }),
  });
}

describe('executeInstrumentPatch sale_transition contract', () => {
  beforeEach(() => {
    resetInstrumentApiContractCacheForTests();
  });

  it('routes Available → Sold with sale_transition to the atomic RPC', async () => {
    const auth = makeAuth();
    mockCurrentInstrumentState(auth, 'Available');
    mockProbeThenSaleRpc(auth, baseInstrument({ status: 'Sold' }));

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Sold',
        sale_transition: {
          sale_price: 1500,
          sale_date: '2026-08-03',
          client_id: CLIENT_ID,
          sales_note: 'sold',
        },
      },
    });

    expect(result.status).toBe(200);
    expect((result.payload as { data: { status: string } }).data.status).toBe(
      'Sold'
    );
    expect(auth.userSupabase.rpc).toHaveBeenLastCalledWith(
      'update_instrument_sale_transition_atomic',
      expect.objectContaining({
        p_instrument_id: INSTRUMENT_ID,
        p_sale_price: 1500,
        p_sale_date: '2026-08-03',
        p_client_id: CLIENT_ID,
        p_sales_note: 'sold',
        p_expected_updated_at: UPDATED_AT,
        p_patch: expect.objectContaining({ status: 'Sold' }),
      })
    );
  });

  it('routes Sold → Available with sale_transition to the atomic RPC', async () => {
    const auth = makeAuth();
    mockCurrentInstrumentState(auth, 'Sold');
    mockProbeThenSaleRpc(auth, baseInstrument({ status: 'Available' }));

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Available',
        sale_transition: {
          sales_note:
            'Auto-refunded when instrument status changed from Sold to Available',
        },
      },
    });

    expect(result.status).toBe(200);
    expect((result.payload as { data: { status: string } }).data.status).toBe(
      'Available'
    );
    expect(auth.userSupabase.rpc).toHaveBeenLastCalledWith(
      'update_instrument_sale_transition_atomic',
      expect.objectContaining({
        p_instrument_id: INSTRUMENT_ID,
        p_sale_price: null,
        p_sale_date: null,
        p_client_id: null,
        p_sales_note:
          'Auto-refunded when instrument status changed from Sold to Available',
        p_expected_updated_at: UPDATED_AT,
        p_patch: expect.objectContaining({ status: 'Available' }),
      })
    );
  });

  it('routes Sold → Maintenance with sale_transition to the atomic RPC', async () => {
    const auth = makeAuth();
    mockCurrentInstrumentState(auth, 'Sold');
    mockProbeThenSaleRpc(auth, baseInstrument({ status: 'Maintenance' }));

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Maintenance',
        sale_transition: {
          sales_note:
            'Auto-refunded when instrument status changed to Maintenance',
        },
      },
    });

    expect(result.status).toBe(200);
    expect((result.payload as { data: { status: string } }).data.status).toBe(
      'Maintenance'
    );
    expect(auth.userSupabase.rpc).toHaveBeenLastCalledWith(
      'update_instrument_sale_transition_atomic',
      expect.objectContaining({
        p_patch: expect.objectContaining({ status: 'Maintenance' }),
        p_sales_note:
          'Auto-refunded when instrument status changed to Maintenance',
      })
    );
  });

  it('rejects Available → Sold without sale_transition (fail-closed)', async () => {
    const auth = makeAuth();
    mockCurrentInstrumentState(auth, 'Available');

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Sold',
      },
    });

    expect(result.status).toBe(409);
    expect((result.payload as { error: string }).error).toContain(
      'cannot be set to Sold directly'
    );
    expect(auth.userSupabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects Sold → Available without sale_transition (fail-closed)', async () => {
    const auth = makeAuth();
    mockCurrentInstrumentState(auth, 'Sold');

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Available',
      },
    });

    expect(result.status).toBe(409);
    expect((result.payload as { error: string }).error).toBe(
      'Sold instruments cannot be moved to another status.'
    );
    expect(auth.userSupabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects sale_transition with missing status rather than falling back', async () => {
    const auth = makeAuth();

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        note: 'should not reach plain update',
        sale_transition: {
          sales_note: 'incomplete transition',
        },
      },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error: string }).error).toBe(
      'sale_transition requires a status value.'
    );
    expect(auth.userSupabase.rpc).not.toHaveBeenCalled();
    expect(auth.userSupabase.from).not.toHaveBeenCalled();
  });

  it('rejects sale_transition with invalid sale_price', async () => {
    const auth = makeAuth();

    const zeroPrice = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Sold',
        sale_transition: { sale_price: 0 },
      },
    });

    expect(zeroPrice.status).toBe(400);
    expect((zeroPrice.payload as { error: string }).error).toContain(
      'greater than zero'
    );
    expect((zeroPrice.payload as { error_code?: string }).error_code).toBe(
      'SALE_PRICE_MUST_BE_POSITIVE'
    );

    const negativePrice = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Sold',
        sale_transition: { sale_price: -100 },
      },
    });

    expect(negativePrice.status).toBe(400);
    expect((negativePrice.payload as { error_code?: string }).error_code).toBe(
      'SALE_PRICE_MUST_BE_POSITIVE'
    );

    const stringPrice = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Sold',
        sale_transition: { sale_price: '1500' },
      },
    });

    expect(stringPrice.status).toBe(400);
    expect((stringPrice.payload as { error: string }).error).toContain(
      'must be a number'
    );
    expect((stringPrice.payload as { error_code?: string }).error_code).toBe(
      'SALE_PRICE_INVALID_TYPE'
    );
    expect(auth.userSupabase.rpc).not.toHaveBeenCalled();

    const imprecisePrice = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Sold',
        sale_transition: { sale_price: 1500.999 },
      },
    });

    expect(imprecisePrice.status).toBe(400);
    expect((imprecisePrice.payload as { error_code?: string }).error_code).toBe(
      'SALE_PRICE_PRECISION_EXCEEDED'
    );

    const overMaxPrice = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Sold',
        sale_transition: { sale_price: 1_000_000_000.01 },
      },
    });

    expect(overMaxPrice.status).toBe(400);
    expect((overMaxPrice.payload as { error_code?: string }).error_code).toBe(
      'SALE_PRICE_EXCEEDS_MAXIMUM'
    );
  });

  it('rejects sale_transition with invalid client_id', async () => {
    const auth = makeAuth();

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Sold',
        sale_transition: {
          sale_price: 1500,
          client_id: 'not-a-uuid',
        },
      },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error: string }).error).toContain(
      'client_id must be a valid UUID'
    );
    expect(auth.userSupabase.rpc).not.toHaveBeenCalled();
  });

  it('does not create another sale for Sold metadata edits without sale_transition', async () => {
    const auth = makeAuth();
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: [baseInstrument({ status: 'Sold', note: 'cleaned' })],
        error: null,
      }),
    };
    auth.userSupabase.from.mockReturnValue(updateChain);

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        note: 'cleaned',
      },
    });

    expect(result.status).toBe(200);
    expect(updateChain.update).toHaveBeenCalled();
    expect(auth.userSupabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects member role before mutation', async () => {
    const auth = makeAuth({ role: 'member' });

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Available',
        sale_transition: { sales_note: 'refund' },
      },
    });

    expect(result.status).toBe(403);
    expect((result.payload as { error: string }).error).toBe(
      'Admin role required'
    );
    expect(auth.userSupabase.rpc).not.toHaveBeenCalled();
    expect(auth.userSupabase.from).not.toHaveBeenCalled();
  });

  it('rejects missing organization context before mutation', async () => {
    const auth = makeAuth({ orgId: null });

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Available',
        sale_transition: { sales_note: 'refund' },
      },
    });

    expect(result.status).toBe(403);
    expect((result.payload as { error: string }).error).toBe(
      'Organization context required'
    );
    expect(auth.userSupabase.rpc).not.toHaveBeenCalled();
    expect(auth.userSupabase.from).not.toHaveBeenCalled();
  });
});
