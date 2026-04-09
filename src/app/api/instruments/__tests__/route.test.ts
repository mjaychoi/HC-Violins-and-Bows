import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from '../route';
import { errorHandler } from '@/utils/errorHandler';

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;
let mockUserSupabase: any;
let mockAuthContext: any;

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => (request: NextRequest) =>
      handler(request, {
        ...mockAuthContext,
        userSupabase: mockUserSupabase,
      }),
  };
});

// Mock typeGuards
jest.mock('@/utils/typeGuards', () => {
  const actual = jest.requireActual('@/utils/typeGuards');
  return {
    ...actual,
    validateSortColumn: jest.fn((table, value) => value || 'created_at'),
    validateUUID: jest.fn(value =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value
      )
    ),
    safeValidate: jest.fn(data => ({
      success: true,
      data,
    })),
    validateInstrument: jest.fn(data => data),
    validateInstrumentArray: jest.fn(data => data),
    validateCreateInstrument: jest.fn(data => data),
    validatePartialInstrument: jest.fn(data => data),
  };
});

// Mock inputValidation
jest.mock('@/utils/inputValidation', () => ({
  validateSortColumn: jest.fn((table, value) => value || 'created_at'),
  validateDateString: jest.fn(value => /^\d{4}-\d{2}-\d{2}$/.test(value)),
  validateUUID: jest.fn(value =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  ),
}));

describe('/api/instruments', () => {
  const mockInstrument = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    maker: 'Stradivarius',
    type: 'Violin',
    subtype: 'Classical',
    serial_number: 'SN12345',
    year: 1700,
    ownership: null,
    size: null,
    weight: null,
    note: null,
    price: null,
    certificate: false,
    status: 'Available',
    created_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(performance, 'now').mockReturnValue(0);
    mockUserSupabase = {
      from: jest.fn(),
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
    it('should reject requests without org context', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        orgId: null,
      };

      const request = new NextRequest('http://localhost/api/instruments');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe('Organization context required');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should scope GET queries to auth org and return instruments', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockInstrument],
        error: null,
        count: 1,
      });

      const mockCertQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest.fn((table: string) =>
          table === 'instrument_certificates' ? mockCertQuery : mockQuery
        ),
      } as any;
      mockAuthContext = { ...mockAuthContext, userSupabase: mockUserSupabase };

      const request = new NextRequest('http://localhost/api/instruments');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([
        { ...mockInstrument, has_certificate: false },
      ]);
      expect(json.count).toBe(1);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should prevent cross-org reads by filtering with the caller org_id', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      mockUserSupabase = {
        from: jest.fn((table: string) =>
          table === 'instrument_certificates'
            ? {
                select: jest.fn().mockReturnThis(),
                in: jest.fn().mockResolvedValue({ data: [], error: null }),
              }
            : mockQuery
        ),
      } as any;
      mockAuthContext = {
        ...mockAuthContext,
        orgId: 'org-abc',
        userSupabase: mockUserSupabase,
      };

      const request = new NextRequest(
        'http://localhost/api/instruments?ownership=owned'
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenNthCalledWith(1, 'org_id', 'org-abc');
      expect(mockQuery.eq).toHaveBeenNthCalledWith(2, 'ownership', 'owned');
    });

    it.skip('should return instruments with default parameters', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockInstrument],
        error: null,
        count: 1,
      });

      const mockCertQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest
          .fn()
          .mockImplementation((table: string) =>
            table === 'instrument_certificates' ? mockCertQuery : mockQuery
          ),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([mockInstrument]);
      expect(json.count).toBe(1);
    });

    it('should filter by ownership', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockInstrument],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn((table: string) =>
          table === 'instrument_certificates'
            ? {
                select: jest.fn().mockReturnThis(),
                in: jest.fn().mockResolvedValue({ data: [], error: null }),
              }
            : mockQuery
        ),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/instruments?ownership=owned'
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith('ownership', 'owned');
    });

    it('should filter instruments by search query', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockInstrument],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn((table: string) =>
          table === 'instrument_certificates'
            ? {
                select: jest.fn().mockReturnThis(),
                in: jest.fn().mockResolvedValue({ data: [], error: null }),
              }
            : mockQuery
        ),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/instruments?search=Stradivarius'
      );
      await GET(request);

      expect(mockQuery.or).toHaveBeenCalled();
    });

    it('should apply limit when provided', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockInstrument],
        error: null,
        count: 1,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/instruments?limit=10'
      );
      await GET(request);

      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    it('should handle Supabase errors', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: null,
        error: mockError,
        count: 0,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;
      mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue({
        code: 'PGRST116',
        message: 'Database error',
      });

      const request = new NextRequest('http://localhost/api/instruments');
      const response = await GET(request);

      expect(response.status).toBe(500);
      expect(mockErrorHandler.handleSupabaseError).toHaveBeenCalled();
    });
  });

  describe('POST', () => {
    it('should create a new instrument', async () => {
      const createData = {
        maker: 'Guarneri',
        type: 'Violin',
        subtype: 'Classical',
        serial_number: 'SN67890',
        year: 1740,
        ownership: null,
        size: null,
        weight: null,
        note: null,
        price: null,
        certificate: false,
        status: 'Available',
      };

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: { ...mockInstrument, ...createData },
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
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
      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        body: JSON.stringify({ invalid: 'data' }),
      });

      const { safeValidate } = require('@/utils/typeGuards');
      (safeValidate as jest.Mock).mockReturnValueOnce({
        success: false,
        error: 'Invalid instrument data',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Invalid instrument data');
    });
  });

  describe('PATCH', () => {
    it('should update an existing instrument', async () => {
      const updates = { note: 'Fair condition' };
      const updatedInstrument = { ...mockInstrument, ...updates };

      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: updatedInstrument,
        error: null,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'PATCH',
        body: JSON.stringify({ id: mockInstrument.id, ...updates }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(mockQuery.update).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', mockInstrument.id);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'PATCH',
        body: JSON.stringify({ condition: 'fair' }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Instrument ID is required');
    });

    it('should return 400 for invalid UUID', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'invalid-id', condition: 'fair' }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid instrument ID format');
    });

    it('should use atomic sale transition RPC for Sold status changes', async () => {
      const stateQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            status: 'Available',
            reserved_reason: null,
            reserved_by_user_id: null,
            reserved_connection_id: null,
          },
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(stateQuery),
        rpc: jest.fn().mockResolvedValue({
          data: { ...mockInstrument, status: 'Sold' },
          error: null,
        }),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockInstrument.id,
          status: 'Sold',
          sale_transition: {
            sale_price: 1500000,
            sale_date: '2026-04-02',
            client_id: '123e4567-e89b-12d3-a456-426614174111',
            sales_note: 'Auto-created',
          },
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.status).toBe('Sold');
      expect(mockUserSupabase.rpc).toHaveBeenCalledWith(
        'update_instrument_sale_transition_atomic',
        expect.objectContaining({
          p_instrument_id: mockInstrument.id,
          p_sale_price: 1500000,
          p_sale_date: '2026-04-02',
          p_client_id: '123e4567-e89b-12d3-a456-426614174111',
          p_sales_note: 'Auto-created',
        })
      );
    });
  });

  describe('DELETE', () => {
    it('should delete an instrument', async () => {
      const mockQuery = {
        delete: jest.fn().mockReturnThis(),
        error: null,
        count: 1,
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest(
        `http://localhost/api/instruments?id=${mockInstrument.id}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', mockInstrument.id);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/instruments');
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Instrument ID is required');
    });

    it('should return 400 for invalid UUID', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/instruments?id=invalid'
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid instrument ID format');
    });
  });
});
