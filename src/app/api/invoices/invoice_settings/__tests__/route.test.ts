import { NextRequest } from 'next/server';
import { GET, PUT } from '../route';

let mockUserSupabase: any;

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
          orgId: 'test-org',
          clientId: null,
          role: 'admin',
          userSupabase: mockUserSupabase,
          isTestBypass: true,
        });
    },
  };
});

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
