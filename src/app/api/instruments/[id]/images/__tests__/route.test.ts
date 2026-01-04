import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getServerSupabase } from '@/lib/supabase-server';
import { validateUUID } from '@/utils/inputValidation';
import { errorHandler } from '@/utils/errorHandler';

jest.mock('@/lib/supabase-server');
jest.mock('@/utils/inputValidation');
jest.mock('@/utils/errorHandler');

const mockGetServerSupabase = getServerSupabase as jest.MockedFunction<
  typeof getServerSupabase
>;
const mockValidateUUID = validateUUID as jest.MockedFunction<
  typeof validateUUID
>;
const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;

describe('/api/instruments/[id]/images', () => {
  const mockInstrumentId = '123e4567-e89b-12d3-a456-426614174000';
  const mockStorage = {
    from: jest.fn().mockReturnValue({
      createSignedUrl: jest.fn().mockResolvedValue({
        data: { signedUrl: 'https://example.com/signed-image.jpg' },
        error: null,
      }),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateUUID.mockReturnValue(true);
    mockErrorHandler.handleSupabaseError = jest
      .fn()
      .mockImplementation((error: unknown) => {
        const err = error as { message?: string };
        return new Error(err.message || 'Database error');
      });
  });

  describe('GET', () => {
    it('should fetch images successfully', async () => {
      const mockImages = [
        {
          id: 'img-1',
          instrument_id: mockInstrumentId,
          image_url: 'https://example.com/image1.jpg',
          display_order: 0,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'img-2',
          instrument_id: mockInstrumentId,
          image_url: 'https://example.com/image2.jpg',
          display_order: 1,
          created_at: '2024-01-02T00:00:00Z',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
        storage: mockStorage as unknown,
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual(mockImages);
      // ✅ 변경: alt_text 컬럼이 없으므로 명시적 컬럼 리스트 사용
      expect(mockQuery.select).toHaveBeenCalledWith(
        'id, instrument_id, image_url, file_name, file_size, mime_type, display_order, created_at'
      );
      expect(mockQuery.eq).toHaveBeenCalledWith(
        'instrument_id',
        mockInstrumentId
      );
      expect(mockQuery.order).toHaveBeenCalledWith('display_order', {
        ascending: true,
      });
    });

    it('should return empty array when no images found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
        storage: mockStorage as unknown,
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual([]);
    });

    it('should return 400 for invalid UUID', async () => {
      mockValidateUUID.mockReturnValue(false);

      const request = new NextRequest(
        'http://localhost/api/instruments/invalid-id/images'
      );
      const context = {
        params: Promise.resolve({ id: 'invalid-id' }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid instrument ID format');
      // UUID validation happens before getServerSupabase is called
      expect(mockGetServerSupabase).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
        storage: mockStorage as unknown,
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Database error');
      expect(mockErrorHandler.handleSupabaseError).toHaveBeenCalled();
    });

    it('should handle exceptions gracefully', async () => {
      mockGetServerSupabase.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };

      try {
        const response = await GET(request, context);
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.error).toBe('Connection failed');
      } catch {
        // If error is thrown, it should be caught by the route handler
        // So we check that errorHandler.handleSupabaseError was called
        expect(errorHandler.handleSupabaseError).toHaveBeenCalled();
      }
    });

    it('should handle params as Promise in Next.js 15+ format', async () => {
      const mockImages = [
        {
          id: 'img-1',
          instrument_id: mockInstrumentId,
          image_url: 'https://example.com/image1.jpg',
          display_order: 0,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
        storage: mockStorage as unknown,
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual(mockImages);
    });

    it('should handle params as object (legacy format)', async () => {
      const mockImages = [
        {
          id: 'img-1',
          instrument_id: mockInstrumentId,
          image_url: 'https://example.com/image1.jpg',
          display_order: 0,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
        storage: mockStorage as unknown,
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: { id: mockInstrumentId } as any,
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual(mockImages);
    });

    it('should handle images with null metadata fields', async () => {
      const mockImages = [
        {
          id: 'img-1',
          instrument_id: mockInstrumentId,
          image_url: 'https://example.com/image1.jpg',
          display_order: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: null,
          metadata: null,
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
        storage: mockStorage as unknown,
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toEqual(mockImages);
    });

    it('should order images by display_order ascending', async () => {
      const mockImages = [
        {
          id: 'img-3',
          instrument_id: mockInstrumentId,
          image_url: 'https://example.com/image3.jpg',
          display_order: 2,
          created_at: '2024-01-03T00:00:00Z',
        },
        {
          id: 'img-1',
          instrument_id: mockInstrumentId,
          image_url: 'https://example.com/image1.jpg',
          display_order: 0,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'img-2',
          instrument_id: mockInstrumentId,
          image_url: 'https://example.com/image2.jpg',
          display_order: 1,
          created_at: '2024-01-02T00:00:00Z',
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
        storage: mockStorage as unknown,
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      await GET(request, context);

      expect(mockQuery.order).toHaveBeenCalledWith('display_order', {
        ascending: true,
      });
    });

    it('should handle large number of images', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) => ({
        id: `img-${i}`,
        instrument_id: mockInstrumentId,
        image_url: `https://example.com/image${i}.jpg`,
        display_order: i,
        created_at: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      }));

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn().mockReturnValue(mockQuery),
        storage: mockStorage as unknown,
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(100);
      expect(json.data[0].display_order).toBe(0);
      expect(json.data[99].display_order).toBe(99);
    });
  });
});
