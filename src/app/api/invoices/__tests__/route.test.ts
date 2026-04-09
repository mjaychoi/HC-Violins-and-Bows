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

function createInvoicesGetQueryMock(result: {
  data: unknown[];
  error: unknown;
  count: number;
}) {
  const query: Record<string, any> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(resolve(result)),
  };

  return query;
}

describe('/api/invoices GET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns full success payload when no rows are dropped', async () => {
    const invoiceRow = {
      id: '123e4567-e89b-12d3-a456-426614174010',
      invoice_number: 'INV-010',
      client_id: '123e4567-e89b-12d3-a456-426614174001',
      invoice_date: '2026-04-03',
      due_date: '2026-04-10',
      subtotal: 100,
      tax: 0,
      total: 100,
      currency: 'USD',
      status: 'draft',
      notes: null,
      created_at: '2026-04-03T00:00:00.000Z',
      updated_at: '2026-04-03T00:00:00.000Z',
      clients: null,
      invoice_items: [],
    };

    const query = createInvoicesGetQueryMock({
      data: [invoiceRow],
      error: null,
      count: 1,
    });

    mockUserSupabase = {
      from: jest.fn(() => query),
    };

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/invoices?page=1');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.partial).toBe(false);
    expect(json.droppedCount).toBe(0);
    expect(json.returnedCount).toBe(1);
    expect(json.count).toBe(1);
    expect(json.warning).toBeUndefined();
    expect(json.data).toHaveLength(1);
  });

  it('searches client first_name using actual schema fields', async () => {
    const query = createInvoicesGetQueryMock({
      data: [],
      error: null,
      count: 0,
    });

    mockUserSupabase = {
      from: jest.fn(() => query),
    };

    const { GET } = await import('../route');
    const request = new NextRequest(
      'http://localhost/api/invoices?page=1&search=John'
    );

    await GET(request);

    expect(query.or).toHaveBeenCalledWith(
      expect.stringContaining('clients.first_name.ilike.%John%')
    );
    expect(query.or).not.toHaveBeenCalledWith(
      expect.stringContaining('clients.name')
    );
  });

  it('searches client last_name using actual schema fields', async () => {
    const query = createInvoicesGetQueryMock({
      data: [],
      error: null,
      count: 0,
    });

    mockUserSupabase = {
      from: jest.fn(() => query),
    };

    const { GET } = await import('../route');
    const request = new NextRequest(
      'http://localhost/api/invoices?page=1&search=Doe'
    );

    await GET(request);

    expect(query.or).toHaveBeenCalledWith(
      expect.stringContaining('clients.last_name.ilike.%Doe%')
    );
  });

  it('keeps invoice number search behavior intact', async () => {
    const query = createInvoicesGetQueryMock({
      data: [],
      error: null,
      count: 0,
    });

    mockUserSupabase = {
      from: jest.fn(() => query),
    };

    const { GET } = await import('../route');
    const request = new NextRequest(
      'http://localhost/api/invoices?page=1&search=INV-010'
    );

    await GET(request);

    expect(query.or).toHaveBeenCalledWith(
      expect.stringContaining('invoice_number.ilike.%INV-010%')
    );
  });

  it('supports simple combined first-name last-name search', async () => {
    const query = createInvoicesGetQueryMock({
      data: [],
      error: null,
      count: 0,
    });

    mockUserSupabase = {
      from: jest.fn(() => query),
    };

    const { GET } = await import('../route');
    const request = new NextRequest(
      'http://localhost/api/invoices?page=1&search=John%20Doe'
    );

    await GET(request);

    expect(query.or).toHaveBeenCalledWith(
      expect.stringContaining(
        'and(clients.first_name.ilike.%John%,clients.last_name.ilike.%Doe%)'
      )
    );
    expect(query.or).toHaveBeenCalledWith(
      expect.stringContaining(
        'and(clients.first_name.ilike.%Doe%,clients.last_name.ilike.%John%)'
      )
    );
  });

  it('returns partial payload and preserves raw count when some rows are dropped', async () => {
    const { safeValidate } = require('@/utils/typeGuards');
    safeValidate
      .mockImplementationOnce((value: unknown) => ({
        success: true,
        data: value,
      }))
      .mockImplementationOnce(() => ({ success: false, error: 'invalid row' }));

    const rows = [
      {
        id: '123e4567-e89b-12d3-a456-426614174011',
        invoice_number: 'INV-011',
        client_id: '123e4567-e89b-12d3-a456-426614174001',
        invoice_date: '2026-04-03',
        due_date: '2026-04-10',
        subtotal: 100,
        tax: 0,
        total: 100,
        currency: 'USD',
        status: 'draft',
        notes: null,
        created_at: '2026-04-03T00:00:00.000Z',
        updated_at: '2026-04-03T00:00:00.000Z',
        clients: null,
        invoice_items: [],
      },
      {
        id: '123e4567-e89b-12d3-a456-426614174012',
        invoice_number: 'INV-012',
        client_id: '123e4567-e89b-12d3-a456-426614174001',
        invoice_date: '2026-04-03',
        due_date: '2026-04-10',
        subtotal: 100,
        tax: 0,
        total: 100,
        currency: 'USD',
        status: 'draft',
        notes: null,
        created_at: '2026-04-03T00:00:00.000Z',
        updated_at: '2026-04-03T00:00:00.000Z',
        clients: null,
        invoice_items: [],
      },
    ];

    const query = createInvoicesGetQueryMock({
      data: rows,
      error: null,
      count: 5,
    });

    mockUserSupabase = {
      from: jest.fn(() => query),
    };

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/invoices?page=1');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.partial).toBe(true);
    expect(json.droppedCount).toBe(1);
    expect(json.returnedCount).toBe(1);
    expect(json.count).toBe(5);
    expect(json.warning).toBe('Some invoices could not be displayed.');
    expect(json.data).toHaveLength(1);
  });

  it('returns partial empty payload when all page rows are dropped', async () => {
    const { safeValidate } = require('@/utils/typeGuards');
    safeValidate.mockImplementation(() => ({
      success: false,
      error: 'invalid row',
    }));

    const rows = [
      {
        id: '123e4567-e89b-12d3-a456-426614174013',
        invoice_number: 'INV-013',
        client_id: '123e4567-e89b-12d3-a456-426614174001',
        invoice_date: '2026-04-03',
        due_date: '2026-04-10',
        subtotal: 100,
        tax: 0,
        total: 100,
        currency: 'USD',
        status: 'draft',
        notes: null,
        created_at: '2026-04-03T00:00:00.000Z',
        updated_at: '2026-04-03T00:00:00.000Z',
        clients: null,
        invoice_items: [],
      },
    ];

    const query = createInvoicesGetQueryMock({
      data: rows,
      error: null,
      count: 3,
    });

    mockUserSupabase = {
      from: jest.fn(() => query),
    };

    const { GET } = await import('../route');
    const request = new NextRequest('http://localhost/api/invoices?page=1');
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.partial).toBe(true);
    expect(json.droppedCount).toBe(1);
    expect(json.returnedCount).toBe(0);
    expect(json.count).toBe(3);
    expect(json.data).toEqual([]);
  });
});

