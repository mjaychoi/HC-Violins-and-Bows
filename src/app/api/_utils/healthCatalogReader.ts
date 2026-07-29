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
const SUCCESS_SNAPSHOT_TTL_MS = 30_000;
const FAILURE_SNAPSHOT_TTL_MS = 3_000;

export class HealthCatalogAccessError extends Error {
  readonly code = 'HEALTH_CATALOG_ACCESS_FAILED';

  constructor(message = 'Health catalog access failed') {
    super(message);
    this.name = 'HealthCatalogAccessError';
  }
}

const REQUIRED_FUNCTION_NAMES = ['org_id', 'user_role', 'is_admin'] as const;

let catalogPool: Pool | null = null;
let poolDatabaseUrl: string | null = null;
let pgModulePromise: Promise<typeof import('pg')> | null = null;

type CachedSuccessSnapshot = {
  policyNamesKey: string;
  snapshot: HealthCatalogSnapshot;
  expiresAt: number;
};

type CachedFailureSnapshot = {
  policyNamesKey: string;
  expiresAt: number;
};

let successSnapshotCache: CachedSuccessSnapshot | null = null;
let failureSnapshotCache: CachedFailureSnapshot | null = null;
let inFlightSnapshotPromise: Promise<HealthCatalogSnapshot> | null = null;
let inFlightPolicyNamesKey: string | null = null;

function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : null;
}

function getPolicyNamesKey(policyNames: readonly string[]): string {
  if (policyNames.length === 0) {
    return '';
  }

  return [...policyNames].sort().join('\0');
}

function resetHealthCatalogSnapshotCache(): void {
  successSnapshotCache = null;
  failureSnapshotCache = null;
  inFlightSnapshotPromise = null;
  inFlightPolicyNamesKey = null;
}

async function resetCatalogPoolIfDatabaseUrlChanged(): Promise<void> {
  const connectionString = getDatabaseUrl();

  if (poolDatabaseUrl === connectionString) {
    return;
  }

  const previousPool = catalogPool;
  catalogPool = null;
  pgModulePromise = null;
  poolDatabaseUrl = connectionString;
  resetHealthCatalogSnapshotCache();

  if (previousPool) {
    try {
      await previousPool.end();
    } catch {
      // Ignore pool teardown failures during URL rotation.
    }
  }
}

async function loadPgModule() {
  if (!pgModulePromise) {
    pgModulePromise = import('pg');
  }

  return pgModulePromise;
}

async function getCatalogPool(): Promise<Pool> {
  await resetCatalogPoolIfDatabaseUrlChanged();

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

async function readHealthCatalogSnapshotUncached(options?: {
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

export async function readHealthCatalogSnapshot(options?: {
  policyNames?: readonly string[];
}): Promise<HealthCatalogSnapshot> {
  const policyNames = options?.policyNames ?? [];
  const policyNamesKey = getPolicyNamesKey(policyNames);
  const now = Date.now();

  await resetCatalogPoolIfDatabaseUrlChanged();

  if (
    successSnapshotCache &&
    successSnapshotCache.policyNamesKey === policyNamesKey &&
    successSnapshotCache.expiresAt > now
  ) {
    return successSnapshotCache.snapshot;
  }

  if (
    failureSnapshotCache &&
    failureSnapshotCache.policyNamesKey === policyNamesKey &&
    failureSnapshotCache.expiresAt > now
  ) {
    throw new HealthCatalogAccessError();
  }

  if (inFlightSnapshotPromise && inFlightPolicyNamesKey === policyNamesKey) {
    return inFlightSnapshotPromise;
  }

  inFlightPolicyNamesKey = policyNamesKey;
  inFlightSnapshotPromise = readHealthCatalogSnapshotUncached(options)
    .then(snapshot => {
      successSnapshotCache = {
        policyNamesKey,
        snapshot,
        expiresAt: Date.now() + SUCCESS_SNAPSHOT_TTL_MS,
      };
      failureSnapshotCache = null;
      return snapshot;
    })
    .catch(error => {
      failureSnapshotCache = {
        policyNamesKey,
        expiresAt: Date.now() + FAILURE_SNAPSHOT_TTL_MS,
      };
      successSnapshotCache = null;
      throw sanitizeConnectionFailure(error);
    })
    .finally(() => {
      inFlightSnapshotPromise = null;
      inFlightPolicyNamesKey = null;
    });

  return inFlightSnapshotPromise;
}

export function resetHealthCatalogPoolForTests(): void {
  catalogPool = null;
  poolDatabaseUrl = null;
  pgModulePromise = null;
  resetHealthCatalogSnapshotCache();
}

export async function closeHealthCatalogPoolForTests(): Promise<void> {
  if (!catalogPool) {
    resetHealthCatalogSnapshotCache();
    poolDatabaseUrl = null;
    return;
  }

  const pool = catalogPool;
  catalogPool = null;
  poolDatabaseUrl = null;
  pgModulePromise = null;
  resetHealthCatalogSnapshotCache();
  await pool.end();
}
