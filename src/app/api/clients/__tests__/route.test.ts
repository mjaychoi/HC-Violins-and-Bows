import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from '../route';
import { errorHandler } from '@/utils/errorHandler';

jest.mock('@/app/api/_utils/rateLimit', () => ({
  searchRateLimit: null,
  exportRateLimit: null,
  authRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
}));
jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/utils/typeGuards');
jest.mock('@/utils/inputValidation');
jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  assertClientsSchemaReadiness: jest.fn().mockResolvedValue({
    ready: true,
    checkedAt: '2026-05-08T00:00:00.000Z',
    missingColumns: [],
  }),
  assertClientConnectionsSchemaReadiness: jest.fn().mockResolvedValue({
    ready: true,
    checkedAt: '2026-05-08T00:00:00.000Z',
    missingColumns: [],
  }),
}));
const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;
let mockUserSupabase: any;
let mockWriteAuditLog: jest.Mock;

jest.mock('@/utils/auditLog', () => ({
  writeAuditLog: (...args: unknown[]) =>
    mockWriteAuditLog(...args).catch(() => {}),
}));

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => (request: NextRequest) =>
      handler(request, {
        user: { id: 'test-user' },
        accessToken: 'test-token',
        orgId: 'test-org',
        clientId: 'test-client',
        role: 'admin',
        userSupabase: mockUserSupabase,
        isTestBypass: true,
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
    validateClient: jest.fn(data => data),
    validateClientArray: jest.fn(data => data),
    validateCreateClient: jest.fn(data => data),
    validatePartialClient: jest.fn(data => data),
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

describe('/api/clients', () => {
  const mockClient = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    first_name: 'John',
    last_name: 'Doe',
    contact_number: '123-456-7890',
    email: 'john@example.com',
    tags: ['Owner'],
    interest: 'Active',
    note: 'Test note',
    client_number: null,
    created_at: '2024-01-01T00:00:00Z',
  };

  // DB-format row returned by Supabase (name/phone, not first_name/contact_number).
  // mapClientsTableRowToClient normalises this into the Client shape above.
  const mockDbRow = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    org_id: 'test-org',
    client_number: null as string | null,
    name: 'John Doe',
    email: 'john@example.com',
    phone: '123-456-7890',
    tags: ['Owner'] as string[],
    interest: 'Active',
    note: 'Test note',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: null as string | null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const {
      assertClientsSchemaReadiness,
      assertClientConnectionsSchemaReadiness,
    } = require('@/app/api/_utils/schemaReadiness');
    assertClientsSchemaReadiness.mockResolvedValue({
      ready: true,
      checkedAt: '2026-05-08T00:00:00.000Z',
      missingColumns: [],
    });
    assertClientConnectionsSchemaReadiness.mockResolvedValue({
      ready: true,
      checkedAt: '2026-05-08T00:00:00.000Z',
      missingColumns: [],
    });
    jest.spyOn(performance, 'now').mockReturnValue(0);
    mockWriteAuditLog = jest.fn().mockResolvedValue(undefined);
    mockUserSupabase = {
      from: jest.fn(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET', () => {
    it('should return clients with default parameters', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [mockDbRow],
          error: null,
          count: 1,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].first_name).toBe('John');
      expect(json.data[0].last_name).toBe('Doe');
      expect(json.data[0].email).toBe('john@example.com');
      expect(json.data[0].contact_number).toBe('123-456-7890');
      expect(json.data[0].tags).toEqual(['Owner']);
      expect(json.count).toBe(1);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should hard-cap and mark truncated all=true lists', async () => {
      const rows = Array.from({ length: 1001 }, () => mockClient);
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: rows,
          error: null,
          count: 1001,
        }),
        order: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients?all=true');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1000);
      expect(json.count).toBe(1001);
      expect(json.truncated).toBe(true);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
      expect(mockQuery.limit).toHaveBeenCalledWith(1001);
    });

    it('fails fast when clients.client_number is missing', async () => {
      const {
        assertClientsSchemaReadiness,
      } = require('@/app/api/_utils/schemaReadiness');
      assertClientsSchemaReadiness.mockRejectedValueOnce(
        Object.assign(new Error('Database migration required'), {
          code: 'SCHEMA_OUT_OF_DATE',
          error_code: 'SCHEMA_OUT_OF_DATE',
          status: 503,
          retryable: false,
          details: { missingColumns: ['public.clients.client_number'] },
        })
      );

      mockUserSupabase = {
        from: jest.fn(() => {
          throw new Error('clients query should not run');
        }),
      };

      const request = new NextRequest('http://localhost/api/clients?all=true');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error_code).toBe('SCHEMA_OUT_OF_DATE');
      expect(json.message).toBe('Database migration required.');
      expect(mockUserSupabase.from).not.toHaveBeenCalled();
    });

    it('should filter clients by search query', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [mockDbRow],
          error: null,
          count: 1,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest(
        'http://localhost/api/clients?search=John'
      );
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(mockQuery.or).toHaveBeenCalledWith(
        expect.stringContaining('name.ilike.%John%')
      );
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should apply limit when provided', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [mockDbRow],
          error: null,
          count: 1,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients?limit=10');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should handle Supabase errors', async () => {
      const mockError = { message: 'Database error', code: 'PGRST116' };
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: mockError,
          count: 0,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;
      mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue({
        code: 'PGRST116',
        message: 'Database error',
      });

      const request = new NextRequest('http://localhost/api/clients');
      const response = await GET(request);

      expect(response.status).toBe(500);
      expect(mockErrorHandler.handleSupabaseError).toHaveBeenCalled();
    });

    it('should normalize null tags to empty array', async () => {
      const dbRowWithNullTags = { ...mockDbRow, tags: null };
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [dbRowWithNullTags],
          error: null,
          count: 1,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data[0].tags).toEqual([]);
    });
  });

  describe('POST', () => {
    it('should create a new client with server-allocated client_number and persist interest/note', async () => {
      const createData = {
        first_name: 'Jane',
        last_name: 'Smith',
        contact_number: '   ',
        email: '   ',
        tags: ['Musician'],
        interest: 'High',
        note: 'Prefers older Italian instruments',
      };

      const dbRow = {
        id: mockClient.id,
        org_id: 'test-org',
        client_number: 'CL001',
        name: 'Jane Smith',
        email: null,
        phone: null,
        tags: ['Musician'] as string[],
        interest: 'High',
        note: 'Prefers older Italian instruments',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
      };

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: dbRow,
        error: null,
      });

      const rpc = jest.fn().mockResolvedValue({ data: 0, error: null });

      mockUserSupabase = {
        rpc,
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'POST',
        body: JSON.stringify(createData),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data).toBeDefined();
      expect(json.data.client_number).toBe('CL001');
      expect(json.data.tags).toEqual(['Musician']);
      expect(json.data.interest).toBe('High');
      expect(json.data.note).toBe('Prefers older Italian instruments');
      expect(rpc).toHaveBeenCalledWith('max_cl_suffix_for_org', {
        p_org_id: 'test-org',
      });
      expect(mockQuery.insert).toHaveBeenCalled();
      const insertArg = (mockQuery.insert as jest.Mock).mock.calls[0][0];
      expect(insertArg).toEqual({
        name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        email: null,
        phone: null,
        org_id: 'test-org',
        client_number: 'CL001',
        tags: ['Musician'],
        interest: 'High',
        note: 'Prefers older Italian instruments',
      });
      expect(Object.keys(insertArg).sort()).toEqual([
        'client_number',
        'email',
        'first_name',
        'interest',
        'last_name',
        'name',
        'note',
        'org_id',
        'phone',
        'tags',
      ]);
    });

    it('should return 400 for invalid data', async () => {
      const request = new NextRequest('http://localhost/api/clients', {
        method: 'POST',
        body: JSON.stringify({ invalid: 'data' }),
      });

      // Mock safeValidate to return failure
      const { safeValidate } = require('@/utils/typeGuards');
      (safeValidate as jest.Mock).mockReturnValueOnce({
        success: false,
        error: 'Invalid client data',
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toContain('Invalid client data');
    });

    it('should ignore request client_number and still server-allocate', async () => {
      const dbRow = {
        id: mockClient.id,
        org_id: 'test-org',
        client_number: 'CL001',
        name: 'John Doe',
        email: null,
        phone: null,
        tags: ['Owner'] as string[],
        interest: null,
        note: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
      };
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: dbRow,
        error: null,
      });
      const rpc = jest.fn().mockResolvedValue({ data: 0, error: null });
      mockUserSupabase = {
        rpc,
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'POST',
        body: JSON.stringify({
          first_name: 'John',
          last_name: 'Doe',
          contact_number: null,
          email: '',
          client_number: 'CL999',
          org_id: 'attacker-org',
          tags: ['Owner'],
          interest: '',
          note: '',
        }),
      });
      const response = await POST(request);
      const json = await response.json();
      expect(response.status).toBe(201);
      expect(json.data.client_number).toBe('CL001');
      expect(json.data.tags).toEqual(['Owner']);
      const insertArg = (mockQuery.insert as jest.Mock).mock.calls[0][0];
      expect(insertArg.client_number).toBe('CL001');
      expect(insertArg.org_id).toBe('test-org');
      expect(insertArg.tags).toEqual(['Owner']);
    });

    it('should return 400 when client name is empty after trimming', async () => {
      const request = new NextRequest('http://localhost/api/clients', {
        method: 'POST',
        body: JSON.stringify({
          first_name: '   ',
          last_name: '',
          contact_number: null,
          email: '',
          tags: [],
          interest: '',
          note: '',
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Client name is required');
    });

    it('should return 409 with allocation_exhausted when bounded retries are exhausted', async () => {
      const dup = {
        message: 'dup',
        code: '23505',
        details: 'Key (org_id, client_number)=(o, CL001) already exists.',
        hint: null,
      };
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: dup }),
      };
      const rpc = jest.fn().mockResolvedValue({ data: 0, error: null });
      mockUserSupabase = {
        rpc,
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'POST',
        body: JSON.stringify({
          first_name: 'John',
          last_name: 'Doe',
          contact_number: null,
          email: '',
          tags: [],
          interest: '',
          note: '',
        }),
      });
      const response = await POST(request);
      const json = await response.json();
      expect(response.status).toBe(409);
      expect(json.error_code).toBe('client_number_allocation_exhausted');
    });

    it('should return 500 for non-unique-violation errors on create', async () => {
      const mockError = { message: 'RLS or policy error', code: 'PGRST301' };
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };
      (mockQuery.single as jest.Mock).mockResolvedValue({
        data: null,
        error: mockError,
      });

      const rpc = jest.fn().mockResolvedValue({ data: 0, error: null });

      mockUserSupabase = {
        rpc,
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;
      mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue({
        code: 'PGRST301',
        message: 'RLS or policy error',
      });

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'POST',
        body: JSON.stringify({
          first_name: 'John',
          last_name: 'Doe',
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });

    it('writes client.create audit log after successful creation', async () => {
      const dbRow = {
        id: mockClient.id,
        org_id: 'test-org',
        client_number: 'CL001',
        name: 'Jane Smith',
        email: null,
        phone: null,
        tags: ['Musician'] as string[],
        interest: null,
        note: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
      };

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: dbRow, error: null }),
      };
      const rpc = jest.fn().mockResolvedValue({ data: 0, error: null });
      mockUserSupabase = {
        rpc,
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'POST',
        body: JSON.stringify({ first_name: 'Jane', last_name: 'Smith' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'client.create',
          resourceType: 'client',
          resourceId: mockClient.id,
          orgId: 'test-org',
          actorId: 'test-user',
        })
      );
    });

    it('audit log failure does not fail client create response', async () => {
      mockWriteAuditLog.mockRejectedValueOnce(new Error('audit db down'));

      const dbRow = {
        id: mockClient.id,
        org_id: 'test-org',
        client_number: 'CL001',
        name: 'Jane Smith',
        email: null,
        phone: null,
        tags: [] as string[],
        interest: null,
        note: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: null,
      };

      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: dbRow, error: null }),
      };
      const rpc = jest.fn().mockResolvedValue({ data: 0, error: null });
      mockUserSupabase = {
        rpc,
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'POST',
        body: JSON.stringify({ first_name: 'Jane', last_name: 'Smith' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
    });
  });

  describe('PATCH', () => {
    it('should update persisted fields and normalize empty strings to null', async () => {
      const updates = {
        first_name: 'Jane',
        interest: 'Collector',
        note: 'Updated note',
        email: '   ',
        contact_number: '',
      };

      const currentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { name: 'John Doe' },
          error: null,
        }),
      };
      const updateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: mockClient.id,
            org_id: 'test-org',
            client_number: 'CL001',
            name: 'Jane Doe',
            email: null,
            phone: null,
            tags: ['Owner'],
            interest: 'Collector',
            note: 'Updated note',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(currentQuery)
          .mockReturnValueOnce(updateQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'PATCH',
        body: JSON.stringify({ id: mockClient.id, ...updates }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data.interest).toBe('Collector');
      expect(json.data.note).toBe('Updated note');
      expect(updateQuery.update).toHaveBeenCalledWith({
        name: 'Jane Doe',
        first_name: 'Jane',
        last_name: 'Doe',
        email: null,
        phone: null,
        interest: 'Collector',
        note: 'Updated note',
      });
      expect(updateQuery.eq).toHaveBeenCalledWith('id', mockClient.id);
      expect(updateQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('ignores client_number on PATCH and does not write it', async () => {
      const currentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { name: 'John Doe', first_name: 'John', last_name: 'Doe' },
          error: null,
        }),
      };
      const updateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: mockClient.id,
            org_id: 'test-org',
            client_number: 'CL001',
            name: 'John Doe',
            first_name: 'John',
            last_name: 'Doe',
            email: null,
            phone: null,
            tags: [],
            interest: null,
            note: 'still works',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(currentQuery)
          .mockReturnValueOnce(updateQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockClient.id,
          client_number: 'CL999',
          note: 'still works',
        }),
      });
      const response = await PATCH(request);

      expect(response.status).toBe(200);
      expect(updateQuery.update).toHaveBeenCalledWith(
        expect.not.objectContaining({ client_number: expect.anything() })
      );
      expect(updateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({ note: 'still works' })
      );
    });

    it('should return 400 when patch would clear the client name', async () => {
      const currentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { name: 'John Doe' },
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(currentQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockClient.id,
          first_name: '   ',
          last_name: '',
        }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Client name is required');
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/clients', {
        method: 'PATCH',
        body: JSON.stringify({ first_name: 'Jane' }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json).toMatchObject({
        message: 'Client ID is required',
        retryable: false,
      });
    });

    it('should return 400 for invalid UUID', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'PATCH',
        body: JSON.stringify({ id: 'invalid-id', first_name: 'Jane' }),
      });
      const response = await PATCH(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json).toMatchObject({
        message: 'Invalid client ID format',
        retryable: false,
      });
    });

    it('writes client.update audit log with changed_fields after successful update', async () => {
      const currentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { name: 'John Doe' },
          error: null,
        }),
      };
      const updateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: mockClient.id,
            org_id: 'test-org',
            client_number: 'CL001',
            name: 'John Updated',
            email: null,
            phone: null,
            tags: ['Owner'],
            interest: null,
            note: 'new note',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
          error: null,
        }),
      };

      mockUserSupabase = {
        from: jest
          .fn()
          .mockReturnValueOnce(currentQuery)
          .mockReturnValueOnce(updateQuery),
      } as any;

      const request = new NextRequest('http://localhost/api/clients', {
        method: 'PATCH',
        body: JSON.stringify({
          id: mockClient.id,
          first_name: 'John',
          last_name: 'Updated',
          note: 'new note',
        }),
      });
      const response = await PATCH(request);

      expect(response.status).toBe(200);
      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'client.update',
          resourceType: 'client',
          resourceId: mockClient.id,
          orgId: 'test-org',
          actorId: 'test-user',
          metadata: expect.objectContaining({
            changed_fields: expect.arrayContaining(['name', 'note']),
          }),
        })
      );
    });
  });

  describe('DELETE', () => {
    it('should delete a client', async () => {
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
        `http://localhost/api/clients?id=${mockClient.id}`
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', mockClient.id);
      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'test-org');
    });

    it('should return 400 when id is missing', async () => {
      const request = new NextRequest('http://localhost/api/clients');
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toBe('Client ID is required');
    });

    it('should return 400 for invalid UUID', async () => {
      const { validateUUID } = require('@/utils/inputValidation');
      (validateUUID as jest.Mock).mockReturnValueOnce(false);

      const request = new NextRequest(
        'http://localhost/api/clients?id=invalid'
      );
      const response = await DELETE(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toBe('Invalid client ID format');
    });

    it('should handle Supabase errors on delete', async () => {
      const mockError = { message: 'Foreign key constraint', code: '23503' };
      const mockQuery = {
        delete: jest.fn().mockReturnThis(),
        error: mockError,
        eq: jest.fn().mockReturnThis(),
      };

      mockUserSupabase = {
        from: jest.fn().mockReturnValue(mockQuery),
      } as any;
      mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue({
        code: '23503',
        message: 'Foreign key constraint',
      });

      const request = new NextRequest(
        `http://localhost/api/clients?id=${mockClient.id}`
      );
      const response = await DELETE(request);

      expect(response.status).toBe(500);
    });
  });
});
