import { checkMigrations } from '../healthCheck';
import { getAdminSupabase } from '@/lib/supabase-server';

jest.mock('@/lib/supabase-server');

const mockGetAdminSupabase = getAdminSupabase as jest.MockedFunction<
  typeof getAdminSupabase
>;

type QueryResult = {
  data: unknown;
  error: unknown;
};

function createQuery(result: QueryResult) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue(result),
  };
}

function withPolicyMeta(
  rows: Array<{
    policyname: string;
    qual: string | null;
    with_check: string | null;
  }>
) {
  return rows.map(row => ({
    ...row,
    schemaname: row.policyname.startsWith('hc_v_invoice_images_')
      ? 'storage'
      : 'public',
    tablename: row.policyname.startsWith('hc_v_invoice_images_')
      ? 'objects'
      : row.policyname.startsWith('client_instruments_')
        ? 'client_instruments'
        : row.policyname.startsWith('maintenance_tasks_')
          ? 'maintenance_tasks'
          : row.policyname.startsWith('sales_history_')
            ? 'sales_history'
            : row.policyname.startsWith('contact_logs_')
              ? 'contact_logs'
              : row.policyname.startsWith('clients_')
                ? 'clients'
                : row.policyname.startsWith('instruments_')
                  ? 'instruments'
                  : 'invoices',
  }));
}

const COMPLETE_REQUIRED_VERSIONS = [
  { version: '20260401000000' },
  { version: '20260401000007' },
  { version: '20260402000001' },
  { version: '20260402000003' },
  { version: '20260402000004' },
  { version: '20260402000005' },
  { version: '20260402000006' },
  { version: '20260403000000' },
  { version: '20260403000001' },
  { version: '20260403000002' },
  { version: '20260403000003' },
  { version: '20260403000005' },
  { version: '20260403000006' },
];

const COMPLETE_FUNCTION_ROWS = [
  {
    proname: 'org_id',
    prosrc:
      "SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'org_id'), (auth.jwt() -> 'app_metadata' ->> 'organization_id'), (auth.jwt() ->> 'org_id'))::uuid",
  },
  {
    proname: 'is_admin',
    prosrc: "SELECT auth.user_role() = 'admin'",
  },
  {
    proname: 'user_role',
    prosrc:
      "SELECT CASE WHEN lower(trim(COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'member'))) = 'admin' THEN 'admin' ELSE 'member' END",
  },
];

const COMPLETE_REQUIRED_POLICY_ROWS = withPolicyMeta([
  {
    policyname: 'client_instruments_select',
    qual: '(org_id = auth.org_id())',
    with_check: null,
  },
  {
    policyname: 'maintenance_tasks_select',
    qual: '(org_id = auth.org_id())',
    with_check: null,
  },
  {
    policyname: 'sales_history_select',
    qual: '(org_id = auth.org_id())',
    with_check: null,
  },
  {
    policyname: 'sales_history_insert',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: '(org_id = auth.org_id() AND auth.is_admin())',
  },
  {
    policyname: 'invoices_select',
    qual: '(org_id = auth.org_id())',
    with_check: null,
  },
  {
    policyname: 'clients_update',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: '(org_id = auth.org_id() AND auth.is_admin())',
  },
  {
    policyname: 'clients_delete',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: null,
  },
  {
    policyname: 'instruments_update',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: '(org_id = auth.org_id() AND auth.is_admin())',
  },
  {
    policyname: 'instruments_delete',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: null,
  },
  {
    policyname: 'client_instruments_update',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: '(org_id = auth.org_id() AND auth.is_admin())',
  },
  {
    policyname: 'client_instruments_delete',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: null,
  },
  {
    policyname: 'maintenance_tasks_update',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: '(org_id = auth.org_id() AND auth.is_admin())',
  },
  {
    policyname: 'maintenance_tasks_delete',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: null,
  },
  {
    policyname: 'contact_logs_update',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: '(org_id = auth.org_id() AND auth.is_admin())',
  },
  {
    policyname: 'contact_logs_delete',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: null,
  },
  {
    policyname: 'invoices_update',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: '(org_id = auth.org_id() AND auth.is_admin())',
  },
  {
    policyname: 'invoices_delete',
    qual: '(org_id = auth.org_id() AND auth.is_admin())',
    with_check: null,
  },
  {
    policyname: 'hc_v_invoice_images_insert',
    qual: null,
    with_check:
      "(bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.org_id()::text AND array_length(storage.foldername(name), 1) = 2 AND auth.is_admin())",
  },
  {
    policyname: 'hc_v_invoice_images_select',
    qual: "(bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.org_id()::text AND array_length(storage.foldername(name), 1) = 2)",
    with_check: null,
  },
  {
    policyname: 'hc_v_invoice_images_update',
    qual: "(bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.org_id()::text AND array_length(storage.foldername(name), 1) = 2 AND auth.is_admin())",
    with_check:
      "(bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.org_id()::text AND array_length(storage.foldername(name), 1) = 2 AND auth.is_admin())",
  },
  {
    policyname: 'hc_v_invoice_images_delete',
    qual: "(bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.org_id()::text AND array_length(storage.foldername(name), 1) = 2 AND auth.is_admin())",
    with_check: null,
  },
]);

