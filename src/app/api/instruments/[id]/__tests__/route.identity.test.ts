import { NextRequest } from 'next/server';
import { PATCH } from '../route';
import { errorHandler } from '@/utils/errorHandler';
import { INSTRUMENT_IDENTITY_ERROR } from '@/utils/identityValidation';
import { resetInstrumentApiContractCacheForTests } from '@/app/api/instruments/_shared/instrumentApiContract';
import { assertInstrumentsSchemaReadiness } from '@/app/api/_utils/schemaReadiness';

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger', () => {
  const actual =
    jest.requireActual<typeof import('@/utils/logger')>('@/utils/logger');
  return {
    ...actual,
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
    logDebug: jest.fn(),
    logPerformance: jest.fn(),
    logApiRequest: jest.fn(),
  };
});

jest.mock('@/app/api/_utils/schemaReadiness', () => {
  const actual = jest.requireActual('@/app/api/_utils/schemaReadiness');
  return {
    ...actual,
    assertInstrumentsSchemaReadiness: jest.fn().mockResolvedValue({
      ready: true,
      checkedAt: '2026-07-31T00:00:00.000Z',
      missingColumns: [],
      missingContracts: [],
    }),
  };
});

const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;
let mockUserSupabase: {
  from: jest.Mock;
};
let mockAuthContext: Record<string, unknown>;

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => (request: NextRequest) =>
      handler(request, {
        ...mockAuthContext,
        userSupabase: mockUserSupabase,
      }),
  };
});

jest.mock('@/utils/inputValidation', () => ({
  validateUUID: jest.fn(value =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  ),
}));

/**
 * Identity final-state regression coverage for PATCH.
 * Uses real typeGuards normalization + assertResultingInstrumentIdentity;
 * only the Supabase query chain is mocked.
 */
describe('/api/instruments/[id] PATCH identity final-state', () => {
  const instrumentId = '123e4567-e89b-12d3-a456-426614174000';
  const updatedAt = '2024-01-02T00:00:00Z';

  let identityRow: { maker: string | null; type: string | null };
  let updatedInstrument: Record<string, unknown>;
  let identityQuery: {
    select: jest.Mock;
    eq: jest.Mock;
    single: jest.Mock;
  };
  let updateQuery: {
    update: jest.Mock;
    eq: jest.Mock;
    select: jest.Mock;
  };

  function buildInstrument(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      id: instrumentId,
      maker: 'Maker A',
      type: 'Violin',
      subtype: null,
      year: 2018,
      certificate: false,
      has_certificate: false,
      certificate_name: null,
      size: null,
      weight: null,
      price: 1000,
      cost_price: null,
      consignment_price: null,
      ownership: null,
      note: null,
      serial_number: 'V-100',
      status: 'Available',
      reserved_reason: null,
      reserved_by_user_id: null,
      reserved_connection_id: null,
      org_id: 'test-org',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: updatedAt,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    resetInstrumentApiContractCacheForTests();
    (
      assertInstrumentsSchemaReadiness as jest.MockedFunction<
        typeof assertInstrumentsSchemaReadiness
      >
    ).mockResolvedValue({
      ready: true,
      checkedAt: '2026-07-31T00:00:00.000Z',
      missingColumns: [],
      missingContracts: [],
    });

    identityRow = { maker: 'Maker A', type: 'Violin' };
    updatedInstrument = buildInstrument();

    identityQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockImplementation(async () => ({
        data: { ...identityRow },
        error: null,
      })),
    };

    updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockImplementation(async () => ({
        data: [{ ...updatedInstrument }],
        error: null,
      })),
    };

    mockUserSupabase = {
      from: jest.fn((table: string) => {
        if (table !== 'instruments') {
          throw new Error(`Unexpected table: ${table}`);
        }
        // First chain is identity select; subsequent chains are updates.
        // Detect by whether `.update` was requested via the returned object
        // shape: callers use either select→eq→single or update→eq→select.
        return {
          select: (...args: unknown[]) => {
            identityQuery.select(...args);
            return identityQuery;
          },
          update: (...args: unknown[]) => {
            updateQuery.update(...args);
            return updateQuery;
          },
        };
      }),
    };

    mockAuthContext = {
      user: { id: 'test-user' },
      accessToken: 'test-token',
      orgId: 'test-org',
      clientId: 'test-client',
      role: 'admin',
      userSupabase: mockUserSupabase,
      isTestBypass: false,
    };

    mockErrorHandler.handleSupabaseError = jest
      .fn()
      .mockImplementation((error: { message?: string } | null | undefined) => {
        return new Error(error?.message || 'Database error');
      });
  });

  async function patchBody(body: Record<string, unknown>) {
    const request = new NextRequest(
      `http://localhost/api/instruments/${instrumentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ ...body, updated_at: updatedAt }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();
    return { response, json };
  }

  it('allows clearing maker when existing type remains', async () => {
    identityRow = { maker: 'Maker A', type: 'Violin' };
    updatedInstrument = buildInstrument({ maker: null, type: 'Violin' });

    const { response, json } = await patchBody({ maker: null });

    expect(response.status).toBe(200);
    expect(json.data.maker).toBeNull();
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ maker: null })
    );
  });

  it('allows clearing type when existing maker remains', async () => {
    identityRow = { maker: 'Maker A', type: 'Violin' };
    updatedInstrument = buildInstrument({ maker: 'Maker A', type: null });

    const { response, json } = await patchBody({ type: null });

    expect(response.status).toBe(200);
    expect(json.data.type).toBeNull();
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ type: null })
    );
  });

  it('rejects clearing both maker and type in one PATCH', async () => {
    identityRow = { maker: 'Maker A', type: 'Violin' };

    const { response, json } = await patchBody({
      maker: null,
      type: null,
    });

    expect(response.status).toBe(400);
    expect(String(json.message || json.error)).toContain(
      INSTRUMENT_IDENTITY_ERROR
    );
    expect(updateQuery.update).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only maker when existing type is empty', async () => {
    identityRow = { maker: 'Maker A', type: null };

    const { response, json } = await patchBody({ maker: '   ' });

    expect(response.status).toBe(400);
    expect(String(json.message || json.error)).toContain(
      INSTRUMENT_IDENTITY_ERROR
    );
    expect(updateQuery.update).not.toHaveBeenCalled();
  });

  it('allows unrelated field patch while identity remains valid', async () => {
    identityRow = { maker: 'Maker A', type: 'Violin' };
    updatedInstrument = buildInstrument({ note: 'Shelf B' });

    const { response, json } = await patchBody({ note: 'Shelf B' });

    expect(response.status).toBe(200);
    expect(json.data.note).toBe('Shelf B');
    // Unrelated patches skip the identity select.
    expect(identityQuery.single).not.toHaveBeenCalled();
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'Shelf B' })
    );
  });

  it('rejects sequential PATCH that would remove the last identity field', async () => {
    identityRow = { maker: 'Maker A', type: 'Violin' };
    updatedInstrument = buildInstrument({ maker: null, type: 'Violin' });

    const first = await patchBody({ maker: null });
    expect(first.response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledTimes(1);

    // Persist resulting identity for the next request.
    identityRow = { maker: null, type: 'Violin' };
    updateQuery.update.mockClear();

    const second = await patchBody({ type: null });
    expect(second.response.status).toBe(400);
    expect(String(second.json.message || second.json.error)).toContain(
      INSTRUMENT_IDENTITY_ERROR
    );
    expect(updateQuery.update).not.toHaveBeenCalled();
  });
});
