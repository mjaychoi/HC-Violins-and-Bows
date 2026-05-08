import {
  claimCreateIdempotency,
  completeCreateIdempotency,
  createRequestHash,
} from '../createIdempotency';
import type { AuthContext } from '../withAuthRoute';

function requestWithKey(key?: string): Request {
  return new Request('http://localhost/api/test', {
    headers: key ? { 'Idempotency-Key': key } : undefined,
  });
}

function createAuth(table: unknown): AuthContext {
  return {
    user: {
      id: '123e4567-e89b-12d3-a456-426614174999',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2024-01-01T00:00:00Z',
    },
    accessToken: 'token',
    orgId: '123e4567-e89b-12d3-a456-426614174000',
    role: 'admin',
    userSupabase: {
      from: jest.fn(() => table),
    } as unknown as AuthContext['userSupabase'],
    isTestBypass: true,
  };
}

function createTableMock(options: {
  insertError?: unknown;
  lookupRow?: unknown;
}) {
  type TableMock = {
    select: jest.Mock<TableMock, [string?]>;
    eq: jest.Mock<TableMock, [string, unknown]>;
    insert: jest.Mock<TableMock, [unknown]>;
    update: jest.Mock<TableMock, [unknown]>;
    delete: jest.Mock<TableMock, []>;
    single: jest.Mock<Promise<{ data: unknown; error: unknown }>, []>;
    maybeSingle: jest.Mock<Promise<{ data: unknown; error: null }>, []>;
  };

  const table = {} as TableMock;
  Object.assign(table, {
    select: jest.fn(() => table),
    eq: jest.fn(() => table),
    insert: jest.fn(() => table),
    update: jest.fn(() => table),
    delete: jest.fn(() => table),
    single: jest.fn(async () => ({
      data: options.insertError ? null : options.lookupRow,
      error: options.insertError ?? null,
    })),
    maybeSingle: jest.fn(async () => ({
      data: options.lookupRow ?? null,
      error: null,
    })),
  });

  return table;
}

describe('create idempotency helper', () => {
  it('ignores requests without an idempotency key', async () => {
    const table = createTableMock({});
    const claim = await claimCreateIdempotency(
      requestWithKey(),
      createAuth(table),
      'POST:/api/test',
      createRequestHash({ a: 1 })
    );

    expect(claim).toEqual({ kind: 'none' });
    expect(table.insert).not.toHaveBeenCalled();
  });

  it('claims a new scoped idempotency key', async () => {
    const row = {
      org_id: '123e4567-e89b-12d3-a456-426614174000',
      user_id: '123e4567-e89b-12d3-a456-426614174999',
      route_key: 'POST:/api/test',
      idempotency_key: 'key-1',
      request_hash: createRequestHash({ a: 1 }),
      status: 'in_progress',
      response_payload: null,
    };
    const table = createTableMock({ lookupRow: row });

    const claim = await claimCreateIdempotency(
      requestWithKey('key-1'),
      createAuth(table),
      'POST:/api/test',
      row.request_hash
    );

    expect(claim).toEqual({ kind: 'claimed', idempotencyKey: 'key-1' });
    expect(table.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: row.org_id,
        user_id: row.user_id,
        route_key: row.route_key,
        idempotency_key: row.idempotency_key,
      })
    );
  });

  it('replays a completed response for the same scoped key and payload hash', async () => {
    const requestHash = createRequestHash({ a: 1 });
    const table = createTableMock({
      insertError: { code: '23505' },
      lookupRow: {
        org_id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174999',
        route_key: 'POST:/api/test',
        idempotency_key: 'key-1',
        request_hash: requestHash,
        status: 'completed',
        response_payload: { data: { id: 'created-1' } },
      },
    });

    const claim = await claimCreateIdempotency(
      requestWithKey('key-1'),
      createAuth(table),
      'POST:/api/test',
      requestHash
    );

    expect(claim).toEqual({
      kind: 'replay',
      payload: {
        data: { id: 'created-1' },
        idempotentReplay: true,
      },
    });
    expect(table.eq).toHaveBeenCalledWith(
      'org_id',
      '123e4567-e89b-12d3-a456-426614174000'
    );
    expect(table.eq).toHaveBeenCalledWith(
      'user_id',
      '123e4567-e89b-12d3-a456-426614174999'
    );
  });

  it('rejects reuse of a key with a different payload hash', async () => {
    const table = createTableMock({
      insertError: { code: '23505' },
      lookupRow: {
        org_id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174999',
        route_key: 'POST:/api/test',
        idempotency_key: 'key-1',
        request_hash: createRequestHash({ a: 1 }),
        status: 'completed',
        response_payload: { data: { id: 'created-1' } },
      },
    });

    const claim = await claimCreateIdempotency(
      requestWithKey('key-1'),
      createAuth(table),
      'POST:/api/test',
      createRequestHash({ a: 2 })
    );

    expect(claim).toMatchObject({
      kind: 'conflict',
      status: 409,
      payload: {
        error_code: 'IDEMPOTENCY_KEY_REUSED',
      },
    });
  });

  it('stores the authoritative response payload only after successful create', async () => {
    const table = createTableMock({});

    await completeCreateIdempotency(
      createAuth(table),
      'POST:/api/test',
      'key-1',
      { data: { id: 'created-1' } }
    );

    expect(table.update).toHaveBeenCalledWith({
      status: 'completed',
      response_payload: { data: { id: 'created-1' } },
    });
  });
});
