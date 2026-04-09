import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '../route';
import { validateUUID } from '@/utils/inputValidation';
import { errorHandler } from '@/utils/errorHandler';

jest.mock('@/utils/inputValidation');
jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');

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

  /** Build a file-like object that satisfies UploadFileLike in all envs */
  function makeFileLike(name: string, type: string, content = 'img-data') {
    const data = Buffer.from(content);
    return {
      name,
      type,
      size: data.length,
      arrayBuffer: async () => data.buffer as ArrayBuffer,
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateUUID.mockReturnValue(true);
    mockStorage = {
      saveFile: jest.fn().mockResolvedValue(`org/${mockInstrumentId}/file.jpg`),
      deleteFile: jest.fn().mockResolvedValue(undefined),
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
            image_url: 'https://storage.example.com/key',
            file_name: 'file.jpg',
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
        })
      );
    });

    it('3-file upload: failure on 2nd file rolls back 1st file (storage + DB)', async () => {
      const files = [
        makeFileLike('a.jpg', 'image/jpeg', 'aaa'),
        makeFileLike('b.jpg', 'image/jpeg', 'bbb'),
        makeFileLike('c.jpg', 'image/jpeg', 'ccc'),
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
        makeFileLike('a.jpg', 'image/jpeg', 'aaa'),
        makeFileLike('b.jpg', 'image/jpeg', 'bbb'),
        makeFileLike('c.jpg', 'image/jpeg', 'ccc'),
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
        makeFileLike('x.jpg', 'image/jpeg', 'xxx'),
        makeFileLike('y.jpg', 'image/jpeg', 'yyy'),
      ];
      const id1 = 'iid-x';
      const id2 = 'iid-y';

      mockStorage.saveFile
        .mockResolvedValueOnce(`key/x.jpg`)
        .mockResolvedValueOnce(`key/y.jpg`);

      mockUserSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === 'instruments') return makeInstrumentQuery();
          if (table === 'instrument_images') {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest
                .fn()
                .mockResolvedValueOnce({
                  data: { id: id1, image_url: 'u1', file_name: 'x.jpg' },
                  error: null,
                })
                .mockResolvedValueOnce({
                  data: { id: id2, image_url: 'u2', file_name: 'y.jpg' },
                  error: null,
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
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
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
