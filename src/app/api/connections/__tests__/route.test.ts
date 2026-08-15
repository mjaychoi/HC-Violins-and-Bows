import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE, PUT } from '../route';
jest.mock('@/app/api/_utils/rateLimit', () => ({
  authRateLimit: null,
  searchRateLimit: null,
  exportRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
}));
jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/utils/typeGuards');
jest.mock('@/utils/inputValidation');
jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  assertClientConnectionsSchemaReadiness: jest.fn().mockResolvedValue({
    ready: true,
    checkedAt: '2026-05-08T00:00:00.000Z',
    missingColumns: [],
  }),
}));
let mockUserSupabase: any;
let mockAuthContext: any;

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => async (request: any, context?: any) =>
      handler(
        request,
        {
          ...mockAuthContext,
          userSupabase: mockUserSupabase,
        },
        context
      ),
  };
});
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
    relationship_type: 'Interested',
    notes: null,
    display_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    client: null,
    instrument: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const {
      assertClientConnectionsSchemaReadiness,
    } = require('@/app/api/_utils/schemaReadiness');
    assertClientConnectionsSchemaReadiness.mockResolvedValue({
      ready: true,
      checkedAt: '2026-05-08T00:00:00.000Z',
      missingColumns: [],
    });
    jest.spyOn(performance, 'now').mockReturnValue(0);
    mockUserSupabase = { from: jest.fn(), rpc: jest.fn() };
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
    it('should return connections', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [mockConnection],
          error: null,
          count: 1,
        }),
      };

      mockUserSupabase = { from: jest.fn().mockReturnValue(mockQuery) };

      const request = new NextRequest('http://localhost/api/connections');
      const response = await GET(request);
      const json = await response.json();

      // F1: the collection GET must embed client/instrument via the same
      // select shape used everywhere else (by-ID / create / update /
      // reorder), so every surface renders identical data.
      const selectArg = mockQuery.select.mock.calls[0][0] as string;
      expect(selectArg).toContain(
        'client:clients(id, first_name, last_name, email, tags)'
      );
      expect(selectArg).toContain(
        'instrument:instruments(id, maker, type, year, price)'
      );
      expect(mockQuery.select).toHaveBeenCalledWith(selectArg, {
        count: 'exact',
      });
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(mockQuery.range).toHaveBeenCalledWith(0, 49);
      expect(response.status).toBe(200);
      expect(json.data).toEqual([mockConnection]);
      expect(json.count).toBe(1);
    });

    it('replaces wildcard client/instrument enrichment with explicit minimum column allowlists', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [mockConnection],
          error: null,
          count: 1,
        }),
      };
      mockUserSupabase = { from: jest.fn().mockReturnValue(mockQuery) };

      const request = new NextRequest('http://localhost/api/connections');
      await GET(request);

      const selectArg = mockQuery.select.mock.calls[0][0] as string;

      // No wildcard projection on either embedded resource.
      expect(selectArg).not.toContain('client:clients(*)');
      expect(selectArg).not.toContain('instrument:instruments(*)');

      // Fields the shipped /connections UI never reads must not be
      // requested from the database at all - private notes, contact
      // details, internal identifiers, and financial/internal instrument
      // fields.
      const clientProjection =
        selectArg.match(/client:clients\(([^)]*)\)/)?.[1] ?? '';
      const instrumentProjection =
        selectArg.match(/instrument:instruments\(([^)]*)\)/)?.[1] ?? '';

      for (const excludedClientField of [
        'note',
        'interest',
        'phone',
        'client_number',
        'address',
        'contact_number',
        'org_id',
        'created_at',
      ]) {
        expect(
          clientProjection
            .split(',')
            .map(f => f.trim())
            .includes(excludedClientField)
        ).toBe(false);
      }

      for (const excludedInstrumentField of [
        'note',
        'cost_price',
        'consignment_price',
        'ownership',
        'serial_number',
        'status',
        'size',
        'weight',
        'subtype',
        'certificate',
        'certificate_name',
        'reserved_reason',
        'reserved_by_user_id',
        'reserved_connection_id',
        'org_id',
        'created_at',
        'updated_at',
      ]) {
        expect(
          instrumentProjection
            .split(',')
            .map(f => f.trim())
            .includes(excludedInstrumentField)
        ).toBe(false);
      }
    });

    it('F1: enriches each row with client and instrument via the shared normalization layer', async () => {
      // Shaped like what the real explicit-column select actually returns
      // from PostgREST - only the allowlisted columns are present. There is
      // deliberately no name/phone/client_number/interest/note (client) or
      // serial_number/status/cost_price (instrument): the database itself
      // never returns them for this query, not just the mapper.
      const dbRow = {
        ...mockConnection,
        client: {
          id: mockConnection.client_id,
          first_name: 'Ada',
          last_name: 'Lovelace',
          email: 'ada@example.com',
          tags: ['VIP'],
        },
        instrument: {
          id: mockConnection.instrument_id,
          maker: 'Stradivari',
          type: 'Violin',
          year: 1721,
          price: 250000,
        },
      };
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [dbRow],
          error: null,
          count: 1,
        }),
      };
      mockUserSupabase = { from: jest.fn().mockReturnValue(mockQuery) };

      const request = new NextRequest('http://localhost/api/connections');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      // Every field the shipped /connections UI needs (cards, edit modal,
      // search/sort) is present with the real value.
      expect(json.data[0].client).toEqual(
        expect.objectContaining({
          id: mockConnection.client_id,
          first_name: 'Ada',
          last_name: 'Lovelace',
          email: 'ada@example.com',
          tags: ['VIP'],
        })
      );
      expect(json.data[0].instrument).toEqual(
        expect.objectContaining({
          id: mockConnection.instrument_id,
          maker: 'Stradivari',
          type: 'Violin',
          year: 1721,
          price: 250000,
        })
      );
    });

    it('F1: omits representative sensitive/internal fields because they are never selected from the database', async () => {
      // Shaped like the *real* PostgREST response for the new explicit
      // select - it physically cannot include note/cost_price/etc. because
      // they were never requested. This is the direct consequence of the
      // select-string assertions above: prove the response layer does not
      // (and structurally cannot, since the fields are simply absent from
      // the row it receives) surface them, rather than re-asserting the
      // select string a second time.
      const dbRow = {
        ...mockConnection,
        client: {
          id: mockConnection.client_id,
          first_name: 'Ada',
          last_name: 'Lovelace',
          email: 'ada@example.com',
          tags: ['VIP'],
        },
        instrument: {
          id: mockConnection.instrument_id,
          maker: 'Stradivari',
          type: 'Violin',
          year: 1721,
          price: 250000,
        },
      };
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [dbRow],
          error: null,
          count: 1,
        }),
      };
      mockUserSupabase = { from: jest.fn().mockReturnValue(mockQuery) };

      const request = new NextRequest('http://localhost/api/connections');
      const response = await GET(request);
      const json = await response.json();

      // Financial/internal instrument fields are absent - normalizeInstrument
      // spreads the row as-is, so anything not selected is simply not there.
      expect(json.data[0].instrument.cost_price).toBeUndefined();
      expect(json.data[0].instrument.consignment_price).toBeUndefined();
      expect(json.data[0].instrument.serial_number).toBeUndefined();
      expect(json.data[0].instrument.status).toBeUndefined();
      expect(json.data[0].instrument.note).toBeUndefined();

      // Client private/internal fields are normalized to null (never the
      // real DB value) by the shared clients mapper, since they were never
      // part of the selected row either.
      expect(json.data[0].client.note).toBeNull();
      expect(json.data[0].client.interest).toBeNull();
      expect(json.data[0].client.contact_number).toBeNull();
      expect(json.data[0].client.client_number).toBeNull();
    });

    it('F1: renders null client/instrument through untouched so the UI can fall back safely', async () => {
      const dbRow = { ...mockConnection, client: null, instrument: null };
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [dbRow],
          error: null,
          count: 1,
        }),
      };
      mockUserSupabase = { from: jest.fn().mockReturnValue(mockQuery) };

      const request = new NextRequest('http://localhost/api/connections');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data[0].client).toBeNull();
      expect(json.data[0].instrument).toBeNull();
    });

    it('should hard-cap and mark truncated all=true lists', async () => {
      const rows = Array.from({ length: 1001 }, (_, index) => ({
        ...mockConnection,
        id: `123e4567-e89b-12d3-a456-${String(index).padStart(12, '0')}`,
      }));
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: rows,
          error: null,
          count: 1001,
        }),
        range: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = { from: jest.fn().mockReturnValue(mockQuery) };

      const request = new NextRequest(
        'http://localhost/api/connections?all=true&orderBy=created_at&ascending=false'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1000);
      expect(json.truncated).toBe(true);
      expect(json.pagination).toEqual({
        page: 1,
        pageSize: 1000,
        totalCount: 1001,
        totalPages: 1,
      });
      expect(mockQuery.limit).toHaveBeenCalledWith(1001);
      expect(mockQuery.range).not.toHaveBeenCalled();
    });

    it('should reject GET when org context is missing', async () => {
      mockAuthContext = {
        ...mockAuthContext,
        orgId: null,
      };

      const request = new NextRequest('http://localhost/api/connections');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe('Organization context required');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should filter by client_id', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [mockConnection],
          error: null,
          count: 1,
        }),
      };

      mockUserSupabase = { from: jest.fn().mockReturnValue(mockQuery) };

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
        range: jest.fn().mockResolvedValue({
          data: [mockConnection],
          error: null,
          count: 1,
        }),
      };

      mockUserSupabase = { from: jest.fn().mockReturnValue(mockQuery) };

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
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
      };
      (mockQuery.range as jest.Mock).mockResolvedValue({
        data: [mockConnection],
        error: null,
        count: 10,
      });

      mockUserSupabase = { from: jest.fn().mockReturnValue(mockQuery) };

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

    it('applies an id tiebreaker after the primary sort for stable paging', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [mockConnection],
          error: null,
          count: 1,
        }),
      };

      mockUserSupabase = { from: jest.fn().mockReturnValue(mockQuery) };

      const request = new NextRequest(
        'http://localhost/api/connections?page=1&pageSize=5&orderBy=created_at&ascending=false'
      );
      await GET(request);

      expect(mockQuery.order).toHaveBeenNthCalledWith(1, 'created_at', {
        ascending: false,
      });
      expect(mockQuery.order).toHaveBeenNthCalledWith(2, 'id', {
        ascending: false,
      });
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

    it('fails fast when client_instruments.display_order is missing', async () => {
      const {
        assertClientConnectionsSchemaReadiness,
      } = require('@/app/api/_utils/schemaReadiness');
      assertClientConnectionsSchemaReadiness.mockRejectedValueOnce(
        Object.assign(new Error('Database migration required'), {
          code: 'SCHEMA_OUT_OF_DATE',
          error_code: 'SCHEMA_OUT_OF_DATE',
          status: 503,
          retryable: false,
          details: {
            missingColumns: ['public.client_instruments.display_order'],
          },
        })
      );

      mockUserSupabase = {
        from: jest.fn(() => {
          throw new Error('connection query should not run');
        }),
      };

      const request = new NextRequest('http://localhost/api/connections');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error_code).toBe('SCHEMA_OUT_OF_DATE');
      expect(json.message).toBe('Database migration required.');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe('POST', () => {
    it('should create a new connection', async () => {
      const createData = {
        client_id: mockConnection.client_id,
        instrument_id: mockConnection.instrument_id,
        relationship_type: 'Owned',
      };

      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockFetchQuery.single as jest.Mock).mockResolvedValue({
        data: mockConnection,
        error: null,
      });

      const mockRpc = jest.fn().mockResolvedValue({
        data: mockConnection.id,
        error: null,
      });
      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockFetchQuery),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify(createData),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data).toBeDefined();
      expect(json.data.display_order).toBe(0);
      expect(mockRpc).toHaveBeenCalledWith('create_connection_atomic', {
        p_client_id: mockConnection.client_id,
        p_instrument_id: mockConnection.instrument_id,
        p_relationship_type: 'Owned',
        p_notes: null,
      });
      expect(mockFetchQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should ignore body org_id and use server-derived org scope', async () => {
      const createData = {
        client_id: mockConnection.client_id,
        instrument_id: mockConnection.instrument_id,
        relationship_type: 'Interested',
        org_id: 'forged-org-id',
      };

      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockConnection,
          error: null,
        }),
      };
      const mockRpc = jest.fn().mockResolvedValue({
        data: mockConnection.id,
        error: null,
      });
      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockFetchQuery),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify(createData),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(mockRpc).toHaveBeenCalledWith('create_connection_atomic', {
        p_client_id: mockConnection.client_id,
        p_instrument_id: mockConnection.instrument_id,
        p_relationship_type: 'Interested',
        p_notes: null,
      });
      expect(mockFetchQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('returns controlled conflict when the RPC rejects a cross-org client', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Client not found in organization' },
      });
      mockUserSupabase = {
        from: jest.fn(),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify({
          client_id: mockConnection.client_id,
          instrument_id: mockConnection.instrument_id,
          relationship_type: 'Interested',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error).toBe('Client not found in organization');
      expect(json.message).not.toBe(
        'Server error occurred. Please try again later.'
      );
      expect(mockRpc).toHaveBeenCalledWith('create_connection_atomic', {
        p_client_id: mockConnection.client_id,
        p_instrument_id: mockConnection.instrument_id,
        p_relationship_type: 'Interested',
        p_notes: null,
      });
    });

    it('returns controlled conflict when the RPC rejects a cross-org instrument', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Instrument not found in organization' },
      });
      mockUserSupabase = {
        from: jest.fn(),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify({
          client_id: mockConnection.client_id,
          instrument_id: mockConnection.instrument_id,
          relationship_type: 'Interested',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error).toBe('Instrument not found in organization');
      expect(json.message).not.toBe(
        'Server error occurred. Please try again later.'
      );
    });

    it('should normalize joined DB rows before response validation', async () => {
      // Shaped like the real explicit-column select response - id/first_name/
      // last_name/email/tags only, matching CONNECTION_CLIENT_COLUMNS.
      const dbConnection = {
        ...mockConnection,
        client: {
          id: mockConnection.client_id,
          first_name: 'Ada',
          last_name: 'Lovelace',
          email: 'ada@example.com',
          tags: ['VIP'],
        },
      };
      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: dbConnection,
          error: null,
        }),
      };
      const mockRpc = jest.fn().mockResolvedValue({
        data: mockConnection.id,
        error: null,
      });
      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockFetchQuery),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify({
          client_id: mockConnection.client_id,
          instrument_id: mockConnection.instrument_id,
          relationship_type: 'Interested',
        }),
      });
      const response = await POST(request);
      const { validateClientInstrument } = require('@/utils/typeGuards');

      expect(response.status).toBe(201);
      expect(validateClientInstrument).toHaveBeenCalledWith(
        expect.objectContaining({
          client: expect.objectContaining({
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@example.com',
            tags: ['VIP'],
            // Never selected from the DB for this response - normalized to
            // null by the shared clients mapper, never the real value.
            contact_number: null,
            client_number: null,
          }),
        })
      );
      // The by-ID fetch backing the POST response uses the same explicit
      // allowlist as the collection GET (see the shared CONNECTION_DETAIL_SELECT
      // constant), so mutation and collection responses normalize identically.
      const postSelectArg = mockFetchQuery.select.mock.calls[0][0] as string;
      expect(postSelectArg).toContain(
        'client:clients(id, first_name, last_name, email, tags)'
      );
      expect(postSelectArg).toContain(
        'instrument:instruments(id, maker, type, year, price)'
      );
    });

    it('fails fast when client_instruments.display_order is missing on create', async () => {
      const {
        assertClientConnectionsSchemaReadiness,
      } = require('@/app/api/_utils/schemaReadiness');
      assertClientConnectionsSchemaReadiness.mockRejectedValueOnce(
        Object.assign(new Error('Database migration required'), {
          code: 'SCHEMA_OUT_OF_DATE',
          error_code: 'SCHEMA_OUT_OF_DATE',
          status: 503,
          retryable: false,
          details: {
            missingColumns: ['public.client_instruments.display_order'],
          },
        })
      );

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify({
          client_id: mockConnection.client_id,
          instrument_id: mockConnection.instrument_id,
          relationship_type: 'Interested',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error_code).toBe('SCHEMA_OUT_OF_DATE');
      expect(mockUserSupabase.rpc).not.toHaveBeenCalled();
    });

    it('handles malformed authoritative DB response safely', async () => {
      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...mockConnection, id: undefined },
          error: null,
        }),
      };
      const mockRpc = jest.fn().mockResolvedValue({
        data: mockConnection.id,
        error: null,
      });
      const { validateClientInstrument } = require('@/utils/typeGuards');
      validateClientInstrument.mockImplementationOnce(() => {
        throw new Error('Invalid ClientInstrument: id is required');
      });
      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockFetchQuery),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify({
          client_id: mockConnection.client_id,
          instrument_id: mockConnection.instrument_id,
          relationship_type: 'Interested',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.message).toBe(
        'Server error occurred. Please try again later.'
      );
      expect(mockRpc).toHaveBeenCalled();
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

    it('F12: maps duplicate Owned unique violation (23505) to 409 INSTRUMENT_ALREADY_OWNED', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "client_instruments_single_owner_per_instrument"',
          details: 'Key (instrument_id)=(instrument-id) already exists.',
        },
      });
      mockUserSupabase = {
        from: jest.fn(),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify({
          client_id: mockConnection.client_id,
          instrument_id: mockConnection.instrument_id,
          relationship_type: 'Owned',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error_code).toBe('INSTRUMENT_ALREADY_OWNED');
      expect(json.error).not.toContain(
        'client_instruments_single_owner_per_instrument'
      );
      expect(json.error).not.toContain('constraint');
    });

    it('F12: unrelated unique violations are not reclassified as INSTRUMENT_ALREADY_OWNED', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "some_other_unrelated_constraint"',
        },
      });
      mockUserSupabase = {
        from: jest.fn(),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        body: JSON.stringify({
          client_id: mockConnection.client_id,
          instrument_id: mockConnection.instrument_id,
          relationship_type: 'Interested',
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error_code).not.toBe('INSTRUMENT_ALREADY_OWNED');
    });

    it('should return 400 for malformed JSON', async () => {
      const request = new NextRequest('http://localhost/api/connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"client_id":',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(response.status).not.toBe(500);
      expect(json.error).toBeDefined();
      expect(mockUserSupabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe('PATCH', () => {
    it('should update an existing connection', async () => {
      const updates = { display_order: 1 };
      const updatedConnection = { ...mockConnection, ...updates };

      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockFetchQuery.single as jest.Mock).mockResolvedValue({
        data: updatedConnection,
        error: null,
      });

      const mockRpc = jest.fn().mockResolvedValue({
        data: mockConnection.id,
        error: null,
      });
      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockFetchQuery),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        body: JSON.stringify({ id: mockConnection.id, ...updates }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(mockRpc).toHaveBeenCalledWith('update_connection_atomic', {
        p_connection_id: mockConnection.id,
        p_updates: updates,
      });
      // PATCH's by-ID fetch uses the same explicit column allowlist as the
      // collection GET and POST response (shared CONNECTION_DETAIL_SELECT).
      const patchSelectArg = mockFetchQuery.select.mock.calls[0][0] as string;
      expect(patchSelectArg).toContain(
        'client:clients(id, first_name, last_name, email, tags)'
      );
      expect(patchSelectArg).toContain(
        'instrument:instruments(id, maker, type, year, price)'
      );
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

    it('should return 400 for malformed JSON', async () => {
      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"id":',
      });

      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(response.status).not.toBe(500);
      expect(json.error).toBeDefined();
      expect(mockUserSupabase.rpc).not.toHaveBeenCalled();
    });

    it('F12: maps duplicate Owned unique violation (23505) to 409 on update', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "client_instruments_single_owner_per_instrument"',
        },
      });
      mockUserSupabase = {
        from: jest.fn(),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockConnection.id,
          relationship_type: 'Owned',
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error_code).toBe('INSTRUMENT_ALREADY_OWNED');
    });

    it('F13: rejects client_id reassignment with 400 and does not call the RPC', async () => {
      mockUserSupabase = {
        from: jest.fn(),
        rpc: jest.fn(),
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockConnection.id,
          client_id: '11111111-1111-1111-1111-111111111111',
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toMatch(/client_id/);
      expect(mockUserSupabase.rpc).not.toHaveBeenCalled();
    });

    it('F13: rejects instrument_id reassignment with 400 and does not call the RPC', async () => {
      mockUserSupabase = {
        from: jest.fn(),
        rpc: jest.fn(),
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockConnection.id,
          instrument_id: '22222222-2222-2222-2222-222222222222',
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toMatch(/instrument_id/);
      expect(mockUserSupabase.rpc).not.toHaveBeenCalled();
    });

    it('F13: maps a direct-RPC CONNECTION_REASSIGNMENT_UNSUPPORTED rejection to 400 (defense in depth)', async () => {
      // The API already rejects client_id/instrument_id before calling the
      // RPC (see the two tests above), so this exercises mapConnectionRpcError's
      // handling of the RPC's own stable error in case that validation is
      // ever bypassed - keeping the error contract consistent either way.
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: {
          message:
            "CONNECTION_REASSIGNMENT_UNSUPPORTED: Reassigning a connection's client_id/instrument_id is not supported. Create a new connection instead.",
        },
      });
      mockUserSupabase = {
        from: jest.fn(),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockConnection.id,
          notes: 'irrelevant once client rejects the request',
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error_code).toBe('CONNECTION_REASSIGNMENT_UNSUPPORTED');
    });

    it('F13: still allows relationship_type/notes updates without client_id/instrument_id', async () => {
      const updates = { relationship_type: 'Booked', notes: 'updated' };
      const mockFetchQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockFetchQuery.single as jest.Mock).mockResolvedValue({
        data: { ...mockConnection, ...updates },
        error: null,
      });
      const mockRpc = jest.fn().mockResolvedValue({
        data: mockConnection.id,
        error: null,
      });
      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockFetchQuery),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PATCH',
        body: JSON.stringify({ id: mockConnection.id, ...updates }),
      });
      const response = await PATCH(request);

      expect(response.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith('update_connection_atomic', {
        p_connection_id: mockConnection.id,
        p_updates: updates,
      });
    });
  });

  describe('DELETE', () => {
    it('should delete a connection', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: mockConnection.id,
        error: null,
      });
      mockUserSupabase = {
        from: jest.fn(),
        rpc: mockRpc,
      };

      const request = new NextRequest(
        `http://localhost/api/connections?id=${mockConnection.id}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('delete_connection_atomic', {
        p_connection_id: mockConnection.id,
      });
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/connections');
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Connection ID is required');
    });

    it('F3: maps SOLD_CONNECTION_IMMUTABLE RPC rejection to 409', async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: {
          message:
            'SOLD_CONNECTION_IMMUTABLE: Sold relationships cannot be deleted. Use the sales refund/adjustment workflow instead.',
        },
      });
      mockUserSupabase = {
        from: jest.fn(),
        rpc: mockRpc,
      };

      const request = new NextRequest(
        `http://localhost/api/connections?id=${mockConnection.id}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.error_code).toBe('SOLD_CONNECTION_IMMUTABLE');
      expect(mockRpc).toHaveBeenCalledWith('delete_connection_atomic', {
        p_connection_id: mockConnection.id,
      });
    });
  });

  describe('PUT', () => {
    it('should reorder connections atomically via RPC', async () => {
      const orders = [
        { id: '123e4567-e89b-12d3-a456-426614174000', display_order: 0 },
        { id: '123e4567-e89b-12d3-a456-426614174001', display_order: 1 },
      ];

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: orders.map(o => ({
            ...mockConnection,
            id: o.id,
            display_order: o.display_order,
          })),
          error: null,
        }),
        data: orders.map(o => ({
          ...mockConnection,
          id: o.id,
          display_order: o.display_order,
        })),
        error: null,
        in: jest.fn(),
      };
      (mockSelectQuery.in as jest.Mock).mockReturnValue(mockSelectQuery);

      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockSelectQuery),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PUT',
        body: JSON.stringify({ orders }),
      });
      const response = await PUT(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data).toHaveLength(2);
      expect(mockRpc).toHaveBeenCalledWith('reorder_connections_atomic', {
        p_orders: orders,
      });
      expect(mockSelectQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(mockSelectQuery.in).toHaveBeenCalledWith(
        'id',
        orders.map(order => order.id)
      );
      expect(mockSelectQuery.order).toHaveBeenCalledWith('display_order', {
        ascending: true,
      });
      // The reorder response fetch uses the same explicit column allowlist
      // as the collection GET / POST / PATCH responses.
      const reorderSelectArg = mockSelectQuery.select.mock
        .calls[0][0] as string;
      expect(reorderSelectArg).toContain(
        'client:clients(id, first_name, last_name, email, tags)'
      );
      expect(reorderSelectArg).toContain(
        'instrument:instruments(id, maker, type, year, price)'
      );
    });

    it('should return 500 and skip follow-up fetch when atomic reorder fails', async () => {
      const orders = [
        { id: '123e4567-e89b-12d3-a456-426614174000', display_order: 0 },
        { id: '123e4567-e89b-12d3-a456-426614174001', display_order: 1 },
      ];

      const mockRpc = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Connection not found in organization' },
      });

      mockUserSupabase = {
        from: jest.fn(),
        rpc: mockRpc,
      };

      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PUT',
        body: JSON.stringify({ orders }),
      });
      const response = await PUT(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Failed to reorder connections');
      expect(json.error_code).toBe('CONNECTION_REORDER_FAILED');
      expect(mockRpc).toHaveBeenCalledWith('reorder_connections_atomic', {
        p_orders: orders,
      });
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
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

    it('should return 400 for malformed JSON', async () => {
      const request = new NextRequest('http://localhost/api/connections', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"orders":',
      });

      const response = await PUT(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(response.status).not.toBe(500);
      expect(json.error).toBeDefined();
      expect(mockUserSupabase.rpc).not.toHaveBeenCalled();
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
