import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE, PUT } from '../route';
import { getServerSupabase } from '@/lib/supabase-server';
jest.mock('@/lib/supabase-server');
jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/utils/typeGuards');
jest.mock('@/utils/inputValidation');

const mockGetServerSupabase = getServerSupabase as jest.MockedFunction<
  typeof getServerSupabase
>;
// Mock typeGuards
jest.mock('@/utils/typeGuards', () => {
  const actual = jest.requireActual('@/utils/typeGuards');
  return {
    ...actual,
    safeValidate: jest.fn(data => ({
      success: true,
      data,
    })),
    validateClientInstrument: jest.fn(data => data),
    validateCreateClientInstrument: jest.fn(data => data),
    validatePartialClientInstrument: jest.fn(data => data),
  };
});

// Mock inputValidation
jest.mock('@/utils/inputValidation', () => ({
  validateSortColumn: jest.fn((table, value) => value || 'created_at'),
  validateUUID: jest.fn(value =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  ),
}));

describe('/api/connections', () => {
  const mockConnection = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    client_id: '123e4567-e89b-12d3-a456-426614174001',
    instrument_id: '123e4567-e89b-12d3-a456-426614174002',
    display_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    client: null,
    instrument: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET', () => {
    it('should return connections', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockConnection],
        error: null,
        count: 1,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest('http://localhost/api/connections');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([mockConnection]);
      expect(json.count).toBe(1);
    });

    it('should filter by client_id', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockConnection],
        error: null,
        count: 1,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/connections?client_id=${mockConnection.client_id}`
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith(
        'client_id',
        mockConnection.client_id
      );
    });

    it('should filter by instrument_id', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockConnection],
        error: null,
        count: 1,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/connections?instrument_id=${mockConnection.instrument_id}`
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith(
        'instrument_id',
        mockConnection.instrument_id
      );
    });

    it('should apply pagination', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
      };
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [mockConnection],
        error: null,
        count: 10,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/connections?page=1&pageSize=5'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(mockQuery.range).toHaveBeenCalledWith(0, 4);
      expect(json.page).toBe(1);
      expect(json.pageSize).toBe(5);
      expect(json.totalPages).toBe(2);
    });

    it('should return 400 for invalid client_id', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/connections?client_id=invalid'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid client_id format');
    });
  });

  describe('POST', () => {
    it('should create a new connection', async () => {
      const createData = {
        client_id: mockConnection.client_id,
        instrument_id: mockConnection.instrument_id,
      };

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: mockConnection,
        error: null,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify(createData),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data).toBeDefined();
      expect(mockQuery.insert).toHaveBeenCalled();
    });

    it('should return 400 for invalid data', async () => {
      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify({ invalid: 'data' }),
      });

      const { safeValidate } = require('@/utils/typeGuards');
      (safeValidate as jest.Mock).mockReturnValueOnce({
        success: false,
        error: 'Invalid connection data',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Invalid connection data');
    });
  });

  describe('PATCH', () => {
    it('should update an existing connection', async () => {
      const updates = { display_order: 1 };
      const updatedConnection = { ...mockConnection, ...updates };

      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: updatedConnection,
        error: null,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        body: JSON.stringify({ id: mockConnection.id, ...updates }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(mockQuery.update).toHaveBeenCalled();
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        body: JSON.stringify({ display_order: 1 }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Connection ID is required');
    });
  });

  describe('DELETE', () => {
    it('should delete a connection', async () => {
      const mockQuery = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn(),
      };
      (mockQuery.eq as jest.Mock).mockResolvedValue({
        error: null,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/connections?id=${mockConnection.id}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockQuery.delete).toHaveBeenCalled();
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/connections');
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Connection ID is required');
    });
  });

  describe('PUT', () => {
    it('should batch update display_order', async () => {
      const orders = [
        { id: '123e4567-e89b-12d3-a456-426614174000', display_order: 0 },
        { id: '123e4567-e89b-12d3-a456-426614174001', display_order: 1 },
      ];

      // Mock update queries (one for each order)
      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn(),
      };
      (mockUpdateQuery.eq as jest.Mock).mockResolvedValue({ error: null });

      // Mock select query for final fetch
      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn(),
      };
      (mockSelectQuery.in as jest.Mock).mockResolvedValue({
        data: orders.map(o => ({
          ...mockConnection,
          id: o.id,
          display_order: o.display_order,
        })),
        error: null,
      });

      let callCount = 0;
      const mockSupabaseClient = {
        from: jest.fn().mockImplementation(() => {
          callCount++;
          // First N calls are for updates (one per order), last call is for select
          if (callCount <= orders.length) {
            return mockUpdateQuery;
          }
          return mockSelectQuery;
        }),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PUT',
        body: JSON.stringify({ orders }),
      });
      const response = await PUT(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data).toHaveLength(2);
    });

    it('should return 400 when orders is not an array', async () => {
      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PUT',
        body: JSON.stringify({ orders: 'not-an-array' }),
      });
      const response = await PUT(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('orders must be an array');
    });

    it('should return empty array when orders is empty', async () => {
      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PUT',
        body: JSON.stringify({ orders: [] }),
      });
      const response = await PUT(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([]);
    });

    it('should return 400 for invalid connection ID in orders', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PUT',
        body: JSON.stringify({
          orders: [{ id: 'invalid', display_order: 0 }],
        }),
      });
      const response = await PUT(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Invalid connection ID');
    });
  });
});
