import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getServerSupabase } from '@/lib/supabase-server';
import { validateUUID } from '@/utils/inputValidation';
import { getStorage } from '@/utils/storage';

// Mock dependencies
jest.mock('@/lib/supabase-server');
jest.mock('@/utils/inputValidation');
jest.mock('@/utils/storage');
jest.mock('@/app/api/_utils/withSentryRoute', () => ({
  withSentryRoute: (fn: unknown) => fn,
}));
jest.mock('@/app/api/_utils/withAuthRoute', () => ({
  withAuthRoute: (fn: unknown) => fn,
}));

const mockGetServerSupabase = getServerSupabase as jest.MockedFunction<
  typeof getServerSupabase
>;
const mockValidateUUID = validateUUID as jest.MockedFunction<
  typeof validateUUID
>;
const mockGetStorage = getStorage as jest.MockedFunction<typeof getStorage>;

describe.skip('/api/instruments/[id]/certificates', () => {
  const mockInstrumentId = '123e4567-e89b-12d3-a456-426614174000';
  const missingTableError = {
    code: '42P01',
    message: 'relation "instrument_certificates" does not exist',
  };

  const createMissingCertificatesQuery = () => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({
      data: [],
      error: missingTableError,
    }),
  });

  const buildSupabaseClient = (mockQuery: any, storage?: unknown) =>
    ({
      from: jest.fn((table: string) =>
        table === 'instrument_certificates'
          ? createMissingCertificatesQuery()
          : mockQuery
      ),
      ...(storage ? { storage } : {}),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateUUID.mockReturnValue(true);

    // ✅ Mock S3Storage for all tests
    const mockStorageInstance = {
      presignPut: jest.fn().mockResolvedValue('https://example.com/signed-url'),
      getFileUrl: jest
        .fn()
        .mockImplementation((key: string) => `https://example.com/${key}`),
      saveFile: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      generateFileKey: jest
        .fn()
        .mockImplementation(
          (name: string, prefix: string) => `${prefix}/${name}`
        ),
    };
    mockGetStorage.mockReturnValue(mockStorageInstance as any);
  });

  describe('GET', () => {
    it('should return list of certificate files successfully', async () => {
      // ✅ Mock certificate rows from database (metadata table)
      const mockCertRows = [
        {
          id: 'cert-1',
          storage_path: 'certificates/123/cert1.pdf',
          original_name: '1234567890_certificate1.pdf',
          mime_type: 'application/pdf',
          size: 5000,
          created_at: '2024-01-02T00:00:00Z',
          version: 1,
          is_primary: false,
        },
        {
          id: 'cert-2',
          storage_path: 'certificates/123/cert2.pdf',
          original_name: '1234567880_certificate2.pdf',
          mime_type: 'application/pdf',
          size: 3000,
          created_at: '2024-01-01T00:00:00Z',
          version: 1,
          is_primary: false,
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId, serial_number: 'SN123' },
          error: null,
        }),
      };

      // Mock certificate query separately
      const mockCertQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockCertRows,
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn((table: string) => {
          if (table === 'instrument_certificates') {
            return mockCertQuery;
          }
          return mockQuery;
        }),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);
      expect(json.data[0].name).toBe('1234567890_certificate1.pdf');
      expect(json.data[0].size).toBe(5000);
      // ✅ S3Storage doesn't use publicUrl anymore
      // expect(json.data[0].publicUrl).toBeDefined();
    });

    it('should return empty array when no certificate files exist', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId, serial_number: 'SN123' },
          error: null,
        }),
      };

      // Mock certificate query with empty result
      const mockCertQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      const mockSupabaseClient = {
        from: jest.fn((table: string) => {
          if (table === 'instrument_certificates') {
            return mockCertQuery;
          }
          return mockQuery;
        }),
      } as any;

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
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
      mockValidateUUID.mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/instruments/invalid-id/certificates'
      );
      const context = {
        params: Promise.resolve({ id: 'invalid-id' }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid instrument ID format');
    });

    it('should return 404 when instrument does not exist', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      };

      const mockSupabaseClient = buildSupabaseClient(mockQuery);

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error).toBe('Instrument not found');
    });

    it('should handle storage list errors gracefully', async () => {
      const mockStorageList = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Storage error' },
      });
      const mockStorage = {
        from: jest.fn().mockReturnValue({
          list: mockStorageList,
        }),
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId, serial_number: 'SN123' },
          error: null,
        }),
      };

      const mockSupabaseClient = buildSupabaseClient(
        mockQuery,
        mockStorage as unknown
      );

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Failed to list certificate files');
    });

    it('should handle files with missing metadata', async () => {
      const mockFiles = [
        {
          name: 'certificate.pdf',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          // No metadata
        },
      ];

      const mockStorageList = jest.fn().mockResolvedValue({
        data: mockFiles,
        error: null,
      });
      const mockStorageCreateSignedUrl = jest.fn((filePath: string) => ({
        data: { signedUrl: `https://example.com/${filePath}` },
      }));
      const mockStorage = {
        from: jest.fn().mockReturnValue({
          list: mockStorageList,
          createSignedUrl: mockStorageCreateSignedUrl,
        }),
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId, serial_number: 'SN123' },
          error: null,
        }),
      };

      const mockSupabaseClient = buildSupabaseClient(
        mockQuery,
        mockStorage as unknown
      );

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].size).toBe(0); // Default to 0 when metadata is missing
    });

    it('should sort files by created_at descending', async () => {
      const mockFiles = [
        {
          name: 'old_file.pdf',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metadata: { size: 1000 },
        },
        {
          name: 'new_file.pdf',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          metadata: { size: 2000 },
        },
        {
          name: 'middle_file.pdf',
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-01T12:00:00Z',
          metadata: { size: 1500 },
        },
      ];

      const mockStorageList = jest.fn().mockResolvedValue({
        data: mockFiles,
        error: null,
      });
      const mockStorageCreateSignedUrl = jest.fn((filePath: string) => ({
        data: { signedUrl: `https://example.com/${filePath}` },
      }));
      const mockStorage = {
        from: jest.fn().mockReturnValue({
          list: mockStorageList,
          createSignedUrl: mockStorageCreateSignedUrl,
        }),
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId, serial_number: 'SN123' },
          error: null,
        }),
      };

      const mockSupabaseClient = buildSupabaseClient(
        mockQuery,
        mockStorage as unknown
      );

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(3);
      // API sorts by created_at desc, so verify the call was made with correct sort params
      // The actual order returned matches what we mocked (Supabase sorts server-side)
      expect(mockStorageList).toHaveBeenCalledWith(
        `certificates/${mockInstrumentId}`,
        expect.objectContaining({
          sortBy: { column: 'created_at', order: 'desc' },
        })
      );
      // Verify all files are present (order is handled by Supabase, not our code)
      const fileNames = json.data.map((f: { name: string }) => f.name);
      expect(fileNames).toContain('new_file.pdf');
      expect(fileNames).toContain('middle_file.pdf');
      expect(fileNames).toContain('old_file.pdf');
    });

    it('should handle files with null createdAt', async () => {
      const mockFiles = [
        {
          name: 'file_no_date.pdf',
          created_at: null,
          updated_at: '2024-01-01T00:00:00Z',
          metadata: { size: 1000 },
        },
      ];

      const mockStorageList = jest.fn().mockResolvedValue({
        data: mockFiles,
        error: null,
      });
      const mockStorageCreateSignedUrl = jest.fn((filePath: string) => ({
        data: { signedUrl: `https://example.com/${filePath}` },
      }));
      const mockStorage = {
        from: jest.fn().mockReturnValue({
          list: mockStorageList,
          createSignedUrl: mockStorageCreateSignedUrl,
        }),
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId, serial_number: 'SN123' },
          error: null,
        }),
      };

      const mockSupabaseClient = buildSupabaseClient(
        mockQuery,
        mockStorage as unknown
      );

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
      // API uses updated_at as fallback when created_at is null
      expect(json.data[0].createdAt).toBe('2024-01-01T00:00:00Z');
      expect(json.data[0].publicUrl).toBeDefined();
    });

    it('should handle files with null updated_at but valid created_at', async () => {
      const mockFiles = [
        {
          name: 'file.pdf',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: null,
          metadata: { size: 1000 },
        },
      ];

      const mockStorageList = jest.fn().mockResolvedValue({
        data: mockFiles,
        error: null,
      });
      const mockStorageCreateSignedUrl = jest.fn((filePath: string) => ({
        data: { signedUrl: `https://example.com/${filePath}` },
      }));
      const mockStorage = {
        from: jest.fn().mockReturnValue({
          list: mockStorageList,
          createSignedUrl: mockStorageCreateSignedUrl,
        }),
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId, serial_number: 'SN123' },
          error: null,
        }),
      };

      const mockSupabaseClient = buildSupabaseClient(
        mockQuery,
        mockStorage as unknown
      );

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('should limit results to 100 files', async () => {
      const mockFiles = Array.from({ length: 150 }, (_, i) => ({
        name: `file_${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        metadata: { size: 1000 },
      }));

      const mockStorageList = jest.fn().mockResolvedValue({
        data: mockFiles.slice(0, 100), // Should be limited to 100
        error: null,
      });
      const mockStorageCreateSignedUrl = jest.fn((filePath: string) => ({
        data: { signedUrl: `https://example.com/${filePath}` },
      }));
      const mockStorage = {
        from: jest.fn().mockReturnValue({
          list: mockStorageList,
          createSignedUrl: mockStorageCreateSignedUrl,
        }),
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId, serial_number: 'SN123' },
          error: null,
        }),
      };

      const mockSupabaseClient = buildSupabaseClient(
        mockQuery,
        mockStorage as unknown
      );

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);

      expect(mockStorageList).toHaveBeenCalledWith(
        `certificates/${mockInstrumentId}`,
        expect.objectContaining({
          limit: 100,
        })
      );
      expect(response.status).toBe(200);
    });

    it('should handle non-Error exceptions in list handler', async () => {
      // Mock getServerSupabase to throw a non-Error
      mockGetServerSupabase.mockImplementationOnce(() => {
        throw 'String error'; // Non-Error exception
      });

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Failed to list certificates');
    });

    it('should handle files with null metadata', async () => {
      const mockFiles = [
        {
          name: 'file_no_metadata.pdf',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metadata: null,
        },
      ];

      const mockStorageList = jest.fn().mockResolvedValue({
        data: mockFiles,
        error: null,
      });
      const mockStorageCreateSignedUrl = jest.fn((filePath: string) => ({
        data: { signedUrl: `https://example.com/${filePath}` },
      }));
      const mockStorage = {
        from: jest.fn().mockReturnValue({
          list: mockStorageList,
          createSignedUrl: mockStorageCreateSignedUrl,
        }),
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId, serial_number: 'SN123' },
          error: null,
        }),
      };

      const mockSupabaseClient = buildSupabaseClient(
        mockQuery,
        mockStorage as unknown
      );

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].size).toBe(0); // Default to 0 when metadata is null
    });

    it('should handle instrument query error', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error', code: 'PGRST_ERROR' },
        }),
      };

      const mockSupabaseClient = buildSupabaseClient(mockQuery);

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error).toBe('Instrument not found');
    });

    it('should handle storage createSignedUrl error gracefully', async () => {
      const mockFiles = [
        {
          name: 'file.pdf',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          metadata: { size: 1000 },
        },
      ];

      const mockStorageList = jest.fn().mockResolvedValue({
        data: mockFiles,
        error: null,
      });
      // createSignedUrl should still return data even if there's an error
      const mockStorageCreateSignedUrl = jest.fn(() => ({
        data: { signedUrl: null },
      }));
      const mockStorage = {
        from: jest.fn().mockReturnValue({
          list: mockStorageList,
          createSignedUrl: mockStorageCreateSignedUrl,
        }),
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId, serial_number: 'SN123' },
          error: null,
        }),
      };

      const mockSupabaseClient = buildSupabaseClient(
        mockQuery,
        mockStorage as unknown
      );

      mockGetServerSupabase.mockReturnValue(mockSupabaseClient);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/certificates`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
      // Should still include publicUrl even if it's null
      expect(json.data[0].publicUrl).toBeDefined();
    });
  });
});