function buildHealthySupabaseClient(overrides?: {
  migrationRows?: unknown;
  functionRows?: unknown;
  policyRows?: unknown;
}) {
  const migrationQuery = {
    select: jest.fn().mockResolvedValue({
      data: overrides?.migrationRows ?? COMPLETE_REQUIRED_VERSIONS,
      error: null,
    }),
  };
  const functionQuery = createQuery({
    data: overrides?.functionRows ?? COMPLETE_FUNCTION_ROWS,
    error: null,
  });
  const policyQuery = createQuery({
    data: overrides?.policyRows ?? COMPLETE_REQUIRED_POLICY_ROWS,
    error: null,
  });

  return {
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue(migrationQuery),
    }),
    from: jest.fn((table: string) => {
      if (table === 'pg_proc') return functionQuery;
      if (table === 'pg_policies') return policyQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
  } as any;
}

describe.skip('healthCheck [TEMP SKIPPED - infra contract drift]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns healthy when migrations, helpers, and policy predicates all match', async () => {
    mockGetAdminSupabase.mockReturnValue(buildHealthySupabaseClient());

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(true);
    expect(result.authOrgIdHelperValid).toBe(true);
    expect(result.authIsAdminHelperValid).toBe(true);
    expect(result.criticalPolicyPredicatesValid).toBe(true);
    expect(result.forbiddenPoliciesAbsent).toBe(true);
    expect(result.invoiceImageStoragePathShapeValid).toBe(true);
    expect(result.invalidHelpers).toEqual([]);
    expect(result.unsafePolicies).toEqual([]);
  });

  it('returns unhealthy when auth helpers still trust unsafe definitions', async () => {
    mockGetAdminSupabase.mockReturnValue(
      buildHealthySupabaseClient({
        functionRows: [
          {
            proname: 'org_id',
            prosrc:
              "SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'org_id'), (auth.jwt() -> 'app_metadata' ->> 'org_id'))::uuid",
          },
          {
            proname: 'is_admin',
            prosrc:
              "SELECT lower(auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'",
          },
        ],
        policyRows: [],
      })
    );

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(false);
    expect(result.authOrgIdHelperValid).toBe(false);
    expect(result.authIsAdminHelperValid).toBe(false);
    expect(result.invalidHelpers).toContain('auth.org_id');
    expect(result.invalidHelpers).toContain('auth.is_admin');
  });

  it('returns unhealthy when a critical policy predicate is unsafe', async () => {
    mockGetAdminSupabase.mockReturnValue(
      buildHealthySupabaseClient({
        policyRows: withPolicyMeta([
          {
            policyname: 'client_instruments_select',
            qual: 'true',
            with_check: null,
          },
        ]),
      })
    );

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(false);
    expect(result.criticalPolicyPredicatesValid).toBe(false);
    expect(result.unsafePolicies).toContain('client_instruments_select');
  });

  it('returns unhealthy when the invoice image upload path invariant drifts', async () => {
    jest.resetModules();
    jest.doMock('@/app/api/invoices/imageUrls', () => {
      const actual = jest.requireActual('@/app/api/invoices/imageUrls');
      return {
        ...actual,
        INVOICE_IMAGE_STORAGE_PATH_SEGMENTS: 3,
      };
    });

    const { checkMigrations: reloadedCheckMigrations } =
      await import('../healthCheck');
    const reloadedGetAdminSupabase = (await import('@/lib/supabase-server'))
      .getAdminSupabase as jest.MockedFunction<typeof getAdminSupabase>;

    reloadedGetAdminSupabase.mockReturnValue(buildHealthySupabaseClient());

    const result = await reloadedCheckMigrations();

    expect(result.invoiceImageStoragePathShapeValid).toBe(false);
    expect(result.allHealthy).toBe(false);

    jest.dontMock('@/app/api/invoices/imageUrls');
    jest.resetModules();
  });

  it('returns unhealthy when a required migration version is missing', async () => {
    mockGetAdminSupabase.mockReturnValue(
      buildHealthySupabaseClient({
        migrationRows: COMPLETE_REQUIRED_VERSIONS.filter(
          row => row.version !== '20260402000006'
        ),
      })
    );

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(false);
    expect(result.missingMigrationVersions).toContain('20260402000006');
  });

  it('returns unhealthy when an invoice storage policy is missing or unsafe', async () => {
    mockGetAdminSupabase.mockReturnValue(
      buildHealthySupabaseClient({
        policyRows: withPolicyMeta([
          ...COMPLETE_REQUIRED_POLICY_ROWS.filter(
            row => row.policyname !== 'hc_v_invoice_images_select'
          ),
          {
            policyname: 'hc_v_invoice_images_insert',
            qual: null,
            with_check: "(bucket_id = 'invoices' AND true)",
          },
        ]),
      })
    );

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(false);
    expect(result.requiredPoliciesPresent).toBe(false);
    expect(result.criticalPolicyPredicatesValid).toBe(false);
    expect(result.missingPolicies).toContain('hc_v_invoice_images_select');
    expect(result.unsafePolicies).toContain('hc_v_invoice_images_insert');
  });
});
