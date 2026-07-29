import { checkMigrations } from '../healthCheck';
import {
  HealthCatalogAccessError,
  readHealthCatalogSnapshot,
} from '../healthCatalogReader';

jest.mock('../healthCatalogReader', () => ({
  HealthCatalogAccessError: class HealthCatalogAccessError extends Error {
    readonly code = 'HEALTH_CATALOG_ACCESS_FAILED';

    constructor(message = 'Health catalog access failed') {
      super(message);
      this.name = 'HealthCatalogAccessError';
    }
  },
  readHealthCatalogSnapshot: jest.fn(),
}));

const mockReadHealthCatalogSnapshot =
  readHealthCatalogSnapshot as jest.MockedFunction<
    typeof readHealthCatalogSnapshot
  >;

function withPolicyMeta(
  rows: Array<{
    policyname: string;
    qual: string | null;
    with_check: string | null;
  }>
) {
  return rows.map(row => ({
    policyname: row.policyname,
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
    qual: row.qual,
    with_check: row.with_check,
  }));
}

const COMPLETE_REQUIRED_VERSIONS = [
  '00000000000000',
  '00000000000001',
  '00000000000002',
  '00000000000003',
  '00000000000004',
  '00000000000005',
  '00000000000054',
  '00000000000060',
  '00000000000061',
  '20260422133936',
];

const COMPLETE_FUNCTION_ROWS = [
  {
    proname: 'org_id',
    prosrc:
      "SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'org_id'), (auth.jwt() -> 'app_metadata' ->> 'organization_id'), (auth.jwt() ->> 'org_id'))::uuid",
  },
  {
    proname: 'is_admin',
    prosrc: "SELECT public.user_role() = 'admin'",
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
    qual: '(org_id = public.org_id())',
    with_check: null,
  },
  {
    policyname: 'maintenance_tasks_select',
    qual: '(org_id = public.org_id())',
    with_check: null,
  },
  {
    policyname: 'sales_history_select',
    qual: '(org_id = public.org_id())',
    with_check: null,
  },
  {
    policyname: 'sales_history_insert',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: '(org_id = public.org_id() AND public.is_admin())',
  },
  {
    policyname: 'invoices_select',
    qual: '(org_id = public.org_id())',
    with_check: null,
  },
  {
    policyname: 'clients_insert',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: '(org_id = public.org_id() AND public.is_admin())',
  },
  {
    policyname: 'clients_update',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: '(org_id = public.org_id() AND public.is_admin())',
  },
  {
    policyname: 'clients_delete',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: null,
  },
  {
    policyname: 'instruments_insert',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: '(org_id = public.org_id() AND public.is_admin())',
  },
  {
    policyname: 'instruments_update',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: '(org_id = public.org_id() AND public.is_admin())',
  },
  {
    policyname: 'instruments_delete',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: null,
  },
  {
    policyname: 'client_instruments_update',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: '(org_id = public.org_id() AND public.is_admin())',
  },
  {
    policyname: 'client_instruments_delete',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: null,
  },
  {
    policyname: 'maintenance_tasks_update',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: '(org_id = public.org_id() AND public.is_admin())',
  },
  {
    policyname: 'maintenance_tasks_delete',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: null,
  },
  {
    policyname: 'contact_logs_update',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: '(org_id = public.org_id() AND public.is_admin())',
  },
  {
    policyname: 'contact_logs_delete',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: null,
  },
  {
    policyname: 'invoices_update',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: '(org_id = public.org_id() AND public.is_admin())',
  },
  {
    policyname: 'invoices_delete',
    qual: '(org_id = public.org_id() AND public.is_admin())',
    with_check: null,
  },
  {
    policyname: 'hc_v_invoice_images_insert',
    qual: null,
    with_check:
      "(bucket_id = 'invoices' AND (storage.foldername(name))[1] = public.org_id()::text AND array_length(storage.foldername(name), 1) = 2 AND public.is_admin())",
  },
  {
    policyname: 'hc_v_invoice_images_select',
    qual: "(bucket_id = 'invoices' AND (storage.foldername(name))[1] = public.org_id()::text AND array_length(storage.foldername(name), 1) = 2)",
    with_check: null,
  },
  {
    policyname: 'hc_v_invoice_images_update',
    qual: "(bucket_id = 'invoices' AND (storage.foldername(name))[1] = public.org_id()::text AND array_length(storage.foldername(name), 1) = 2 AND public.is_admin())",
    with_check:
      "(bucket_id = 'invoices' AND (storage.foldername(name))[1] = public.org_id()::text AND array_length(storage.foldername(name), 1) = 2 AND public.is_admin())",
  },
  {
    policyname: 'hc_v_invoice_images_delete',
    qual: "(bucket_id = 'invoices' AND (storage.foldername(name))[1] = public.org_id()::text AND array_length(storage.foldername(name), 1) = 2 AND public.is_admin())",
    with_check: null,
  },
]);

const COMPLETE_PRESENT_COLUMNS = [
  'public.invoices.invoice_number',
  'public.invoice_settings.business_name',
  'public.invoice_settings.business_address',
  'public.invoice_settings.business_phone',
  'public.invoice_settings.business_email',
  'public.invoice_settings.bank_account_holder',
  'public.invoice_settings.bank_name',
  'public.invoice_settings.bank_swift_code',
  'public.invoice_settings.bank_account_number',
  'public.invoice_settings.default_conditions',
  'public.invoice_settings.default_exchange_rate',
  'public.invoice_settings.default_currency',
  'public.instrument_images.storage_key',
  'public.instrument_images.file_name',
  'public.instrument_images.file_size',
  'public.instrument_images.mime_type',
  'public.instrument_images.display_order',
  'public.client_instruments.display_order',
  'public.clients.client_number',
];

