import {
  buildInvoiceImageStoragePath,
  INVOICE_IMAGE_STORAGE_PATH_SEGMENTS,
  matchesInvoiceImageStoragePolicyShape,
} from '@/app/api/invoices/imageUrls';
import {
  getMissingRequiredColumns,
  getMissingRuntimeContracts,
} from '@/app/api/_utils/healthCatalogSpecs';
import {
  HealthCatalogAccessError,
  readHealthCatalogSnapshot,
} from '@/app/api/_utils/healthCatalogReader';

export interface MigrationCheckResult {
  display_order: boolean;
  tenantIsolationMigration: boolean;
  roleEnforcedWritePoliciesMigration: boolean;
  requiredPoliciesPresent: boolean;
  forbiddenPoliciesAbsent: boolean;
  authOrgIdHelperValid: boolean;
  authIsAdminHelperValid: boolean;
  criticalPolicyPredicatesValid: boolean;
  invoiceImageStoragePathShapeValid: boolean;
  requiredColumnsPresent: boolean;
  runtimeContractsPresent: boolean;
  catalogAccessFailed: boolean;
  allHealthy: boolean;
  missingMigrationVersions: string[];
  missingPolicies: string[];
  forbiddenPoliciesPresent: string[];
  invalidHelpers: string[];
  unsafePolicies: string[];
  missingColumns: string[];
  missingRuntimeContracts: string[];
}

type SchemaName = 'public' | 'storage';

type RequiredPolicySpec = {
  schema: SchemaName;
  table: string;
  snippets: string[];
};

type ForbiddenPolicySpec = {
  schema: SchemaName;
  table: string;
  policy: string;
};

type PgProcRow = {
  proname?: unknown;
  prosrc?: unknown;
};

type PgPolicyRow = {
  policyname?: unknown;
  schemaname?: unknown;
  tablename?: unknown;
  qual?: unknown;
  with_check?: unknown;
};

type ParsedPolicyRow = {
  policyName: string;
  schemaName: string;
  tableName: string;
  qual: string;
  withCheck: string;
  predicate: string;
};

const REQUIRED_MIGRATION_VERSIONS = [
  '00000000000000', // initial_schema
  '00000000000001', // auth_helpers
  '00000000000002', // rls_policies
  '00000000000003', // triggers
  '00000000000004', // functions
  '00000000000005', // indexes

  // Client create RPC readiness
  '00000000000054', // create_client_with_connections_atomic
  '00000000000060', // create_client_with_connections returns JSONB payload
  '00000000000061', // clients tags support
  '20260422133936', // clients interest/note persistence
] as const;

// With consolidated migrations the "tenant isolation" and "role-enforced write
// policies" functionality ship in the initial 00000000000000 migration.
const TENANT_ISOLATION_MIGRATION_VERSION = '00000000000000';
const ROLE_ENFORCED_WRITE_POLICIES_MIGRATION_VERSION = '00000000000002';

const REQUIRED_HELPER_SNIPPETS = {
  org_id: ['app_metadata', 'org_id'],
  is_admin: ['public.user_role() =', 'admin'],
} as const;

