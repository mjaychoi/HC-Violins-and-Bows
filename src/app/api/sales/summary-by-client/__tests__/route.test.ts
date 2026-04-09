import { NextRequest, NextResponse } from 'next/server';
import { GET } from '../route';
import { errorHandler } from '@/utils/errorHandler';
import { validateDateString } from '@/utils/inputValidation';

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/inputValidation');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');

let mockUserSupabase: any;
let mockAuthContext: any;

jest.mock('@/app/api/_utils/apiHandler', () => ({
  apiHandler: jest.fn(async (_request, _options, handler) => {
    try {
      const result = await handler();
      return NextResponse.json(result.payload, {
        status: result.status || 200,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'An error occurred' },
        { status: 500 }
      );
    }
  }),
}));

jest.mock('@/app/api/_utils/withSentryRoute', () => ({
  withSentryRoute: (fn: unknown) => fn,
}));

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute:
      (handler: (req: unknown, auth: unknown) => unknown) => (req: unknown) =>
        handler(req, {
          ...mockAuthContext,
          userSupabase: mockUserSupabase,
        }),
  };
});

const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;
const mockValidateDateString = validateDateString as jest.MockedFunction<
  typeof validateDateString
>;

function createQueryResult(result: Record<string, unknown>) {
  const promise = Promise.resolve(result);
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };

  return query;
}

describe('/api/sales/summary-by-client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserSupabase = { from: jest.fn() };
    mockAuthContext = {
      user: { id: 'test-user-id' },
      accessToken: 'test-token',
      orgId: 'test-org',
      clientId: 'test-client',
      role: 'admin',
      userSupabase: mockUserSupabase,
      isTestBypass: false,
    };
    mockValidateDateString.mockImplementation(
      date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    );
    mockErrorHandler.handleSupabaseError = jest
      .fn()
      .mockImplementation((error: unknown) => {
        const err = error as { message?: string };
        return new Error(err.message || 'Database error');
      });
  });

  it('returns aggregated sales summary rows from the database', async () => {
    const aggregateQuery = createQueryResult({
      data: [
        {
          client_id: 'client-1',
          total_spend: 3000,
          purchase_count: 2,
          last_purchase_date: '2024-02-20',
          first_purchase_date: '2024-01-15',
        },
        {
          client_id: 'client-2',
          total_spend: 1500,
          purchase_count: 1,
          last_purchase_date: '2024-01-10',
          first_purchase_date: '2024-01-10',
        },
      ],
      error: null,
    });
    const countQuery = createQueryResult({
      data: null,
      error: null,
      count: 3,
    });

    let callCount = 0;
    mockUserSupabase = {
      from: jest.fn().mockImplementation(() => {
        callCount += 1;
        return callCount === 1 ? aggregateQuery : countQuery;
      }),
    };

    const request = new NextRequest(
      'http://localhost/api/sales/summary-by-client'
    );
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([
      {
        client_id: 'client-1',
        total_spend: 3000,
        purchase_count: 2,
        last_purchase_date: '2024-02-20',
        first_purchase_date: '2024-01-15',
      },
      {
        client_id: 'client-2',
        total_spend: 1500,
        purchase_count: 1,
        last_purchase_date: '2024-01-10',
        first_purchase_date: '2024-01-10',
      },
    ]);
    expect(json.count).toBe(2);
    expect(json.totalSales).toBe(3);
    expect(aggregateQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    expect(countQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    expect(aggregateQuery.not).toHaveBeenCalledWith('client_id', 'is', null);
    expect(countQuery.not).toHaveBeenCalledWith('client_id', 'is', null);
  });

  it('applies date filters to both aggregate and count queries', async () => {
    const aggregateQuery = createQueryResult({
      data: [],
      error: null,
    });
    const countQuery = createQueryResult({
      data: null,
      error: null,
      count: 0,
    });

    let callCount = 0;
    mockUserSupabase = {
      from: jest.fn().mockImplementation(() => {
        callCount += 1;
        return callCount === 1 ? aggregateQuery : countQuery;
      }),
    };

    const request = new NextRequest(
      'http://localhost/api/sales/summary-by-client?fromDate=2024-01-01&toDate=2024-01-31'
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(aggregateQuery.gte).toHaveBeenCalledWith('sale_date', '2024-01-01');
    expect(aggregateQuery.lte).toHaveBeenCalledWith('sale_date', '2024-01-31');
    expect(countQuery.gte).toHaveBeenCalledWith('sale_date', '2024-01-01');
    expect(countQuery.lte).toHaveBeenCalledWith('sale_date', '2024-01-31');
  });

  it('rejects GET when org context is missing', async () => {
    mockAuthContext = {
      ...mockAuthContext,
      orgId: null,
    };

    const request = new NextRequest(
      'http://localhost/api/sales/summary-by-client'
    );
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Organization context required');
    expect(mockUserSupabase.from).not.toHaveBeenCalled();
  });

  it('returns 500 when the aggregate query fails', async () => {
    const aggregateQuery = createQueryResult({
      data: null,
      error: { message: 'Database error' },
    });

    mockUserSupabase = {
      from: jest.fn().mockReturnValue(aggregateQuery),
    };

    const request = new NextRequest(
      'http://localhost/api/sales/summary-by-client'
    );
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('Database error');
    expect(mockErrorHandler.handleSupabaseError).toHaveBeenCalled();
  });
});
