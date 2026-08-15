/**
 * Permanent regression coverage proving PATCH /api/instruments
 * (sale_transition.sale_price) and POST /api/sales (sale_price) both run the
 * same shared validator (src/utils/salePriceRules.ts) for equivalent inputs.
 *
 * Both routes reject invalid input before any Supabase call, so these cases
 * only need minimal auth mocking — no RPC/database mocks required.
 *
 * One deliberate, documented exception is asserted explicitly rather than
 * silently unified: POST /api/sales allows a negative amount to record a
 * standalone refund-style entry (SaleForm.tsx: "Amount (negative for
 * refund)"), while /api/instruments sale_transition.sale_price always means
 * "the amount to sell for" and is always requirePositive. See the comment
 * above parseSalePrice in src/app/api/sales/route.ts.
 */
import { NextRequest } from 'next/server';

jest.mock('@/app/api/_utils/rateLimit', () => ({
  mutationRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  applyScopedRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  tooManyRequestsApiResult: () => ({
    payload: { error: 'Too many requests', success: false },
    status: 429,
  }),
}));

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

jest.mock('@/utils/monitoring', () => ({
  captureException: jest.fn(),
}));

jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn((err: unknown) => {
      throw err ?? new Error('supabase error');
    }),
  },
}));

let mockUserSupabase: { from: jest.Mock; rpc: jest.Mock };
let mockAuthContext: Record<string, unknown>;

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute:
      (handler: (req: unknown, ctx: unknown) => unknown) =>
      async (request: unknown) =>
        handler(request, {
          ...mockAuthContext,
          userSupabase: mockUserSupabase,
        }),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  executeInstrumentPatch,
} = require('../../instruments/_shared/executeInstrumentPatch');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  resetInstrumentApiContractCacheForTests,
} = require('../../instruments/_shared/instrumentApiContract');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST: salesPost } = require('../../sales/route');

beforeEach(() => {
  resetInstrumentApiContractCacheForTests();
});

const INSTRUMENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const UPDATED_AT = '2024-01-02T00:00:00Z';

function fullInstrumentRow(overrides: Record<string, unknown> = {}) {
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
    status: 'Sold',
    reserved_reason: null,
    reserved_by_user_id: null,
    reserved_connection_id: null,
    org_id: 'org-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: UPDATED_AT,
    ...overrides,
  };
}

function makeInstrumentAuth() {
  const rpc = jest.fn();
  const from = jest.fn();

  // Contract probe (always the first RPC call) reports "ok" via a
  // domain/business error, same as isExpectedSaleRpcProbeExecutionError
  // expects; the second call is the real sale-transition RPC.
  rpc
    .mockResolvedValueOnce({
      data: null,
      error: { message: 'instrument row not found for probe' },
    })
    .mockResolvedValueOnce({
      data: fullInstrumentRow(),
      error: null,
    });

  from.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: {
        status: 'Available',
        reserved_reason: null,
        reserved_by_user_id: null,
        reserved_connection_id: null,
      },
      error: null,
    }),
  });

  return {
    user: { id: 'admin-user' },
    accessToken: 'token',
    orgId: 'org-1',
    clientId: null,
    role: 'admin',
    isTestBypass: false,
    userSupabase: { from, rpc },
  };
}

async function callInstruments(
  salePriceValue: unknown
): Promise<{ status: number; errorCode: string | undefined }> {
  const auth = makeInstrumentAuth();
  const result = await executeInstrumentPatch(auth, {
    mode: 'collection',
    instrumentId: INSTRUMENT_ID,
    apiPath: 'InstrumentsAPI',
    body: {
      id: INSTRUMENT_ID,
      updated_at: UPDATED_AT,
      status: 'Sold',
      sale_transition: { sale_price: salePriceValue },
    },
  });

  return {
    status: result.status as number,
    errorCode: (result.payload as { error_code?: string }).error_code,
  };
}

