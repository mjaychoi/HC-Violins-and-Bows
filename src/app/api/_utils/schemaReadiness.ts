import { getAdminSupabase } from '@/lib/supabase-server';
import { ErrorCodes } from '@/types/errors';

type RequiredColumnSpec = {
  schema: 'public';
  table: string;
  column: string;
};

type SchemaReadinessClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export interface SchemaReadinessResult {
  ready: boolean;
  checkedAt: string;
  missingColumns: string[];
  missingContracts: string[];
}

const SCHEMA_READINESS_CACHE_TTL_MS = 30_000;

const CORE_RUNTIME_CONTRACTS = {
  api_create_idempotency_exists: 'public.api_create_idempotency table',
  api_create_idempotency_columns_ok:
    'public.api_create_idempotency required columns',
  api_create_idempotency_unique_ok:
    'public.api_create_idempotency scoped uniqueness',
  create_connection_atomic_hardened:
    'public.create_connection_atomic org-scoped parent checks',
} as const;

const ITEM_CLIENT_RUNTIME_CONTRACTS = {
  instrument_type_nullable: 'public.instruments.type nullable contract',
  instrument_identity_check_exists:
    'public.instruments instruments_identity_check constraint',
  instrument_certificate_name_check_exists:
    'public.instruments instruments_certificate_name_check constraint',
  client_identity_columns_exist:
    'public.clients first_name and last_name columns',
  client_identity_check_exists:
    'public.clients clients_name_identity_check constraint',
  client_rpc_5_arg_exists:
    'public.create_client_with_connections_atomic 5-arg overload',
  client_rpc_6_arg_exists:
    'public.create_client_with_connections_atomic 6-arg overload',
  client_rpc_10_arg_exists:
    'public.create_client_with_connections_atomic 10-arg overload',
  client_rpc_all_security_invoker:
    'public.create_client_with_connections_atomic SECURITY INVOKER overloads',
  client_rpc_authenticated_execute:
    'public.create_client_with_connections_atomic authenticated EXECUTE grants',
  client_rpc_anon_execute_revoked:
    'public.create_client_with_connections_atomic anon EXECUTE revocation',
} as const;

const INSTRUMENT_RUNTIME_CONTRACTS = {
  instrument_type_nullable:
    ITEM_CLIENT_RUNTIME_CONTRACTS.instrument_type_nullable,
  instrument_identity_check_exists:
    ITEM_CLIENT_RUNTIME_CONTRACTS.instrument_identity_check_exists,
  instrument_certificate_name_check_exists:
    ITEM_CLIENT_RUNTIME_CONTRACTS.instrument_certificate_name_check_exists,
} as const;

const CLIENT_RUNTIME_CONTRACTS = {
  client_identity_columns_exist:
    ITEM_CLIENT_RUNTIME_CONTRACTS.client_identity_columns_exist,
  client_identity_check_exists:
    ITEM_CLIENT_RUNTIME_CONTRACTS.client_identity_check_exists,
} as const;

const CLIENT_RPC_RUNTIME_CONTRACTS = {
  client_rpc_5_arg_exists:
    ITEM_CLIENT_RUNTIME_CONTRACTS.client_rpc_5_arg_exists,
  client_rpc_6_arg_exists:
    ITEM_CLIENT_RUNTIME_CONTRACTS.client_rpc_6_arg_exists,
  client_rpc_10_arg_exists:
    ITEM_CLIENT_RUNTIME_CONTRACTS.client_rpc_10_arg_exists,
  client_rpc_all_security_invoker:
    ITEM_CLIENT_RUNTIME_CONTRACTS.client_rpc_all_security_invoker,
  client_rpc_authenticated_execute:
    ITEM_CLIENT_RUNTIME_CONTRACTS.client_rpc_authenticated_execute,
  client_rpc_anon_execute_revoked:
    ITEM_CLIENT_RUNTIME_CONTRACTS.client_rpc_anon_execute_revoked,
} as const;

