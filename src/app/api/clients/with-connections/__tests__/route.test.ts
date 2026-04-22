import { NextRequest } from 'next/server';
import { POST } from '../route';
import { errorHandler } from '@/utils/errorHandler';
import { ErrorCodes } from '@/types/errors';
import { validateClient } from '@/utils/typeGuards';

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/utils/typeGuards', () => {
  const actual = jest.requireActual('@/utils/typeGuards');
  return {
    ...actual,
    validateClient: jest.fn((d: unknown) => d),
    validateClientInstrument: jest.fn((d: unknown) => d),
  };
});

const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;

let mockUserSupabase: any;

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => (request: NextRequest) =>
      handler(request, {
        user: { id: 'test-user' },
        accessToken: 'test-token',
        orgId: '00000000-0000-0000-0000-000000000001',
        clientId: 'test-client',
        role: 'admin',
        userSupabase: mockUserSupabase,
        isTestBypass: true,
      }),
  };
});

const validInst = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const clientRow = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  org_id: '00000000-0000-0000-0000-000000000001',
  name: 'Jane Smith',
  email: 'j@example.com',
  phone: null,
  client_number: 'CL001',
  tags: ['Owner'],
  interest: 'Collector',
  note: 'Wants an instrument for quartet work',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: null,
};

const connRow = {
  id: '223e4567-e89b-12d3-a456-426614174000',
  client_id: clientRow.id,
  instrument_id: validInst,
  relationship_type: 'Interested',
  notes: null,
  display_order: 0,
  created_at: '2024-01-01T00:00:00Z',
};

