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

const REQUIRED_RUNTIME_CONTRACTS = {
  api_create_idempotency_exists: 'public.api_create_idempotency table',
  api_create_idempotency_columns_ok:
    'public.api_create_idempotency required columns',
  api_create_idempotency_unique_ok:
    'public.api_create_idempotency scoped uniqueness',
  create_connection_atomic_hardened:
    'public.create_connection_atomic org-scoped parent checks',
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
  instrument_images: [
    'storage_key',
    'file_name',
    'file_size',
    'mime_type',
    'display_order',
  ],
  client_instruments: ['display_order'],
  clients: ['client_number'],
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
  includeRuntimeContracts: boolean
): SchemaReadinessResult {
  return {
    ready: false,
    checkedAt: new Date().toISOString(),
    missingColumns: requiredColumns.map(getColumnKey),
    missingContracts: includeRuntimeContracts
      ? Object.values(REQUIRED_RUNTIME_CONTRACTS)
      : [],
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
  includeRuntimeContracts: boolean
): string {
  return [
    requiredColumns.map(getColumnKey).sort().join('|'),
    includeRuntimeContracts ? 'runtime-contracts' : 'columns-only',
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
  supabase: SchemaReadinessClient
): Promise<string[]> {
  const contractColumns = Object.keys(
    REQUIRED_RUNTIME_CONTRACTS
  ) as RuntimeContractColumn[];

  const { data, error } = await supabase
    .from('runtime_contract_checks')
    .select(contractColumns.join(','))
    .limit(1);

  if (error) {
    if (isMissingContractViewError(error)) {
      return getAllRuntimeContracts();
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== 'object') {
    return getAllRuntimeContracts();
  }

  const contractRow = row as RuntimeContractRow;

  return contractColumns
    .filter(column => contractRow[column] !== true)
    .map(column => REQUIRED_RUNTIME_CONTRACTS[column]);
}

export function __resetSchemaReadinessCacheForTests() {
  cachedResults.clear();
}

export async function checkSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
  tables?: readonly RequiredTableName[];
  requiredColumns?: readonly RequiredColumnSpec[];
  includeRuntimeContracts?: boolean;
}): Promise<SchemaReadinessResult> {
  const bypassCache = options?.bypassCache === true;
  const now = Date.now();
  const requiredColumns =
    options?.requiredColumns ??
    (options?.tables
      ? getSpecsForTables(options.tables)
      : ALL_REQUIRED_COLUMNS);
  const includeRuntimeContracts =
    options?.includeRuntimeContracts ??
    (!options?.tables && !options?.requiredColumns);
  const cacheKey = getCacheKey(requiredColumns, includeRuntimeContracts);
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

    if (includeRuntimeContracts) {
      missingContracts.push(...(await checkRuntimeContracts(supabase)));
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
      includeRuntimeContracts
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
  });
}

export async function assertInvoiceSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  return assertSchemaReadiness({
    ...options,
    tables: ['invoices', 'invoice_settings'],
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
  return assertTableColumnsReady(
    'clients',
    REQUIRED_COLUMNS_BY_TABLE.clients,
    'clients schema readiness',
    options
  );
}