const REQUIRED_POLICY_SPECS: Record<string, RequiredPolicySpec> = {
  client_instruments_select: {
    schema: 'public',
    table: 'client_instruments',
    snippets: ['org_id = public.org_id()'],
  },
  maintenance_tasks_select: {
    schema: 'public',
    table: 'maintenance_tasks',
    snippets: ['org_id = public.org_id()'],
  },
  sales_history_select: {
    schema: 'public',
    table: 'sales_history',
    snippets: ['org_id = public.org_id()'],
  },
  sales_history_insert: {
    schema: 'public',
    table: 'sales_history',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  invoices_select: {
    schema: 'public',
    table: 'invoices',
    snippets: ['org_id = public.org_id()'],
  },
  clients_insert: {
    schema: 'public',
    table: 'clients',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  clients_update: {
    schema: 'public',
    table: 'clients',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  clients_delete: {
    schema: 'public',
    table: 'clients',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  instruments_insert: {
    schema: 'public',
    table: 'instruments',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  instruments_update: {
    schema: 'public',
    table: 'instruments',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  instruments_delete: {
    schema: 'public',
    table: 'instruments',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  client_instruments_update: {
    schema: 'public',
    table: 'client_instruments',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  client_instruments_delete: {
    schema: 'public',
    table: 'client_instruments',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  maintenance_tasks_update: {
    schema: 'public',
    table: 'maintenance_tasks',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  maintenance_tasks_delete: {
    schema: 'public',
    table: 'maintenance_tasks',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  contact_logs_update: {
    schema: 'public',
    table: 'contact_logs',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  contact_logs_delete: {
    schema: 'public',
    table: 'contact_logs',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  invoices_update: {
    schema: 'public',
    table: 'invoices',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  invoices_delete: {
    schema: 'public',
    table: 'invoices',
    snippets: ['org_id = public.org_id()', 'public.is_admin()'],
  },
  hc_v_invoice_images_insert: {
    schema: 'storage',
    table: 'objects',
    snippets: [
      "bucket_id = 'invoices'",
      '(storage.foldername(name))[1] = public.org_id()::text',
      'array_length(storage.foldername(name), 1) = 2',
      'public.is_admin()',
    ],
  },
  hc_v_invoice_images_select: {
    schema: 'storage',
    table: 'objects',
    snippets: [
      "bucket_id = 'invoices'",
      '(storage.foldername(name))[1] = public.org_id()::text',
      'array_length(storage.foldername(name), 1) = 2',
    ],
  },
  hc_v_invoice_images_update: {
    schema: 'storage',
    table: 'objects',
    snippets: [
      "bucket_id = 'invoices'",
      '(storage.foldername(name))[1] = public.org_id()::text',
      'array_length(storage.foldername(name), 1) = 2',
      'public.is_admin()',
    ],
  },
  hc_v_invoice_images_delete: {
    schema: 'storage',
    table: 'objects',
    snippets: [
      "bucket_id = 'invoices'",
      '(storage.foldername(name))[1] = public.org_id()::text',
      'array_length(storage.foldername(name), 1) = 2',
      'public.is_admin()',
    ],
  },
};

const REQUIRED_POLICY_NAMES = Object.keys(REQUIRED_POLICY_SPECS);

const FORBIDDEN_POLICY_SPECS: readonly ForbiddenPolicySpec[] = [
  {
    schema: 'public',
    table: 'sales_history',
    policy: 'sales_history_update',
  },
  {
    schema: 'public',
    table: 'sales_history',
    policy: 'sales_history_delete',
  },
] as const;

const POLICY_NAMES_TO_CHECK = [
  ...REQUIRED_POLICY_NAMES,
  ...FORBIDDEN_POLICY_SPECS.map(spec => spec.policy),
];

function normalizeSql(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').toLowerCase().trim();
}

function buildPolicyKey(
  schema: string,
  table: string,
  policyName: string
): string {
  return `${schema}.${table}.${policyName}`;
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function getMigrationFlag(
  missingMigrationVersions: string[],
  requiredVersion: string
): boolean {
  return !missingMigrationVersions.includes(requiredVersion);
}

function getDefaultForbiddenPolicyKeys(): string[] {
  return FORBIDDEN_POLICY_SPECS.map(spec =>
    buildPolicyKey(spec.schema, spec.table, spec.policy)
  );
}

function unhealthyResult(
  overrides: Partial<MigrationCheckResult> = {}
): MigrationCheckResult {
  return {
    display_order: false,
    tenantIsolationMigration: false,
    roleEnforcedWritePoliciesMigration: false,
    requiredPoliciesPresent: false,
    forbiddenPoliciesAbsent: false,
    authOrgIdHelperValid: false,
    authIsAdminHelperValid: false,
    criticalPolicyPredicatesValid: false,
    invoiceImageStoragePathShapeValid: false,
    requiredColumnsPresent: false,
    runtimeContractsPresent: false,
    catalogAccessFailed: false,
    allHealthy: false,
    missingMigrationVersions: [...REQUIRED_MIGRATION_VERSIONS],
    missingPolicies: [...REQUIRED_POLICY_NAMES],
    forbiddenPoliciesPresent: getDefaultForbiddenPolicyKeys(),
    invalidHelpers: ['public.org_id', 'public.is_admin'],
    unsafePolicies: [...REQUIRED_POLICY_NAMES],
    missingColumns: ['public.invoices.invoice_number'],
    missingRuntimeContracts: [],
    ...overrides,
  };
}

function catalogAccessFailureResult(): MigrationCheckResult {
  return unhealthyResult({
    catalogAccessFailed: true,
    missingMigrationVersions: ['health_catalog_access_failed'],
    missingPolicies: [],
    forbiddenPoliciesPresent: [],
    invalidHelpers: [],
    unsafePolicies: [],
    missingColumns: [],
    missingRuntimeContracts: [],
  });
}

function isInvoiceImageStoragePathInvariantValid(): boolean {
  const samplePath = buildInvoiceImageStoragePath(
    '00000000-0000-0000-0000-000000000000',
    'invoice-item-test.png'
  );

  return (
    INVOICE_IMAGE_STORAGE_PATH_SEGMENTS === 2 &&
    matchesInvoiceImageStoragePolicyShape(samplePath)
  );
}

function buildFunctionSourceMap(
  rows: PgProcRow[] | null | undefined
): Map<string, string> {
  return new Map(
    (rows ?? [])
      .map(row => {
        const name = typeof row.proname === 'string' ? row.proname : null;
        if (!name) return null;
        return [
          name,
          normalizeSql(typeof row.prosrc === 'string' ? row.prosrc : ''),
        ] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null)
  );
}

function getInvalidHelpers(functionMap: Map<string, string>): string[] {
  const invalidHelpers: string[] = [];

  const orgIdHelperSource = functionMap.get('org_id') ?? '';
  const isAdminHelperSource = functionMap.get('is_admin') ?? '';

  const orgIdInvalid =
    REQUIRED_HELPER_SNIPPETS.org_id.some(
      snippet => !orgIdHelperSource.includes(normalizeSql(snippet))
    ) || orgIdHelperSource.includes('user_metadata');

  const isAdminInvalid =
    REQUIRED_HELPER_SNIPPETS.is_admin.some(
      snippet => !isAdminHelperSource.includes(normalizeSql(snippet))
    ) || isAdminHelperSource.includes('user_metadata');

  if (orgIdInvalid) {
    invalidHelpers.push('public.org_id');
  }

  if (isAdminInvalid) {
    invalidHelpers.push('public.is_admin');
  }

  return invalidHelpers;
}

function parsePolicyRows(
  rows: PgPolicyRow[] | null | undefined
): ParsedPolicyRow[] {
  return (rows ?? [])
    .map(row => {
      const policyName =
        typeof row.policyname === 'string' ? row.policyname : null;
      const schemaName =
        typeof row.schemaname === 'string' ? row.schemaname : null;
      const tableName =
        typeof row.tablename === 'string' ? row.tablename : null;

      if (!policyName || !schemaName || !tableName) {
        return null;
      }

      const qual = normalizeSql(typeof row.qual === 'string' ? row.qual : '');
      const withCheck = normalizeSql(
        typeof row.with_check === 'string' ? row.with_check : ''
      );
      const predicate = normalizeSql(`${qual} ${withCheck}`);

      return {
        policyName,
        schemaName,
        tableName,
        qual,
        withCheck,
        predicate,
      };
    })
    .filter((row): row is ParsedPolicyRow => row !== null);
}

function getPresentPolicyKeys(policyRows: ParsedPolicyRow[]): Set<string> {
  return new Set(
    policyRows.map(row =>
      buildPolicyKey(row.schemaName, row.tableName, row.policyName)
    )
  );
}

function getMissingPolicies(presentPolicyKeys: Set<string>): string[] {
  return REQUIRED_POLICY_NAMES.filter(policyName => {
    const spec = REQUIRED_POLICY_SPECS[policyName];
    return !presentPolicyKeys.has(
      buildPolicyKey(spec.schema, spec.table, policyName)
    );
  });
}

function getForbiddenPoliciesPresent(presentPolicyKeys: Set<string>): string[] {
  return FORBIDDEN_POLICY_SPECS.map(spec =>
    buildPolicyKey(spec.schema, spec.table, spec.policy)
  ).filter(policyKey => presentPolicyKeys.has(policyKey));
}

function policyHasUnsafeTruePredicate(row: ParsedPolicyRow): boolean {
  return (
    row.qual.includes('using (true') ||
    row.withCheck.includes('with check (true') ||
    row.predicate.includes('using (true') ||
    row.predicate.includes('with check (true')
  );
}

function getUnsafePolicies(policyRows: ParsedPolicyRow[]): string[] {
  const unsafe: string[] = [];

  for (const row of policyRows) {
    const spec = REQUIRED_POLICY_SPECS[row.policyName];
    if (!spec) continue;

    if (row.schemaName !== spec.schema || row.tableName !== spec.table) {
      unsafe.push(row.policyName);
      continue;
    }

    if (policyHasUnsafeTruePredicate(row)) {
      unsafe.push(row.policyName);
      continue;
    }

    const missingRequiredSnippet = spec.snippets.some(
      snippet => !row.predicate.includes(normalizeSql(snippet))
    );

    if (missingRequiredSnippet) {
      unsafe.push(row.policyName);
    }
  }

  return uniq(unsafe);
}

export async function checkMigrations(): Promise<MigrationCheckResult> {
  try {
    const catalog = await readHealthCatalogSnapshot({
      policyNames: POLICY_NAMES_TO_CHECK,
    });

    const appliedVersions = new Set(catalog.migrationVersions);

    const missingMigrationVersions = REQUIRED_MIGRATION_VERSIONS.filter(
      version => !appliedVersions.has(version)
    );

    const functionMap = buildFunctionSourceMap(
      catalog.functions.map(row => ({
        proname: row.proname,
        prosrc: row.prosrc,
      }))
    );
    const invalidHelpers = getInvalidHelpers(functionMap);

    const parsedPolicyRows = parsePolicyRows(
      catalog.policies.map(row => ({
        policyname: row.policyname,
        schemaname: row.schemaname,
        tablename: row.tablename,
        qual: row.qual,
        with_check: row.with_check,
      }))
    );

    const presentPolicyKeys = getPresentPolicyKeys(parsedPolicyRows);

    const missingPolicies = getMissingPolicies(presentPolicyKeys);
    const forbiddenPoliciesPresent =
      getForbiddenPoliciesPresent(presentPolicyKeys);
    const unsafePolicies = getUnsafePolicies(parsedPolicyRows);

    const missingColumns = getMissingRequiredColumns(catalog.presentColumns);
    const missingRuntimeContracts = getMissingRuntimeContracts(
      catalog.runtimeContracts
    );

    const requiredMigrationsPresent = missingMigrationVersions.length === 0;

    const tenantIsolationMigration = getMigrationFlag(
      missingMigrationVersions,
      TENANT_ISOLATION_MIGRATION_VERSION
    );

    const roleEnforcedWritePoliciesMigration = getMigrationFlag(
      missingMigrationVersions,
      ROLE_ENFORCED_WRITE_POLICIES_MIGRATION_VERSION
    );

    const requiredPoliciesPresent = missingPolicies.length === 0;
    const forbiddenPoliciesAbsent = forbiddenPoliciesPresent.length === 0;
    const authOrgIdHelperValid = !invalidHelpers.includes('public.org_id');
    const authIsAdminHelperValid = !invalidHelpers.includes('public.is_admin');

    const criticalPolicyPredicatesValid =
      unsafePolicies.length === 0 && missingPolicies.length === 0;

    const invoiceImageStoragePathShapeValid =
      isInvoiceImageStoragePathInvariantValid();

    const requiredColumnsPresent = missingColumns.length === 0;
    const runtimeContractsPresent = missingRuntimeContracts.length === 0;

    const allHealthy =
      requiredMigrationsPresent &&
      tenantIsolationMigration &&
      roleEnforcedWritePoliciesMigration &&
      requiredPoliciesPresent &&
      forbiddenPoliciesAbsent &&
      authOrgIdHelperValid &&
      authIsAdminHelperValid &&
      criticalPolicyPredicatesValid &&
      invoiceImageStoragePathShapeValid &&
      requiredColumnsPresent &&
      runtimeContractsPresent;

    const display_order =
      tenantIsolationMigration &&
      requiredPoliciesPresent &&
      forbiddenPoliciesAbsent &&
      authOrgIdHelperValid &&
      authIsAdminHelperValid &&
      criticalPolicyPredicatesValid &&
      invoiceImageStoragePathShapeValid &&
      requiredColumnsPresent &&
      runtimeContractsPresent;

    return {
      display_order,
      tenantIsolationMigration,
      roleEnforcedWritePoliciesMigration,
      requiredPoliciesPresent,
      forbiddenPoliciesAbsent,
      authOrgIdHelperValid,
      authIsAdminHelperValid,
      criticalPolicyPredicatesValid,
      invoiceImageStoragePathShapeValid,
      requiredColumnsPresent,
      runtimeContractsPresent,
      catalogAccessFailed: false,
      allHealthy,
      missingMigrationVersions,
      missingPolicies,
      forbiddenPoliciesPresent,
      invalidHelpers,
      unsafePolicies,
      missingColumns,
      missingRuntimeContracts,
    };
  } catch (error) {
    if (error instanceof HealthCatalogAccessError) {
      return catalogAccessFailureResult();
    }

    return catalogAccessFailureResult();
  }
}
