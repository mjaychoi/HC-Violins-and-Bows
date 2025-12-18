import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from '../route';
import { getServerSupabase } from '@/lib/supabase-server';
import { errorHandler } from '@/utils/errorHandler';

jest.mock('@/lib/supabase-server');
jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/utils/inputValidation');
jest.mock('@/utils/dateParsing');

const mockGetServerSupabase = getServerSupabase as jest.MockedFunction<
  typeof getServerSupabase
>;
const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;

// Mock inputValidation
jest.mock('@/utils/inputValidation', () => ({
  validateUUID: jest.fn(value =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  ),
}));

// Mock dateParsing
jest.mock('@/utils/dateParsing', () => ({
  todayLocalYMD: jest.fn(() => '2024-01-20'),
}));

describe('/api/contacts', () => {
  const mockContactLog = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    client_id: '123e4567-e89b-12d3-a456-426614174001',
    instrument_id: null,
    contact_type: 'email',
    subject: 'Test Subject',
    content: 'Test content',
    contact_date: '2024-01-15',
    next_follow_up_date: null,
    follow_up_completed_at: null,
    purpose: 'inquiry',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
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
    it('should return contact logs', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest('http://localhost/api/contacts');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([mockContactLog]);
      expect(json.success).toBe(true);
    });

    it('should filter by clientId', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/contacts?clientId=${mockContactLog.client_id}`
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith(
        'client_id',
        mockContactLog.client_id
      );
    });

    it('should filter by batch clientIds', async () => {
      const clientIds = [
        '123e4567-e89b-12d3-a456-426614174001',
        '123e4567-e89b-12d3-a456-426614174002',
      ];
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/contacts?clientIds=${clientIds.join(',')}`
      );
      await GET(request);

      expect(mockQuery.in).toHaveBeenCalledWith('client_id', clientIds);
    });

    it('should filter by instrumentId', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const instrumentId = '123e4567-e89b-12d3-a456-426614174002';
      const request = new NextRequest(
        `http://localhost/api/contacts?instrumentId=${instrumentId}`
      );
      await GET(request);

      expect(mockQuery.eq).toHaveBeenCalledWith('instrument_id', instrumentId);
    });

    it('should filter by date range', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/contacts?fromDate=2024-01-01&toDate=2024-01-31'
      );
      await GET(request);

      expect(mockQuery.gte).toHaveBeenCalledWith('contact_date', '2024-01-01');
      expect(mockQuery.lte).toHaveBeenCalledWith('contact_date', '2024-01-31');
    });

    it('should filter by followUpDue', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [mockContactLog],
        error: null,
        count: 1,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        'http://localhost/api/contacts?followUpDue=true'
      );
      await GET(request);

      expect(mockQuery.not).toHaveBeenCalledWith(
        'next_follow_up_date',
        'is',
        null
      );
      expect(mockQuery.lte).toHaveBeenCalledWith(
        'next_follow_up_date',
        '2024-01-20'
      );
      expect(mockQuery.is).toHaveBeenCalledWith('follow_up_completed_at', null);
    });
  });

  describe('POST', () => {
    it('should create a new contact log', async () => {
      const createData = {
        client_id: mockContactLog.client_id,
        instrument_id: null,
        contact_type: 'email',
        subject: 'Test Subject',
        content: 'Test content',
        contact_date: '2024-01-15',
        next_follow_up_date: null,
        purpose: 'inquiry',
      };

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: mockContactLog,
        error: null,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        body: JSON.stringify(createData),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.success).toBe(true);
      expect(mockQuery.insert).toHaveBeenCalled();
    });

    it('should return 400 when client_id is missing', async () => {
      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          contact_type: 'email',
          content: 'Test',
          contact_date: '2024-01-15',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Valid client_id is required');
    });

    it('should return 400 when contact_type is invalid', async () => {
      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          client_id: mockContactLog.client_id,
          contact_type: 'invalid',
          content: 'Test',
          contact_date: '2024-01-15',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Valid contact_type is required');
    });

    it('should return 400 when content is missing', async () => {
      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          client_id: mockContactLog.client_id,
          contact_type: 'email',
          contact_date: '2024-01-15',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Content is required');
    });
  });

  describe('PATCH', () => {
    it('should update an existing contact log', async () => {
      const updates = {
        subject: 'Updated Subject',
        content: 'Updated content',
      };
      const updatedContact = { ...mockContactLog, ...updates };

      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: updatedContact,
        error: null,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'PATCH',
        body: JSON.stringify({ id: mockContactLog.id, ...updates }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.success).toBe(true);
      expect(mockQuery.update).toHaveBeenCalled();
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'PATCH',
        body: JSON.stringify({ subject: 'Updated' }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Valid id is required');
    });

    it('should trim content when updating', async () => {
      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: mockContactLog,
        error: null,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest('http://localhost/api/contacts', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockContactLog.id,
          content: '  Test content with spaces  ',
        }),
      });
      await PATCH(request);

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Test content with spaces',
        })
      );
    });
  });

  describe('DELETE', () => {
    it('should delete a contact log', async () => {
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
        `http://localhost/api/contacts?id=${mockContactLog.id}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockQuery.delete).toHaveBeenCalled();
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/contacts');
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Valid id is required');
    });

    it('should return 400 for invalid UUID', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/contacts?id=invalid'
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Valid id is required');
    });

    it('should handle Supabase errors on delete', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockQuery = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn(),
      };
      (mockQuery.eq as jest.Mock).mockResolvedValue({
        error: mockError,
      });

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);
      mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue({
        code: 'PGRST116',
        message: 'Database error',
      });

      const request = new NextRequest(
        `http://localhost/api/contacts?id=${mockContactLog.id}`
      );
      const response = await DELETE(request);

      expect(response.status).toBe(500);
      expect(mockErrorHandler.handleSupabaseError).toHaveBeenCalled();
    });
  });
});