describe('/api/invoices POST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { safeValidate } = require('@/utils/typeGuards');
    safeValidate.mockImplementation((value: unknown) => ({
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
    }));
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
    expect(json.result).toBe('full_success');
    expect(json.message).toBe('Invoice created successfully.');
    expect(json.imageTracking).toEqual({
      status: 'claimed',
      requestedCount: 0,
      claimedCount: 0,
      missingCount: 0,
      missingPaths: [],
    });
    expect(mockInvoiceQuery.eq).toHaveBeenCalledWith('id', refreshedInvoice.id);
    expect(mockInvoiceQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
  });

  it('returns partial_success when image tracking is partial', async () => {
    const { claimInvoiceImageUploads } = require('../imageUploadTracking');
    claimInvoiceImageUploads.mockResolvedValueOnce({
      status: 'partial',
      requestedCount: 2,
      claimedCount: 1,
      missingCount: 1,
      missingPaths: ['org/file-a.jpg'],
    });

    const refreshedInvoice = {
      id: '123e4567-e89b-12d3-a456-426614174199',
      invoice_number: 'INV-002',
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
      from: jest.fn(() => mockInvoiceQuery),
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
    expect(json.result).toBe('partial_success');
    expect(json.message).toBe(
      'Invoice created, but some item images were not linked.'
    );
    expect(json.imageTracking.status).toBe('partial');
    expect(json.data.id).toBe(refreshedInvoice.id);
  });
});
