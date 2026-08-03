#!/usr/bin/env tsx
/**
 * Authoritative post-deploy Postgres catalog postflight.
 *
 * `npm run schema:ready` (src/app/api/_utils/schemaReadiness.ts) reads
 * through PostgREST and has a documented false-negative mode: a PostgREST
 * permission error (403 / Postgres error code 42501) contains the words
 * "column"/"relation" and gets folded into "missing column" instead of
 * being surfaced as a real (non-schema) error — see
 * schemaReadiness.ts's isMissingSchemaError / isMissingContractViewError.
 * That check therefore cannot be the sole blocking gate for "did the
 * migration actually converge."
 *
 * This script instead reads directly from Postgres system catalogs
 * (read-only transaction) and is authoritative: it fails the deploy if the
 * remote migration-history version set does not exactly equal the local
 * version set, or if any of a small set of always-required functions,
 * triggers, or columns are missing.
 *
 * Invoked only from .github/workflows/production-db-deploy.yml, after
 * `supabase db push`, reusing the same DATABASE_URL already gated by the
 * `validate-only` production-identity check earlier in the same job — this
 * script only re-checks basic structural safety, not identity, which keeps
 * it connectable to the isolated local Postgres instance used by
 * tests/integration/production/*.integration.test.ts. Never logs
 * credentials, hostnames, project refs, or full connection strings. Stdout
 * contract: exactly one JSON document and nothing else; all diagnostics go
 * to stderr.
 *
 * Usage: tsx scripts/production/postflight-catalog.ts
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import {
  describeDatabaseUrlSafely,
  parseLocalMigrationFilenames,
  reconcileMigrationVersions,
  summarizePendingVersions,
  validateDatabaseUrlStructure,
  type LocalMigration,
} from './db-deploy-guards';

// Mirrors src/app/api/_utils/healthCatalogReader.ts's REQUIRED_FUNCTION_NAMES
// — kept as an independent literal here so this deploy-time script has no
// import dependency on the Next.js application source tree.
const REQUIRED_FUNCTIONS = ['org_id', 'user_role', 'is_admin'] as const;

// Status-transition guard triggers created by
// supabase/migrations/00000000000003_triggers.sql and
// 00000000000058_enforce_status_transitions.sql. "When applicable" means:
// only enforced when the local migration set (the set this postflight is
// reconciling against) includes the migration that defines each trigger.
// For this repository's single linear migration history that is always
// true post-deploy, so the applicability check degrades to "always check."
const REQUIRED_TRIGGERS = [
  'tr_enforce_instrument_status_transition',
  'tr_enforce_invoice_status_transition',
  'tr_enforce_maintenance_task_status_transition',
] as const;

// Mirrors src/app/api/_utils/healthCatalogSpecs.ts's HEALTH_REQUIRED_COLUMNS
// (kept independent for the same reason as REQUIRED_FUNCTIONS above).
const REQUIRED_COLUMNS: readonly { table: string; column: string }[] = [
  { table: 'invoices', column: 'invoice_number' },
  { table: 'invoice_settings', column: 'business_name' },
  { table: 'invoice_settings', column: 'business_address' },
  { table: 'invoice_settings', column: 'business_phone' },
  { table: 'invoice_settings', column: 'business_email' },
  { table: 'invoice_settings', column: 'bank_account_holder' },
  { table: 'invoice_settings', column: 'bank_name' },
  { table: 'invoice_settings', column: 'bank_swift_code' },
  { table: 'invoice_settings', column: 'bank_account_number' },
  { table: 'invoice_settings', column: 'default_conditions' },
  { table: 'invoice_settings', column: 'default_exchange_rate' },
  { table: 'invoice_settings', column: 'default_currency' },
  { table: 'instrument_images', column: 'storage_key' },
  { table: 'instrument_images', column: 'file_name' },
  { table: 'instrument_images', column: 'file_size' },
  { table: 'instrument_images', column: 'mime_type' },
  { table: 'instrument_images', column: 'display_order' },
  { table: 'client_instruments', column: 'display_order' },
  { table: 'clients', column: 'client_number' },
];

export type PostflightResult = {
  authoritative: true;
  migrationSetConverged: boolean;
  pendingMigrationCount: number;
  remoteOnlyVersionCount: number;
  missingFunctions: string[];
  missingTriggers: string[];
  missingColumns: string[];
  passed: boolean;
};

function readLocalMigrations(): LocalMigration[] {
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  const filenames = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name);
  return parseLocalMigrationFilenames(filenames);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  validateDatabaseUrlStructure(databaseUrl);
  console.error(
    `Target: ${JSON.stringify(describeDatabaseUrlSafely(databaseUrl as string))}`
  );

  const localMigrations = readLocalMigrations();
  const client = new Client({ connectionString: databaseUrl as string });
  await client.connect();

  let result: PostflightResult;
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10000ms'");

    const historyResult = await client.query<{ version: string }>(
      'SELECT version FROM supabase_migrations.schema_migrations'
    );
    const reconciliation = reconcileMigrationVersions(
      localMigrations,
      historyResult.rows.map(row => row.version)
    );
    const summary = summarizePendingVersions(reconciliation);

    console.error(
      `Postflight migration-set reconciliation: ${reconciliation.localVersionCount} local, ${reconciliation.remoteUniqueVersionCount} remote, ${summary.pendingMigrationCount} pending (digest ${summary.pendingDigest.slice(0, 12)}...).`
    );

    const functionResult = await client.query<{ proname: string }>(
      `SELECT p.proname
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
      [REQUIRED_FUNCTIONS]
    );
    const presentFunctions = new Set(functionResult.rows.map(r => r.proname));
    const missingFunctions = REQUIRED_FUNCTIONS.filter(
      name => !presentFunctions.has(name)
    );

    const triggerResult = await client.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE tgname = ANY($1::text[]) AND NOT tgisinternal`,
      [REQUIRED_TRIGGERS]
    );
    const presentTriggers = new Set(triggerResult.rows.map(r => r.tgname));
    const missingTriggers = REQUIRED_TRIGGERS.filter(
      name => !presentTriggers.has(name)
    );

    const columnResult = await client.query<{
      table_name: string;
      column_name: string;
    }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name, column_name) IN (
            SELECT * FROM UNNEST($1::text[], $2::text[])
          )`,
      [REQUIRED_COLUMNS.map(c => c.table), REQUIRED_COLUMNS.map(c => c.column)]
    );
    const presentColumns = new Set(
      columnResult.rows.map(r => `${r.table_name}.${r.column_name}`)
    );
    const missingColumns = REQUIRED_COLUMNS.map(
      c => `${c.table}.${c.column}`
    ).filter(key => !presentColumns.has(key));

    await client.query('COMMIT');

    const migrationSetConverged =
      reconciliation.pendingMigrationCount === 0 &&
      reconciliation.remoteOnlyVersions.length === 0;

    result = {
      authoritative: true,
      migrationSetConverged,
      pendingMigrationCount: reconciliation.pendingMigrationCount,
      remoteOnlyVersionCount: reconciliation.remoteOnlyVersions.length,
      missingFunctions,
      missingTriggers,
      missingColumns,
      passed:
        migrationSetConverged &&
        missingFunctions.length === 0 &&
        missingTriggers.length === 0 &&
        missingColumns.length === 0,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure during teardown.
    }
    throw error;
  } finally {
    await client.end();
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);

  if (!result.passed) {
    console.error('Postflight catalog check FAILED (authoritative, blocking).');
    process.exit(1);
  }

  console.error('Postflight catalog check passed (authoritative, blocking).');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
