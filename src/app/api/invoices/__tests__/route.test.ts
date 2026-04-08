import { NextRequest } from 'next/server';

let mockUserSupabase: any;

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
jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn((error: unknown) => error),
    createError: jest.fn(
      (_code: string, message: string) => new Error(message)
    ),
  },
}));
jest.mock('@/utils/typeGuards', () => ({
  validateInvoice: jest.fn((value: unknown) => ({
    success: true,
    data: value,
  })),
  validateCreateInvoice: jest.fn(),
  safeValidate: jest.fn((value: unknown) => ({
    success: true,
    data: {
      client_id:
        (value as { client_id?: string } | null)?.client_id ||
        '123e4567-e89b-12d3-a456-426614174001',
      invoice_date: '2026-04-03',
      due_date: '2026-04-10',
      subtotal: 100,
      tax: 0,
      total: 100,
      status: 'draft',
      currency: 'USD',
      items: [],
    },
  })),
}));
jest.mock('../financialValidation', () => ({
  toFinancialSnapshot: jest.fn((value: unknown) => value),
  validateInvoiceFinancials: jest.fn(() => null),
}));
jest.mock('../imageUrls', () => ({
  attachSignedUrlsToInvoice: jest.fn(
    async (_supabase: unknown, invoice: unknown) => invoice
  ),
}));
jest.mock('../imageUploadTracking', () => ({
  claimInvoiceImageUploads: jest.fn(async () => undefined),
}));
jest.mock('@/utils/invoiceNormalize', () => ({
  normalizeInvoiceRecord: jest.fn((value: unknown) => ({ normalized: value })),
}));

describe('/api/invoices POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes the created-invoice readback by org_id', async () => {
    const refreshedInvoice = {
      id: '123e4567-e89b-12d3-a456-426614174099',
      invoice_number: 'INV-001',
      client_id: '123e4567-e89b-12d3-a456-426614174001',
      invoice_date: '2026-04-03',
      due_date: '2026-04-10',
      subtotal: 100,
      tax: 0,
      total: 100,
      currency: 'USD',
      status: 'draft',
      notes: null,
      business_name: null,
      business_address: null,
      business_phone: null,
      business_email: null,
      bank_account_holder: null,
      bank_name: null,
      bank_swift_code: null,
      bank_account_number: null,
      default_conditions: null,
      default_exchange_rate: null,
      created_at: '2026-04-03T00:00:00.000Z',
      updated_at: '2026-04-03T00:00:00.000Z',
      clients: null,
      invoice_items: [],
    };

    const mockInvoiceQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: refreshedInvoice,
        error: null,
      }),
    };

    mockUserSupabase = {
      rpc: jest.fn().mockResolvedValue({
        data: refreshedInvoice.id,
        error: null,
      }),
      from: jest.fn((table: string) => {
        if (table === 'invoices') return mockInvoiceQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const { POST } = await import('../route');
    const request = new NextRequest('http://localhost/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        client_id: refreshedInvoice.client_id,
        invoice_date: refreshedInvoice.invoice_date,
        due_date: refreshedInvoice.due_date,
        subtotal: refreshedInvoice.subtotal,
        total: refreshedInvoice.total,
        items: [],
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.id).toBe(refreshedInvoice.id);
    expect(mockInvoiceQuery.eq).toHaveBeenCalledWith('id', refreshedInvoice.id);
    expect(mockInvoiceQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
  });
});
