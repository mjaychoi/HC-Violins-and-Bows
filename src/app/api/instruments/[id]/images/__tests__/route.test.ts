import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '../route';
import { validateUUID } from '@/utils/inputValidation';
import { errorHandler } from '@/utils/errorHandler';

jest.mock('@/utils/inputValidation');
jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/app/api/_utils/rateLimit', () => ({
  searchRateLimit: null,
  exportRateLimit: null,
  authRateLimit: null,
  mutationRateLimit: null,
  uploadRateLimit: null,
  destructiveMutationRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  applyScopedRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  tooManyRequestsApiResult: () => ({
    payload: { error: 'Too many requests', success: false },
    status: 429,
  }),
}));
jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  assertInstrumentImagesSchemaReadiness: jest.fn().mockResolvedValue({
    ready: true,
    checkedAt: '2026-05-08T00:00:00.000Z',
    missingColumns: [],
  }),
}));

const mockValidateUUID = validateUUID as jest.MockedFunction<
  typeof validateUUID
>;
const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;
let mockUserSupabase: any;
let mockAuthContext: any;

// ─── Storage singleton shared between route and tests ───────────────────────
let mockStorage: {
  saveFile: jest.Mock;
  deleteFile: jest.Mock;
  fileExists: jest.Mock;
  getFileUrl: jest.Mock;
  presignGet: jest.Mock;
};

jest.mock('@/utils/storage', () => ({
  getStorage: jest.fn(() => mockStorage),
}));

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

