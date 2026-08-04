import { NextRequest } from 'next/server';
import { PATCH } from '../route';
import {
  assertInstrumentsSchemaReadiness,
  SchemaCheckFailedError,
  SchemaNotReadyError,
} from '@/app/api/_utils/schemaReadiness';

jest.mock('@/app/api/_utils/rateLimit', () => ({
  searchRateLimit: null,
  exportRateLimit: null,
  authRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
}));

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

jest.mock('@/utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logDebug: jest.fn(),
  logPerformance: jest.fn(),
  logApiRequest: jest.fn(),
}));

jest.mock('@/utils/monitoring');

let mockUserSupabase: {
  from: jest.Mock;
  rpc: jest.Mock;
};

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => (request: NextRequest) =>
      handler(request, {
        user: { id: 'user-1' },
        accessToken: 'token',
        orgId: 'test-org',
        clientId: null,
        role: 'admin',
        userSupabase: mockUserSupabase,
        isTestBypass: false,
      }),
  };
});

describe('PATCH /api/instruments/[id] schema readiness', () => {
  const instrumentId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserSupabase = {
      from: jest.fn(),
      rpc: jest.fn(),
    };
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
  });

  it('runs readiness via executeInstrumentPatch and returns 503 on drift', async () => {
    (
      assertInstrumentsSchemaReadiness as jest.MockedFunction<
        typeof assertInstrumentsSchemaReadiness
      >
    ).mockRejectedValueOnce(
      new SchemaNotReadyError(
        ['public.instruments.certificate_name'],
        'InstrumentsByIdAPI'
      )
    );

    const request = new NextRequest(
      `http://localhost/api/instruments/${instrumentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          updated_at: '2026-07-31T00:00:00.000Z',
          note: 'x',
        }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(assertInstrumentsSchemaReadiness).toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(json.error_code).toBe('SCHEMA_OUT_OF_DATE');
    expect(json.retryable).toBe(false);
    expect(mockUserSupabase.from).not.toHaveBeenCalled();
  });

  it('returns SCHEMA_CHECK_FAILED 503 with retryable=true on transient probe failure', async () => {
    (
      assertInstrumentsSchemaReadiness as jest.MockedFunction<
        typeof assertInstrumentsSchemaReadiness
      >
    ).mockRejectedValueOnce(
      new SchemaCheckFailedError(
        [],
        'InstrumentsByIdAPI',
        [],
        'catalog timeout'
      )
    );

    const request = new NextRequest(
      `http://localhost/api/instruments/${instrumentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          updated_at: '2026-07-31T00:00:00.000Z',
          note: 'x',
        }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(assertInstrumentsSchemaReadiness).toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(json.error_code).toBe('SCHEMA_CHECK_FAILED');
    expect(json.retryable).toBe(true);
    expect(mockUserSupabase.from).not.toHaveBeenCalled();
  });
});
