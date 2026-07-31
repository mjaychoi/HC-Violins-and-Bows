/**
 * GET /api/clients/analytics — organization-wide metrics (not page-scoped).
 */
import { NextRequest } from 'next/server';
import { GET } from '../route';

jest.mock('@/app/api/_utils/rateLimit', () => ({
  searchRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
}));
jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn((e: unknown) => {
      throw e;
    }),
  },
}));
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  assertClientsSchemaReadiness: jest.fn().mockResolvedValue({
    ready: true,
    checkedAt: '2026-05-08T00:00:00.000Z',
    missingColumns: [],
  }),
}));

let mockUserSupabase: any;

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => (request: NextRequest) =>
      handler(request, {
        user: { id: 'test-user' },
        accessToken: 'test-token',
        orgId: 'test-org',
        clientId: 'test-client',
        role: 'admin',
        userSupabase: mockUserSupabase,
        isTestBypass: true,
      }),
  };
});

describe('GET /api/clients/analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns organization-wide summary with safe empty averages', async () => {
    const clientsHead = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
    };

    const salesAgg = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          total_spend: null,
          purchase_count: null,
          most_recent: null,
        },
        error: null,
      }),
    };

    const distinct = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockResolvedValue({ data: [], error: null }),
    };

    let fromCall = 0;
    mockUserSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'clients') return clientsHead;
        fromCall += 1;
        return fromCall === 1 ? salesAgg : distinct;
      }),
    };

    // Fix: sales then distinct — both from sales_history
    mockUserSupabase.from = jest.fn((table: string) => {
      if (table === 'clients') return clientsHead;
      if (table === 'sales_history') {
        // First sales_history call is aggregate, second is distinct
        if (!mockUserSupabase._salesCalls) mockUserSupabase._salesCalls = 0;
        mockUserSupabase._salesCalls += 1;
        return mockUserSupabase._salesCalls === 1 ? salesAgg : distinct;
      }
      throw new Error(`unexpected table ${table}`);
    });

    const res = await GET(
      new NextRequest('http://localhost/api/clients/analytics')
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.customerCount).toBe(0);
    expect(json.data.totalSpend).toBe(0);
    expect(json.data.avgSpendPerCustomer).toBe(0);
    expect(json.data.purchaseCount).toBe(0);
    expect(json.data.mostRecentPurchaseDate).toBeNull();
    expect(json.data.scope).toBe('organization');
    expect(json.complete).toBe(true);
  });

  it('does not double-count clients with multiple sales', async () => {
    const clientsHead = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ count: 1001, error: null }),
    };

    const salesAgg = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          total_spend: 300,
          purchase_count: 3,
          most_recent: '2026-07-01',
        },
        error: null,
      }),
    };

    const distinct = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockResolvedValue({
        data: [{ client_id: 'c1' }, { client_id: 'c1' }, { client_id: 'c2' }],
        error: null,
      }),
    };

    mockUserSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'clients') return clientsHead;
        if (!mockUserSupabase._salesCalls) mockUserSupabase._salesCalls = 0;
        mockUserSupabase._salesCalls += 1;
        return mockUserSupabase._salesCalls === 1 ? salesAgg : distinct;
      }),
    };

    const res = await GET(
      new NextRequest('http://localhost/api/clients/analytics')
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.customerCount).toBe(1001);
    expect(json.data.clientsWithPurchases).toBe(2);
    expect(json.data.totalSpend).toBe(300);
    expect(json.data.purchaseCount).toBe(3);
    expect(json.data.avgSpendPerCustomer).toBe(150);
    expect(json.data.mostRecentPurchaseDate).toBe('2026-07-01');
  });
});