const REQUIRED_RUNTIME_CONTRACTS = {
  ...CORE_RUNTIME_CONTRACTS,
  ...ITEM_CLIENT_RUNTIME_CONTRACTS,
} as const;

type RuntimeContractColumn = keyof typeof REQUIRED_RUNTIME_CONTRACTS;

type RuntimeContractRow = Partial<Record<RuntimeContractColumn, boolean>>;

const REQUIRED_COLUMNS_BY_TABLE = {
  invoices: ['invoice_number'],
  invoice_settings: [
    'business_name',
    'business_address',
    'business_phone',
    'business_email',
    'bank_account_holder',
    'bank_name',
    'bank_swift_code',
    'bank_account_number',
    'default_conditions',
    'default_exchange_rate',
    'default_currency',
  ],
  instruments: ['certificate_name'],
  instrument_images: [
    'storage_key',
    'file_name',
    'file_size',
    'mime_type',
    'display_order',
  ],
  client_instruments: ['display_order'],
  clients: ['client_number', 'first_name', 'last_name'],
} as const satisfies Record<string, readonly string[]>;

type RequiredTableName = keyof typeof REQUIRED_COLUMNS_BY_TABLE;

const ALL_REQUIRED_COLUMNS: readonly RequiredColumnSpec[] = Object.entries(
  REQUIRED_COLUMNS_BY_TABLE
).flatMap(([table, columns]) =>
  columns.map(column => ({ schema: 'public' as const, table, column }))
);

const cachedResults = new Map<
  string,
  { result: SchemaReadinessResult; expiresAt: number }
>();

function getColumnKey(spec: RequiredColumnSpec): string {
  return `${spec.schema}.${spec.table}.${spec.column}`;
}

function buildDefaultResult(
  requiredColumns: readonly RequiredColumnSpec[],
  runtimeContracts: Record<string, string>
): SchemaReadinessResult {
  return {
    ready: false,
    checkedAt: new Date().toISOString(),
    missingColumns: requiredColumns.map(getColumnKey),
    missingContracts: Object.values(runtimeContracts),
  };
}

function isMissingSchemaError(
  error: unknown,
  requiredColumns: readonly RequiredColumnSpec[]
): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const haystacks = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.toLowerCase());

  return (
    code === 'PGRST204' ||
    code === '42703' ||
    code === '42P01' ||
    haystacks.some(
      text =>
        requiredColumns.some(spec => text.includes(spec.column)) ||
        text.includes('schema cache') ||
        text.includes('column') ||
        text.includes('does not exist') ||
        text.includes('relation')
    )
  );
}

function groupRequiredColumnsByTable(
  requiredColumns: readonly RequiredColumnSpec[]
): Map<string, RequiredColumnSpec[]> {
  const grouped = new Map<string, RequiredColumnSpec[]>();

  for (const spec of requiredColumns) {
    const tableKey = `${spec.schema}.${spec.table}`;
    const specs = grouped.get(tableKey) ?? [];
    specs.push(spec);
    grouped.set(tableKey, specs);
  }

  return grouped;
}

function buildSchemaNotReadyMessage(
  missingColumns: string[],
  missingContracts: string[]
): string {
  if (missingColumns.length === 0 && missingContracts.length === 0) {
    return 'Database migration required';
  }

  const missing = [...missingColumns, ...missingContracts];
  return `Database migration required: missing ${missing.join(', ')}`;
}

export class SchemaNotReadyError extends Error {
  code = ErrorCodes.SCHEMA_OUT_OF_DATE;
  error_code = ErrorCodes.SCHEMA_OUT_OF_DATE;
  status = 503;
  retryable = false;
  details: {
    missingColumns: string[];
    missingContracts: string[];
    context?: string;
  };

  constructor(
    missingColumns: string[],
    context?: string,
    missingContracts: string[] = []
  ) {
    super(buildSchemaNotReadyMessage(missingColumns, missingContracts));
    this.name = 'SchemaNotReadyError';
    this.details = { missingColumns, missingContracts, context };
  }
}