async function callSalesPost(
  salePriceValue: unknown,
  idempotencyKey: string
): Promise<{ status: number; errorCode: string | undefined }> {
  mockAuthContext = {
    user: { id: 'admin-user' },
    orgId: 'org-1',
    role: 'admin',
  };
  mockUserSupabase = { from: jest.fn(), rpc: jest.fn() };

  const request = new NextRequest('http://localhost:3000/api/sales', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      sale_price: salePriceValue,
      sale_date: '2024-01-15',
    }),
  });

  const response = await salesPost(request);
  const body = await response.json();

  return { status: response.status, errorCode: body.error_code };
}

type Case = {
  name: string;
  value: unknown;
  expectRejected: boolean;
  errorCode?: string;
};

// Cases where /api/instruments and /api/sales must behave identically:
// finiteness, type strictness, precision, and the shared maximum are not
// carve-out territory — only sign/zero handling differs (tested separately
// below). `undefined`/`null` are deliberately NOT in this table: POST
// /api/sales always requires a sale_price (a create call always needs one),
// while PATCH /api/instruments' sale_transition.sale_price is contextually
// optional within the broader sale_transition envelope (absent = "this
// transition isn't setting a price," e.g. the unsell/refund direction, where
// the amount is derived server-side from the stored sale, never from this
// field). That is a structural difference in what the field means on each
// endpoint, not a validation-rule divergence — see the dedicated test below.
const SHARED_CASES: Case[] = [
  {
    name: 'empty string',
    value: '',
    expectRejected: true,
    errorCode: 'SALE_PRICE_INVALID_TYPE',
  },
  {
    name: 'whitespace string',
    value: '   ',
    expectRejected: true,
    errorCode: 'SALE_PRICE_INVALID_TYPE',
  },
  {
    name: 'numeric string "12.34"',
    value: '12.34',
    expectRejected: true,
    errorCode: 'SALE_PRICE_INVALID_TYPE',
  },
  {
    name: 'numeric string with surrounding whitespace',
    value: '  12.34  ',
    expectRejected: true,
    errorCode: 'SALE_PRICE_INVALID_TYPE',
  },
  {
    name: 'boolean',
    value: true,
    expectRejected: true,
    errorCode: 'SALE_PRICE_INVALID_TYPE',
  },
  {
    name: 'array',
    value: [100],
    expectRejected: true,
    errorCode: 'SALE_PRICE_INVALID_TYPE',
  },
  {
    name: 'object',
    value: { amount: 100 },
    expectRejected: true,
    errorCode: 'SALE_PRICE_INVALID_TYPE',
  },
  { name: 'valid integer', value: 100, expectRejected: false },
  { name: 'valid one-decimal value', value: 99.9, expectRejected: false },
  { name: 'valid two-decimal value', value: 99.99, expectRejected: false },
  {
    name: 'three-decimal value (not rounded, rejected)',
    value: 99.999,
    expectRejected: true,
    errorCode: 'SALE_PRICE_PRECISION_EXCEEDED',
  },
  {
    name: 'value below one cent',
    value: 0.001,
    expectRejected: true,
    errorCode: 'SALE_PRICE_PRECISION_EXCEEDED',
  },
  {
    name: 'exponential notation within range',
    value: 1e3,
    expectRejected: false,
  },
  { name: 'maximum value', value: 1_000_000_000, expectRejected: false },
  {
    name: 'maximum plus one cent',
    value: 1_000_000_000.01,
    expectRejected: true,
    errorCode: 'SALE_PRICE_EXCEEDS_MAXIMUM',
  },
  {
    name: 'value unsafe at cent precision',
    value: 1e16,
    expectRejected: true,
    errorCode: 'SALE_PRICE_OUT_OF_RANGE',
  },
];

