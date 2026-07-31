import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from '../route';
import { errorHandler } from '@/utils/errorHandler';
import {
  INSTRUMENT_PATCH_UPDATED_AT_REQUIRED_CODE,
  resetInstrumentApiContractCacheForTests,
} from '@/app/api/instruments/_shared/instrumentApiContract';
import {
  assertInstrumentsSchemaReadiness,
  SchemaNotReadyError,
} from '@/app/api/_utils/schemaReadiness';

jest.mock('@/app/api/_utils/rateLimit', () => ({
  searchRateLimit: null,
  exportRateLimit: null,
  authRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
}));
jest.mock('@/utils/errorHandler');
jest.mock('@/app/api/_utils/schemaReadiness', () => {
  const actual = jest.requireActual('@/app/api/_utils/schemaReadiness');
  return {
    ...actual,
    assertInstrumentsSchemaReadiness: jest.fn().mockResolvedValue({
      ready: true,
      checkedAt: '2026-07-31T00:00:00.000Z',
      missingColumns: [],
      missingContracts: [],
    }),
  };
});
jest.mock('@/utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logDebug: jest.fn(),
  logPerformance: jest.fn(),
  logApiRequest: jest.fn(),
}));
jest.mock('@/utils/monitoring');

let mockStorage: { deleteFile: jest.Mock };
jest.mock('@/utils/storage', () => ({
  getStorage: jest.fn(() => mockStorage),
}));

let mockWriteAuditLog: jest.Mock;
jest.mock('@/utils/auditLog', () => ({
  writeAuditLog: (...args: unknown[]) =>
    mockWriteAuditLog(...args).catch(() => {}),
}));
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