describe('/api/instruments/[id]/images', () => {
  const mockInstrumentId = '123e4567-e89b-12d3-a456-426614174000';
  const mockImageId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  function makeSupabaseClient(imageQuery: unknown, instrumentExists = true) {
    const instrumentQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: instrumentExists ? { id: mockInstrumentId } : null,
        error: instrumentExists ? null : { message: 'Instrument not found' },
      }),
    };

    const client = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'instruments') return instrumentQuery;
        if (table === 'instrument_images') return imageQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
      rpc: jest.fn(),
    } as any;

    client.__instrumentQuery = instrumentQuery;
    client.__imageQuery = imageQuery;
    return client;
  }

  // Minimal valid magic bytes for each supported MIME type
  const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const PNG_MAGIC = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const WEBP_MAGIC = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  // A buffer with no valid image magic bytes (simulates a renamed non-image file)
  const BAD_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

  const MIME_MAGIC: Record<string, Buffer> = {
    'image/jpeg': JPEG_MAGIC,
    'image/jpg': JPEG_MAGIC,
    'image/png': PNG_MAGIC,
    'image/webp': WEBP_MAGIC,
  };

  /**
   * Build a file-like object that satisfies UploadFileLike in all envs.
   * When `content` is omitted the buffer defaults to valid magic bytes for
   * the given MIME type so that the magic-byte check passes by default.
   */
  function makeFileLike(name: string, type: string, content?: Buffer | string) {
    const data =
      content !== undefined
        ? Buffer.isBuffer(content)
          ? content
          : Buffer.from(content)
        : (MIME_MAGIC[type] ?? Buffer.from('img-data'));

    // Buffer.from([...]) uses Node's pool, so data.buffer is a larger shared
    // ArrayBuffer with data starting at data.byteOffset — NOT at offset 0.
    // We copy into a fresh ArrayBuffer so the route's Buffer.from(arrayBuffer)
    // reads the magic bytes at index 0, exactly as a real browser File does.
    const isolated = new ArrayBuffer(data.length);
    new Uint8Array(isolated).set(data);

    return {
      name,
      type,
      size: data.length,
      arrayBuffer: async () => isolated,
    };
  }

  type FileLike = ReturnType<typeof makeFileLike>;

  function makePostRequest(files: FileLike[]): NextRequest {
    const req = new NextRequest(
      `http://localhost/api/instruments/${mockInstrumentId}/images`,
      { method: 'POST' }
    );
    // Inject a synthetic FormData so the route receives our controlled files
    (req as any).formData = async () => ({
      getAll: jest.fn().mockReturnValue(files),
    });
    return req;
  }

  function makeDeleteRequest(imageId: string): NextRequest {
    return new NextRequest(
      `http://localhost/api/instruments/${mockInstrumentId}/images?imageId=${imageId}`,
      { method: 'DELETE' }
    );
  }

  function makeStoredImage(
    imageId: string,
    displayOrder: number,
    overrides: Record<string, unknown> = {}
  ) {
    const storageKey = `test-org/${mockInstrumentId}/${imageId}.jpg`;
    return {
      id: imageId,
      instrument_id: mockInstrumentId,
      image_url: `https://presigned.example.com/${storageKey}`,
      storage_key: storageKey,
      file_name: `${imageId}.jpg`,
      file_size: 123,
      mime_type: 'image/jpeg',
      display_order: displayOrder,
      created_at: '2024-01-01T00:00:00Z',
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    const {
      assertInstrumentImagesSchemaReadiness,
    } = require('@/app/api/_utils/schemaReadiness');
    assertInstrumentImagesSchemaReadiness.mockResolvedValue({
      ready: true,
      checkedAt: '2026-05-08T00:00:00.000Z',
      missingColumns: [],
    });
    mockValidateUUID.mockReturnValue(true);
    mockStorage = {
      saveFile: jest.fn().mockResolvedValue(`org/${mockInstrumentId}/file.jpg`),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      fileExists: jest.fn().mockResolvedValue(true),
      getFileUrl: jest.fn(
        (key: string) => `https://storage.example.com/${key}`
      ),
      presignGet: jest.fn((key: string) =>
        Promise.resolve(`https://presigned.example.com/${key}`)
      ),
    };
    mockUserSupabase = {
      from: jest.fn(),
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
        makeStoredImage('img-1', 0),
        makeStoredImage('img-2', 1, {
          created_at: '2024-01-02T00:00:00Z',
        }),
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      mockUserSupabase = makeSupabaseClient(mockQuery);

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
        'id, instrument_id, image_url, storage_key, file_name, file_size, mime_type, display_order, created_at, instruments!inner(org_id)'
      );
      expect(mockQuery.eq).toHaveBeenCalledWith(
        'instrument_id',
        mockInstrumentId
      );
      expect(mockQuery.eq).toHaveBeenCalledWith(
        'instruments.org_id',
        'test-org'
      );
      expect(mockUserSupabase.__instrumentQuery.eq).toHaveBeenCalledWith(
        'org_id',
        'test-org'
      );
      expect(mockQuery.order).toHaveBeenCalledWith('display_order', {
        ascending: true,
      });
    });

    it('should reject missing org context before any tenant-owned reads', async () => {
      mockAuthContext.orgId = null;

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json).toMatchObject({
        message: 'Organization context required',
        retryable: false,
      });
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
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

      mockUserSupabase = makeSupabaseClient(mockQuery);

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
      expect(json).toMatchObject({
        message: 'Invalid instrument ID format',
        retryable: false,
      });
      // UUID validation happens before the admin client helper is called
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

      mockUserSupabase = makeSupabaseClient(mockQuery);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.message).toBe('Database error');
    });

    it('returns safe SCHEMA_OUT_OF_DATE when image metadata columns are missing', async () => {
      const {
        assertInstrumentImagesSchemaReadiness,
      } = require('@/app/api/_utils/schemaReadiness');
      assertInstrumentImagesSchemaReadiness.mockRejectedValueOnce(
        Object.assign(new Error('Database migration required'), {
          code: 'SCHEMA_OUT_OF_DATE',
          error_code: 'SCHEMA_OUT_OF_DATE',
          status: 503,
          retryable: false,
          details: {
            missingColumns: ['public.instrument_images.storage_key'],
          },
        })
      );

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn(),
      };
      mockUserSupabase = makeSupabaseClient(mockQuery);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json).toMatchObject({
        message: 'Database migration required.',
        error_code: 'SCHEMA_OUT_OF_DATE',
        retryable: false,
      });
      expect(mockQuery.order).not.toHaveBeenCalled();
    });

    it('should fail closed when the instrument is outside the caller org', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn(),
      };

      mockUserSupabase = makeSupabaseClient(mockQuery, false);
      mockAuthContext.userSupabase = mockUserSupabase;

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json).toMatchObject({
        message: 'Instrument not found',
        retryable: false,
      });
      expect(mockQuery.order).not.toHaveBeenCalled();
      expect(mockUserSupabase.__instrumentQuery.eq).toHaveBeenCalledWith(
        'org_id',
        'test-org'
      );
    });

    it('should handle exceptions gracefully', async () => {
      mockUserSupabase = undefined;

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };

      const response = await GET(request, context);
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.message).toContain('from');
    });

    it('should handle params as Promise in Next.js 15+ format', async () => {
      const mockImages = [makeStoredImage('img-1', 0)];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      mockUserSupabase = makeSupabaseClient(mockQuery);

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
      const mockImages = [makeStoredImage('img-1', 0)];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      mockUserSupabase = makeSupabaseClient(mockQuery);

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
        makeStoredImage('img-1', 0, {
          updated_at: null,
          metadata: null,
        }),
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      mockUserSupabase = makeSupabaseClient(mockQuery);

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

    it('should order images by display_order ascending (alias)', async () => {
      const mockImages = [
        makeStoredImage('img-3', 2, {
          created_at: '2024-01-03T00:00:00Z',
        }),
        makeStoredImage('img-1', 0),
        makeStoredImage('img-2', 1, {
          created_at: '2024-01-02T00:00:00Z',
        }),
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      mockUserSupabase = makeSupabaseClient(mockQuery);

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

    it('uses persisted storage_key for signed URLs instead of reconstructing from file_name', async () => {
      const storedKey = `other-org/${mockInstrumentId}/actual-key.jpg`;
      const mockImages = [
        {
          id: 'img-1',
          instrument_id: mockInstrumentId,
          image_url: 'https://storage.example.com/legacy-wrong-key.jpg',
          storage_key: storedKey,
          file_name: 'reconstructed-would-be-wrong.jpg',
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

      mockUserSupabase = makeSupabaseClient(mockQuery);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(mockStorage.presignGet).toHaveBeenCalledWith(storedKey, 600);
      expect(json.data[0].image_url).toBe(
        `https://presigned.example.com/${storedKey}`
      );
    });

    it('falls back to parsing legacy image_url when storage_key is absent', async () => {
      const legacyKey = `test-org/${mockInstrumentId}/legacy-key.jpg`;
      const mockImages = [
        {
          id: 'img-1',
          instrument_id: mockInstrumentId,
          image_url: `https://bucket.s3.us-east-1.amazonaws.com/${legacyKey}`,
          storage_key: null,
          file_name: 'legacy-key.jpg',
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

      mockUserSupabase = makeSupabaseClient(mockQuery);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(mockStorage.presignGet).toHaveBeenCalledWith(legacyKey, 600);
      expect(json.data[0].image_url).toBe(
        `https://presigned.example.com/${legacyKey}`
      );
    });

    it('should handle large number of images', async () => {
      const mockImages = Array.from({ length: 100 }, (_, i) =>
        makeStoredImage(`img-${i}`, i, {
          created_at: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        })
      );

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      mockUserSupabase = makeSupabaseClient(mockQuery);

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

    it('returns 404 when the storage object is missing', async () => {
      const mockImages = [makeStoredImage('img-1', 0)];
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      mockStorage.fileExists.mockResolvedValueOnce(false);
      mockUserSupabase = makeSupabaseClient(mockQuery);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json).toMatchObject({
        message: 'Media object not found',
        retryable: false,
      });
      expect(mockStorage.presignGet).not.toHaveBeenCalled();
    });

    it('returns 500 when access URL generation fails', async () => {
      const mockImages = [makeStoredImage('img-1', 0)];
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockImages,
          error: null,
        }),
      };

      mockStorage.presignGet.mockRejectedValueOnce(new Error('presign failed'));
      mockUserSupabase = makeSupabaseClient(mockQuery);

      const request = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images`
      );
      const context = {
        params: Promise.resolve({ id: mockInstrumentId }),
      };
      const response = await GET(request, context);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json).toMatchObject({
        message: 'Failed to generate access URL',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST — compensating rollback on multi-file upload failure
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST — compensating rollback', () => {
    const idCtx = { params: Promise.resolve({ id: mockInstrumentId }) };

    function makeInstrumentQuery() {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId },
          error: null,
        }),
      };
    }

    function makeImageInsertQuery(insertedId: string) {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: insertedId,
            instrument_id: mockInstrumentId,
            image_url: 'https://storage.example.com/key',
            storage_key: `org/${mockInstrumentId}/file.jpg`,
            file_name: 'file.jpg',
            file_size: 8,
            mime_type: 'image/jpeg',
            display_order: 0,
            created_at: '2024-01-01T00:00:00Z',
          },
          error: null,
        }),
      };
    }

    it('single file upload succeeds — no rollback called', async () => {
      const file = makeFileLike('photo.jpg', 'image/jpeg');
      const insertedId = 'inserted-id-1';

      const imageQuery = makeImageInsertQuery(insertedId);
      mockUserSupabase = makeSupabaseClient(imageQuery);
      mockUserSupabase.rpc = jest
        .fn()
        .mockResolvedValue({ data: insertedId, error: null });

      const res = await POST(makePostRequest([file]), idCtx);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
      expect(mockUserSupabase.rpc).toHaveBeenCalledWith(
        'create_instrument_image_metadata',
        expect.objectContaining({
          p_storage_key: `org/${mockInstrumentId}/file.jpg`,
          p_file_name: 'file.jpg',
          p_file_size: file.size,
          p_mime_type: 'image/jpeg',
        })
      );
    });

    it('uses server org for storage keys and ignores forged tenant inputs', async () => {
      const file = makeFileLike('photo.png', 'image/png');
      const insertedId = 'inserted-id-forged-org';
      const imageQuery = makeImageInsertQuery(insertedId);

      mockUserSupabase = makeSupabaseClient(imageQuery);
      mockUserSupabase.rpc = jest
        .fn()
        .mockResolvedValue({ data: insertedId, error: null });

      const req = new NextRequest(
        `http://localhost/api/instruments/${mockInstrumentId}/images?org_id=forged-org`,
        { method: 'POST' }
      );
      (req as any).formData = async () => ({
        getAll: jest.fn((field: string) =>
          field === 'images' ? [file] : ['forged-org']
        ),
      });

      const res = await POST(req, idCtx);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(mockStorage.saveFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringMatching(new RegExp(`^test-org/${mockInstrumentId}/`)),
        'image/png'
      );
      expect(mockUserSupabase.__instrumentQuery.eq).toHaveBeenCalledWith(
        'org_id',
        'test-org'
      );
    });

    it('3-file upload: failure on 2nd file rolls back 1st file (storage + DB)', async () => {
      const files = [
        makeFileLike('a.jpg', 'image/jpeg'),
        makeFileLike('b.jpg', 'image/jpeg'),
        makeFileLike('c.jpg', 'image/jpeg'),
      ];

      const insertedId1 = 'inserted-id-a';
      const storedKey1 = `test-org/${mockInstrumentId}/a.jpg`;

      // saveFile: succeeds for file 1, throws on file 2
      mockStorage.saveFile
        .mockResolvedValueOnce(storedKey1)
        .mockRejectedValueOnce(new Error('Storage unavailable'));

      // from('instrument_images') call order:
      //   1st: fetch after insert  → select/eq/single
      //   2nd: rollback delete     → delete/eq
      const fetchChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: insertedId1, image_url: 'u', file_name: 'a.jpg' },
          error: null,
        }),
      };
      const dbDeleteMock = jest.fn().mockReturnThis();
      const dbDeleteEqMock = jest.fn().mockResolvedValue({ error: null });
      const deleteChain = { delete: dbDeleteMock, eq: dbDeleteEqMock };

      let imageCallIdx = 0;
      mockUserSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'instruments') return makeInstrumentQuery();
          if (table === 'instrument_images') {
            imageCallIdx++;
            return imageCallIdx === 1 ? fetchChain : deleteChain;
          }
          throw new Error(`Unexpected: ${table}`);
        }),
        rpc: jest.fn().mockResolvedValue({ data: insertedId1, error: null }),
      };

      const res = await POST(makePostRequest(files), idCtx);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.message).toMatch(/failed to upload image/i);

      // DB record for file 1 must be deleted (rollback)
      expect(dbDeleteMock).toHaveBeenCalled();
      // Storage file for file 1 must be deleted (rollback)
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(storedKey1);
      // File 3 was never started
      expect(mockStorage.saveFile).toHaveBeenCalledTimes(2);
    });

    it('3-file upload: DB insert failure on 2nd rolls back 1st and cleans up 2nd storage', async () => {
      const files = [
        makeFileLike('a.jpg', 'image/jpeg'),
        makeFileLike('b.jpg', 'image/jpeg'),
        makeFileLike('c.jpg', 'image/jpeg'),
      ];

      const insertedId1 = 'inserted-id-a';
      const storedKey1 = `test-org/${mockInstrumentId}/a.jpg`;
      const storedKey2 = `test-org/${mockInstrumentId}/b.jpg`;

      mockStorage.saveFile
        .mockResolvedValueOnce(storedKey1)
        .mockResolvedValueOnce(storedKey2);

      // RPC: succeeds for file 1, fails for file 2
      const rpcMock = jest
        .fn()
        .mockResolvedValueOnce({ data: insertedId1, error: null })
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'DB constraint' },
        });

      // from('instrument_images') call order:
      //   1st: fetch after insert for file 1  → select/eq/single
      //   2nd: rollback delete for file 1     → delete/eq
      const fetchChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: insertedId1, image_url: 'u', file_name: 'a.jpg' },
          error: null,
        }),
      };
      const dbDeleteMock = jest.fn().mockReturnThis();
      const deleteChain = {
        delete: dbDeleteMock,
        eq: jest.fn().mockResolvedValue({ error: null }),
      };

      let imageCallIdx = 0;
      mockUserSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'instruments') return makeInstrumentQuery();
          if (table === 'instrument_images') {
            imageCallIdx++;
            return imageCallIdx === 1 ? fetchChain : deleteChain;
          }
          throw new Error(`Unexpected: ${table}`);
        }),
        rpc: rpcMock,
      };

      mockErrorHandler.handleSupabaseError = jest
        .fn()
        .mockReturnValue(new Error('DB constraint'));

      const res = await POST(makePostRequest(files), idCtx);

      expect(res.status).toBe(500);

      // Orphaned storage file for file 2 (RPC failed → no DB record) must be deleted
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(storedKey2);
      // Committed file 1 must also be rolled back
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(storedKey1);
      expect(dbDeleteMock).toHaveBeenCalled();
    });

    it('all-success 2-file upload — no rollback, returns 2 results', async () => {
      const files = [
        makeFileLike('x.jpg', 'image/jpeg'),
        makeFileLike('y.jpg', 'image/jpeg'),
      ];
      const id1 = 'iid-x';
      const id2 = 'iid-y';

      mockStorage.saveFile
        .mockResolvedValueOnce(`key/x.jpg`)
        .mockResolvedValueOnce(`key/y.jpg`);

      let fetchInsertedCount = 0;
      mockUserSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'instruments') return makeInstrumentQuery();
          if (table === 'instrument_images') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn().mockImplementation(async () => {
                fetchInsertedCount += 1;

                return {
                  data:
                    fetchInsertedCount === 1
                      ? {
                          id: id1,
                          instrument_id: mockInstrumentId,
                          image_url: 'u1',
                          storage_key: 'key/x.jpg',
                          file_name: 'x.jpg',
                          file_size: 3,
                          mime_type: 'image/jpeg',
                          display_order: 0,
                          created_at: '2024-01-01T00:00:00Z',
                        }
                      : {
                          id: id2,
                          instrument_id: mockInstrumentId,
                          image_url: 'u2',
                          storage_key: 'key/y.jpg',
                          file_name: 'y.jpg',
                          file_size: 3,
                          mime_type: 'image/jpeg',
                          display_order: 1,
                          created_at: '2024-01-01T00:00:00Z',
                        },
                  error: null,
                };
              }),
            };
          }
          throw new Error(`Unexpected: ${table}`);
        }),
        rpc: jest
          .fn()
          .mockResolvedValueOnce({ data: id1, error: null })
          .mockResolvedValueOnce({ data: id2, error: null }),
      };

      const res = await POST(makePostRequest(files), idCtx);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data).toHaveLength(2);
      expect(json.data).toEqual([
        expect.objectContaining({
          id: id1,
          storage_key: 'key/x.jpg',
          file_name: 'x.jpg',
          file_size: 3,
          mime_type: 'image/jpeg',
          display_order: 0,
        }),
        expect.objectContaining({
          id: id2,
          storage_key: 'key/y.jpg',
          file_name: 'y.jpg',
          file_size: 3,
          mime_type: 'image/jpeg',
          display_order: 1,
        }),
      ]);
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('returns safe SCHEMA_OUT_OF_DATE before upload when metadata columns are missing', async () => {
      const {
        assertInstrumentImagesSchemaReadiness,
      } = require('@/app/api/_utils/schemaReadiness');
      assertInstrumentImagesSchemaReadiness.mockRejectedValueOnce(
        Object.assign(new Error('Database migration required'), {
          code: 'SCHEMA_OUT_OF_DATE',
          error_code: 'SCHEMA_OUT_OF_DATE',
          status: 503,
          retryable: false,
          details: {
            missingColumns: ['public.instrument_images.storage_key'],
          },
        })
      );
      const imageQuery = makeImageInsertQuery('unused-id');
      mockUserSupabase = makeSupabaseClient(imageQuery);

      const res = await POST(
        makePostRequest([makeFileLike('photo.jpg', 'image/jpeg')]),
        idCtx
      );
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json).toMatchObject({
        message: 'Database migration required.',
        error_code: 'SCHEMA_OUT_OF_DATE',
      });
      expect(mockStorage.saveFile).not.toHaveBeenCalled();
      expect(mockUserSupabase.rpc).not.toHaveBeenCalled();
    });

    it('returns 500 and skips metadata write when storage returns no file key', async () => {
      mockStorage.saveFile.mockResolvedValueOnce('');
      const imageQuery = makeImageInsertQuery('unused-id');
      mockUserSupabase = makeSupabaseClient(imageQuery);
      mockUserSupabase.rpc = jest.fn();

      const res = await POST(
        makePostRequest([makeFileLike('photo.jpg', 'image/jpeg')]),
        idCtx
      );
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.message).toContain(
        'Failed to upload image: Storage upload did not return a file key'
      );
      expect(mockUserSupabase.rpc).not.toHaveBeenCalled();
    });

    // ── Magic-byte validation ──────────────────────────────────────────────

    it('rejects a non-image file renamed to .jpg (bad magic bytes)', async () => {
      const imageQuery = makeImageInsertQuery('unused-id');
      mockUserSupabase = makeSupabaseClient(imageQuery);

      const res = await POST(
        makePostRequest([makeFileLike('shell.jpg', 'image/jpeg', BAD_BYTES)]),
        idCtx
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.message).toMatch(/invalid image file content/i);
      expect(mockStorage.saveFile).not.toHaveBeenCalled();
    });

    it('rejects a PNG file declared as image/jpeg (magic-byte mismatch)', async () => {
      const imageQuery = makeImageInsertQuery('unused-id');
      mockUserSupabase = makeSupabaseClient(imageQuery);

      const res = await POST(
        makePostRequest([makeFileLike('img.jpg', 'image/jpeg', PNG_MAGIC)]),
        idCtx
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.message).toMatch(/invalid image file content/i);
      expect(mockStorage.saveFile).not.toHaveBeenCalled();
    });

    it('rejects a JPEG file declared as image/png (extension/MIME mismatch)', async () => {
      const imageQuery = makeImageInsertQuery('unused-id');
      mockUserSupabase = makeSupabaseClient(imageQuery);

      const res = await POST(
        makePostRequest([makeFileLike('img.png', 'image/png', JPEG_MAGIC)]),
        idCtx
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.message).toMatch(/invalid image file content/i);
      expect(mockStorage.saveFile).not.toHaveBeenCalled();
    });

    it('accepts a valid JPEG file (magic bytes match MIME type)', async () => {
      const insertedId = 'inserted-jpeg-id';
      const imageQuery = makeImageInsertQuery(insertedId);
      mockUserSupabase = makeSupabaseClient(imageQuery);
      mockUserSupabase.rpc = jest
        .fn()
        .mockResolvedValue({ data: insertedId, error: null });

      const res = await POST(
        makePostRequest([makeFileLike('photo.jpg', 'image/jpeg', JPEG_MAGIC)]),
        idCtx
      );

      expect(res.status).toBe(200);
      expect(mockStorage.saveFile).toHaveBeenCalledTimes(1);
    });

    it('accepts a valid PNG file', async () => {
      const insertedId = 'inserted-png-id';
      const imageQuery = makeImageInsertQuery(insertedId);
      mockUserSupabase = makeSupabaseClient(imageQuery);
      mockUserSupabase.rpc = jest
        .fn()
        .mockResolvedValue({ data: insertedId, error: null });

      const res = await POST(
        makePostRequest([makeFileLike('image.png', 'image/png', PNG_MAGIC)]),
        idCtx
      );

      expect(res.status).toBe(200);
      expect(mockStorage.saveFile).toHaveBeenCalledTimes(1);
    });

    it('accepts a valid WebP file', async () => {
      const insertedId = 'inserted-webp-id';
      const imageQuery = makeImageInsertQuery(insertedId);
      mockUserSupabase = makeSupabaseClient(imageQuery);
      mockUserSupabase.rpc = jest
        .fn()
        .mockResolvedValue({ data: insertedId, error: null });

      const res = await POST(
        makePostRequest([makeFileLike('anim.webp', 'image/webp', WEBP_MAGIC)]),
        idCtx
      );

      expect(res.status).toBe(200);
      expect(mockStorage.saveFile).toHaveBeenCalledTimes(1);
    });

    it('rolls back file 1 when file 2 fails magic-byte check', async () => {
      const insertedId1 = 'rollback-file1-id';
      const storedKey1 = `test-org/${mockInstrumentId}/a.jpg`;

      mockStorage.saveFile.mockResolvedValueOnce(storedKey1);

      const dbDeleteMock = jest.fn().mockReturnThis();
      const dbDeleteEqMock = jest.fn().mockResolvedValue({ error: null });
      let imageCallIdx = 0;

      mockUserSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'instruments') return makeInstrumentQuery();
          if (table === 'instrument_images') {
            imageCallIdx++;
            if (imageCallIdx === 1) {
              return {
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: insertedId1,
                    image_url: 'u',
                    file_name: 'a.jpg',
                    storage_key: storedKey1,
                    file_size: JPEG_MAGIC.length,
                    mime_type: 'image/jpeg',
                    display_order: 0,
                    created_at: '2024-01-01T00:00:00Z',
                    instrument_id: mockInstrumentId,
                  },
                  error: null,
                }),
              };
            }
            return { delete: dbDeleteMock, eq: dbDeleteEqMock };
          }
          throw new Error(`Unexpected: ${table}`);
        }),
        rpc: jest.fn().mockResolvedValue({ data: insertedId1, error: null }),
      };

      const res = await POST(
        makePostRequest([
          makeFileLike('a.jpg', 'image/jpeg', JPEG_MAGIC),
          makeFileLike('bad.jpg', 'image/jpeg', BAD_BYTES), // bad file
        ]),
        idCtx
      );

      expect(res.status).toBe(400);
      // File 1 must be rolled back from storage
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(storedKey1);
      // DB record for file 1 must be deleted
      expect(dbDeleteMock).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE — storage failure must block DB deletion
  // ═══════════════════════════════════════════════════════════════════════════
  describe('DELETE — storage failure blocks DB deletion', () => {
    const idCtx = { params: Promise.resolve({ id: mockInstrumentId }) };

    /**
     * DELETE handler calls from('instrument_images') twice:
     *   1st: .select('*').eq('id', imageId).eq('instrument_id', id).single()  → fetch image
     *   2nd: .delete().eq('id', imageId)                                       → remove record
     */
    function makeDeleteSupabaseClient(image: Record<string, unknown> | null) {
      const instrumentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: mockInstrumentId },
          error: null,
        }),
      };

      const fetchChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: image,
          error: image ? null : { message: 'Not found' },
        }),
      };

      const deleteChain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        error: null,
      };

      const fromMock = jest.fn().mockImplementation((table: string) => {
        if (table === 'instruments') return instrumentQuery;
        if (table === 'instrument_images') {
          // First call = fetch, second call = delete
          const callsSoFar = (fromMock.mock.calls as string[][]).filter(
            ([t]) => t === 'instrument_images'
          ).length;
          return callsSoFar === 1 ? fetchChain : deleteChain;
        }
        throw new Error(`Unexpected table: ${table}`);
      });

      return { from: fromMock, rpc: jest.fn() } as any;
    }

    it('storage delete succeeds → DB record is deleted (200)', async () => {
      const image = {
        id: mockImageId,
        instrument_id: mockInstrumentId,
        storage_key: `canonical/${mockImageId}.jpg`,
        file_name: 'photo.jpg',
        image_url: null,
      };
      mockUserSupabase = makeDeleteSupabaseClient(image);
      mockStorage.deleteFile.mockResolvedValue(true);

      const res = await DELETE(makeDeleteRequest(mockImageId), idCtx);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.result).toBe('full_success');
      expect(json.message).toBe('Image deleted successfully.');
      expect(json.cleanup).toEqual({ storageDeleted: true });
      expect(mockStorage.deleteFile).toHaveBeenCalledTimes(1);
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(
        `canonical/${mockImageId}.jpg`
      );
      const deleteChain = mockUserSupabase.from.mock.results
        .filter((result: any) => result.value?.delete)
        .at(-1)?.value;
      expect(deleteChain.delete).toHaveBeenCalled();
      expect(deleteChain.eq).toHaveBeenCalledWith('id', mockImageId);
      expect(deleteChain.eq).toHaveBeenCalledWith(
        'instrument_id',
        mockInstrumentId
      );
    });

    it('wrong-org delete attempt fails closed before image removal', async () => {
      const imageQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      mockUserSupabase = makeSupabaseClient(imageQuery, false);
      mockAuthContext.userSupabase = mockUserSupabase;

      const res = await DELETE(makeDeleteRequest(mockImageId), idCtx);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.message).toBe('Instrument not found');
      expect(imageQuery.single).not.toHaveBeenCalled();
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
      expect(mockUserSupabase.__instrumentQuery.eq).toHaveBeenCalledWith(
        'org_id',
        'test-org'
      );
    });

    it('storage delete fails → returns partial_success instead of silent success', async () => {
      const image = {
        id: mockImageId,
        instrument_id: mockInstrumentId,
        storage_key: `canonical/${mockImageId}.jpg`,
        file_name: 'photo.jpg',
        image_url: null,
      };

      const deleteDbMock = jest.fn().mockReturnThis();
      const instrumentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: { id: mockInstrumentId }, error: null }),
      };
      const fetchChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: image, error: null }),
      };
      const deleteChain: any = {
        delete: deleteDbMock,
      };
      deleteChain.eq = jest.fn().mockReturnValue(deleteChain);
      // Terminal value for the chain
      (deleteChain.eq as jest.Mock).mockImplementation(() => ({
        eq: jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockResolvedValue({ error: null }),
        })),
      }));

      const fromMock = jest.fn().mockImplementation((table: string) => {
        if (table === 'instruments') return instrumentQuery;
        if (table === 'instrument_images') {
          const imageCallCount = (fromMock.mock.calls as string[][]).filter(
            ([t]) => t === 'instrument_images'
          ).length;
          return imageCallCount === 1 ? fetchChain : deleteChain;
        }
        throw new Error(`Unexpected: ${table}`);
      });

      mockUserSupabase = { from: fromMock, rpc: jest.fn() };
      mockStorage.deleteFile.mockRejectedValue(
        new Error('S3 connection timeout')
      );

      const res = await DELETE(makeDeleteRequest(mockImageId), idCtx);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.result).toBe('partial_success');
      expect(json.message).toBe(
        'Image removed from the app, but storage cleanup failed.'
      );
      expect(json.cleanup).toEqual({ storageDeleted: false });
      // DB delete MUST have been called (it happens before storage)
      expect(deleteDbMock).toHaveBeenCalled();
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(
        `canonical/${mockImageId}.jpg`
      );
    });

    it('image with no file_name and no resolvable storage path returns 409 and preserves DB metadata', async () => {
      const image = {
        id: mockImageId,
        instrument_id: mockInstrumentId,
        storage_key: null,
        file_name: null,
        image_url: 'https://some-cdn.example.com/image.jpg',
      };

      mockUserSupabase = makeDeleteSupabaseClient(image);

      const res = await DELETE(makeDeleteRequest(mockImageId), idCtx);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.message).toBe('Image storage key could not be resolved');
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('legacy row without storage_key still deletes via parsed image_url', async () => {
      const legacyKey = `test-org/${mockInstrumentId}/legacy-delete.jpg`;
      const image = {
        id: mockImageId,
        instrument_id: mockInstrumentId,
        storage_key: null,
        file_name: null,
        image_url: `https://bucket.s3.us-east-1.amazonaws.com/${legacyKey}`,
      };
      mockUserSupabase = makeDeleteSupabaseClient(image);
      mockStorage.deleteFile.mockResolvedValue(true);

      const res = await DELETE(makeDeleteRequest(mockImageId), idCtx);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.result).toBe('full_success');
      expect(json.message).toBe('Image deleted successfully.');
      expect(json.cleanup).toEqual({ storageDeleted: true });
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(legacyKey);
    });
  });
});
