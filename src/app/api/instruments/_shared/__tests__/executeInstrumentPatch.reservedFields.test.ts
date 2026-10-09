/**
 * Reservation identity is server-derived. Clients must not inject
 * reserved_by_user_id / reserved_connection_id onto an instrument they own.
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
const ADMIN_USER_ID = '123e4567-e89b-12d3-a456-426614174001';
const FOREIGN_USER_ID = '223e4567-e89b-12d3-a456-426614174999';
const FOREIGN_CONNECTION_ID = '323e4567-e89b-12d3-a456-426614174888';
const RANDOM_USER_ID = '423e4567-e89b-12d3-a456-426614174777';

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

function makeAuth() {
  const userSupabase = {
    from: jest.fn(),
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  };

  return {
    user: { id: ADMIN_USER_ID },
    accessToken: 'token',
    orgId: 'org-1',
    clientId: null,
    role: 'admin',
    isTestBypass: false,
    userSupabase,
  };
}

describe('executeInstrumentPatch reserved identity boundary', () => {
  beforeEach(() => {
    resetInstrumentApiContractCacheForTests();
  });

  it('rejects a reserved-identity-only patch as having no client-writable fields', async () => {
    const auth = makeAuth();

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        reserved_by_user_id: FOREIGN_USER_ID,
        reserved_connection_id: FOREIGN_CONNECTION_ID,
      },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error: string }).error).toBe(
      'No valid fields to update'
    );
    expect(auth.userSupabase.from).not.toHaveBeenCalled();
  });

  it('does not persist a client-supplied foreign reserved user on an otherwise valid patch', async () => {
    const auth = makeAuth();
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: [baseInstrument({ note: 'kept' })],
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
        note: 'kept',
        reserved_by_user_id: FOREIGN_USER_ID,
        reserved_connection_id: FOREIGN_CONNECTION_ID,
      },
    });

    expect(result.status).toBe(200);
    expect(updateChain.update).toHaveBeenCalledWith({ note: 'kept' });
    const persisted = updateChain.update.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(persisted).not.toHaveProperty('reserved_by_user_id');
    expect(persisted).not.toHaveProperty('reserved_connection_id');
  });

  it('treats a random reserved user id the same as a foreign real user id', async () => {
    const auth = makeAuth();
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: [baseInstrument({ note: 'kept' })],
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
        note: 'kept',
        reserved_by_user_id: RANDOM_USER_ID,
      },
    });

    expect(result.status).toBe(200);
    expect(updateChain.update).toHaveBeenCalledWith({ note: 'kept' });
  });

  it('still records the acting user on a legitimate Available → Reserved transition', async () => {
    const auth = makeAuth();
    const stateQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          status: 'Available',
          reserved_reason: null,
          reserved_by_user_id: null,
          reserved_connection_id: null,
        },
        error: null,
      }),
    };
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: [
          baseInstrument({
            status: 'Reserved',
            reserved_reason: 'Held for client',
            reserved_by_user_id: ADMIN_USER_ID,
          }),
        ],
        error: null,
      }),
    };
    let instrumentCallCount = 0;
    auth.userSupabase.from.mockImplementation(() => {
      instrumentCallCount += 1;
      return instrumentCallCount === 1 ? stateQuery : updateChain;
    });

    const result = await executeInstrumentPatch(auth as never, {
      mode: 'collection',
      instrumentId: INSTRUMENT_ID,
      apiPath: 'InstrumentsAPI',
      body: {
        id: INSTRUMENT_ID,
        updated_at: UPDATED_AT,
        status: 'Reserved',
        reserved_reason: 'Held for client',
        reserved_by_user_id: FOREIGN_USER_ID,
        reserved_connection_id: FOREIGN_CONNECTION_ID,
      },
    });

    expect(result.status).toBe(200);
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'Reserved',
        reserved_reason: 'Held for client',
        reserved_by_user_id: ADMIN_USER_ID,
        reserved_connection_id: null,
      })
    );
  });
});
