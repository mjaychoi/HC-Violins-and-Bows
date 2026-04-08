import { NextRequest } from 'next/server';
import { GET, POST, PATCH } from '../route';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
let mockUserSupabase: any;
let mockAuthContext: any;

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => async (request: any, context?: any) =>
      handler(
        request,
        {
          ...mockAuthContext,
          userSupabase: mockUserSupabase,
        },
        context
      ),
  };
});
const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;
const mockLogApiRequest = logApiRequest as jest.MockedFunction<
  typeof logApiRequest
>;
const mockCaptureException = captureException as jest.MockedFunction<
  typeof captureException
>;

describe('/api/sales', () => {
  // Helper function to create a mock Supabase client
  const createMockSupabaseClient = (fromMock: any, rpcMock?: any) =>
    ({
      from: jest.fn().mockReturnValue(fromMock),
      rpc: rpcMock || jest.fn(),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(performance, 'now').mockReturnValue(0);
    const baseQuery = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockUserSupabase = {
      from: jest.fn().mockReturnValue(baseQuery),
      rpc: jest.fn(),
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET', () => {
    it('should deny export mode for non-admin users', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        role: 'member',
      };

      const request = new NextRequest(
        'http://localhost:3000/api/sales?export=true&pageSize=5000'
      );
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toMatchObject({
        message: 'Admin role required',
        error_code: 'ADMIN_REQUIRED',
        retryable: false,
      });
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should allow standard paginated listing for non-admin users', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        role: 'member',
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
          count: 0,
        }),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);

      const request = new NextRequest('http://localhost:3000/api/sales?page=1');
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.pagination).toEqual({
        page: 1,
        pageSize: 10,
        totalCount: 0,
        totalPages: 1,
      });
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should reject GET when org context is missing', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        orgId: null,
      };

      const request = new NextRequest('http://localhost:3000/api/sales?page=1');
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toMatchObject({
        message: 'Organization context required',
        retryable: false,
      });
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should allow export mode for admin users and enforce server-side cap', async () => {
      const mockData = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          instrument_id: '123e4567-e89b-12d3-a456-426614174001',
          client_id: '123e4567-e89b-12d3-a456-426614174002',
          sale_price: 2500.0,
          sale_date: '2024-01-15',
          notes: 'Export sale',
          created_at: '2024-01-15T10:30:00Z',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: mockData,
          error: null,
          count: 1,
        }),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);

      const request = new NextRequest(
        'http://localhost:3000/api/sales?export=true&pageSize=6000'
      );
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual(mockData);
      expect(body.pagination).toBeUndefined();
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(mockQuery.limit).toHaveBeenCalledWith(5000);
    });

    it('should return paginated sales data', async () => {
      const mockData = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          instrument_id: '123e4567-e89b-12d3-a456-426614174001',
          client_id: '123e4567-e89b-12d3-a456-426614174002',
          sale_price: 2500.0,
          sale_date: '2024-01-15',
          notes: 'Test sale',
          created_at: '2024-01-15T10:30:00Z',
        },
      ];
      const mockCount = 2;

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      const mockPositiveTotalsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { revenue: 2500, avg_ticket: 2500 },
          error: null,
        }),
      };

      const mockRefundTotalsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { refund_total: -500 },
          error: null,
        }),
      };

      let callCount = 0;
      const mockSupabaseClient = {
        from: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return mockQuery as any;
          }
          if (callCount === 2) {
            return mockPositiveTotalsQuery as any;
          }
          return mockRefundTotalsQuery as any;
        }),
      } as any;

      mockUserSupabase = mockSupabaseClient;

      // range가 마지막에 호출되고 그 결과가 resolve되어야 함
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: mockData,
        error: null,
        count: mockCount,
      });

      const request = new NextRequest('http://localhost:3000/api/sales?page=1');
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual(mockData);
      expect(body.pagination).toEqual({
        page: 1,
        pageSize: 10,
        totalCount: mockCount,
        totalPages: 1,
      });
      expect(body.totals).toEqual({
        revenue: 2500,
        refund: 500,
        avgTicket: 2500,
        count: 2,
        refundRate: 16.7,
      });
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(mockPositiveTotalsQuery.eq).toHaveBeenCalledWith(
        'org_id',
        'test-org'
      );
      expect(mockRefundTotalsQuery.eq).toHaveBeenCalledWith(
        'org_id',
        'test-org'
      );
      expect(mockPositiveTotalsQuery.single).toHaveBeenCalled();
      expect(mockRefundTotalsQuery.single).toHaveBeenCalled();
      expect(mockLogApiRequest).toHaveBeenCalledWith(
        'GET',
        '/api/sales',
        200,
        expect.any(Number),
        'SalesAPI',
        expect.objectContaining({
          page: 1,
          recordCount: 1,
          totalCount: 2,
        })
      );
    });

    it('should handle date filters', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);
      // range가 마지막에 호출되고 그 결과가 resolve되어야 함
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=1&fromDate=2024-01-01&toDate=2024-12-31'
      );
      const response = await GET(request);
      expect(response.status).toBe(200);
      expect(mockQuery.range).toHaveBeenCalled();
    });

    it('should handle search filter', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);
      // range가 마지막에 호출되고 그 결과가 resolve되어야 함
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=1&search=violin'
      );
      await GET(request);

      expect(mockQuery.ilike).toHaveBeenCalledWith('notes', '%violin%');
    });

    it('should handle errors', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockAppError = new Error('App error');

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);
      // range가 마지막에 호출되고 그 결과가 resolve되어야 함
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: null,
        error: mockError,
        count: null,
      });

      mockErrorHandler.handleSupabaseError = jest
        .fn()
        .mockReturnValue(mockAppError);

      const request = new NextRequest('http://localhost:3000/api/sales?page=1');
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.message).toBe(
        'Server error occurred. Please try again later.'
      );
    });

    it('should handle invalid instrument_id format', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=1&instrument_id=invalid-uuid'
      );
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe('Invalid instrument_id format');
    });

    it('should handle invalid date format', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      // invalid date format should not call gte/lte
      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=1&fromDate=invalid-date'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockQuery.gte).not.toHaveBeenCalled();
    });

    it('should handle pagination with different page sizes', async () => {
      const mockData = Array.from({ length: 5 }, (_, i) => ({
        id: `123e4567-e89b-12d3-a456-42661417400${i}`,
        instrument_id: null,
        client_id: null,
        sale_price: 1000 + i * 100,
        sale_date: '2024-01-15',
        notes: null,
        created_at: '2024-01-15T10:30:00Z',
      }));
      const mockCount = 25;

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      const mockPositiveTotalsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { revenue: 6000, avg_ticket: 1200 },
          error: null,
        }),
      };

      const mockRefundTotalsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { refund_total: 0 },
          error: null,
        }),
      };

      let callCount = 0;
      const mockSupabaseClient = {
        from: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return mockQuery as any;
          }
          if (callCount === 2) {
            return mockPositiveTotalsQuery as any;
          }
          return mockRefundTotalsQuery as any;
        }),
      } as any;
      mockUserSupabase = mockSupabaseClient;

      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: mockData,
        error: null,
        count: mockCount,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=2&pageSize=5'
      );
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.pagination).toEqual({
        page: 2,
        pageSize: 5,
        totalCount: mockCount,
        totalPages: 5,
      });
      expect(mockQuery.range).toHaveBeenCalledWith(5, 9); // (page-1)*pageSize to page*pageSize-1
    });

    it('should handle sortColumn and sortDirection', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=1&sortColumn=sale_price&sortDirection=asc'
      );
      await GET(request);

      expect(mockQuery.order).toHaveBeenCalledWith('sale_price', {
        ascending: true,
      });
    });

    it('should handle empty search term', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=1&search='
      );
      await GET(request);

      expect(mockQuery.ilike).not.toHaveBeenCalled();
    });

    it('should handle instrument_id filter', async () => {
      const instrumentId = '123e4567-e89b-12d3-a456-426614174001';
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest(
        `http://localhost:3000/api/sales?page=1&instrument_id=${instrumentId}`
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith('instrument_id', instrumentId);
    });

    it('should handle default sortColumn case', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      // invalid sortColumn should default to 'sale_date'
      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=1&sortColumn=invalid_column'
      );
      await GET(request);

      expect(mockQuery.order).toHaveBeenCalledWith('sale_date', {
        ascending: false,
      });
    });

    it('should handle validation failure in GET response', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      const mockPositiveTotalsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { revenue: 1000, avg_ticket: 1000 },
          error: null,
        }),
      };

      const mockRefundTotalsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { refund_total: 0 },
          error: null,
        }),
      };

      let callCount = 0;
      const mockSupabaseClient = {
        from: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return mockQuery as any;
          }
          if (callCount === 2) {
            return mockPositiveTotalsQuery as any;
          }
          return mockRefundTotalsQuery as any;
        }),
      } as any;
      mockUserSupabase = mockSupabaseClient;

      // Return invalid data that will fail validation
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [{ invalid: 'data' }],
        error: null,
        count: 1,
      });

      const request = new NextRequest('http://localhost:3000/api/sales?page=1');
      const response = await GET(request);

      // Should still return 200 but with validation warning logged
      expect(response.status).toBe(200);
      expect(mockCaptureException).toHaveBeenCalled();
      expect(mockLogApiRequest).toHaveBeenCalledWith(
        'GET',
        '/api/sales',
        200,
        expect.any(Number),
        'SalesAPI',
        expect.objectContaining({
          validationWarning: true,
        })
      );
    });

    it('should handle exception in GET', async () => {
      const mockAppError = new Error('App error');
      mockErrorHandler.handleSupabaseError = jest
        .fn()
        .mockReturnValue(mockAppError);

      // Mock supabase.from to throw an error
      const mockSupabaseClient = {
        from: jest.fn().mockImplementation(() => {
          throw new Error('Unexpected error');
        }),
      } as any;
      mockUserSupabase = mockSupabaseClient;

      const request = new NextRequest('http://localhost:3000/api/sales?page=1');
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.message).toBe(
        'Server error occurred. Please try again later.'
      );
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('should handle missing query parameters with defaults', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      // No query parameters - should use defaults
      const request = new NextRequest('http://localhost:3000/api/sales');
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(10);
    });

    it('should handle invalid toDate format', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = createMockSupabaseClient(mockQuery);
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      // invalid date format should not call lte
      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=1&toDate=invalid-date'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockQuery.lte).not.toHaveBeenCalled();
    });
  });

  describe('POST', () => {
    it('should reject sale creation for non-admin users without partial writes', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        role: 'member',
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      const mockRpc = jest.fn();
      mockUserSupabase = createMockSupabaseClient(mockSelectQuery, mockRpc);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sale-key-member-blocked' },
        body: JSON.stringify({
          sale_price: 2500.0,
          sale_date: '2024-01-15',
          notes: 'Blocked member sale',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body).toMatchObject({
        message: 'Admin role required',
        error_code: 'ADMIN_REQUIRED',
        retryable: false,
      });
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
      expect(mockSelectQuery.select).not.toHaveBeenCalled();
    });

    it('should create a new sale for admin users', async () => {
      const mockSale = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: 'Test sale',
        created_at: '2024-01-15T10:30:00Z',
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSale,
          error: null,
        }),
      };

      const mockRpc = jest.fn().mockResolvedValue({
        data: mockSale.id,
        error: null,
      });
      mockUserSupabase = createMockSupabaseClient(mockSelectQuery, mockRpc);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sale-key-1' },
        body: JSON.stringify({
          sale_price: 2500.0,
          sale_date: '2024-01-15',
          client_id: mockSale.client_id,
          instrument_id: mockSale.instrument_id,
          notes: 'Test sale',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.data).toEqual(mockSale);
      expect(mockRpc).toHaveBeenCalledWith('create_sale_atomic_idempotent', {
        p_route_key: 'POST:/api/sales',
        p_idempotency_key: 'sale-key-1',
        p_request_hash: expect.any(String),
        p_sale_price: 2500,
        p_sale_date: '2024-01-15',
        p_client_id: mockSale.client_id,
        p_instrument_id: mockSale.instrument_id,
        p_notes: 'Test sale',
      });
      expect(mockSelectQuery.eq).toHaveBeenCalledWith('id', mockSale.id);
      expect(mockSelectQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should validate required fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sale-key-2' },
        body: JSON.stringify({
          sale_price: 2500.0,
          // sale_date missing
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe('Sale price and date are required.');
    });

    it('should validate sale_price is a number', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sale-key-3' },
        body: JSON.stringify({
          sale_price: 'not-a-number',
          sale_date: '2024-01-15',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe('Sale price must be a number.');
    });

    it('should handle null optional fields', async () => {
      const mockSale = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: null,
        client_id: null,
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: null,
        created_at: '2024-01-15T10:30:00Z',
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSale,
          error: null,
        }),
      };

      const mockRpc = jest.fn().mockResolvedValue({
        data: mockSale.id,
        error: null,
      });
      mockUserSupabase = createMockSupabaseClient(mockSelectQuery, mockRpc);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sale-key-4' },
        body: JSON.stringify({
          sale_price: 2500.0,
          sale_date: '2024-01-15',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(mockRpc).toHaveBeenCalledWith('create_sale_atomic_idempotent', {
        p_route_key: 'POST:/api/sales',
        p_idempotency_key: 'sale-key-4',
        p_request_hash: expect.any(String),
        p_sale_price: 2500,
        p_sale_date: '2024-01-15',
        p_client_id: null,
        p_instrument_id: null,
        p_notes: null,
      });
    });

    it('should handle database error on insert', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockAppError = new Error('App error');

      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: mockError,
      });
      mockUserSupabase = createMockSupabaseClient({}, mockRpc);
      mockErrorHandler.handleSupabaseError = jest
        .fn()
        .mockReturnValue(mockAppError);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sale-key-5' },
        body: JSON.stringify({
          sale_price: 2500.0,
          sale_date: '2024-01-15',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.message).toBe(
        'Server error occurred. Please try again later.'
      );
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('should handle invalid JSON body', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sale-key-6' },
        body: 'invalid json',
      });

      // JSON.parse will throw, which should be caught
      await expect(POST(request)).resolves.toBeDefined();
    });

    it('should allow negative sale_price for refunds', async () => {
      const mockSale = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: null,
        client_id: null,
        sale_price: -500.0,
        sale_date: '2024-01-15',
        notes: 'Refund',
        created_at: '2024-01-15T10:30:00Z',
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSale,
          error: null,
        }),
      };

      const mockRpc = jest.fn().mockResolvedValue({
        data: mockSale.id,
        error: null,
      });
      mockUserSupabase = createMockSupabaseClient(mockSelectQuery, mockRpc);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sale-key-7' },
        body: JSON.stringify({
          sale_price: -500.0,
          sale_date: '2024-01-15',
          notes: 'Refund',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.data.sale_price).toBe(-500.0);
    });

    it('should validate sale_date format', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sale-key-8' },
        body: JSON.stringify({
          sale_price: 2500.0,
          sale_date: 'invalid-date',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toContain('sale_date must be a valid date string');
    });

    it('should require an idempotency key', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          sale_price: 2500.0,
          sale_date: '2024-01-15',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe('Idempotency key is required.');
    });

    it('should return the same sale on retry with the same idempotency key', async () => {
      const mockSale = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: null,
        client_id: null,
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: 'Manual sale',
        created_at: '2024-01-15T10:30:00Z',
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSale,
          error: null,
        }),
      };

      const mockRpc = jest.fn().mockResolvedValue({
        data: mockSale.id,
        error: null,
      });
      mockUserSupabase = createMockSupabaseClient(mockSelectQuery, mockRpc);

      const makeRequest = () =>
        new NextRequest('http://localhost:3000/api/sales', {
          method: 'POST',
          headers: { 'Idempotency-Key': 'retry-key-1' },
          body: JSON.stringify({
            sale_price: 2500.0,
            sale_date: '2024-01-15',
            notes: 'Manual sale',
          }),
        });

      const firstResponse = await POST(makeRequest());
      const secondResponse = await POST(makeRequest());
      const firstBody = await firstResponse.json();
      const secondBody = await secondResponse.json();

      expect(firstResponse.status).toBe(201);
      expect(secondResponse.status).toBe(201);
      expect(firstBody.data).toEqual(mockSale);
      expect(secondBody.data).toEqual(mockSale);
      expect(mockSelectQuery.eq).toHaveBeenCalledWith('id', mockSale.id);
      expect(mockSelectQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(mockRpc).toHaveBeenNthCalledWith(
        1,
        'create_sale_atomic_idempotent',
        expect.objectContaining({
          p_route_key: 'POST:/api/sales',
          p_idempotency_key: 'retry-key-1',
          p_request_hash: expect.any(String),
          p_sale_price: 2500,
          p_sale_date: '2024-01-15',
          p_client_id: null,
          p_instrument_id: null,
          p_notes: 'Manual sale',
        })
      );
      expect(mockRpc).toHaveBeenNthCalledWith(
        2,
        'create_sale_atomic_idempotent',
        expect.objectContaining({
          p_route_key: 'POST:/api/sales',
          p_idempotency_key: 'retry-key-1',
          p_request_hash: expect.any(String),
          p_sale_price: 2500,
          p_sale_date: '2024-01-15',
          p_client_id: null,
          p_instrument_id: null,
          p_notes: 'Manual sale',
        })
      );
      expect(mockRpc.mock.calls[0][1].p_request_hash).toBe(
        mockRpc.mock.calls[1][1].p_request_hash
      );
    });

    it('should not return a sale outside the caller org on readback', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000';
      const mockError = { message: 'Not found', code: 'PGRST116' };
      const mockAppError = new Error('App error');

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      };

      const mockRpc = jest.fn().mockResolvedValue({
        data: saleId,
        error: null,
      });
      mockUserSupabase = createMockSupabaseClient(mockSelectQuery, mockRpc);
      mockErrorHandler.handleSupabaseError = jest
        .fn()
        .mockReturnValue(mockAppError);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'sale-key-org-scope' },
        body: JSON.stringify({
          sale_price: 2500.0,
          sale_date: '2024-01-15',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.message).toBe(
        'Server error occurred. Please try again later.'
      );
      expect(mockSelectQuery.eq).toHaveBeenCalledWith('id', saleId);
      expect(mockSelectQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should create a new sale for a different idempotency key', async () => {
      const firstSale = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: 'Instrument sale',
        created_at: '2024-01-15T10:30:00Z',
      };
      const secondSale = {
        ...firstSale,
        id: '223e4567-e89b-12d3-a456-426614174000',
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValueOnce({
            data: firstSale,
            error: null,
          })
          .mockResolvedValueOnce({
            data: secondSale,
            error: null,
          }),
      };

      const mockRpc = jest
        .fn()
        .mockResolvedValueOnce({ data: firstSale.id, error: null })
        .mockResolvedValueOnce({ data: secondSale.id, error: null });
      mockUserSupabase = createMockSupabaseClient(mockSelectQuery, mockRpc);

      const firstResponse = await POST(
        new NextRequest('http://localhost:3000/api/sales', {
          method: 'POST',
          headers: { 'Idempotency-Key': 'sale-key-a' },
          body: JSON.stringify({
            sale_price: 2500.0,
            sale_date: '2024-01-15',
            client_id: firstSale.client_id,
            instrument_id: firstSale.instrument_id,
            notes: 'Instrument sale',
          }),
        })
      );
      const secondResponse = await POST(
        new NextRequest('http://localhost:3000/api/sales', {
          method: 'POST',
          headers: { 'Idempotency-Key': 'sale-key-b' },
          body: JSON.stringify({
            sale_price: 2500.0,
            sale_date: '2024-01-15',
            client_id: firstSale.client_id,
            instrument_id: firstSale.instrument_id,
            notes: 'Instrument sale',
          }),
        })
      );

      const firstBody = await firstResponse.json();
      const secondBody = await secondResponse.json();

      expect(firstResponse.status).toBe(201);
      expect(secondResponse.status).toBe(201);
      expect(firstBody.data.id).toBe(firstSale.id);
      expect(secondBody.data.id).toBe(secondSale.id);
      expect(mockRpc).toHaveBeenNthCalledWith(
        1,
        'create_sale_atomic_idempotent',
        expect.objectContaining({ p_idempotency_key: 'sale-key-a' })
      );
      expect(mockRpc).toHaveBeenNthCalledWith(
        2,
        'create_sale_atomic_idempotent',
        expect.objectContaining({ p_idempotency_key: 'sale-key-b' })
      );
      expect(mockRpc.mock.calls[0][1].p_request_hash).toBe(
        mockRpc.mock.calls[1][1].p_request_hash
      );
    });
  });

  describe('PATCH', () => {
    it('should scope sale fetches by auth org', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000';
      const currentSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        notes: 'Original notes',
        sale_date: '2024-01-15',
        created_at: '2024-01-15T10:30:00Z',
        entry_kind: 'sale',
        adjustment_of_sale_id: null,
      };

      const mockFetch = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: currentSale,
          error: null,
        }),
      };

      mockUserSupabase = createMockSupabaseClient(mockFetch);
      mockAuthContext = {
        ...mockAuthContext,
        orgId: 'org-123',
        userSupabase: mockUserSupabase,
      };

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: saleId,
          sale_price: 2500.0,
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.sale_price).toBe(2500.0);
      expect(mockFetch.eq).toHaveBeenNthCalledWith(1, 'id', saleId);
      expect(mockFetch.eq).toHaveBeenNthCalledWith(2, 'org_id', 'org-123');
    });

    it('should fail closed when org context is missing', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        orgId: null,
      };

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: '123e4567-e89b-12d3-a456-426614174000',
          sale_price: 2500.0,
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.message).toBe('Organization context required');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should update a sale for refund', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000'; // Valid UUID
      const originalSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: 'Original sale',
        created_at: '2024-01-15T10:30:00Z',
        entry_kind: 'sale',
        adjustment_of_sale_id: null,
      };
      const mockUpdatedSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: -2500.0,
        sale_date: '2024-01-15',
        notes: 'Refund issued on 2024-01-20',
        created_at: '2024-01-15T10:30:00Z',
        entry_kind: 'refund',
        adjustment_of_sale_id: saleId,
      };

      const currentSaleQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: originalSale,
          error: null,
        }),
      };
      const adjustmentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockUpdatedSale,
          error: null,
        }),
      };

      let fromCallCount = 0;
      const mockRpc = jest.fn().mockResolvedValue({
        data: '223e4567-e89b-12d3-a456-426614174000',
        error: null,
      });
      mockUserSupabase = {
        from: jest.fn().mockImplementation(() => {
          fromCallCount += 1;
          return fromCallCount === 1 ? currentSaleQuery : adjustmentQuery;
        }),
        rpc: mockRpc,
      } as any;

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: saleId,
          sale_price: -2500.0,
          notes: 'Refund issued on 2024-01-20',
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual(mockUpdatedSale);
      expect(mockRpc).toHaveBeenCalledWith('create_sale_adjustment_atomic', {
        p_source_sale_id: saleId,
        p_adjustment_kind: 'refund',
        p_notes: 'Refund issued on 2024-01-20',
      });
    });

    it('should require id field', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          sale_price: -2500.0,
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe('Sale ID is required.');
    });

    it('should require at least one field to update', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000'; // Valid UUID
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: saleId,
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe('No fields to update.');
    });

    it('should reject direct sale amount rewrites', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000'; // Valid UUID
      const currentSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        notes: 'Original notes',
        sale_date: '2024-01-15',
        created_at: '2024-01-15T10:30:00Z',
        entry_kind: 'sale',
        adjustment_of_sale_id: null,
      };

      const mockFetch = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: currentSale,
          error: null,
        }),
      };

      mockUserSupabase = createMockSupabaseClient(mockFetch);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: saleId,
          sale_price: 1800.0,
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.message).toContain(
        'Direct sale amount rewrites are not allowed'
      );
    });

    it('should handle database error on adjustment creation', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000';
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockAppError = new Error('App error');
      const currentSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        notes: 'Original notes',
        sale_date: '2024-01-15',
        created_at: '2024-01-15T10:30:00Z',
        entry_kind: 'sale',
        adjustment_of_sale_id: null,
      };

      const mockFetch = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: currentSale,
          error: null,
        }),
      };

      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: mockError,
      });
      mockUserSupabase = createMockSupabaseClient(mockFetch, mockRpc);
      mockErrorHandler.handleSupabaseError = jest
        .fn()
        .mockReturnValue(mockAppError);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: saleId,
          sale_price: -2500.0,
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.message).toBe(
        'Server error occurred. Please try again later.'
      );
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('should handle invalid JSON body', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: 'invalid json',
      });

      // JSON.parse will throw, which should be caught
      await expect(PATCH(request)).resolves.toBeDefined();
    });

    it('should handle update with only notes', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000';
      const currentSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        notes: 'Original notes',
        sale_date: '2024-01-15',
        created_at: '2024-01-15T10:30:00Z',
        entry_kind: 'sale',
        adjustment_of_sale_id: null,
      };
      const mockUpdatedSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        notes: 'Updated notes',
        sale_date: '2024-01-15',
        created_at: '2024-01-15T10:30:00Z',
        entry_kind: 'sale',
        adjustment_of_sale_id: null,
      };

      const mockFetch = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValueOnce({
            data: currentSale,
            error: null,
          })
          .mockResolvedValueOnce({
            data: mockUpdatedSale,
            error: null,
          }),
      };
      const mockRpc = jest.fn().mockResolvedValue({
        data: saleId,
        error: null,
      });

      mockUserSupabase = createMockSupabaseClient(mockFetch, mockRpc);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: saleId,
          notes: 'Updated notes',
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith('update_sale_notes_atomic', {
        p_sale_id: saleId,
        p_notes: 'Updated notes',
      });
      expect(body.data.notes).toBe('Updated notes');
    });

    it('should return current sale when submitted values do not change', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000';
      const currentSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        notes: 'Original notes',
        sale_date: '2024-01-15',
        created_at: '2024-01-15T10:30:00Z',
        entry_kind: 'sale',
        adjustment_of_sale_id: null,
      };

      const mockFetch = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: currentSale,
          error: null,
        }),
      };

      mockUserSupabase = createMockSupabaseClient(mockFetch);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: saleId,
          sale_price: 2500.0,
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(mockFetch.update).not.toHaveBeenCalled();
      expect(body.data.sale_price).toBe(2500.0);
    });

    it('should handle invalid sale_price type in update', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000';
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: saleId,
          sale_price: 'not-a-number',
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toContain('Sale price must be a number');
    });

    it('should handle invalid UUID format in PATCH', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: 'invalid-uuid-format',
          sale_price: -2500.0,
        }),
      });

      const response = await PATCH(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe('Invalid sale ID format');
    });
  });
});
