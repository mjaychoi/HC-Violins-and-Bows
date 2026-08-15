import { NextRequest } from 'next/server';
import { POST } from '../route';
import { errorHandler } from '@/utils/errorHandler';
import { createRequestHash } from '@/app/api/_utils/createIdempotency';
import { createClientInputToDbRow } from '@/utils/clientDbMap';

jest.mock('@/app/api/_utils/rateLimit', () => ({
  searchRateLimit: null,
  exportRateLimit: null,
  authRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
}));
jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
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

const adaBody = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  contact_number: null,
  tags: [],
  interest: '',
  note: '',
};

const adaRow = createClientInputToDbRow({
  ...adaBody,
  client_number: null,
  tags: [],
});

const adaHash = createRequestHash({
  name: adaRow.name.trim(),
  email: adaRow.email,
  phone: adaRow.phone,
  tags: adaRow.tags ?? [],
  interest: adaRow.interest,
  note: adaRow.note,
});

const createdDbRow = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  org_id: 'test-org',
  client_number: 'CL001',
  name: 'Ada Lovelace',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  phone: null,
  tags: [] as string[],
  interest: null,
  note: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: null,
};

function postRequest(key: string, body: unknown = adaBody) {
  return new NextRequest('http://localhost/api/clients', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
}

function createIdempotencyTable(options: {
  insertError?: unknown;
  lookupRow?: unknown;
}) {
  const table: Record<string, jest.Mock> = {};
  Object.assign(table, {
    select: jest.fn(() => table),
    eq: jest.fn(() => table),
    insert: jest.fn(() => table),
    update: jest.fn(() => table),
    delete: jest.fn(() => table),
    single: jest.fn(async () => ({
      data: options.insertError ? null : { idempotency_key: 'k' },
      error: options.insertError ?? null,
    })),
    maybeSingle: jest.fn(async () => ({
      data: options.lookupRow ?? null,
      error: null,
    })),
  });
  return table;
}

function createClientsTable(result: { data: unknown; error: unknown }) {
  const table: Record<string, jest.Mock> = {};
  Object.assign(table, {
    insert: jest.fn(() => table),
    select: jest.fn(() => table),
    single: jest.fn(async () => result),
  });
  return table;
}

describe('POST /api/clients idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteAuditLog = jest.fn().mockResolvedValue(undefined);
    mockErrorHandler.handleSupabaseError = jest.fn().mockReturnValue({
      code: 'PGRST301',
      message: 'RLS or policy error',
    });
  });

  it('TEST-6: same key + same payload replays one Client without a second insert', async () => {
    const idempotency = createIdempotencyTable({
      insertError: { code: '23505' },
      lookupRow: {
        request_hash: adaHash,
        status: 'completed',
        response_payload: {
          data: {
            id: createdDbRow.id,
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@example.com',
            contact_number: null,
            tags: [],
            interest: null,
            note: null,
            client_number: 'CL001',
            created_at: createdDbRow.created_at,
            updated_at: null,
          },
        },
      },
    });
    const clients = createClientsTable({ data: createdDbRow, error: null });

    mockUserSupabase = {
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
      from: jest.fn((table: string) => {
        if (table === 'api_create_idempotency') return idempotency;
        if (table === 'clients') return clients;
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const response = await POST(postRequest('key-a'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.id).toBe(createdDbRow.id);
    expect(json.idempotentReplay).toBe(true);
    expect(clients.insert).not.toHaveBeenCalled();
  });

  it('TEST-7: same key + different payload is rejected', async () => {
    const idempotency = createIdempotencyTable({
      insertError: { code: '23505' },
      lookupRow: {
        request_hash: 'other-hash',
        status: 'completed',
        response_payload: { data: { id: createdDbRow.id } },
      },
    });

    mockUserSupabase = {
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
      from: jest.fn((table: string) => {
        if (table === 'api_create_idempotency') return idempotency;
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const response = await POST(postRequest('key-a'));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error_code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('creates exactly one client row for a newly claimed key', async () => {
    const idempotency = createIdempotencyTable({});
    const clients = createClientsTable({ data: createdDbRow, error: null });

    mockUserSupabase = {
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
      from: jest.fn((table: string) => {
        if (table === 'api_create_idempotency') return idempotency;
        if (table === 'clients') return clients;
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const response = await POST(postRequest('key-a'));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.id).toBe(createdDbRow.id);
    expect(clients.insert).toHaveBeenCalledTimes(1);
    expect(idempotency.update).toHaveBeenCalledWith({
      status: 'completed',
      response_payload: { data: json.data },
    });
  });

  it('treats distinct keys with the same payload as distinct operations', async () => {
    const idempotency = createIdempotencyTable({});
    const clients = createClientsTable({ data: createdDbRow, error: null });

    mockUserSupabase = {
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
      from: jest.fn((table: string) => {
        if (table === 'api_create_idempotency') return idempotency;
        if (table === 'clients') return clients;
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const first = await POST(postRequest('key-a'));
    const second = await POST(postRequest('key-b'));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(clients.insert).toHaveBeenCalledTimes(2);
  });

  it('releases a failed claim so a later retry can proceed', async () => {
    const idempotency = createIdempotencyTable({});
    const clients = createClientsTable({
      data: null,
      error: { message: 'RLS or policy error', code: 'PGRST301' },
    });

    mockUserSupabase = {
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
      from: jest.fn((table: string) => {
        if (table === 'api_create_idempotency') return idempotency;
        if (table === 'clients') return clients;
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const response = await POST(postRequest('key-a'));
    expect(response.status).toBe(500);
    expect(idempotency.delete).toHaveBeenCalled();
  });
});
