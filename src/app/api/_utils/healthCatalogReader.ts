import type { Pool, PoolClient, QueryResultRow } from 'pg';
import {
  HEALTH_REQUIRED_COLUMNS,
  type HealthCatalogPolicyRow,
  type HealthCatalogRuntimeContracts,
  type HealthCatalogSnapshot,
} from '@/app/api/_utils/healthCatalogSpecs';

if (typeof window !== 'undefined') {
  throw new Error('healthCatalogReader is server-only');
}

const CONNECTION_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 10_000;
const POOL_MAX = 1;
const POOL_IDLE_TIMEOUT_MS = 30_000;

export class HealthCatalogAccessError extends Error {
  readonly code = 'HEALTH_CATALOG_ACCESS_FAILED';

  constructor(message = 'Health catalog access failed') {
    super(message);
    this.name = 'HealthCatalogAccessError';
  }
}

const REQUIRED_FUNCTION_NAMES = ['org_id', 'user_role', 'is_admin'] as const;

let catalogPool: Pool | null = null;
let pgModulePromise: Promise<typeof import('pg')> | null = null;

function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : null;
}

async function loadPgModule() {
  if (!pgModulePromise) {
    pgModulePromise = import('pg');
  }

  return pgModulePromise;
}

async function getCatalogPool(): Promise<Pool> {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new HealthCatalogAccessError();
  }

  if (!catalogPool) {
    const { Pool: PgPool } = await loadPgModule();
    catalogPool = new PgPool({
      connectionString,
      max: POOL_MAX,
      idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      allowExitOnIdle: true,
    });
  }

  return catalogPool;
}

function sanitizeConnectionFailure(error: unknown): HealthCatalogAccessError {
  if (error instanceof HealthCatalogAccessError) {
    return error;
  }

  return new HealthCatalogAccessError();
}

async function runReadOnlyCatalogQuery<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values?: unknown[]
) {
  return client.query<T>(text, values);
}

export async function readHealthCatalogSnapshot(options?: {
  policyNames?: readonly string[];
}): Promise<HealthCatalogSnapshot> {
  const policyNames = options?.policyNames ?? [];

  let client: PoolClient | null = null;

  try {
    const pool = await getCatalogPool();
    client = await pool.connect();

    await client.query('BEGIN READ ONLY');
    await client.query(
      `SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`
    );

    const migrationResult = await runReadOnlyCatalogQuery<{ version: string }>(
      client,
      'SELECT version FROM supabase_migrations.schema_migrations'
    );

    const functionResult = await runReadOnlyCatalogQuery<{
      proname: string;
      prosrc: string;
    }>(
      client,
      `
        SELECT
          p.proname,
          COALESCE(p.prosrc, pg_get_functiondef(p.oid)) AS prosrc
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY($1::text[])
      `,
      [REQUIRED_FUNCTION_NAMES]
    );

    let policies: HealthCatalogPolicyRow[] = [];

    if (policyNames.length > 0) {
      const policyResult =
        await runReadOnlyCatalogQuery<HealthCatalogPolicyRow>(
          client,
          `
          SELECT policyname, schemaname, tablename, qual, with_check
          FROM pg_policies
          WHERE policyname = ANY($1::text[])
        `,
          [policyNames]
        );
      policies = policyResult.rows;
    }

    const columnConditions = HEALTH_REQUIRED_COLUMNS.map(
      (_, index) =>
        `(table_schema = $${index * 3 + 1} AND table_name = $${index * 3 + 2} AND column_name = $${index * 3 + 3})`
    ).join(' OR ');

    const columnValues = HEALTH_REQUIRED_COLUMNS.flatMap(spec => [
      spec.schema,
      spec.table,
      spec.column,
    ]);

    const columnResult = await runReadOnlyCatalogQuery<{
      table_schema: string;
      table_name: string;
      column_name: string;
    }>(
      client,
      `
        SELECT table_schema, table_name, column_name
        FROM information_schema.columns
        WHERE ${columnConditions}
      `,
      columnValues
    );

    let runtimeContracts: HealthCatalogRuntimeContracts | null = null;

    try {
      const runtimeResult =
        await runReadOnlyCatalogQuery<HealthCatalogRuntimeContracts>(
          client,
          `
            SELECT
              api_create_idempotency_exists,
              api_create_idempotency_columns_ok,
              api_create_idempotency_unique_ok,
              create_connection_atomic_hardened
            FROM public.runtime_contract_checks
            LIMIT 1
          `
        );

      runtimeContracts = runtimeResult.rows[0] ?? null;
    } catch {
      runtimeContracts = null;
    }

    await client.query('COMMIT');

    return {
      migrationVersions: migrationResult.rows.map(row => row.version),
      functions: functionResult.rows.map(row => ({
        proname: row.proname,
        prosrc: row.prosrc,
      })),
      policies,
      presentColumns: columnResult.rows.map(
        row => `${row.table_schema}.${row.table_name}.${row.column_name}`
      ),
      runtimeContracts,
    };
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failures during connection teardown.
      }
    }

    throw sanitizeConnectionFailure(error);
  } finally {
    client?.release();
  }
}

export function resetHealthCatalogPoolForTests(): void {
  catalogPool = null;
  pgModulePromise = null;
}

export async function closeHealthCatalogPoolForTests(): Promise<void> {
  if (!catalogPool) {
    return;
  }

  const pool = catalogPool;
  catalogPool = null;
  pgModulePromise = null;
  await pool.end();
}
