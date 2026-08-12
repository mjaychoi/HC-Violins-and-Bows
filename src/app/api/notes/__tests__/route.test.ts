import { NextRequest } from 'next/server';
import { GET, POST, PATCH, DELETE } from '../route';

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger');
jest.mock('@/utils/monitoring');
jest.mock('@/utils/typeGuards');
jest.mock('@/utils/inputValidation');
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

jest.mock('@/utils/typeGuards', () => {
  const actual = jest.requireActual('@/utils/typeGuards');
  return {
    ...actual,
    safeValidate: jest.fn(data => ({
      success: true,
      data,
    })),
    validateNote: jest.fn(data => data),
    validateNoteArray: jest.fn(data => data),
    validateCreateNote: jest.fn(data => data),
    validatePartialNote: jest.fn(data => data),
  };
});

jest.mock('@/utils/inputValidation', () => ({
  validateUUID: jest.fn(value =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  ),
}));

// ─── Realistic in-memory "notes" table mock ──────────────────────────────
// Unlike a canned single-response mock, this actually filters an in-memory
// row set by every .eq() applied in the chain, so it can prove real
// same-org/cross-user and cross-org isolation instead of just asserting
// that a particular .eq() call happened.
type Row = Record<string, any>;

function makeNotesSupabase(seedRows: Row[]) {
  let rows: Row[] = seedRows.map(r => ({ ...r }));
  let idCounter = 0;
  let clock = 1000;

  function nextId() {
    idCounter += 1;
    return `99999999-9999-9999-9999-${String(idCounter).padStart(12, '0')}`;
  }

  function nextTimestamp() {
    clock += 1;
    return new Date(clock * 1000).toISOString();
  }

  function makeQuery() {
    const filters: [string, unknown][] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let insertPayload: Row | null = null;
    let updatePayload: Row | null = null;
    let resolved = false;
    let resolvedResult: {
      data: Row | Row[] | null;
      error: null;
      count: number;
    } | null = null;

    function applyFilters(list: Row[]) {
      return list.filter(row => filters.every(([k, v]) => row[k] === v));
    }

    function resolve() {
      if (resolved) return resolvedResult!;
      resolved = true;

      if (mode === 'insert') {
        const newRow: Row = {
          id: nextId(),
          created_at: nextTimestamp(),
          updated_at: nextTimestamp(),
          ...insertPayload,
        };
        rows.push(newRow);
        resolvedResult = { data: newRow, error: null, count: 1 };
        return resolvedResult;
      }

      if (mode === 'update') {
        const matches = applyFilters(rows);
        if (matches.length === 0) {
          resolvedResult = { data: null, error: null, count: 0 };
          return resolvedResult;
        }
        const target = matches[0];
        Object.assign(target, updatePayload, { updated_at: nextTimestamp() });
        resolvedResult = { data: { ...target }, error: null, count: 1 };
        return resolvedResult;
      }

      if (mode === 'delete') {
        const matches = applyFilters(rows);
        rows = rows.filter(row => !matches.includes(row));
        resolvedResult = { data: null, error: null, count: matches.length };
        return resolvedResult;
      }

      const matches = applyFilters(rows)
        .map(row => ({ ...row }))
        .sort((a, b) => {
          const byUpdatedAt = String(b.updated_at).localeCompare(
            String(a.updated_at)
          );
          if (byUpdatedAt !== 0) return byUpdatedAt;
          return String(a.id).localeCompare(String(b.id));
        });
      resolvedResult = { data: matches, error: null, count: matches.length };
      return resolvedResult;
    }

    const q: any = {
      select: jest.fn(() => q),
      eq: jest.fn((col: string, val: unknown) => {
        filters.push([col, val]);
        return q;
      }),
      order: jest.fn(() => q),
      insert: jest.fn((payload: Row) => {
        mode = 'insert';
        insertPayload = payload;
        return q;
      }),
      update: jest.fn((payload: Row) => {
        mode = 'update';
        updatePayload = payload;
        return q;
      }),
      delete: jest.fn(() => {
        mode = 'delete';
        return q;
      }),
      single: jest.fn(() => {
        const r = resolve();
        const row = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return Promise.resolve({ data: row, error: r.error });
      }),
      maybeSingle: jest.fn(() => {
        const r = resolve();
        const row = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return Promise.resolve({ data: row, error: r.error });
      }),
      then: (onFulfilled: any, onRejected?: any) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };

    return q;
  }

  return {
    from: jest.fn(() => makeQuery()),
    _rows: () => rows,
  };
}

function authCtx(overrides: {
  userId: string;
  orgId: string | null;
  db: ReturnType<typeof makeNotesSupabase>;
}) {
  return {
    user: { id: overrides.userId },
    accessToken: 'test-token',
    orgId: overrides.orgId,
    role: 'member',
    userSupabase: overrides.db,
    isTestBypass: false,
  };
}

