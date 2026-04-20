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
}

const SCHEMA_READINESS_CACHE_TTL_MS = 30_000;

const REQUIRED_COLUMNS: readonly RequiredColumnSpec[] = [
  {
    schema: 'public',
    table: 'invoices',
    column: 'invoice_number',
  },
] as const;

let cachedResult: SchemaReadinessResult | null = null;
let cacheExpiresAt = 0;

function getColumnKey(spec: RequiredColumnSpec): string {
  return `${spec.schema}.${spec.table}.${spec.column}`;
}

function buildDefaultResult(): SchemaReadinessResult {
  return {
    ready: false,
    checkedAt: new Date().toISOString(),
    missingColumns: REQUIRED_COLUMNS.map(getColumnKey),
  };
}

function isMissingInvoiceSchemaError(error: unknown): boolean {
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
        text.includes('invoice_number') ||
        text.includes('schema cache') ||
        text.includes('column') ||
        text.includes('does not exist') ||
        text.includes('relation')
    )
  );
}

function buildSchemaNotReadyMessage(missingColumns: string[]): string {
  if (missingColumns.length === 0) {
    return 'Database migration required';
  }

  return `Database migration required: missing ${missingColumns.join(', ')}`;
}

export class SchemaNotReadyError extends Error {
  code = ErrorCodes.SCHEMA_OUT_OF_DATE;
  error_code = ErrorCodes.SCHEMA_OUT_OF_DATE;
  status = 503;
  retryable = false;
  details: { missingColumns: string[] };

  constructor(missingColumns: string[]) {
    super(buildSchemaNotReadyMessage(missingColumns));
    this.name = 'SchemaNotReadyError';
    this.details = { missingColumns };
  }
}

export function __resetSchemaReadinessCacheForTests() {
  cachedResult = null;
  cacheExpiresAt = 0;
}

export async function checkSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  const bypassCache = options?.bypassCache === true;
  const now = Date.now();

  if (!bypassCache && cachedResult && now < cacheExpiresAt) {
    return cachedResult;
  }

  try {
    const supabase = (options?.supabase ??
      getAdminSupabase()) as SchemaReadinessClient;

    const { error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .limit(1);

    if (error && isMissingInvoiceSchemaError(error)) {
      throw error;
    }

    if (error) {
      throw error;
    }

    const result: SchemaReadinessResult = {
      ready: true,
      checkedAt: new Date().toISOString(),
      missingColumns: [],
    };

    cachedResult = result;
    cacheExpiresAt = now + SCHEMA_READINESS_CACHE_TTL_MS;

    return result;
  } catch {
    const fallback = buildDefaultResult();
    cachedResult = fallback;
    cacheExpiresAt = now + SCHEMA_READINESS_CACHE_TTL_MS;
    return fallback;
  }
}

export async function assertSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  const result = await checkSchemaReadiness(options);

  if (!result.ready) {
    throw new SchemaNotReadyError(result.missingColumns);
  }

  return result;
}

export async function assertInvoiceSchemaReadiness(options?: {
  bypassCache?: boolean;
  supabase?: SchemaReadinessClient;
}): Promise<SchemaReadinessResult> {
  return assertSchemaReadiness(options);
}
