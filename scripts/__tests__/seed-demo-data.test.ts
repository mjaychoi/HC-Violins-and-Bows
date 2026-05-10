import {
  buildDemoRows,
  createDemoIdentity,
  DEFAULT_COUNTS,
  isLocalSupabaseUrl,
  loadConfig,
  parseArgs,
  runDoctor,
  uuidFor,
} from '../seed-demo-data';

const mockGetUserById = jest.fn();
const mockCreateUser = jest.fn();
const mockUpdateUserById = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      admin: {
        getUserById: mockGetUserById,
        createUser: mockCreateUser,
        updateUserById: mockUpdateUserById,
      },
    },
  })),
}));

describe('seed-demo-data safety and planning', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'local-service-role',
      SEED_DEMO_ORG_ID: '11111111-1111-4111-8111-111111111111',
      SEED_DEMO_USER_ID: '22222222-2222-4222-8222-222222222222',
    };
    mockGetUserById.mockResolvedValue({
      data: { user: { id: process.env.SEED_DEMO_USER_ID } },
      error: null,
    });
    mockCreateUser.mockResolvedValue({
      data: { user: { id: process.env.SEED_DEMO_USER_ID } },
      error: null,
    });
    mockUpdateUserById.mockResolvedValue({
      data: { user: { id: process.env.SEED_DEMO_USER_ID } },
      error: null,
    });
    global.fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        return new Response(
          JSON.stringify(
            method === 'GET' ? [{ id: process.env.SEED_DEMO_ORG_ID }] : null
          ),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        );
      }
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('builds deterministic ids and target row counts', () => {
    const config = {
      orgId: process.env.SEED_DEMO_ORG_ID!,
      userId: process.env.SEED_DEMO_USER_ID!,
    };
    const rows = buildDemoRows(config);

    expect(uuidFor('client:1')).toBe(uuidFor('client:1'));
    expect(rows.clients).toHaveLength(DEFAULT_COUNTS.clients);
    expect(rows.instruments).toHaveLength(DEFAULT_COUNTS.instruments);
    expect(rows.connections).toHaveLength(DEFAULT_COUNTS.connections);
    expect(rows.sales).toHaveLength(DEFAULT_COUNTS.sales);
    expect(rows.invoices).toHaveLength(DEFAULT_COUNTS.invoices);
    expect(rows.maintenanceTasks).toHaveLength(DEFAULT_COUNTS.maintenanceTasks);
    expect(rows.contactLogs).toHaveLength(DEFAULT_COUNTS.contactLogs);
  });

  it('plans the manual QA edge cases the pages need', () => {
    const rows = buildDemoRows({
      orgId: process.env.SEED_DEMO_ORG_ID!,
      userId: process.env.SEED_DEMO_USER_ID!,
    });
    const connectedClientIds = new Set(
      rows.connections.map(row => row.client_id)
    );
    const connectedInstrumentIds = new Set(
      rows.connections.map(row => row.instrument_id)
    );
    const instrumentsByClient = new Map<string | null | undefined, number>();
    const clientsByInstrument = new Map<string | null | undefined, number>();
    const tasksByScheduledDate = new Map<string | null | undefined, number>();

    for (const row of rows.connections) {
      instrumentsByClient.set(
        row.client_id,
        (instrumentsByClient.get(row.client_id) ?? 0) + 1
      );
      clientsByInstrument.set(
        row.instrument_id,
        (clientsByInstrument.get(row.instrument_id) ?? 0) + 1
      );
    }
    for (const row of rows.maintenanceTasks) {
      tasksByScheduledDate.set(
        row.scheduled_date,
        (tasksByScheduledDate.get(row.scheduled_date) ?? 0) + 1
      );
    }

    expect(rows.clients.some(row => row.email === null)).toBe(true);
    expect(rows.clients.some(row => row.phone === null)).toBe(true);
    expect(rows.clients.some(row => /[가-힣]/.test(row.name))).toBe(true);
    expect(
      rows.instruments.some(row => !connectedInstrumentIds.has(row.id))
    ).toBe(true);
    expect(rows.clients.some(row => !connectedClientIds.has(row.id))).toBe(
      true
    );
    expect(Math.max(...instrumentsByClient.values())).toBeGreaterThanOrEqual(5);
    expect(Math.max(...clientsByInstrument.values())).toBeGreaterThanOrEqual(3);
    expect(rows.invoices.some(row => row.status === 'overdue')).toBe(true);
    expect(rows.invoices.some(row => row.status === 'paid')).toBe(true);
    expect(rows.invoices.some(row => row.status === 'draft')).toBe(true);
    expect(
      rows.sales.some(
        row => row.entry_kind === 'refund' || row.entry_kind === 'adjustment'
      )
    ).toBe(true);
    expect(
      rows.maintenanceTasks.some(
        row =>
          row.status !== 'completed' &&
          row.status !== 'cancelled' &&
          row.due_date &&
          row.due_date < new Date().toISOString().slice(0, 10)
      )
    ).toBe(true);
    expect(Math.max(...tasksByScheduledDate.values())).toBeGreaterThanOrEqual(
      8
    );
    expect(
      rows.contactLogs.some(
        row =>
          row.next_follow_up_date &&
          row.next_follow_up_date < new Date().toISOString().slice(0, 10) &&
          !row.follow_up_completed_at
      )
    ).toBe(true);
    expect(rows.contactLogs.some(row => /[가-힣]/.test(row.content))).toBe(
      true
    );
    expect(rows.clients.some(row => (row.note?.length ?? 0) > 150)).toBe(true);
  });

  it('keeps reset scoped to deterministic seeded records', () => {
    const rows = buildDemoRows({
      orgId: process.env.SEED_DEMO_ORG_ID!,
      userId: process.env.SEED_DEMO_USER_ID!,
    });
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(rows.clients.every(row => uuidPattern.test(row.id ?? ''))).toBe(
      true
    );
    expect(new Set(rows.clients.map(row => row.id)).size).toBe(
      rows.clients.length
    );
    expect(rows.clients.every(row => row.note?.includes('[DEMO_SEED]'))).toBe(
      true
    );
    expect(rows.invoices.every(row => row.notes?.includes('[DEMO_SEED]'))).toBe(
      true
    );
    expect(
      rows.maintenanceTasks.every(row => row.notes?.includes('[DEMO_SEED]'))
    ).toBe(true);
  });

  it('refuses production mode', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });

    expect(() => loadConfig(parseArgs(['--dry-run']))).toThrow(
      'NODE_ENV=production'
    );
  });

  it('requires explicit confirmation for non-dry-run seeding', () => {
    expect(() => loadConfig(parseArgs([]))).toThrow('--confirm');
  });

  it('requires explicit remote opt-in for hosted Supabase URLs', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';

    expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true);
    expect(isLocalSupabaseUrl('https://example.supabase.co')).toBe(false);
    expect(() => loadConfig(parseArgs(['--dry-run']))).toThrow(
      '--allow-remote-dev'
    );
  });

  it('allows hosted development URL only with explicit remote opt-in', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';

    const config = loadConfig(parseArgs(['--dry-run', '--allow-remote-dev']));

    expect(config.supabaseUrl).toBe('https://example.supabase.co');
    expect(config.args.allowRemoteDev).toBe(true);
  });

  it('allows dry-run with explicit env and local Supabase URL', () => {
    const config = loadConfig(parseArgs(['--dry-run']));

    expect(config.args.dryRun).toBe(true);
    expect(config.orgId).toBe(process.env.SEED_DEMO_ORG_ID);
    expect(config.userId).toBe(process.env.SEED_DEMO_USER_ID);
  });

  it('accepts CLI org/user ids and supports separated values', () => {
    const config = loadConfig(
      parseArgs([
        '--dry-run',
        '--org-id',
        '33333333-3333-4333-8333-333333333333',
        '--user-id',
        '44444444-4444-4444-8444-444444444444',
      ])
    );

    expect(config.orgId).toBe('33333333-3333-4333-8333-333333333333');
    expect(config.userId).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('lets CLI org/user ids override env vars', () => {
    const config = loadConfig(
      parseArgs([
        '--dry-run',
        '--org-id=33333333-3333-4333-8333-333333333333',
        '--user-id=44444444-4444-4444-8444-444444444444',
      ])
    );

    expect(config.orgId).toBe('33333333-3333-4333-8333-333333333333');
    expect(config.userId).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('missing org/user message mentions env and CLI options', () => {
    delete process.env.SEED_DEMO_ORG_ID;
    delete process.env.SEED_DEMO_USER_ID;

    expect(() => loadConfig(parseArgs(['--dry-run']))).toThrow(
      /SEED_DEMO_ORG_ID.*SEED_DEMO_USER_ID.*--org-id <uuid> --user-id <uuid>/
    );
  });

  it('rejects invalid UUIDs', () => {
    expect(() =>
      loadConfig(parseArgs(['--dry-run', '--org-id', 'not-a-uuid']))
    ).toThrow('org_id must be a valid UUID');
  });

  it('doctor mode checks identity without write requests', async () => {
    const config = loadConfig(parseArgs(['--doctor']));

    await runDoctor(config);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/organizations'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        method: expect.stringMatching(/POST|PATCH|DELETE/),
      })
    );
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('identity creation mode refuses hosted Supabase by default', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';

    expect(() => loadConfig(parseArgs(['--create-demo-identity']))).toThrow(
      '--allow-remote-dev'
    );
  });

  it('identity creation upserts org and creates missing auth user locally', async () => {
    mockGetUserById
      .mockResolvedValueOnce({
        data: { user: null },
        error: new Error('missing'),
      })
      .mockResolvedValueOnce({
        data: { user: { id: process.env.SEED_DEMO_USER_ID } },
        error: null,
      });
    const config = loadConfig(parseArgs(['--create-demo-identity']));

    await createDemoIdentity(config);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/organizations?on_conflict=id'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: process.env.SEED_DEMO_USER_ID,
        email: 'demo-seed-user@example.test',
        email_confirm: true,
      })
    );
  });
});
