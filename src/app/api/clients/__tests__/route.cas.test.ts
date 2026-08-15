import { NextRequest } from 'next/server';
import { PATCH, DELETE } from '../route';
import {
  CLIENT_EXPECTED_UPDATED_AT_INVALID_CODE,
  CLIENT_EXPECTED_UPDATED_AT_REQUIRED_CODE,
  CLIENT_STALE_CONFLICT_MESSAGE,
  CLIENT_STALE_VERSION_CODE,
} from '../_utils/concurrency';

jest.mock('@/app/api/_utils/rateLimit', () => ({
  searchRateLimit: null,
  exportRateLimit: null,
  authRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
}));
jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn((err: unknown) => err),
  },
}));
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/app/api/_utils/schemaReadiness', () => ({
  assertClientsSchemaReadiness: jest.fn().mockResolvedValue({
    ready: true,
    checkedAt: '2026-05-08T00:00:00.000Z',
    missingColumns: [],
  }),
}));
jest.mock('@/utils/auditLog', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLIENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-01T00:00:01.000Z';

type ClientRow = {
  id: string;
  org_id: string;
  client_number: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  interest: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

let store: ClientRow | null;
let lastUpdate: {
  patch: Record<string, unknown> | null;
  filters: Record<string, unknown>;
} = { patch: null, filters: {} };
let updateAttempts = 0;
let mockUserSupabase: { from: jest.Mock };
let mockAuth: {
  user: { id: string };
  accessToken: string;
  orgId: string | null;
  clientId: string | null;
  role: 'admin' | 'member';
  userSupabase: { from: jest.Mock };
  isTestBypass: boolean;
};

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => (request: NextRequest) =>
      handler(request, mockAuth),
  };
});

function createInitialRow(): ClientRow {
  return {
    id: CLIENT_ID,
    org_id: ORG_A,
    client_number: 'CL001',
    name: 'Ada Lovelace',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone: 'P0',
    tags: ['Musician'],
    interest: 'Active',
    note: 'A0',
    created_at: T0,
    updated_at: T0,
  };
}

function createCasSupabase() {
  return {
    from: jest.fn((table: string) => {
      if (table !== 'clients') {
        throw new Error(`unexpected table ${table}`);
      }

      const filters: Record<string, unknown> = {};
      let mode: 'select' | 'update' = 'select';
      let patch: Record<string, unknown> | null = null;

      const matchesIdentity = () =>
        store && store.id === filters.id && store.org_id === filters.org_id;

      const matchesCas = () =>
        matchesIdentity() && store!.updated_at === filters.updated_at;

      const finish = async (requireRow: boolean) => {
        if (mode === 'update') {
          updateAttempts += 1;
          lastUpdate = { patch, filters: { ...filters } };
          if (!matchesCas()) {
            return { data: null, error: null };
          }
          store = {
            ...store!,
            ...patch,
            updated_at: T1,
          } as ClientRow;
          return { data: { ...store }, error: null };
        }

        if (!matchesIdentity()) {
          if (requireRow) {
            return { data: null, error: { message: 'not found' } };
          }
          return { data: null, error: null };
        }

        return { data: { ...store }, error: null };
      };

      const chain: Record<string, any> = {
        select: jest.fn(() => chain),
        update: jest.fn((nextPatch: Record<string, unknown>) => {
          mode = 'update';
          patch = nextPatch;
          return chain;
        }),
        delete: jest.fn(() => {
          const deleteChain: Record<string, any> = {
            eq: jest.fn((key: string, value: unknown) => {
              filters[key] = value;
              return deleteChain;
            }),
            then: (onFulfilled: any) => {
              const matched = matchesIdentity();
              if (matched) {
                store = null;
              }
              return Promise.resolve({
                error: null,
                count: matched ? 1 : 0,
              }).then(onFulfilled);
            },
          };
          return deleteChain;
        }),
        eq: jest.fn((key: string, value: unknown) => {
          filters[key] = value;
          return chain;
        }),
        single: jest.fn(() => finish(true)),
        maybeSingle: jest.fn(() => finish(false)),
      };

      return chain;
    }),
  };
}

function patchRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/clients', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/clients optimistic concurrency', () => {
  beforeEach(() => {
    store = createInitialRow();
    lastUpdate = { patch: null, filters: {} };
    updateAttempts = 0;
    mockUserSupabase = createCasSupabase();
    mockAuth = {
      user: { id: 'test-user' },
      accessToken: 'test-token',
      orgId: ORG_A,
      clientId: null,
      role: 'admin',
      userSupabase: mockUserSupabase,
      isTestBypass: true,
    };
  });

  it('TEST-1/2: current-version update succeeds and advances updated_at', async () => {
    const response = await PATCH(
      patchRequest({
        id: CLIENT_ID,
        note: 'A1',
        expected_updated_at: T0,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.note).toBe('A1');
    expect(json.data.contact_number).toBe('P0');
    expect(json.data.updated_at).toBe(T1);
    expect(json.data.updated_at).not.toBe(T0);
    expect(lastUpdate.filters).toEqual({
      id: CLIENT_ID,
      org_id: ORG_A,
      updated_at: T0,
    });
    expect(lastUpdate.patch).not.toHaveProperty('updated_at');
    expect(store?.phone).toBe('P0');
    expect(store?.note).toBe('A1');
    expect(store?.updated_at).toBe(T1);
  });

  it('TEST-3: missing expected version is rejected with 400', async () => {
    const response = await PATCH(
      patchRequest({
        id: CLIENT_ID,
        note: 'A1',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error_code).toBe(CLIENT_EXPECTED_UPDATED_AT_REQUIRED_CODE);
    expect(store?.note).toBe('A0');
    expect(store?.updated_at).toBe(T0);
    expect(updateAttempts).toBe(0);
  });

  it('TEST-4: malformed expected version is rejected with 400', async () => {
    const response = await PATCH(
      patchRequest({
        id: CLIENT_ID,
        note: 'A1',
        expected_updated_at: 'not-a-timestamp',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error_code).toBe(CLIENT_EXPECTED_UPDATED_AT_INVALID_CODE);
    expect(store?.note).toBe('A0');
    expect(updateAttempts).toBe(0);
  });

  it('rejected stale write keeps T1 tags instead of applying the T0 tag snapshot', async () => {
    store = {
      ...createInitialRow(),
      tags: ['Musician', 'Dealer'],
      updated_at: T1,
    };

    const response = await PATCH(
      patchRequest({
        id: CLIENT_ID,
        note: 'A1',
        tags: ['Musician'],
        expected_updated_at: T0,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error_code).toBe(CLIENT_STALE_VERSION_CODE);
    expect(store?.tags).toEqual(['Musician', 'Dealer']);
    expect(store?.note).toBe('A0');
    expect(store?.updated_at).toBe(T1);
  });

  it('TEST-5/6/7/8: stale full-snapshot save returns 409 and changes zero fields', async () => {
    const editorA = {
      id: CLIENT_ID,
      contact_number: 'P0',
      note: 'A1',
      email: 'ada@example.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
      tags: ['Musician'],
      interest: 'Active',
      expected_updated_at: T0,
    };

    const b = await PATCH(
      patchRequest({
        id: CLIENT_ID,
        contact_number: 'P1',
        expected_updated_at: T0,
      })
    );
    expect(b.status).toBe(200);
    expect(store?.phone).toBe('P1');
    expect(store?.note).toBe('A0');
    expect(store?.updated_at).toBe(T1);

    const beforeA = { ...store! };
    const a = await PATCH(patchRequest(editorA));
    const json = await a.json();

    expect(a.status).toBe(409);
    expect(json.error_code).toBe(CLIENT_STALE_VERSION_CODE);
    expect(json.error).toBe(CLIENT_STALE_CONFLICT_MESSAGE);
    expect(store).toEqual(beforeA);
    expect(store?.phone).toBe('P1');
    expect(store?.note).toBe('A0');
    expect(lastUpdate.filters.updated_at).toBe(T0);
  });

  it('TEST-11: after reconciling to T1, a new edit can save', async () => {
    await PATCH(
      patchRequest({
        id: CLIENT_ID,
        contact_number: 'P1',
        expected_updated_at: T0,
      })
    );

    const response = await PATCH(
      patchRequest({
        id: CLIENT_ID,
        note: 'A1',
        expected_updated_at: T1,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.contact_number).toBe('P1');
    expect(json.data.note).toBe('A1');
  });

  it('TEST-14: member role remains denied before any mutation', async () => {
    mockAuth.role = 'member';
    const response = await PATCH(
      patchRequest({
        id: CLIENT_ID,
        note: 'A1',
        expected_updated_at: T0,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Admin role required');
    expect(store?.note).toBe('A0');
    expect(store?.updated_at).toBe(T0);
    expect(updateAttempts).toBe(0);
  });

  it('TEST-13: cross-org update remains denied without leaking the row', async () => {
    mockAuth.orgId = ORG_B;
    const response = await PATCH(
      patchRequest({
        id: CLIENT_ID,
        note: 'A1',
        expected_updated_at: T0,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('Client not found');
    expect(store?.org_id).toBe(ORG_A);
    expect(store?.note).toBe('A0');
    expect(store?.updated_at).toBe(T0);
  });

  it('TEST-22: deleted client is not recreated and does not return success', async () => {
    store = null;
    const response = await PATCH(
      patchRequest({
        id: CLIENT_ID,
        note: 'A1',
        expected_updated_at: T0,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('Client not found');
    expect(store).toBeNull();
  });

  it('does not treat client-supplied updated_at as the new database value', async () => {
    const response = await PATCH(
      patchRequest({
        id: CLIENT_ID,
        note: 'A1',
        updated_at: '1999-01-01T00:00:00.000Z',
        expected_updated_at: T0,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.updated_at).toBe(T1);
    expect(lastUpdate.patch).not.toHaveProperty('updated_at');
    expect(store?.updated_at).toBe(T1);
  });

  it('TEST-17: Client delete behavior is unchanged by CAS', async () => {
    const response = await DELETE(
      new NextRequest(`http://localhost/api/clients?id=${CLIENT_ID}`)
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(store).toBeNull();
  });
});
