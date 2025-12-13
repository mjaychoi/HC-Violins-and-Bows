import { NextRequest } from 'next/server';
import { GET, POST, PATCH } from '../route';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';

jest.mock('@/lib/supabase-server');
jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');

const mockGetServerSupabase = getServerSupabase as jest.MockedFunction<typeof getServerSupabase>;
const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;
const mockLogApiRequest = logApiRequest as jest.MockedFunction<typeof logApiRequest>;
const mockCaptureException = captureException as jest.MockedFunction<typeof captureException>;

describe('/api/sales', () => {
  // Helper function to create a mock Supabase client
  const createMockSupabaseClient = (fromMock: any) => ({
    from: jest.fn().mockReturnValue(fromMock),
  } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET', () => {
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
      const mockCount = 1;

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };

      // totalsQuery를 위한 별도 mockQuery 생성 (sale_price만 select)
      const mockTotalsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: mockData.map((s: any) => ({ sale_price: s.sale_price })),
          error: null,
        }),
      };

      // supabase.from이 두 번 호출됨: 메인 쿼리와 totalsQuery
      let callCount = 0;
      const mockSupabaseClient = {
        from: jest.fn().mockImplementation(() => {
          callCount++;
          // 첫 번째 호출: 메인 쿼리 (range 사용)
          if (callCount === 1) {
            return mockQuery as any;
          }
          // 두 번째 호출: totalsQuery (limit 사용)
          return mockTotalsQuery as any;
        }),
      } as any;
      
      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);
      
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
      expect(mockLogApiRequest).toHaveBeenCalledWith(
        'GET',
        '/api/sales',
        200,
        expect.any(Number),
        'SalesAPI',
        expect.objectContaining({
          page: 1,
          recordCount: 1,
          totalCount: 1,
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

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockQuery));
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

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockQuery));
      // range가 마지막에 호출되고 그 결과가 resolve되어야 함
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest('http://localhost:3000/api/sales?page=1&search=violin');
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

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockQuery));
      // range가 마지막에 호출되고 그 결과가 resolve되어야 함
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: null,
        error: mockError,
        count: null,
      });

      mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue(mockAppError);

      const request = new NextRequest('http://localhost:3000/api/sales?page=1');
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('An error occurred');
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('should handle invalid instrument_id format', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=1&instrument_id=invalid-uuid'
      );
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('Invalid instrument_id format');
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

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockQuery));
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
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };

      // totalsQuery를 위한 별도 mockQuery 생성
      const mockTotalsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: mockData.map((s: any) => ({ sale_price: s.sale_price })),
          error: null,
        }),
      };

      // supabase.from이 두 번 호출됨: 메인 쿼리와 totalsQuery
      let callCount = 0;
      const mockSupabaseClient = {
        from: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return mockQuery as any;
          }
          return mockTotalsQuery as any;
        }),
      } as any;
      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);
      
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: mockData,
        error: null,
        count: mockCount,
      });

      const request = new NextRequest('http://localhost:3000/api/sales?page=2&pageSize=5');
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

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockQuery));
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/sales?page=1&sortColumn=sale_price&sortDirection=asc'
      );
      await GET(request);

      expect(mockQuery.order).toHaveBeenCalledWith('sale_price', { ascending: true });
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

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockQuery));
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const request = new NextRequest('http://localhost:3000/api/sales?page=1&search=');
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

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockQuery));
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

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockQuery));
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

      expect(mockQuery.order).toHaveBeenCalledWith('sale_date', { ascending: false });
    });

    it('should handle validation failure in GET response', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };

      // totalsQuery를 위한 별도 mockQuery 생성
      const mockTotalsQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [{ sale_price: 1000 }],
          error: null,
        }),
      };

      // supabase.from이 두 번 호출됨: 메인 쿼리와 totalsQuery
      let callCount = 0;
      const mockSupabaseClient = {
        from: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return mockQuery as any;
          }
          return mockTotalsQuery as any;
        }),
      } as any;
      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);
      
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
      mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue(mockAppError);

      // Mock supabase.from to throw an error
      const mockSupabaseClient = {
        from: jest.fn().mockImplementation(() => {
          throw new Error('Unexpected error');
        }),
      } as any;
      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest('http://localhost:3000/api/sales?page=1');
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('An error occurred');
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

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockQuery));
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

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockQuery));
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
    it('should create a new sale', async () => {
      const mockSale = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: 'Test sale',
        created_at: '2024-01-15T10:30:00Z',
      };

      const mockInsert = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSale,
          error: null,
        }),
      };

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockInsert));

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
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
      expect(mockInsert.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          sale_price: 2500.0,
          sale_date: '2024-01-15',
        }),
      ]);
    });

    it('should validate required fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          sale_price: 2500.0,
          // sale_date missing
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('Sale price and date are required.');
    });

    it('should validate sale_price is a number', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          sale_price: 'not-a-number',
          sale_date: '2024-01-15',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe('Sale price must be a number.');
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

      const mockInsert = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSale,
          error: null,
        }),
      };

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockInsert));

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          sale_price: 2500.0,
          sale_date: '2024-01-15',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(mockInsert.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          sale_price: 2500.0,
          sale_date: '2024-01-15',
          client_id: null,
          instrument_id: null,
          notes: null,
        }),
      ]);
    });

    it('should handle database error on insert', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockAppError = new Error('App error');

      const mockInsert = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      };

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockInsert));
      mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue(mockAppError);

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          sale_price: 2500.0,
          sale_date: '2024-01-15',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('An error occurred');
      expect(mockCaptureException).toHaveBeenCalled();
    });

    it('should handle invalid JSON body', async () => {
      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
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

      const mockInsert = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSale,
          error: null,
        }),
      };

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockInsert));

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'POST',
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
        body: JSON.stringify({
          sale_price: 2500.0,
          sale_date: 'invalid-date',
        }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain('sale_date must be a valid date string');
    });
  });

  describe('PATCH', () => {
    it('should update a sale for refund', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000'; // Valid UUID
      const mockUpdatedSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: -2500.0,
        sale_date: '2024-01-15',
        notes: 'Refund issued on 2024-01-20',
        created_at: '2024-01-15T10:30:00Z',
      };

      const mockUpdate = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockUpdatedSale,
          error: null,
        }),
      };

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockUpdate));

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
      expect(mockUpdate.update).toHaveBeenCalledWith({
        sale_price: -2500.0,
        notes: 'Refund issued on 2024-01-20',
      });
      expect(mockUpdate.eq).toHaveBeenCalledWith('id', saleId);
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
      expect(body.error).toBe('Sale ID is required.');
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
      expect(body.error).toBe('No fields to update.');
    });

    it('should handle partial updates', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000'; // Valid UUID
      const mockUpdatedSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: -2500.0,
        notes: 'Original notes',
        sale_date: '2024-01-15',
        created_at: '2024-01-15T10:30:00Z',
      };

      const mockUpdate = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockUpdatedSale,
          error: null,
        }),
      };

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockUpdate));

      const request = new NextRequest('http://localhost:3000/api/sales', {
        method: 'PATCH',
        body: JSON.stringify({
          id: saleId,
          sale_price: -2500.0,
        }),
      });

      const response = await PATCH(request);

      expect(response.status).toBe(200);
      expect(mockUpdate.update).toHaveBeenCalledWith({
        sale_price: -2500.0,
      });
    });

    it('should handle database error on update', async () => {
      const saleId = '123e4567-e89b-12d3-a456-426614174000';
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockAppError = new Error('App error');

      const mockUpdate = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      };

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockUpdate));
      mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue(mockAppError);

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
      expect(body.error).toBe('An error occurred');
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
      const mockUpdatedSale = {
        id: saleId,
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        notes: 'Updated notes',
        sale_date: '2024-01-15',
        created_at: '2024-01-15T10:30:00Z',
      };

      const mockUpdate = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockUpdatedSale,
          error: null,
        }),
      };

      mockGetServerSupabase.mockReturnValue(createMockSupabaseClient(mockUpdate));

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
      expect(mockUpdate.update).toHaveBeenCalledWith({
        notes: 'Updated notes',
      });
      expect(body.data.notes).toBe('Updated notes');
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
      expect(body.error).toContain('Sale price must be a number');
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
      expect(body.error).toBe('Invalid sale ID format');
    });
  });
});
