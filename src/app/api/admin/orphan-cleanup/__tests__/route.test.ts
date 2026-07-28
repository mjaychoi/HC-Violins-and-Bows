import { NextRequest } from 'next/server';

jest.mock('@/utils/storage', () => ({
  getStorage: jest.fn(() => mockStorage),
}));

jest.mock('@/lib/supabase-server', () => ({
  getAdminSupabase: jest.fn(() => mockAdmin),
}));

jest.mock('@/utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

let mockStorage: { deleteFile: jest.Mock };
let mockAdmin: any;

const VALID_SECRET = 'test-secret-xyz';

function mutateSecret(secret: string, index: number, replacement = 'X'): string {
  return secret.slice(0, index) + replacement + secret.slice(index + 1);
}

function makeRequest(
  secret?: string,
  authScheme: 'Bearer' | 'Basic' = 'Bearer'
): NextRequest {
  return new NextRequest('http://localhost/api/admin/orphan-cleanup', {
    method: 'POST',
    headers: secret ? { Authorization: `${authScheme} ${secret}` } : {},
  });
}

function makeAdminMock(
  orphans: Array<{
    id: string;
    storage_key: string;
    bucket: string;
    source: string;
    org_id: string;
    error_message: string | null;
  }>
) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    then: (resolve: any) =>
      Promise.resolve({ data: orphans, error: null }).then(resolve),
    storage: {
      from: jest.fn().mockReturnValue({
        remove: jest.fn().mockResolvedValue({ error: null }),
      }),
    },
  };

  // Separate mocks for delete/update chains (void-resolving)
  const mutationChain = {
    delete: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ error: null }),
  };

  const admin = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'orphaned_storage_objects') {
        // First call = SELECT for fetch; subsequent calls = DELETE/UPDATE
        const callCount = (admin.from as jest.Mock).mock.calls.filter(
          ([t]: [string]) => t === 'orphaned_storage_objects'
        ).length;
        // Return select chain for first call, mutation chain for the rest
        return callCount === 0 ? chain : mutationChain;
      }
      return {};
    }),
    storage: chain.storage,
  };

  // Wrap so each invocation of from() returns the right chain
  admin.from = jest.fn().mockImplementation(() => {
    const calls = (admin.from as jest.Mock).mock.calls.length;
    if (calls <= 1) return chain; // SELECT call
    return mutationChain; // DELETE / UPDATE calls
  });

  return {
    admin,
    mutationChain,
    storageRemoveMock: chain.storage.from().remove,
  };
}