function getSpecsForTables(
  tables: readonly RequiredTableName[]
): RequiredColumnSpec[] {
  return tables.flatMap(table =>
    REQUIRED_COLUMNS_BY_TABLE[table].map(column => ({
      schema: 'public' as const,
      table,
      column,
    }))
  );
}

function getCacheKey(
  requiredColumns: readonly RequiredColumnSpec[],
  runtimeContracts: Record<string, string> | null
): string {
  const contractPart = runtimeContracts
    ? Object.keys(runtimeContracts).sort().join('|')
    : 'no-contracts';

  return [
    requiredColumns.map(getColumnKey).sort().join('|'),
    contractPart,
  ].join('::');
}

function getAllRuntimeContracts(): string[] {
  return Object.values(REQUIRED_RUNTIME_CONTRACTS);
}

function isMissingContractViewError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const haystacks = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.toLowerCase());

  return (
    code === 'PGRST204' ||
    code === '42P01' ||
    haystacks.some(
      text =>
        text.includes('runtime_contract_checks') ||
        text.includes('schema cache') ||
        text.includes('does not exist') ||
        text.includes('relation')
    )
  );
}

async function checkRuntimeContracts(
  supabase: SchemaReadinessClient,
  runtimeContracts: Record<string, string>
): Promise<string[]> {
  const contractColumns = Object.keys(
    runtimeContracts
  ) as RuntimeContractColumn[];

  const { data, error } = await supabase
    .from('runtime_contract_checks')
    .select(contractColumns.join(','))
    .limit(1);

  if (error) {
    if (isMissingContractViewError(error)) {
      return Object.values(runtimeContracts);
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== 'object') {
    return Object.values(runtimeContracts);
  }

  const contractRow = row as RuntimeContractRow;

  return contractColumns
    .filter(column => contractRow[column] !== true)
    .map(column => runtimeContracts[column]);
}

export function __resetSchemaReadinessCacheForTests() {
  cachedResults.clear();
}

export async function checkSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
  tables?: readonly RequiredTableName[];
  requiredColumns?: readonly RequiredColumnSpec[];
  runtimeContracts?: Record<string, string> | null;
  includeRuntimeContracts?: boolean;
}): Promise<SchemaReadinessResult> {
  const bypassCache = options?.bypassCache === true;
  const now = Date.now();
  const requiredColumns =
    options?.requiredColumns ??
    (options?.tables
      ? getSpecsForTables(options.tables)
      : ALL_REQUIRED_COLUMNS);

  let runtimeContracts: Record<string, string> | null = null;
  if (options?.runtimeContracts !== undefined) {
    runtimeContracts = options.runtimeContracts;
  } else if (
    options?.includeRuntimeContracts ??
    (!options?.tables && !options?.requiredColumns)
  ) {
    runtimeContracts = REQUIRED_RUNTIME_CONTRACTS;
  }

  const cacheKey = getCacheKey(requiredColumns, runtimeContracts);
  const cached = cachedResults.get(cacheKey);

  if (!bypassCache && cached && now < cached.expiresAt) {
    return cached.result;
  }

  try {
    const supabase = (options?.supabase ??
      getAdminSupabase()) as SchemaReadinessClient;

    const missingColumns: string[] = [];
    const missingContracts: string[] = [];

    for (const specs of groupRequiredColumnsByTable(requiredColumns).values()) {
      const table = specs[0]?.table;
      if (!table) continue;

      const { error } = await supabase
        .from(table)
        .select(specs.map(spec => spec.column).join(','))
        .limit(1);

      if (error && isMissingSchemaError(error, specs)) {
        missingColumns.push(...specs.map(getColumnKey));
        continue;
      }

      if (error) {
        throw error;
      }
    }

    if (runtimeContracts) {
      missingContracts.push(
        ...(await checkRuntimeContracts(supabase, runtimeContracts))
      );
    }

    if (missingColumns.length > 0 || missingContracts.length > 0) {
      const result: SchemaReadinessResult = {
        ready: false,
        checkedAt: new Date().toISOString(),
        missingColumns,
        missingContracts,
      };

      cachedResults.set(cacheKey, {
        result,
        expiresAt: now + SCHEMA_READINESS_CACHE_TTL_MS,
      });

      return result;
    }

    const result: SchemaReadinessResult = {
      ready: true,
      checkedAt: new Date().toISOString(),
      missingColumns: [],
      missingContracts: [],
    };

    cachedResults.set(cacheKey, {
      result,
      expiresAt: now + SCHEMA_READINESS_CACHE_TTL_MS,
    });

    return result;
  } catch {
    const fallback = buildDefaultResult(
      requiredColumns,
      runtimeContracts ?? REQUIRED_RUNTIME_CONTRACTS
    );
    cachedResults.set(cacheKey, {
      result: fallback,
      expiresAt: now + SCHEMA_READINESS_CACHE_TTL_MS,
    });
    return fallback;
  }
}