describe('sale price API parity — /api/instruments vs /api/sales', () => {
  it.each(SHARED_CASES)(
    '$name: both routes agree ($expectRejected ? "reject" : "accept")',
    async ({ value, expectRejected, errorCode }) => {
      const instrumentsResult = await callInstruments(value);
      const salesResult = await callSalesPost(
        value,
        `parity-${JSON.stringify(value)}-${Math.random()}`
      );

      if (expectRejected) {
        expect(instrumentsResult.status).toBe(400);
        expect(salesResult.status).toBe(400);
        expect(instrumentsResult.errorCode).toBe(errorCode);
        expect(salesResult.errorCode).toBe(errorCode);
      } else {
        expect(instrumentsResult.status).not.toBe(400);
        expect(salesResult.status).not.toBe(400);
      }
    }
  );

  describe('documented structural differences (not unified)', () => {
    it('POST /api/sales requires sale_price; PATCH /api/instruments treats an omitted price as "not setting a price" for this transition', async () => {
      const salesResult = await callSalesPost(undefined, 'parity-omitted');
      expect(salesResult.status).toBe(400);
      expect(salesResult.errorCode).toBe('SALE_PRICE_REQUIRED');

      const salesNullResult = await callSalesPost(null, 'parity-null');
      expect(salesNullResult.status).toBe(400);
      expect(salesNullResult.errorCode).toBe('SALE_PRICE_REQUIRED');

      // On /api/instruments, omitting sale_price is not itself a validation
      // error at this layer — it means the transition (e.g. unselling) does
      // not need one. Whether that is ultimately valid depends on direction,
      // enforced deeper in update_instrument_sale_transition_atomic.
      const instrumentsResult = await callInstruments(undefined);
      expect(instrumentsResult.status).not.toBe(400);
    });

    it('rejects zero on both routes, with different (but both non-positive) error codes', async () => {
      const instrumentsResult = await callInstruments(0);
      const salesResult = await callSalesPost(0, 'parity-zero');

      expect(instrumentsResult.status).toBe(400);
      expect(salesResult.status).toBe(400);
      expect(instrumentsResult.errorCode).toBe('SALE_PRICE_MUST_BE_POSITIVE');
      expect(salesResult.errorCode).toBe('SALE_PRICE_ZERO_NOT_ALLOWED');
    });

    it('rejects negative zero on both routes', async () => {
      const instrumentsResult = await callInstruments(-0);
      const salesResult = await callSalesPost(-0, 'parity-neg-zero');

      expect(instrumentsResult.status).toBe(400);
      expect(salesResult.status).toBe(400);
    });

    it('rejects a negative amount on /api/instruments but accepts it on /api/sales (documented refund-entry carve-out)', async () => {
      const instrumentsResult = await callInstruments(-500);
      expect(instrumentsResult.status).toBe(400);
      expect(instrumentsResult.errorCode).toBe('SALE_PRICE_MUST_BE_POSITIVE');

      mockAuthContext = {
        user: { id: 'admin-user' },
        orgId: 'org-1',
        role: 'admin',
      };
      const mockSale = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: null,
        client_id: null,
        sale_price: -500,
        sale_date: '2024-01-15',
        notes: null,
        created_at: '2024-01-15T10:30:00Z',
      };
      mockUserSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockSale, error: null }),
        }),
        // get_sales_financials() is also called (fetchSaleById) — see
        // 20260814160000_enforce_financial_confidentiality_db_boundary.sql.
        rpc: jest.fn().mockImplementation((fn: string) => {
          if (fn === 'get_sales_financials') {
            return Promise.resolve({
              data: [{ id: mockSale.id, sale_price: mockSale.sale_price }],
              error: null,
            });
          }
          return Promise.resolve({ data: mockSale.id, error: null });
        }),
      };

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'parity-negative-accept' },
        body: JSON.stringify({ sale_price: -500, sale_date: '2024-01-15' }),
      });

      const response = await salesPost(request);
      expect(response.status).toBe(201);
    });
  });
});