describe('POST /api/clients/with-connections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockErrorHandler.handleSupabaseError.mockImplementation(() => ({
      code: ErrorCodes.DATABASE_ERROR,
      message: 'Database error',
      status: 500,
      timestamp: new Date().toISOString(),
    }));
    const rpc = jest.fn().mockImplementation((name: string) => {
      if (name === 'max_cl_suffix_for_org') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (name === 'create_client_with_connections_atomic') {
        return Promise.resolve({
          data: { client: clientRow, connections: [connRow] },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mockUserSupabase = { rpc };
  });

  it('returns 201 from RPC payload without follow-up SELECT', async () => {
    const request = new NextRequest(
      'http://localhost/api/clients/with-connections',
      {
        method: 'POST',
        body: JSON.stringify({
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'j@example.com',
          contact_number: null,
          interest: 'Collector',
          note: 'Wants an instrument for quartet work',
          client_number: 'CL999',
          tags: ['Owner'],
          instrumentLinks: [
            {
              instrument_id: validInst,
              relationship_type: 'Interested',
              notes: null,
            },
          ],
        }),
      }
    );
    const response = await POST(request);
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.data.client.client_number).toBe('CL001');
    expect(json.data.client.tags).toEqual(['Owner']);
    expect(json.data.client.interest).toBe('Collector');
    expect(json.data.client.note).toBe('Wants an instrument for quartet work');
    expect(mockUserSupabase.from).toBeUndefined();
    const createCall = mockUserSupabase.rpc.mock.calls.find(
      (c: unknown[]) => c[0] === 'create_client_with_connections_atomic'
    );
    expect(createCall).toBeDefined();
    const args = createCall![1] as {
      p_client_number: string;
      p_tags: string[] | null;
      p_interest: string | null;
      p_note: string | null;
    };
    expect(args.p_client_number).toBe('CL001');
    expect(args.p_tags).toEqual(['Owner']);
    expect(args.p_interest).toBe('Collector');
    expect(args.p_note).toBe('Wants an instrument for quartet work');
  });

  it('returns 201 when RPC JSON is malformed but the row exists in DB (write succeeded; recovered via SELECT)', async () => {
    const rpc = jest.fn().mockImplementation((name: string) => {
      if (name === 'max_cl_suffix_for_org') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (name === 'create_client_with_connections_atomic') {
        return Promise.resolve({
          data: { bad: true },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const recoveredClientQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: clientRow,
        error: null,
      }),
    };
    const recoveredConnectionsQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
    };
    (recoveredConnectionsQuery.order as jest.Mock)
      .mockReturnValueOnce(recoveredConnectionsQuery)
      .mockResolvedValueOnce({
        data: [connRow],
        error: null,
      });

    mockUserSupabase = {
      rpc,
      from: jest.fn((table: string) => {
        if (table === 'clients') {
          return recoveredClientQuery;
        }
        if (table === 'client_instruments') {
          return recoveredConnectionsQuery;
        }
        return undefined;
      }),
    };

    const request = new NextRequest(
      'http://localhost/api/clients/with-connections',
      {
        method: 'POST',
        body: JSON.stringify({
          first_name: 'Jane',
          last_name: 'Smith',
          email: '',
          contact_number: null,
          client_number: null,
          tags: [],
          interest: 'Collector',
          note: 'Needs recovery path',
          instrumentLinks: [
            {
              instrument_id: validInst,
              relationship_type: 'Interested',
              notes: null,
            },
          ],
        }),
      }
    );
    const response = await POST(request);
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.data.client.id).toBe(clientRow.id);
    expect(json.data.connections).toHaveLength(1);
  });

  it('returns 400 when the combined client name is empty', async () => {
    const request = new NextRequest(
      'http://localhost/api/clients/with-connections',
      {
        method: 'POST',
        body: JSON.stringify({
          first_name: '   ',
          last_name: '',
          email: '',
          contact_number: null,
          client_number: null,
          tags: [],
          interest: '',
          note: '',
          instrumentLinks: [],
        }),
      }
    );

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('Client name is required');
  });

  it('returns 503 + create_response_malformed when RPC succeeds but payload cannot be parsed and recovery finds no row (write may have succeeded; do not blindly retry create)', async () => {
    const rpc = jest.fn().mockImplementation((name: string) => {
      if (name === 'max_cl_suffix_for_org') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (name === 'create_client_with_connections_atomic') {
        return Promise.resolve({
          data: { not_client_shape: true },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const recoveredClientQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };
    mockUserSupabase = {
      rpc,
      from: jest.fn((table: string) => {
        if (table === 'clients') return recoveredClientQuery;
        return undefined;
      }),
    };

    const request = new NextRequest(
      'http://localhost/api/clients/with-connections',
      {
        method: 'POST',
        body: JSON.stringify({
          first_name: 'Jane',
          last_name: 'Smith',
          email: '',
          contact_number: null,
          client_number: null,
          tags: [],
          interest: 'Collector',
          note: 'Unrecoverable payload',
          instrumentLinks: [],
        }),
      }
    );
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error_code).toBe('create_response_malformed');
    expect(json.retryable).toBe(false);
    expect(String(json.error)).toMatch(/refresh|verify/i);
  });

  it('returns 503 when RPC returns a parseable payload but API response assembly throws (ambiguous post-write state)', async () => {
    (validateClient as jest.Mock).mockImplementationOnce(() => {
      throw new Error('simulated validate failure');
    });

    const request = new NextRequest(
      'http://localhost/api/clients/with-connections',
      {
        method: 'POST',
        body: JSON.stringify({
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'j@example.com',
          contact_number: null,
          interest: 'Collector',
          note: 'x',
          client_number: 'CL999',
          tags: ['Owner'],
          instrumentLinks: [
            {
              instrument_id: validInst,
              relationship_type: 'Interested',
              notes: null,
            },
          ],
        }),
      }
    );
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error_code).toBe('create_response_malformed');
    expect(json.retryable).toBe(false);
  });

  it('returns 500 when RPC reports an unexpected error before a successful create can be confirmed', async () => {
    const rpc = jest.fn().mockImplementation((name: string) => {
      if (name === 'max_cl_suffix_for_org') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (name === 'create_client_with_connections_atomic') {
        return Promise.resolve({
          data: null,
          error: {
            code: '57000',
            message: 'operator intervention',
            details: null,
            hint: null,
          },
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mockUserSupabase = { rpc };

    const request = new NextRequest(
      'http://localhost/api/clients/with-connections',
      {
        method: 'POST',
        body: JSON.stringify({
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'j@example.com',
          contact_number: null,
          interest: 'Collector',
          note: 'x',
          client_number: null,
          tags: [],
          instrumentLinks: [],
        }),
      }
    );
    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(mockErrorHandler.handleSupabaseError).toHaveBeenCalled();
  });

  it('returns 409 on unique violation when duplicate org client_number is indicated', async () => {
    const rpc = jest.fn().mockImplementation((name: string) => {
      if (name === 'max_cl_suffix_for_org') {
        return Promise.resolve({ data: 0, error: null });
      }
      if (name === 'create_client_with_connections_atomic') {
        return Promise.resolve({
          data: null,
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint',
            details:
              'Key (org_id, client_number)=(00000000-0000-0000-0000-000000000001, CL001) already exists.',
            hint: null,
          },
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mockUserSupabase = { rpc };

    const request = new NextRequest(
      'http://localhost/api/clients/with-connections',
      {
        method: 'POST',
        body: JSON.stringify({
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'j@example.com',
          contact_number: null,
          interest: 'Collector',
          note: 'x',
          client_number: null,
          tags: [],
          instrumentLinks: [],
        }),
      }
    );
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(String(json.error)).toMatch(/client number|already in use/i);
  });
});
