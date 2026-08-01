/**
 * F2 / F3 API contract regression tests for POST /api/invoices.
 *
 * F2: the database now rejects arithmetically inconsistent invoices inside the
 * RPC transaction. This file proves the route translates those violations into
 * stable machine-readable responses instead of leaking PostgreSQL text or
 * returning a 500.
 *
 * F3: creating an invoice directly as paid / overdue / cancelled is rejected
 * before the RPC is ever called.
 */

import { NextRequest } from 'next/server';

/* eslint-disable @typescript-eslint/no-explicit-any */
let mockUserSupabase: any;

jest.mock('@/utils/auditLog', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/app/api/_utils/rateLimit', () => ({
  searchRateLimit: null,
  exportRateLimit: null,
  authRateLimit: null,
  mutationRateLimit: null,
  uploadRateLimit: null,
  destructiveMutationRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  applyScopedRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  tooManyRequestsApiResult: () => ({
    payload: { error: 'Too many requests', success: false },
    status: 429,
  }),
}));

jest.mock('@/app/api/_utils/withSentryRoute', () => ({
  withSentryRoute: (fn: unknown) => fn,
}));

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => async (request: any, context?: any) =>
      handler(
        request,
        {
          user: { id: 'test-user' },
          accessToken: 'test-token',
          orgId: 'test-org',
          clientId: 'test-client',
          role: 'admin',
          userSupabase: mockUserSupabase,
          isTestBypass: true,
        },
        context
      ),
  };
});

jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  assertInvoiceSchemaReadiness: jest.fn().mockResolvedValue({
    ready: true,
    checkedAt: '2026-08-01T00:00:00.000Z',
    missingColumns: [],
  }),
}));
jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn((error: unknown) => error),
    createError: jest.fn(
      (_code: string, message: string) => new Error(message)
    ),
  },
}));
jest.mock('../imageUrls', () => ({
  attachSignedUrlsToInvoice: jest.fn(
    async (_supabase: unknown, invoice: unknown) => invoice
  ),
}));
jest.mock('../imageUploadTracking', () => ({
  claimInvoiceImageUploads: jest.fn(async () => ({
    status: 'claimed',
    requestedCount: 0,
    claimedCount: 0,
    missingCount: 0,
    missingPaths: [],
  })),
}));
jest.mock('@/utils/invoiceNormalize', () => ({
  normalizeInvoiceRecord: jest.fn((value: unknown) => ({ normalized: value })),
}));
// Real create/partial validation is kept (F3 relies on it); only the readback
// validator is stubbed so these tests focus on the mutation contract.
jest.mock('@/utils/typeGuards', () => {
  const actual = jest.requireActual('@/utils/typeGuards');
  return {
    ...actual,
    validateInvoice: jest.fn((value: unknown) => ({
      success: true,
      data: value,
    })),
  };
});

const CLIENT_ID = '123e4567-e89b-12d3-a456-426614174001';

/**
 * Non-round cent-level fixture shared with the SQL regression tests:
 * qty 3 x rate 19.99 = 59.97, tax 4.95, total 64.92.
 */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    client_id: CLIENT_ID,
    invoice_date: '2026-08-01',
    due_date: null,
    subtotal: 59.97,
    tax: 4.95,
    total: 64.92,
    currency: 'USD',
    notes: null,
    items: [
      {
        instrument_id: null,
        description: 'Bow rehair',
        qty: 3,
        rate: 19.99,
        amount: 59.97,
        image_url: null,
        display_order: 0,
      },
    ],
    ...overrides,
  };
}

const NEW_INVOICE_ID = '123e4567-e89b-12d3-a456-426614174777';

