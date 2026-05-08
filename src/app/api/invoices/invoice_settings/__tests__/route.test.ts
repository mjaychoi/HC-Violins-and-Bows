import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';

let mockUserSupabase: any;
let mockOrgId: string | null = 'test-org';
let mockRole: 'admin' | 'member' = 'admin';
const mockAssertInvoiceSchemaReadiness = jest.fn();

jest.mock('@/app/api/_utils/withSentryRoute', () => ({
  withSentryRoute: (fn: unknown) => fn,
}));

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: (req: unknown, auth: unknown) => unknown) => {
      return (req: unknown) =>
        handler(req, {
          user: { id: 'test-user' },
          accessToken: 'test-token',
          orgId: mockOrgId,
          clientId: null,
          role: mockRole,
          userSupabase: mockUserSupabase,
          isTestBypass: true,
        });
    },
  };
});

jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  assertInvoiceSchemaReadiness: (...args: unknown[]) =>
    mockAssertInvoiceSchemaReadiness(...args),
}));

jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn(
      (error: { message?: string } | null | undefined) =>
        new Error(error?.message || 'Unexpected error')
    ),
  },
}));

jest.mock('@/utils/monitoring', () => ({
  captureException: jest.fn(),
}));

describe('/api/invoices/invoice_settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrgId = 'test-org';
    mockRole = 'admin';
    mockAssertInvoiceSchemaReadiness.mockResolvedValue({
      ready: true,
      checkedAt: new Date().toISOString(),
      missingColumns: [],
    });
  });

  it('returns settings after a concurrent first-access unique violation', async () => {
    const upsertQuery = {
      upsert: jest.fn().mockResolvedValue({
        error: { code: '23505', message: 'duplicate key value' },
      }),
    };
    const selectQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'settings-1',
          org_id: 'test-org',
          business_name: 'HC Violins',
          business_address: null,
          business_phone: null,
          business_email: null,
          bank_account_holder: null,
          bank_name: null,
          bank_swift_code: null,
          bank_account_number: null,
          default_conditions: null,
          default_exchange_rate: null,
          default_currency: 'USD',
        },
        error: null,
      }),
    };

    let callCount = 0;
    mockUserSupabase = {
      from: jest.fn(() => {
        callCount += 1;
        return callCount === 1 ? upsertQuery : selectQuery;
      }),
    };

    const response = await GET(
      new NextRequest('http://localhost/api/invoices/invoice_settings')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.business_name).toBe('HC Violins');
    expect(upsertQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: 'test-org' }),
      { onConflict: 'org_id', ignoreDuplicates: true }
    );
    expect(selectQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    expect(mockAssertInvoiceSchemaReadiness).toHaveBeenCalledWith({
      supabase: mockUserSupabase,
    });
  });

  it('returns default settings envelope when no row exists after first read', async () => {
    const upsertQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const selectQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      }),
    };

    let callCount = 0;
    mockUserSupabase = {
      from: jest.fn(() => {
        callCount += 1;
        return callCount === 1 ? upsertQuery : selectQuery;
      }),
    };

    const response = await GET(
      new NextRequest('http://localhost/api/invoices/invoice_settings')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      data: {
        org_id: 'test-org',
        business_name: '',
        address: '',
        phone: '',
        email: '',
        default_currency: 'USD',
        default_exchange_rate: '',
      },
      success: true,
    });
    expect(selectQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
  });

  it('enforces tenant-scoped lookup from auth context only', async () => {
    mockOrgId = 'org-from-session';
    const upsertQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const selectQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'settings-1',
          org_id: 'org-from-session',
          business_name: 'Scoped',
          business_address: null,
          business_phone: null,
          business_email: null,
          bank_account_holder: null,
          bank_name: null,
          bank_swift_code: null,
          bank_account_number: null,
          default_conditions: null,
          default_exchange_rate: null,
          default_currency: 'USD',
        },
        error: null,
      }),
    };

    let callCount = 0;
    mockUserSupabase = {
      from: jest.fn(() => {
        callCount += 1;
        return callCount === 1 ? upsertQuery : selectQuery;
      }),
    };

    const response = await GET(
      new NextRequest(
        'http://localhost/api/invoices/invoice_settings?orgId=forged-org'
      )
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.business_name).toBe('Scoped');
    expect(upsertQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ org_id: 'org-from-session' }),
      expect.any(Object)
    );
    expect(selectQuery.eq).toHaveBeenCalledWith('org_id', 'org-from-session');
    expect(selectQuery.eq).not.toHaveBeenCalledWith('org_id', 'forged-org');
  });

  it('returns a meaningful permission envelope for non-admin users', async () => {
    mockRole = 'member';
    mockUserSupabase = {
      from: jest.fn(),
    };

    const response = await GET(
      new NextRequest('http://localhost/api/invoices/invoice_settings')
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.message).toBe('Admin role required');
    expect(json.error_code).toBe('ADMIN_REQUIRED');
    expect(mockUserSupabase.from).not.toHaveBeenCalled();
  });

  it('returns a meaningful organization-context envelope when tenant is missing', async () => {
    mockOrgId = null;
    mockUserSupabase = {
      from: jest.fn(),
    };

    const response = await GET(
      new NextRequest('http://localhost/api/invoices/invoice_settings')
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.message).toBe('Organization context required');
    expect(mockUserSupabase.from).not.toHaveBeenCalled();
    expect(mockAssertInvoiceSchemaReadiness).not.toHaveBeenCalled();
  });

  it('returns a schema readiness error before querying missing invoice settings columns', async () => {
    mockUserSupabase = {
      from: jest.fn(),
    };
    mockAssertInvoiceSchemaReadiness.mockRejectedValueOnce(
      Object.assign(
        new Error(
          'Database migration required: missing public.invoice_settings.business_name'
        ),
        {
          code: 'SCHEMA_OUT_OF_DATE',
          error_code: 'SCHEMA_OUT_OF_DATE',
          status: 503,
          retryable: false,
          details: {
            missingColumns: ['public.invoice_settings.business_name'],
          },
        }
      )
    );

    const response = await GET(
      new NextRequest('http://localhost/api/invoices/invoice_settings')
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.message).toBe('Database migration required.');
    expect(json.error_code).toBe('SCHEMA_OUT_OF_DATE');
    expect(mockUserSupabase.from).not.toHaveBeenCalled();
  });

  it('updates settings with an authoritative tenant-scoped response envelope', async () => {
    const upsertQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'settings-1',
          org_id: 'test-org',
          business_name: '',
          business_address: null,
          business_phone: null,
          business_email: null,
          bank_account_holder: null,
          bank_name: null,
          bank_swift_code: null,
          bank_account_number: null,
          default_conditions: null,
          default_exchange_rate: null,
          default_currency: 'USD',
        },
        error: null,
      }),
    };
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'settings-1',
          org_id: 'test-org',
          business_name: 'Updated Studio',
          business_address: '123 Main',
          business_phone: '555-0100',
          business_email: 'billing@example.com',
          bank_account_holder: null,
          bank_name: null,
          bank_swift_code: null,
          bank_account_number: null,
          default_conditions: 'Net 15',
          default_exchange_rate: 1300,
          default_currency: 'KRW',
        },
        error: null,
      }),
    };

    let callCount = 0;
    mockUserSupabase = {
      from: jest.fn(() => {
        callCount += 1;
        if (callCount === 1) return upsertQuery;
        if (callCount === 2) return existingQuery;
        return updateQuery;
      }),
    };

    const request = new NextRequest(
      'http://localhost/api/invoices/invoice_settings',
      {
        method: 'PUT',
        body: JSON.stringify({
          org_id: 'forged-org',
          business_name: 'Updated Studio',
          address: '123 Main',
          phone: '555-0100',
          email: 'billing@example.com',
          default_conditions: 'Net 15',
          default_exchange_rate: '1300',
          default_currency: 'krw',
        }),
      }
    );

    const response = await PUT(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      data: {
        org_id: 'test-org',
        business_name: 'Updated Studio',
        address: '123 Main',
        phone: '555-0100',
        email: 'billing@example.com',
        default_conditions: 'Net 15',
        default_exchange_rate: '1300',
        default_currency: 'KRW',
      },
      success: true,
    });
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        business_name: 'Updated Studio',
        business_address: '123 Main',
        business_phone: '555-0100',
        business_email: 'billing@example.com',
        default_conditions: 'Net 15',
        default_exchange_rate: 1300,
        default_currency: 'KRW',
      })
    );
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.not.objectContaining({
        org_id: 'forged-org',
      })
    );
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'settings-1');
    expect(updateQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    expect(updateQuery.eq).not.toHaveBeenCalledWith('org_id', 'forged-org');
  });

  it('returns a safe failure envelope when update returns no authoritative row', async () => {
    const upsertQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
    const existingQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'settings-1',
          org_id: 'test-org',
          business_name: '',
          business_address: null,
          business_phone: null,
          business_email: null,
          bank_account_holder: null,
          bank_name: null,
          bank_swift_code: null,
          bank_account_number: null,
          default_conditions: null,
          default_exchange_rate: null,
          default_currency: 'USD',
        },
        error: null,
      }),
    };
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };

    let callCount = 0;
    mockUserSupabase = {
      from: jest.fn(() => {
        callCount += 1;
        if (callCount === 1) return upsertQuery;
        if (callCount === 2) return existingQuery;
        return updateQuery;
      }),
    };

    const request = new NextRequest(
      'http://localhost/api/invoices/invoice_settings',
      {
        method: 'PUT',
        body: JSON.stringify({
          business_name: 'Updated Studio',
        }),
      }
    );

    const response = await PUT(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.message).toBe('Server error occurred. Please try again later.');
    expect(updateQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
  });

  it('returns 400 for invalid JSON in PUT', async () => {
    mockUserSupabase = {
      from: jest.fn(),
    };

    const request = new NextRequest(
      'http://localhost/api/invoices/invoice_settings',
      {
        method: 'PUT',
        body: '{invalid',
      }
    );

    const response = await PUT(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.message).toBe('Invalid JSON body');
    expect(mockUserSupabase.from).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid default_exchange_rate', async () => {
    const selectQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'settings-1',
          org_id: 'test-org',
          business_name: 'HC Violins',
          business_address: null,
          business_phone: null,
          business_email: null,
          bank_account_holder: null,
          bank_name: null,
          bank_swift_code: null,
          bank_account_number: null,
          default_conditions: null,
          default_exchange_rate: null,
          default_currency: 'USD',
        },
        error: null,
      }),
      update: jest.fn(),
    };
    const upsertQuery = {
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };

    let callCount = 0;
    mockUserSupabase = {
      from: jest.fn(() => {
        callCount += 1;
        return callCount === 1 ? upsertQuery : selectQuery;
      }),
    };

    const request = new NextRequest(
      'http://localhost/api/invoices/invoice_settings',
      {
        method: 'PUT',
        body: JSON.stringify({
          default_exchange_rate: 'not-a-number',
        }),
      }
    );

    const response = await PUT(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.message).toBe('default_exchange_rate must be a valid number');
    expect(selectQuery.update).not.toHaveBeenCalled();
  });
});