const COMPLETE_RUNTIME_CONTRACTS = {
  api_create_idempotency_exists: true,
  api_create_idempotency_columns_ok: true,
  api_create_idempotency_unique_ok: true,
  create_connection_atomic_hardened: true,
};

function buildHealthyCatalogSnapshot(overrides?: {
  migrationVersions?: string[];
  functions?: typeof COMPLETE_FUNCTION_ROWS;
  policies?: ReturnType<typeof withPolicyMeta>;
  presentColumns?: string[];
  runtimeContracts?: typeof COMPLETE_RUNTIME_CONTRACTS | null;
}) {
  return {
    migrationVersions:
      overrides?.migrationVersions ?? COMPLETE_REQUIRED_VERSIONS,
    functions: overrides?.functions ?? COMPLETE_FUNCTION_ROWS,
    policies: overrides?.policies ?? COMPLETE_REQUIRED_POLICY_ROWS,
    presentColumns: overrides?.presentColumns ?? COMPLETE_PRESENT_COLUMNS,
    runtimeContracts:
      overrides?.runtimeContracts === undefined
        ? COMPLETE_RUNTIME_CONTRACTS
        : overrides.runtimeContracts,
  };
}

describe('healthCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns healthy when migrations, helpers, and policy predicates all match', async () => {
    mockReadHealthCatalogSnapshot.mockResolvedValue(
      buildHealthyCatalogSnapshot()
    );

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(true);
    expect(result.catalogAccessFailed).toBe(false);
    expect(result.authOrgIdHelperValid).toBe(true);
    expect(result.authIsAdminHelperValid).toBe(true);
    expect(result.criticalPolicyPredicatesValid).toBe(true);
    expect(result.forbiddenPoliciesAbsent).toBe(true);
    expect(result.invoiceImageStoragePathShapeValid).toBe(true);
    expect(result.requiredColumnsPresent).toBe(true);
    expect(result.runtimeContractsPresent).toBe(true);
    expect(result.invalidHelpers).toEqual([]);
    expect(result.unsafePolicies).toEqual([]);
  });

  it('fails closed when catalog access fails', async () => {
    mockReadHealthCatalogSnapshot.mockRejectedValue(
      new HealthCatalogAccessError()
    );

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(false);
    expect(result.catalogAccessFailed).toBe(true);
    expect(result.missingMigrationVersions).toEqual([
      'health_catalog_access_failed',
    ]);
  });

  it('returns unhealthy when auth helpers still trust unsafe definitions', async () => {
    mockReadHealthCatalogSnapshot.mockResolvedValue(
      buildHealthyCatalogSnapshot({
        functions: [
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
        policies: [],
      })
    );

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(false);
    expect(result.authOrgIdHelperValid).toBe(false);
    expect(result.authIsAdminHelperValid).toBe(false);
    expect(result.invalidHelpers).toContain('public.org_id');
    expect(result.invalidHelpers).toContain('public.is_admin');
  });

  it('returns unhealthy when a critical policy predicate is unsafe', async () => {
    mockReadHealthCatalogSnapshot.mockResolvedValue(
      buildHealthyCatalogSnapshot({
        policies: withPolicyMeta([
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
    const reloadedReadHealthCatalogSnapshot = (
      await import('../healthCatalogReader')
    ).readHealthCatalogSnapshot as jest.MockedFunction<
      typeof readHealthCatalogSnapshot
    >;

    reloadedReadHealthCatalogSnapshot.mockResolvedValue(
      buildHealthyCatalogSnapshot()
    );

    const result = await reloadedCheckMigrations();

    expect(result.invoiceImageStoragePathShapeValid).toBe(false);
    expect(result.allHealthy).toBe(false);

    jest.dontMock('@/app/api/invoices/imageUrls');
    jest.resetModules();
  });

  it('returns unhealthy when a required migration version is missing', async () => {
    mockReadHealthCatalogSnapshot.mockResolvedValue(
      buildHealthyCatalogSnapshot({
        migrationVersions: COMPLETE_REQUIRED_VERSIONS.filter(
          version => version !== '20260422133936'
        ),
      })
    );

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(false);
    expect(result.missingMigrationVersions).toContain('20260422133936');
  });

  it('returns unhealthy when required columns are missing', async () => {
    mockReadHealthCatalogSnapshot.mockResolvedValue(
      buildHealthyCatalogSnapshot({
        presentColumns: COMPLETE_PRESENT_COLUMNS.filter(
          column => column !== 'public.clients.client_number'
        ),
      })
    );

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(false);
    expect(result.requiredColumnsPresent).toBe(false);
    expect(result.missingColumns).toContain('public.clients.client_number');
  });

  it('returns unhealthy when runtime contracts are missing', async () => {
    mockReadHealthCatalogSnapshot.mockResolvedValue(
      buildHealthyCatalogSnapshot({
        runtimeContracts: {
          api_create_idempotency_exists: false,
          api_create_idempotency_columns_ok: true,
          api_create_idempotency_unique_ok: true,
          create_connection_atomic_hardened: true,
        },
      })
    );

    const result = await checkMigrations();

    expect(result.allHealthy).toBe(false);
    expect(result.runtimeContractsPresent).toBe(false);
    expect(result.missingRuntimeContracts).toContain(
      'public.api_create_idempotency table'
    );
  });

  it('returns unhealthy when an invoice storage policy is missing or unsafe', async () => {
    mockReadHealthCatalogSnapshot.mockResolvedValue(
      buildHealthyCatalogSnapshot({
        policies: withPolicyMeta([
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