export async function assertSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
  tables?: readonly RequiredTableName[];
  requiredColumns?: readonly RequiredColumnSpec[];
  runtimeContracts?: Record<string, string> | null;
  includeRuntimeContracts?: boolean;
  context?: string;
}): Promise<SchemaReadinessResult> {
  const result = await checkSchemaReadiness(options);

  if (!result.ready) {
    throw new SchemaNotReadyError(
      result.missingColumns,
      options?.context,
      result.missingContracts
    );
  }

  return result;
}

export async function assertTableColumnsReady(
  tableName: RequiredTableName,
  requiredColumns: readonly string[],
  context: string,
  options?: {
    bypassCache?: boolean;
    supabase?: SchemaReadinessClient;
    runtimeContracts?: Record<string, string> | null;
  }
): Promise<SchemaReadinessResult> {
  return assertSchemaReadiness({
    ...options,
    context,
    requiredColumns: requiredColumns.map(column => ({
      schema: 'public' as const,
      table: tableName,
      column,
    })),
    runtimeContracts: options?.runtimeContracts ?? null,
    includeRuntimeContracts: false,
  });
}

export async function assertInvoiceSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  return assertSchemaReadiness({
    ...options,
    tables: ['invoices', 'invoice_settings'],
    runtimeContracts: null,
    includeRuntimeContracts: false,
    context: 'invoice schema readiness',
  });
}

export async function assertInstrumentImagesSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  return assertTableColumnsReady(
    'instrument_images',
    REQUIRED_COLUMNS_BY_TABLE.instrument_images,
    'instrument images schema readiness',
    options
  );
}

export async function assertClientConnectionsSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  return assertTableColumnsReady(
    'client_instruments',
    REQUIRED_COLUMNS_BY_TABLE.client_instruments,
    'client connections schema readiness',
    options
  );
}

export async function assertClientsSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  return assertSchemaReadiness({
    ...options,
    tables: ['clients'],
    runtimeContracts: CLIENT_RUNTIME_CONTRACTS,
    includeRuntimeContracts: false,
    context: 'clients schema readiness',
  });
}

export async function assertClientRpcSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  return assertSchemaReadiness({
    ...options,
    requiredColumns: [],
    runtimeContracts: CLIENT_RPC_RUNTIME_CONTRACTS,
    includeRuntimeContracts: false,
    context: 'client RPC schema readiness',
  });
}

export async function assertInstrumentsSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  return assertSchemaReadiness({
    ...options,
    tables: ['instruments'],
    runtimeContracts: INSTRUMENT_RUNTIME_CONTRACTS,
    includeRuntimeContracts: false,
    context: 'instruments schema readiness',
  });
}

export async function assertItemClientCertificateSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  return assertSchemaReadiness({
    ...options,
    tables: ['instruments', 'clients'],
    runtimeContracts: {
      ...INSTRUMENT_RUNTIME_CONTRACTS,
      ...CLIENT_RUNTIME_CONTRACTS,
    },
    includeRuntimeContracts: false,
    context: 'item and client certificate schema readiness',
  });
}

export { REQUIRED_RUNTIME_CONTRACTS, getAllRuntimeContracts };