describe('POST /api/admin/orphan-cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ORPHAN_CLEANUP_SECRET = VALID_SECRET;
    mockStorage = { deleteFile: jest.fn().mockResolvedValue(true) };
  });

  afterEach(() => {
    delete process.env.ORPHAN_CLEANUP_SECRET;
  });

  async function invoke(
    secret?: string,
    authScheme: 'Bearer' | 'Basic' = 'Bearer'
  ) {
    const { POST } = await import('../route');
    return POST(makeRequest(secret, authScheme));
  }

  it('returns 401 when no Authorization header', async () => {
    const response = await invoke();
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toEqual({ error: 'Unauthorized' });
    expect(JSON.stringify(json)).not.toContain(VALID_SECRET);
  });

  it('returns 401 when wrong secret', async () => {
    const response = await invoke('wrong-secret');
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toEqual({ error: 'Unauthorized' });
    expect(JSON.stringify(json)).not.toContain(VALID_SECRET);
  });

  it('returns 401 for a same-length wrong secret', async () => {
    const wrongSecret = mutateSecret(VALID_SECRET, 0);
    expect(wrongSecret.length).toBe(VALID_SECRET.length);

    const response = await invoke(wrongSecret);
    expect(response.status).toBe(401);
  });

  it('returns 401 when only the first byte differs', async () => {
    const response = await invoke(mutateSecret(VALID_SECRET, 0));
    expect(response.status).toBe(401);
  });

  it('returns 401 when only a middle byte differs', async () => {
    const middle = Math.floor(VALID_SECRET.length / 2);
    const response = await invoke(mutateSecret(VALID_SECRET, middle));
    expect(response.status).toBe(401);
  });

  it('returns 401 when only the last byte differs', async () => {
    const response = await invoke(
      mutateSecret(VALID_SECRET, VALID_SECRET.length - 1)
    );
    expect(response.status).toBe(401);
  });

  it('returns 401 for a shorter secret without throwing', async () => {
    expect(() => invoke(VALID_SECRET.slice(0, -1))).not.toThrow();
    const response = await invoke(VALID_SECRET.slice(0, -1));
    expect(response.status).toBe(401);
  });

  it('returns 401 for a longer secret without throwing', async () => {
    expect(() => invoke(`${VALID_SECRET}x`)).not.toThrow();
    const response = await invoke(`${VALID_SECRET}x`);
    expect(response.status).toBe(401);
  });

  it('returns 401 for a non-Bearer Authorization header', async () => {
    const response = await invoke(VALID_SECRET, 'Basic');
    expect(response.status).toBe(401);
  });

  it('returns 401 when ORPHAN_CLEANUP_SECRET is not configured', async () => {
    delete process.env.ORPHAN_CLEANUP_SECRET;
    const response = await invoke(VALID_SECRET);
    expect(response.status).toBe(401);
  });

  it('does not call cleanup logic when unauthorized', async () => {
    mockAdmin = {
      from: jest.fn(),
      storage: { from: jest.fn() },
    };

    const response = await invoke('wrong-secret');

    expect(response.status).toBe(401);
    expect(mockAdmin.from).not.toHaveBeenCalled();
    expect(mockStorage.deleteFile).not.toHaveBeenCalled();
  });

  it('authorizes a valid bearer secret', async () => {
    const { admin } = makeAdminMock([]);
    mockAdmin = admin;

    const response = await invoke(VALID_SECRET);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.processed).toBe(0);
    expect(json.cleaned).toBe(0);
    expect(json.stillFailing).toBe(0);
  });

  it('calls deleteFile for S3 orphans and removes the record on success', async () => {
    const orphans = [
      {
        id: 'o1',
        storage_key: 'org/img1.jpg',
        bucket: 's3',
        source: 'instrument_delete',
        org_id: 'org-1',
        error_message: null,
      },
    ];

    // Build a more precise mock where each from() call returns appropriate chain
    const selectResult = { data: orphans, error: null };
    const mutateResult = { error: null };

    let callIdx = 0;
    mockAdmin = {
      from: jest.fn().mockImplementation(() => {
        callIdx += 1;
        if (callIdx === 1) {
          // SELECT query
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            then: (r: any) => Promise.resolve(selectResult).then(r),
          };
        }
        // DELETE query
        return {
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue(mutateResult),
        };
      }),
      storage: { from: jest.fn() },
    };

    const response = await invoke(VALID_SECRET);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.cleaned).toBe(1);
    expect(json.stillFailing).toBe(0);
    expect(mockStorage.deleteFile).toHaveBeenCalledWith('org/img1.jpg');
  });

  it('calls storage.remove for Supabase Storage orphans', async () => {
    const orphans = [
      {
        id: 'o2',
        storage_key: 'org/img.jpg',
        bucket: 'invoices',
        source: 'invoice_delete',
        org_id: 'org-1',
        error_message: null,
      },
    ];

    const removeMock = jest.fn().mockResolvedValue({ error: null });
    let callIdx = 0;
    mockAdmin = {
      from: jest.fn().mockImplementation(() => {
        callIdx += 1;
        if (callIdx === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            then: (r: any) =>
              Promise.resolve({ data: orphans, error: null }).then(r),
          };
        }
        return {
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
      }),
      storage: { from: jest.fn().mockReturnValue({ remove: removeMock }) },
    };

    const response = await invoke(VALID_SECRET);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.cleaned).toBe(1);
    expect(removeMock).toHaveBeenCalledWith(['org/img.jpg']);
    // S3 deleteFile should NOT have been called
    expect(mockStorage.deleteFile).not.toHaveBeenCalled();
  });

  it('increments stillFailing and updates error_message when retry fails', async () => {
    const orphans = [
      {
        id: 'o3',
        storage_key: 'org/stuck.jpg',
        bucket: 's3',
        source: 'instrument_delete',
        org_id: 'org-1',
        error_message: null,
      },
    ];
    mockStorage.deleteFile = jest
      .fn()
      .mockRejectedValue(new Error('S3 unreachable'));

    const updateEqMock = jest.fn().mockResolvedValue({ error: null });
    let callIdx = 0;
    mockAdmin = {
      from: jest.fn().mockImplementation(() => {
        callIdx += 1;
        if (callIdx === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            then: (r: any) =>
              Promise.resolve({ data: orphans, error: null }).then(r),
          };
        }
        return {
          update: jest.fn().mockReturnThis(),
          eq: updateEqMock,
        };
      }),
      storage: { from: jest.fn() },
    };

    const response = await invoke(VALID_SECRET);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.cleaned).toBe(0);
    expect(json.stillFailing).toBe(1);
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].storage_key).toBe('org/stuck.jpg');
  });

  /**
   * E2E-ish scenario: simulates the full lifecycle of an orphaned S3 object.
   *
   *   1. Instrument DELETE fails to clean up storage → orphan row inserted
   *      (tested in instruments/route.test.ts "logs orphan…" case)
   *   2. Cleanup job reads the orphan row
   *   3. S3 delete succeeds on retry
   *   4. Orphan row is removed from the table
   *   5. Response reports cleaned=1, stillFailing=0
   */
  it('full lifecycle: orphan written on S3 failure is cleaned on retry success', async () => {
    // Step 2 — cleanup job reads the row that was written during instrument DELETE
    const persistedOrphan = {
      id: 'orphan-lifecycle-1',
      org_id: 'org-abc',
      storage_key: 'org-abc/instruments/cert.pdf',
      bucket: 's3',
      source: 'instrument_delete',
      error_message: 'S3 timeout', // error from the original failed attempt
    };

    const deletedIds: string[] = [];
    let callIdx = 0;

    mockAdmin = {
      from: jest.fn().mockImplementation(() => {
        callIdx += 1;
        if (callIdx === 1) {
          // SELECT — returns the persisted orphan row
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            then: (r: any) =>
              Promise.resolve({ data: [persistedOrphan], error: null }).then(r),
          };
        }
        // DELETE — records which row was removed
        return {
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation((_col: string, id: string) => {
            deletedIds.push(id);
            return Promise.resolve({ error: null });
          }),
        };
      }),
      storage: { from: jest.fn() },
    };

    // Step 3 — S3 delete succeeds this time
    mockStorage.deleteFile = jest.fn().mockResolvedValue(true);

    const response = await invoke(VALID_SECRET);
    const json = await response.json();

    // Step 4 — orphan row removed
    expect(deletedIds).toContain(persistedOrphan.id);

    // Step 5 — summary correct
    expect(response.status).toBe(200);
    expect(json.processed).toBe(1);
    expect(json.cleaned).toBe(1);
    expect(json.stillFailing).toBe(0);
    expect(json.errors).toHaveLength(0);

    // Verify the right storage key was retried
    expect(mockStorage.deleteFile).toHaveBeenCalledWith(
      persistedOrphan.storage_key
    );
  });
});