function makeSupabase(
  rpcResult: { data: unknown; error: unknown } = {
    data: NEW_INVOICE_ID,
    error: null,
  }
) {
  const clientQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: { id: CLIENT_ID },
      error: null,
    }),
  };

  const invoiceReadback = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: {
        id: NEW_INVOICE_ID,
        invoice_number: 'INV-777',
        status: 'draft',
        subtotal: 59.97,
        tax: 4.95,
        total: 64.92,
        currency: 'USD',
        invoice_items: [],
      },
      error: null,
    }),
  };

  return {
    rpc: jest.fn().mockResolvedValue(rpcResult),
    from: jest.fn((table: string) => {
      if (table === 'clients') return clientQuery;
      if (table === 'invoices') return invoiceReadback;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

async function post(body: unknown) {
  const { POST } = await import('../route');

  const request = new NextRequest('http://localhost/api/invoices', {
    method: 'POST',
    headers: { 'Idempotency-Key': `key-${Math.random()}` },
    body: JSON.stringify(body),
  });

  const response = await POST(request);
  return { response, json: await response.json() };
}

describe('POST /api/invoices — F3 initial invoice status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserSupabase = makeSupabase();
  });

  it.each(['paid', 'overdue', 'cancelled'])(
    'rejects create-as-%s with 400 INVALID_INITIAL_INVOICE_STATUS before calling the RPC',
    async status => {
      const { response, json } = await post(validBody({ status }));

      expect(response.status).toBe(400);
      expect(json.error_code).toBe('INVALID_INITIAL_INVOICE_STATUS');
      expect(json.success).toBe(false);
      // The rejection happens in the API layer, so no invoice is ever attempted.
      expect(mockUserSupabase.rpc).not.toHaveBeenCalled();
    }
  );

  it('allows draft', async () => {
    mockUserSupabase = makeSupabase();
    const { response } = await post(validBody({ status: 'draft' }));

    expect(response.status).toBe(201);
    expect(mockUserSupabase.rpc).toHaveBeenCalledWith(
      'create_invoice_atomic_idempotent',
      expect.objectContaining({
        p_invoice: expect.objectContaining({ status: 'draft' }),
      })
    );
  });

  it('allows sent (the shipped create-and-send flow)', async () => {
    mockUserSupabase = makeSupabase();
    const { response } = await post(validBody({ status: 'sent' }));

    expect(response.status).toBe(201);
    expect(mockUserSupabase.rpc).toHaveBeenCalledWith(
      'create_invoice_atomic_idempotent',
      expect.objectContaining({
        p_invoice: expect.objectContaining({ status: 'sent' }),
      })
    );
  });

  it('normalizes a missing status to draft', async () => {
    mockUserSupabase = makeSupabase();
    const body = validBody();
    delete (body as Record<string, unknown>).status;

    await post(body);

    expect(mockUserSupabase.rpc).toHaveBeenCalledWith(
      'create_invoice_atomic_idempotent',
      expect.objectContaining({
        p_invoice: expect.objectContaining({ status: 'draft' }),
      })
    );
  });
});

describe('POST /api/invoices — F2 database invariant error mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const cases: Array<[string, number]> = [
    ['INVOICE_ITEM_AMOUNT_MISMATCH', 422],
    ['INVOICE_SUBTOTAL_MISMATCH', 422],
    ['INVOICE_TOTAL_MISMATCH', 422],
    ['INVOICE_NEGATIVE_AMOUNT', 422],
    ['INVOICE_NON_FINITE_AMOUNT', 422],
  ];

  it.each(cases)(
    'maps %s raised by the RPC to HTTP %i with a stable error_code',
    async (code, expectedStatus) => {
      mockUserSupabase = makeSupabase({
        data: null,
        error: {
          code: '23514',
          message: `${code}: some internal postgres wording`,
          details: JSON.stringify({ error_code: code }),
          hint: code,
        },
      });

      const { response, json } = await post(validBody());

      expect(response.status).toBe(expectedStatus);
      expect(json.error_code).toBe(code);
      expect(json.success).toBe(false);
      // Raw SQL wording must never reach the client.
      expect(json.error).not.toContain('postgres');
      expect(json.error).not.toContain(code);
    }
  );

  it('maps a database-side INVALID_INITIAL_INVOICE_STATUS to 400', async () => {
    mockUserSupabase = makeSupabase({
      data: null,
      error: {
        code: '23514',
        message:
          'INVALID_INITIAL_INVOICE_STATUS: An invoice cannot be created with status paid.',
        details: JSON.stringify({
          error_code: 'INVALID_INITIAL_INVOICE_STATUS',
        }),
        hint: 'INVALID_INITIAL_INVOICE_STATUS',
      },
    });

    const { response, json } = await post(validBody());

    expect(response.status).toBe(400);
    expect(json.error_code).toBe('INVALID_INITIAL_INVOICE_STATUS');
  });

  it('leaves unrelated database errors alone (no false 4xx mapping)', async () => {
    mockUserSupabase = makeSupabase({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    });

    const { response, json } = await post(validBody());

    expect(response.status).toBe(500);
    expect(json.error_code).not.toBe('INVOICE_TOTAL_MISMATCH');
  });

  it('still accepts an exact cent-level invoice (3 x 19.99 = 59.97, +4.95 tax = 64.92)', async () => {
    mockUserSupabase = makeSupabase();

    const { response } = await post(validBody());

    expect(response.status).toBe(201);
    expect(mockUserSupabase.rpc).toHaveBeenCalledWith(
      'create_invoice_atomic_idempotent',
      expect.objectContaining({
        p_invoice: expect.objectContaining({
          subtotal: 59.97,
          tax: 4.95,
          total: 64.92,
        }),
      })
    );
  });

  it('rejects an item whose amount does not equal qty * rate before the RPC (defence in depth)', async () => {
    mockUserSupabase = makeSupabase();

    const { response } = await post(
      validBody({
        subtotal: 100,
        tax: 0,
        total: 100,
        items: [
          {
            instrument_id: null,
            description: 'tampered',
            qty: 2,
            rate: 10,
            amount: 100,
            image_url: null,
            display_order: 0,
          },
        ],
      })
    );

    expect(response.status).toBe(400);
    expect(mockUserSupabase.rpc).not.toHaveBeenCalled();
  });
});