describe('/api/notes', () => {
  const ORG_X = '11111111-1111-1111-1111-111111111111';
  const ORG_Y = '22222222-2222-2222-2222-222222222222';
  const USER_A = 'aaaaaaaa-1111-1111-1111-111111111111';
  const USER_B = 'bbbbbbbb-2222-2222-2222-222222222222';

  const NOTE_AX = {
    id: 'a0a0a0a0-0000-0000-0000-000000000001',
    org_id: ORG_X,
    user_id: USER_A,
    title: 'A in X',
    content: 'note A / org X',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  const NOTE_BX = {
    id: 'b0b0b0b0-0000-0000-0000-000000000002',
    org_id: ORG_X,
    user_id: USER_B,
    title: 'B in X',
    content: 'note B / org X',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  const NOTE_AY = {
    id: 'c0c0c0c0-0000-0000-0000-000000000003',
    org_id: ORG_Y,
    user_id: USER_A,
    title: 'A in Y',
    content: 'note A / org Y',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET (authentication / org context / list isolation)', () => {
    it('rejects requests without org context (403)', async () => {
      mockAuthContext = authCtx({
        userId: USER_A,
        orgId: null,
        db: makeNotesSupabase([NOTE_AX]),
      });
      const request = new NextRequest('http://localhost/api/notes');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.message).toBe('Organization context required');
    });

    it('returns only the current user + current org notes (same-org, different-user isolation)', async () => {
      const db = makeNotesSupabase([NOTE_AX, NOTE_BX, NOTE_AY]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const request = new NextRequest('http://localhost/api/notes');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(NOTE_AX.id);
      // Neither the same-org different-user note nor the same-user
      // different-org note may leak into the response.
      expect(json.data.some((n: any) => n.id === NOTE_BX.id)).toBe(false);
      expect(json.data.some((n: any) => n.id === NOTE_AY.id)).toBe(false);
    });

    it("user B's request against the same org only sees their own note", async () => {
      const db = makeNotesSupabase([NOTE_AX, NOTE_BX, NOTE_AY]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_B, orgId: ORG_X, db });

      const request = new NextRequest('http://localhost/api/notes');
      const response = await GET(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(NOTE_BX.id);
    });
  });

  describe('POST', () => {
    it('creates a note for the authenticated user/org', async () => {
      const db = makeNotesSupabase([]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const request = new NextRequest('http://localhost/api/notes', {
        method: 'POST',
        body: JSON.stringify({ title: 'New note', content: 'Hello' }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data.title).toBe('New note');
      expect(json.data.org_id).toBe(ORG_X);
      expect(json.data.user_id).toBe(USER_A);
    });

    it('ignores a client-supplied user_id and always uses the authenticated user', async () => {
      const db = makeNotesSupabase([]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const request = new NextRequest('http://localhost/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Spoofed',
          content: 'x',
          user_id: USER_B,
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data.user_id).toBe(USER_A);
    });

    it('ignores a client-supplied org_id and always uses the authenticated org', async () => {
      const db = makeNotesSupabase([]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const request = new NextRequest('http://localhost/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Spoofed',
          content: 'x',
          org_id: ORG_Y,
        }),
      });
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data.org_id).toBe(ORG_X);
    });

    it('rejects requests without org context (403)', async () => {
      const db = makeNotesSupabase([]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: null, db });

      const response = await POST(
        new NextRequest('http://localhost/api/notes', {
          method: 'POST',
          body: JSON.stringify({ title: 'x', content: 'y' }),
        })
      );

      expect(response.status).toBe(403);
    });

    it('rejects malformed input (400)', async () => {
      const { safeValidate } = require('@/utils/typeGuards');
      (safeValidate as jest.Mock).mockReturnValueOnce({
        success: false,
        error: 'Invalid note data',
      });

      const db = makeNotesSupabase([]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await POST(
        new NextRequest('http://localhost/api/notes', {
          method: 'POST',
          body: JSON.stringify({ invalid: 'data' }),
        })
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.message).toContain('Invalid note data');
    });

    it('rejects invalid JSON body (400)', async () => {
      const db = makeNotesSupabase([]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await POST(
        new NextRequest('http://localhost/api/notes', {
          method: 'POST',
          body: '{not-json',
        })
      );

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH (owner + optimistic concurrency)', () => {
    it('allows the owner to update their own note', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({
            id: NOTE_AX.id,
            content: 'updated content',
            updated_at: NOTE_AX.updated_at,
          }),
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.content).toBe('updated content');
    });

    it('advances updated_at on a successful update', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({
            id: NOTE_AX.id,
            content: 'v2',
            updated_at: NOTE_AX.updated_at,
          }),
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.updated_at).not.toBe(NOTE_AX.updated_at);
    });

    it('same-org different-user cannot update the note (not found from their scope)', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_B, orgId: ORG_X, db });

      const response = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({
            id: NOTE_AX.id,
            content: 'hijacked',
            updated_at: NOTE_AX.updated_at,
          }),
        })
      );

      expect(response.status).toBe(404);
      expect(db._rows().find(r => r.id === NOTE_AX.id)?.content).toBe(
        NOTE_AX.content
      );
    });

    it('same-user different-org cannot update the note', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      // Same user id as the note owner, but authenticated into a different org.
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_Y, db });

      const response = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({
            id: NOTE_AX.id,
            content: 'cross-org write',
            updated_at: NOTE_AX.updated_at,
          }),
        })
      );

      expect(response.status).toBe(404);
      expect(db._rows().find(r => r.id === NOTE_AX.id)?.content).toBe(
        NOTE_AX.content
      );
    });

    it('rejects a stale updated_at with 409 and leaves the newer row untouched', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      // Concurrent update bumps updated_at first.
      const firstUpdate = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({
            id: NOTE_AX.id,
            content: 'first writer wins',
            updated_at: NOTE_AX.updated_at,
          }),
        })
      );
      expect(firstUpdate.status).toBe(200);

      // Original client retries with the now-stale updated_at.
      const staleUpdate = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({
            id: NOTE_AX.id,
            content: 'stale writer loses',
            updated_at: NOTE_AX.updated_at,
          }),
        })
      );
      const staleJson = await staleUpdate.json();

      expect(staleUpdate.status).toBe(409);
      expect(staleJson.error_code).toBe('NOTES_CONFLICT');
      expect(db._rows().find(r => r.id === NOTE_AX.id)?.content).toBe(
        'first writer wins'
      );
    });

    it('requires updated_at to be supplied (400)', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({ id: NOTE_AX.id, content: 'no precondition' }),
        })
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error_code).toBe('NOTE_UPDATED_AT_REQUIRED');
    });

    it('returns 400 when id is missing', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({ content: 'x' }),
        })
      );

      expect(response.status).toBe(400);
    });

    it('returns 400 for an invalid note id format', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({ id: 'not-a-uuid', content: 'x' }),
        })
      );

      expect(response.status).toBe(400);
    });

    it('rejects a PATCH with no updatable fields (400)', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({
            id: NOTE_AX.id,
            updated_at: NOTE_AX.updated_at,
          }),
        })
      );

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('allows the owner to delete their own note', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await DELETE(
        new NextRequest(`http://localhost/api/notes?id=${NOTE_AX.id}`)
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(db._rows()).toHaveLength(0);
    });

    it('same-org different-user cannot delete the note', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_B, orgId: ORG_X, db });

      const response = await DELETE(
        new NextRequest(`http://localhost/api/notes?id=${NOTE_AX.id}`)
      );

      expect(response.status).toBe(404);
      expect(db._rows()).toHaveLength(1);
    });

    it('cross-org request cannot delete the note', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_Y, db });

      const response = await DELETE(
        new NextRequest(`http://localhost/api/notes?id=${NOTE_AX.id}`)
      );

      expect(response.status).toBe(404);
      expect(db._rows()).toHaveLength(1);
    });

    it('returns 400 when id is missing', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await DELETE(
        new NextRequest('http://localhost/api/notes')
      );

      expect(response.status).toBe(400);
    });

    it('returns 400 for an invalid note id format', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });

      const response = await DELETE(
        new NextRequest('http://localhost/api/notes?id=not-a-uuid')
      );

      expect(response.status).toBe(400);
    });

    it('rejects requests without org context (403) before touching the DB', async () => {
      const db = makeNotesSupabase([NOTE_AX]);
      mockUserSupabase = db;
      mockAuthContext = authCtx({ userId: USER_A, orgId: null, db });

      const response = await DELETE(
        new NextRequest(`http://localhost/api/notes?id=${NOTE_AX.id}`)
      );

      expect(response.status).toBe(403);
      expect(db._rows()).toHaveLength(1);
    });
  });

  describe('Vertical slice: user-private notes boundary', () => {
    it('a full create → list → update → delete cycle never crosses the owning user, even within the same org', async () => {
      const db = makeNotesSupabase([]);
      mockUserSupabase = db;

      // User A creates a note in org X.
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });
      const createRes = await POST(
        new NextRequest('http://localhost/api/notes', {
          method: 'POST',
          body: JSON.stringify({ title: 'Private', content: 'secret' }),
        })
      );
      const created = await createRes.json();
      expect(createRes.status).toBe(201);
      const noteId = created.data.id;

      // User B, same org, cannot see it.
      mockAuthContext = authCtx({ userId: USER_B, orgId: ORG_X, db });
      const listAsB = await GET(new NextRequest('http://localhost/api/notes'));
      const listAsBJson = await listAsB.json();
      expect(listAsBJson.data).toHaveLength(0);

      // User B cannot update or delete it either.
      const patchAsB = await PATCH(
        new NextRequest('http://localhost/api/notes', {
          method: 'PATCH',
          body: JSON.stringify({
            id: noteId,
            content: 'tampered',
            updated_at: created.data.updated_at,
          }),
        })
      );
      expect(patchAsB.status).toBe(404);

      const deleteAsB = await DELETE(
        new NextRequest(`http://localhost/api/notes?id=${noteId}`)
      );
      expect(deleteAsB.status).toBe(404);

      // User A still sees their untouched note.
      mockAuthContext = authCtx({ userId: USER_A, orgId: ORG_X, db });
      const listAsA = await GET(new NextRequest('http://localhost/api/notes'));
      const listAsAJson = await listAsA.json();
      expect(listAsAJson.data).toHaveLength(1);
      expect(listAsAJson.data[0].content).toBe('secret');
    });
  });
});
