import { NextRequest, NextResponse } from 'next/server';
import { GET } from '../route';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';
import { validateDateString } from '@/utils/inputValidation';

jest.mock('@/lib/supabase-server');
jest.mock('@/utils/errorHandler');
jest.mock('@/utils/inputValidation');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
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
jest.mock('@/app/api/_utils/withAuthRoute', () => ({
  withAuthRoute: (handler: (req: unknown, user: unknown) => unknown) => {
    return (req: unknown) => {
      const TEST_USER = { id: 'test-user-id' } as any;
      return handler(req, TEST_USER);
    };
  },
}));

const mockGetServerSupabase = getServerSupabase as jest.MockedFunction<
  typeof getServerSupabase
>;
const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;
const mockValidateDateString = validateDateString as jest.MockedFunction<
  typeof validateDateString
>;

describe('/api/sales/summary-by-client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateDateString.mockImplementation(date => {
      return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
    });
    mockErrorHandler.handleSupabaseError = jest
      .fn()
      .mockImplementation((error: unknown) => {
        const err = error as { message?: string };
        return new Error(err.message || 'Database error');
      });
  });

  describe('GET', () => {
    it('should return sales summary grouped by client', async () => {
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 1000.0,
          sale_date: '2024-01-15',
        },
        {
          client_id: 'client-1',
          sale_price: 2000.0,
          sale_date: '2024-02-20',
        },
        {
          client_id: 'client-2',
          sale_price: 1500.0,
          sale_date: '2024-01-10',
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 3,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);

      // Check first client summary
      const client1Summary = json.data.find(
        (s: any) => s.client_id === 'client-1'
      );
      expect(client1Summary).toBeDefined();
      expect(client1Summary.total_spend).toBe(3000.0);
      expect(client1Summary.purchase_count).toBe(2);
      expect(client1Summary.last_purchase_date).toBe('2024-02-20');
      expect(client1Summary.first_purchase_date).toBe('2024-01-15');

      // Check second client summary
      const client2Summary = json.data.find(
        (s: any) => s.client_id === 'client-2'
      );
      expect(client2Summary).toBeDefined();
      expect(client2Summary.total_spend).toBe(1500.0);
      expect(client2Summary.purchase_count).toBe(1);
      expect(client2Summary.last_purchase_date).toBe('2024-01-10');
      expect(client2Summary.first_purchase_date).toBe('2024-01-10');

      expect(json.count).toBe(2);
      expect(json.totalSales).toBe(3);
    });

    it('should handle empty sales data', async () => {
      const mockNot = jest.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([]);
      expect(json.count).toBe(0);
      expect(json.totalSales).toBe(0);
    });

    it('should group sales correctly with multiple sales per client', async () => {
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 500.0,
          sale_date: '2024-01-01',
        },
        {
          client_id: 'client-1',
          sale_price: 750.0,
          sale_date: '2024-01-02',
        },
        {
          client_id: 'client-1',
          sale_price: 250.0,
          sale_date: '2024-01-03',
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 3,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].total_spend).toBe(1500.0);
      expect(json.data[0].purchase_count).toBe(3);
      expect(json.data[0].last_purchase_date).toBe('2024-01-03');
      expect(json.data[0].first_purchase_date).toBe('2024-01-01');
    });

    it('should handle negative sale prices (refunds)', async () => {
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 1000.0,
          sale_date: '2024-01-01',
        },
        {
          client_id: 'client-1',
          sale_price: -500.0, // Refund
          sale_date: '2024-01-02',
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 2,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data[0].total_spend).toBe(500.0); // 1000 - 500
      expect(json.data[0].purchase_count).toBe(2);
    });

    it('should filter out sales with null client_id', async () => {
      // Note: The API filters out null client_id using .not('client_id', 'is', null)
      // So the mock should only return sales with client_id
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 2000.0,
          sale_date: '2024-01-02',
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 1,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      // Should only include sales with client_id (filtered by .not('client_id', 'is', null))
      expect(json.data).toHaveLength(1);
      expect(json.data[0].client_id).toBe('client-1');
      expect(mockQuery.not).toHaveBeenCalledWith('client_id', 'is', null);
    });

    it('should handle database errors', async () => {
      const mockNot = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
        count: null,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client'
      );

      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBeDefined();
      expect(mockErrorHandler.handleSupabaseError).toHaveBeenCalled();
    });

    it('should apply date filters when fromDate and toDate are provided', async () => {
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 1000.0,
          sale_date: '2024-01-15',
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 1,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client?fromDate=2024-01-01&toDate=2024-01-31'
      );
      await GET(request);

      expect(mockQuery.gte).toHaveBeenCalledWith('sale_date', '2024-01-01');
      expect(mockQuery.lte).toHaveBeenCalledWith('sale_date', '2024-01-31');
    });

    it('should not apply date filters for invalid dates', async () => {
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 1000.0,
          sale_date: '2024-01-15',
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 1,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      mockValidateDateString.mockReturnValue(false);

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client?fromDate=invalid&toDate=invalid'
      );
      await GET(request);

      expect(mockQuery.gte).not.toHaveBeenCalled();
      expect(mockQuery.lte).not.toHaveBeenCalled();
    });

    it('should apply only fromDate filter when toDate is missing', async () => {
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 1000.0,
          sale_date: '2024-01-15',
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 1,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client?fromDate=2024-01-01'
      );
      await GET(request);

      expect(mockQuery.gte).toHaveBeenCalledWith('sale_date', '2024-01-01');
      expect(mockQuery.lte).not.toHaveBeenCalled();
    });

    it('should apply only toDate filter when fromDate is missing', async () => {
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 1000.0,
          sale_date: '2024-01-15',
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 1,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client?toDate=2024-01-31'
      );
      await GET(request);

      expect(mockQuery.lte).toHaveBeenCalledWith('sale_date', '2024-01-31');
      expect(mockQuery.gte).not.toHaveBeenCalled();
    });

    it('should handle zero sale prices', async () => {
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 0.0,
          sale_date: '2024-01-15',
        },
        {
          client_id: 'client-1',
          sale_price: 1000.0,
          sale_date: '2024-01-16',
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 2,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data[0].total_spend).toBe(1000.0);
      expect(json.data[0].purchase_count).toBe(2);
    });

    it('should handle very large sale prices', async () => {
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 999999999.99,
          sale_date: '2024-01-15',
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 1,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data[0].total_spend).toBe(999999999.99);
    });

    it('should correctly calculate last and first purchase dates with multiple clients', async () => {
      const mockSalesData = [
        {
          client_id: 'client-1',
          sale_price: 1000.0,
          sale_date: '2024-01-10', // First purchase for client-1
        },
        {
          client_id: 'client-1',
          sale_price: 2000.0,
          sale_date: '2024-01-20', // Last purchase for client-1
        },
        {
          client_id: 'client-2',
          sale_price: 1500.0,
          sale_date: '2024-01-15', // Only purchase for client-2
        },
      ];

      const mockNot = jest.fn().mockResolvedValue({
        data: mockSalesData,
        error: null,
        count: 3,
      });
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        not: mockNot,
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/sales/summary-by-client'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);

      const client1Summary = json.data.find(
        (s: any) => s.client_id === 'client-1'
      );
      expect(client1Summary.last_purchase_date).toBe('2024-01-20');
      expect(client1Summary.first_purchase_date).toBe('2024-01-10');

      const client2Summary = json.data.find(
        (s: any) => s.client_id === 'client-2'
      );
      expect(client2Summary.last_purchase_date).toBe('2024-01-15');
      expect(client2Summary.first_purchase_date).toBe('2024-01-15');
    });
  });
});