// Mock inputValidation — use real search helpers for route safety tests
jest.mock('@/utils/inputValidation', () => {
  const actual = jest.requireActual('@/utils/inputValidation');
  return {
    ...actual,
    validateSortColumn: jest.fn((table, value) => value || 'created_at'),
    validateDateString: jest.fn(value => /^\d{4}-\d{2}-\d{2}$/.test(value)),
    validateUUID: jest.fn(value =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value
      )
    ),
  };
});

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
    updated_at: '2024-01-02T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (
      assertInstrumentsSchemaReadiness as jest.MockedFunction<
        typeof assertInstrumentsSchemaReadiness
      >
    ).mockResolvedValue({
      ready: true,
      checkedAt: '2026-07-31T00:00:00.000Z',
      missingColumns: [],
      missingContracts: [],
    });
    resetInstrumentApiContractCacheForTests();
    jest.spyOn(performance, 'now').mockReturnValue(0);
    mockStorage = { deleteFile: jest.fn().mockResolvedValue(true) };
    mockWriteAuditLog = jest.fn().mockResolvedValue(undefined);
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
    it('returns 429 when searchRateLimit is exceeded', async () => {
      const { applyRateLimit } = require('@/app/api/_utils/rateLimit');
      (applyRateLimit as jest.Mock).mockResolvedValueOnce({ limited: true });

      const request = new NextRequest('http://localhost/api/instruments');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(429);
      expect(json.error).toBe('Too many requests');
    });

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
      // Default unbounded list is capped (see DEFAULT_LIST_LIMIT in route)
      expect(mockQuery.limit).toHaveBeenCalledWith(200);
    });

    it('should hard-cap and mark truncated all=true lists', async () => {
      const rows = Array.from({ length: 1001 }, (_, index) => ({
        ...mockInstrument,
        id: `123e4567-e89b-12d3-a456-${String(index).padStart(12, '0')}`,
      }));
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: rows,
        error: null,
        count: 1001,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;
      mockAuthContext = { ...mockAuthContext, userSupabase: mockUserSupabase };

      const request = new NextRequest(
        'http://localhost/api/instruments?all=true&orderBy=created_at&ascending=false'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1000);
      expect(json.truncated).toBe(true);
      expect(mockQuery.limit).toHaveBeenCalledWith(1001);
      expect(json.pagination).toEqual({
        page: 1,
        pageSize: 1000,
        totalCount: 1001,
        totalPages: 1,
      });
      expect(json.scope).toBe('all');
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

    it('should return instruments with default parameters', async () => {
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
      // instrumentSchema.transform() appends has_certificate derived from certificate
      expect(json.data).toEqual([
        { ...mockInstrument, has_certificate: false },
      ]);
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

    it('should filter instruments by search query using safe ilike on maker', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
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

      expect(mockQuery.ilike).toHaveBeenCalledWith('maker', '%Stradivarius%');
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('trims whitespace from search before applying maker ilike filter', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      await GET(
        new NextRequest(
          'http://localhost/api/instruments?search=%20Guarneri%20'
        )
      );

      expect(mockQuery.ilike).toHaveBeenCalledWith('maker', '%Guarneri%');
    });

    it('does not apply search filter when search is empty or whitespace-only', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      await GET(
        new NextRequest('http://localhost/api/instruments?search=%20%20')
      );
      await GET(new NextRequest('http://localhost/api/instruments?search='));

      expect(mockQuery.ilike).not.toHaveBeenCalled();
    });

    it('strips control characters from search before querying', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      await GET(
        new NextRequest(
          `http://localhost/api/instruments?search=${encodeURIComponent('Strad\x00ivarius')}`
        )
      );

      expect(mockQuery.ilike).toHaveBeenCalledWith('maker', '%Stradivarius%');
    });

    it('escapes PostgREST filter wildcards and grammar characters in maker search', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      await GET(
        new NextRequest(
          'http://localhost/api/instruments?search=50%25_off,(test)\\a'
        )
      );

      expect(mockQuery.ilike).toHaveBeenCalledWith(
        'maker',
        '%50\\%\\_off\\,\\(test\\)\\\\a%'
      );
    });

    it('bounds excessively long search input before querying', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (mockQuery.order as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const longSearch = 'a'.repeat(150);
      await GET(
        new NextRequest(
          `http://localhost/api/instruments?search=${encodeURIComponent(longSearch)}`
        )
      );

      const ilikeArg = (mockQuery.ilike as jest.Mock).mock
        .calls[0][1] as string;
      expect(ilikeArg.length).toBeLessThanOrEqual(102);
      expect(ilikeArg.startsWith('%')).toBe(true);
      expect(ilikeArg.endsWith('%')).toBe(true);
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

    // ── F7: financial field access control ──────────────────────────────────

    function makeInstrumentQueryMock(instrument: object) {
      const q = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      (q.order as jest.Mock).mockResolvedValue({
        data: [instrument],
        error: null,
        count: 1,
      });
      mockUserSupabase = { from: jest.fn().mockReturnValue(q) } as any;
    }

    const richInstrument = {
      ...mockInstrument,
      cost_price: 1500,
      consignment_price: 800,
      price: 3000,
    };

    it('admin receives cost_price and consignment_price', async () => {
      makeInstrumentQueryMock(richInstrument);
      mockAuthContext = { ...mockAuthContext, role: 'admin' };

      const response = await GET(
        new NextRequest('http://localhost/api/instruments')
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data[0].cost_price).toBe(1500);
      expect(json.data[0].consignment_price).toBe(800);
      expect(json.data[0].price).toBe(3000);
    });

    it('non-admin member does not receive cost_price or consignment_price', async () => {
      makeInstrumentQueryMock(richInstrument);
      mockAuthContext = { ...mockAuthContext, role: 'member' };

      const response = await GET(
        new NextRequest('http://localhost/api/instruments')
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data[0].cost_price).toBeUndefined();
      expect(json.data[0].consignment_price).toBeUndefined();
    });

    it('non-admin member still receives retail price', async () => {
      makeInstrumentQueryMock(richInstrument);
      mockAuthContext = { ...mockAuthContext, role: 'member' };

      const response = await GET(
        new NextRequest('http://localhost/api/instruments')
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data[0].price).toBe(3000);
    });

    it('member cannot bypass restriction by calling the instruments API directly', async () => {
      makeInstrumentQueryMock(richInstrument);
      mockAuthContext = { ...mockAuthContext, role: 'member' };

      const response = await GET(
        new NextRequest('http://localhost/api/instruments')
      );
      const json = await response.json();

      // Ensure no financial leak via any key name variant
      const keys = Object.keys(json.data[0]);
      expect(keys).not.toContain('cost_price');
      expect(keys).not.toContain('consignment_price');
    });
  });

  describe('POST', () => {
    it('returns SCHEMA_OUT_OF_DATE 503 when instrument schema readiness fails', async () => {
      (
        assertInstrumentsSchemaReadiness as jest.MockedFunction<
          typeof assertInstrumentsSchemaReadiness
        >
      ).mockRejectedValueOnce(
        new SchemaNotReadyError(
          ['public.instruments.certificate_name'],
          'InstrumentsAPI'
        )
      );

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        body: JSON.stringify({ type: 'Violin' }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error_code).toBe('SCHEMA_OUT_OF_DATE');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should create a new instrument from a valid minimal payload', async () => {
      const createData = {
        type: 'Violin',
      };

      const createdInstrument = {
        ...mockInstrument,
        type: 'Violin',
        maker: null,
        subtype: null,
        serial_number: 'VI0000001',
        status: 'Available',
        certificate: false,
      };

      const serialListQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (insertQuery.single as jest.Mock).mockResolvedValue({
        data: createdInstrument,
        error: null,
      });

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(serialListQuery)
          .mockReturnValue(insertQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        body: JSON.stringify(createData),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(insertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'test-org',
          type: 'Violin',
          status: 'Available',
          certificate: false,
          serial_number: 'VI0000001',
        })
      );
      expect(json.data).toEqual(
        expect.objectContaining({
          id: mockInstrument.id,
          maker: null,
          type: 'Violin',
          serial_number: 'VI0000001',
          status: 'Available',
          certificate: false,
          created_at: mockInstrument.created_at,
        })
      );
    });

    it('returns existing instrument when Idempotency-Key matches completed request hash', async () => {
      const createData = { type: 'Violin' };
      const existing = {
        ...mockInstrument,
        type: 'Violin',
        serial_number: 'VI0000001',
      };

      const contractProbe = {
        limit: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      const insertChain = {
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate key' },
        }),
      };
      const lookupChain = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            org_id: 'test-org',
            user_id: 'test-user',
            route_key: 'POST:/api/instruments',
            idempotency_key: 'idem-1',
            request_hash:
              '096618e6f6a92dbe94775bb221c87d103e3456a31c741feac4410af266ee7a4c',
            status: 'completed',
            response_payload: { data: existing },
          },
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'api_create_idempotency') {
            return {
              select: jest.fn(() => contractProbe),
              insert: jest.fn(() => insertChain),
            };
          }
          throw new Error(`unexpected table ${table}`);
        }),
      } as any;
      mockUserSupabase.from.mockImplementationOnce(() => ({
        select: jest.fn(() => contractProbe),
      }));
      mockUserSupabase.from.mockImplementationOnce(() => ({
        insert: jest.fn(() => insertChain),
      }));
      mockUserSupabase.from.mockImplementationOnce(() => ({
        select: jest.fn(() => lookupChain),
      }));

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-1',
        },
        body: JSON.stringify(createData),
      });
      const response = await POST(request);
      const json = await response.json();
      expect(response.status).toBe(201);
      expect(json.data.id).toBe(existing.id);
      expect(json.idempotentReplay).toBe(true);
    });

    it('returns conflict when Idempotency-Key is reused with a different payload', async () => {
      const contractProbe = {
        limit: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      const insertChain = {
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate key' },
        }),
      };
      const lookupChain = {
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            org_id: 'test-org',
            user_id: 'test-user',
            route_key: 'POST:/api/instruments',
            idempotency_key: 'idem-1',
            request_hash: 'different-request-hash',
            status: 'completed',
            response_payload: { data: mockInstrument },
          },
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest
          .fn()
          .mockImplementationOnce(() => ({
            select: jest.fn(() => contractProbe),
          }))
          .mockImplementationOnce(() => ({
            insert: jest.fn(() => insertChain),
          }))
          .mockImplementationOnce(() => ({
            select: jest.fn(() => lookupChain),
          })),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-1',
        },
        body: JSON.stringify({ type: 'Violin' }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error_code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('returns 503 when idempotency table is missing (migration not applied)', async () => {
      const createData = { type: 'Violin' };
      const missingTableError = {
        code: '42P01',
        message: 'relation "public.api_create_idempotency" does not exist',
      };

      mockUserSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'api_create_idempotency') {
            return {
              select: jest.fn(() => ({
                limit: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: missingTableError }),
              })),
            };
          }
          throw new Error(`unexpected table ${table}`);
        }),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-missing-table',
        },
        body: JSON.stringify(createData),
      });
      const response = await POST(request);
      const json = await response.json();
      expect(response.status).toBe(503);
      expect(json.error_code).toBe('INSTRUMENT_SCHEMA_CONTRACT_MISSING');
      expect(String(json.error)).toContain('database contract is missing');
    });

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

    it('should persist certificate_name and strip unknown fields before inserting', async () => {
      const createData = {
        maker: 'Guarneri',
        type: 'Violin',
        subtype: 'Classical',
        serial_number: 'VI0000007',
        certificate: true,
        has_certificate: true,
        certificate_name: '  Original Label  ',
        image_url: 'https://example.com/test.jpg',
        status: 'Available',
      };

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: {
          ...mockInstrument,
          ...createData,
          certificate_name: 'Original Label',
        },
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

      expect(response.status).toBe(201);
      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          certificate: true,
          certificate_name: 'Original Label',
          type: 'Violin',
        })
      );
      expect(mockQuery.insert).toHaveBeenCalledWith(
        expect.not.objectContaining({
          has_certificate: expect.anything(),
          image_url: expect.anything(),
        })
      );
    });

    it('should retry serial allocation after a serial unique conflict', async () => {
      const createData = {
        maker: 'Guarneri',
        type: 'Violin',
        serial_number: 'VI0000002',
        status: 'Available',
      };

      const firstInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint',
            details:
              'Key (org_id, serial_number)=(test-org, VI0000002) already exists.',
          },
        }),
      };
      const serialLookupQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [
            { serial_number: 'VI0000001' },
            { serial_number: 'VI0000002' },
          ],
          error: null,
        }),
      };
      const secondInsertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            ...mockInstrument,
            ...createData,
            serial_number: 'VI0000003',
          },
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(firstInsertQuery)
          .mockReturnValueOnce(serialLookupQuery)
          .mockReturnValueOnce(secondInsertQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        body: JSON.stringify(createData),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(firstInsertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({ serial_number: 'VI0000002' })
      );
      expect(serialLookupQuery.select).toHaveBeenCalledWith('serial_number');
      expect(serialLookupQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(secondInsertQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({ serial_number: 'VI0000003' })
      );
      expect(json.data.serial_number).toBe('VI0000003');
    });

    it('returns 500 when serial unique conflict persists after all retries', async () => {
      const createData = {
        maker: 'Guarneri',
        type: 'Violin',
        serial_number: 'VI0000002',
        status: 'Available',
      };

      const serialConflictErr = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
        details:
          'Key (org_id, serial_number)=(test-org, VI0000002) already exists.',
      };

      const insertFail = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: serialConflictErr,
        }),
      };
      const serialLookup = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [{ serial_number: 'VI0000001' }],
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(insertFail)
          .mockReturnValueOnce(serialLookup)
          .mockReturnValueOnce(insertFail)
          .mockReturnValueOnce(serialLookup)
          .mockReturnValueOnce(insertFail)
          .mockReturnValueOnce(serialLookup)
          .mockReturnValueOnce(insertFail),
      } as any;

      mockErrorHandler.handleSupabaseError = jest
        .fn()
        .mockReturnValue(new Error('Create instrument failed'));

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        body: JSON.stringify(createData),
      });
      const response = await POST(request);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(mockErrorHandler.handleSupabaseError).toHaveBeenCalled();
    });

    it('should return 403 when the user is not an admin (matches instruments_insert RLS)', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        role: 'member',
      };

      const createData = {
        maker: 'Guarneri',
        type: 'Violin',
        subtype: null,
        serial_number: null,
        year: 1740,
        ownership: null,
        size: null,
        weight: null,
        note: null,
        price: null,
        certificate: false,
        status: 'Available',
      };

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        body: JSON.stringify(createData),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe('Admin role required');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
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

    // ── F10: audit log ──────────────────────────────────────────────────────

    it('writes instrument.create audit log after successful creation', async () => {
      const createdInstrument = {
        ...mockInstrument,
        type: 'Cello',
        serial_number: 'CE0000001',
      };

      const serialListQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: createdInstrument, error: null }),
      };
      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(serialListQuery)
          .mockReturnValue(insertQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        body: JSON.stringify({ type: 'Cello' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'instrument.create',
          resourceType: 'instrument',
          resourceId: createdInstrument.id,
          orgId: 'test-org',
          actorId: 'test-user',
        })
      );
    });

    it('includes cost_price and consignment_price in audit metadata when provided', async () => {
      const createdInstrument = {
        ...mockInstrument,
        type: 'Viola',
        serial_number: 'VI0000002',
        cost_price: 3000,
        consignment_price: 500,
      };

      const serialListQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: createdInstrument, error: null }),
      };
      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(serialListQuery)
          .mockReturnValue(insertQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        body: JSON.stringify({
          type: 'Viola',
          cost_price: 3000,
          consignment_price: 500,
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'instrument.create',
          metadata: expect.objectContaining({
            cost_price: 3000,
            consignment_price: 500,
            changed_fields: expect.arrayContaining([
              'cost_price',
              'consignment_price',
            ]),
          }),
        })
      );
    });

    it('audit log failure does not fail instrument create response', async () => {
      mockWriteAuditLog = jest.fn().mockRejectedValue(new Error('audit down'));

      const createdInstrument = {
        ...mockInstrument,
        type: 'Bass',
        serial_number: 'BA0000001',
      };
      const serialListQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: createdInstrument, error: null }),
      };
      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(serialListQuery)
          .mockReturnValue(insertQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'POST',
        body: JSON.stringify({ type: 'Bass' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
    });
  });

  describe('PATCH', () => {
    it('returns SCHEMA_OUT_OF_DATE 503 when instrument schema readiness fails', async () => {
      (
        assertInstrumentsSchemaReadiness as jest.MockedFunction<
          typeof assertInstrumentsSchemaReadiness
        >
      ).mockRejectedValueOnce(
        new SchemaNotReadyError(
          ['public.instruments.certificate_name'],
          'InstrumentsAPI'
        )
      );

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockInstrument.id,
          updated_at: mockInstrument.updated_at,
          note: 'x',
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error_code).toBe('SCHEMA_OUT_OF_DATE');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should update an existing instrument', async () => {
      const updates = { note: 'Fair condition' };
      const updatedInstrument = { ...mockInstrument, ...updates };

      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [updatedInstrument],
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockInstrument.id,
          updated_at: mockInstrument.updated_at,
          ...updates,
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(mockQuery.update).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', mockInstrument.id);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(mockQuery.eq).toHaveBeenCalledWith(
        'updated_at',
        mockInstrument.updated_at
      );
    });

    it('returns 400 when updated_at is missing', async () => {
      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'PATCH',
        body: JSON.stringify({ id: mockInstrument.id, note: 'x' }),
      });
      const response = await PATCH(request);
      const json = await response.json();
      expect(response.status).toBe(400);
      expect(String(json.message || json.error)).toContain('updated_at');
      expect(json.error_code).toBe(INSTRUMENT_PATCH_UPDATED_AT_REQUIRED_CODE);
    });

    it('returns 409 when updated_at does not match current row', async () => {
      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn(),
      };
      (mockQuery.select as jest.Mock).mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const existsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: { id: mockInstrument.id }, error: null }),
      };

      let call = 0;
      mockUserSupabase = {
        from: jest.fn(() => {
          call += 1;
          return call === 1 ? mockQuery : existsQuery;
        }),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockInstrument.id,
          updated_at: mockInstrument.updated_at,
          note: 'stale',
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();
      expect(response.status).toBe(409);
      expect(json.error_code).toBe('INSTRUMENT_CONFLICT');
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
        rpc: jest
          .fn()
          .mockResolvedValueOnce({
            data: null,
            error: { message: 'instrument row not found for probe' },
          })
          .mockResolvedValueOnce({
            data: { ...mockInstrument, status: 'Sold' },
            error: null,
          }),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockInstrument.id,
          updated_at: mockInstrument.updated_at,
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
      expect(mockUserSupabase.rpc).toHaveBeenCalledTimes(2);
      expect(mockUserSupabase.rpc).toHaveBeenLastCalledWith(
        'update_instrument_sale_transition_atomic',
        expect.objectContaining({
          p_instrument_id: mockInstrument.id,
          p_sale_price: 1500000,
          p_sale_date: '2026-04-02',
          p_client_id: '123e4567-e89b-12d3-a456-426614174111',
          p_sales_note: 'Auto-created',
          p_expected_updated_at: mockInstrument.updated_at,
        })
      );
    });

    it('returns 503 when sale RPC is missing (schema contract)', async () => {
      mockUserSupabase = {
        from: jest.fn(),
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42883',
            message:
              'function public.update_instrument_sale_transition_atomic(uuid,jsonb,...) does not exist',
          },
        }),
      } as any;

      const request = new NextRequest('http://localhost/api/instruments', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockInstrument.id,
          updated_at: mockInstrument.updated_at,
          status: 'Sold',
          sale_transition: {
            sale_price: 1500000,
            sale_date: '2026-04-02',
            client_id: '123e4567-e89b-12d3-a456-426614174111',
            sales_note: 'x',
          },
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();
      expect(response.status).toBe(503);
      expect(json.error_code).toBe('INSTRUMENT_SCHEMA_CONTRACT_MISSING');
      expect(String(json.error)).toContain('database contract is missing');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    const INSTRUMENT_ID = '123e4567-e89b-12d3-a456-426614174000';

    function makeDeleteFromMock({
      imageKeys = [] as string[],
      certPaths = [] as string[],
      deleteCount = 1,
      deleteError = null as any,
    } = {}) {
      const selectChain = (data: any[]) => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) =>
          Promise.resolve({ data, error: null }).then(resolve),
      });

      const deleteChain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: any) =>
          Promise.resolve({ error: deleteError, count: deleteCount }).then(
            resolve
          ),
      };

      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
      };

      return jest.fn().mockImplementation((table: string) => {
        if (table === 'instrument_images') {
          return selectChain(imageKeys.map(k => ({ storage_key: k })));
        }
        if (table === 'instrument_certificates') {
          return selectChain(certPaths.map(p => ({ storage_path: p })));
        }
        if (table === 'orphaned_storage_objects') {
          return insertChain;
        }
        if (table === 'instruments') {
          return deleteChain;
        }
        return {};
      });
    }

    it('returns 200 and deletes instrument with no storage files', async () => {
      mockUserSupabase.from = makeDeleteFromMock();

      const request = new NextRequest(
        `http://localhost/api/instruments?id=${INSTRUMENT_ID}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('calls storage.deleteFile for each image and certificate key', async () => {
      mockUserSupabase.from = makeDeleteFromMock({
        imageKeys: ['org/img1.jpg', 'org/img2.jpg'],
        certPaths: ['org/cert1.pdf'],
      });

      const request = new NextRequest(
        `http://localhost/api/instruments?id=${INSTRUMENT_ID}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockStorage.deleteFile).toHaveBeenCalledTimes(3);
      expect(mockStorage.deleteFile).toHaveBeenCalledWith('org/img1.jpg');
      expect(mockStorage.deleteFile).toHaveBeenCalledWith('org/img2.jpg');
      expect(mockStorage.deleteFile).toHaveBeenCalledWith('org/cert1.pdf');
    });

    it('logs orphan and inserts to orphaned_storage_objects when storage delete fails', async () => {
      mockStorage.deleteFile = jest
        .fn()
        .mockRejectedValue(new Error('S3 timeout'));

      mockUserSupabase.from = makeDeleteFromMock({
        imageKeys: ['org/img1.jpg'],
        certPaths: [],
      });

      const { logError } = require('@/utils/logger');
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      const originalFrom = mockUserSupabase.from;
      mockUserSupabase.from = jest.fn().mockImplementation((table: string) => {
        if (table === 'orphaned_storage_objects') {
          return { insert: insertMock };
        }
        return originalFrom(table);
      });

      const request = new NextRequest(
        `http://localhost/api/instruments?id=${INSTRUMENT_ID}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(logError).toHaveBeenCalledWith(
        'instrument_storage_cleanup_failed',
        expect.any(Error),
        'InstrumentsAPI',
        expect.objectContaining({ storageKey: 'org/img1.jpg' })
      );
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'test-org',
          storage_key: 'org/img1.jpg',
          bucket: 's3',
          source: 'instrument_delete',
        })
      );
    });

    it('returns 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/instruments');
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Instrument ID is required');
    });

    it('returns 400 for invalid UUID', async () => {
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
