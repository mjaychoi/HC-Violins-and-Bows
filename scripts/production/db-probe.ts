#!/usr/bin/env tsx
/**
 * Production migration-deploy helper: a read-only connectivity probe and a
 * migration-history read, plus (in `validate-only` mode only) the strict
 * production-identity gate.
 *
 * Identity enforcement (Supabase session-pooler endpoint, exact project-ref
 * match, port 5432, sslmode=require — see validateProductionEndpoint in
 * db-deploy-guards.ts) runs once, in `validate-only` mode, as its own
 * workflow step before any other step connects to DATABASE_URL. `probe` and
 * `history` reuse the same already-gated DATABASE_URL and only re-check
 * basic structural safety (scheme/host/credentials/db name present) — this
 * keeps them connectable to any real Postgres, including the isolated local
 * instance used by tests/integration/production/*.integration.test.ts,
 * without needing to fake a Supabase-shaped hostname.
 *
 * Invoked only from .github/workflows/production-db-deploy.yml, after the
 * `production` GitHub Environment has granted approval. Never logs
 * credentials, hostnames, project refs, or full connection strings.
 *
 * Stdout/stderr contract (load-bearing — the workflow pipes stdout through
 * `tee history.json` and calls JSON.parse() on the file):
 *   - `history` mode writes exactly one JSON document to stdout and nothing
 *     else. No prefix, no suffix, no trailing log line.
 *   - Every other message (target description, status, errors) goes to
 *     stderr via console.error, never console.log.
 *   - `validate-only` and `probe` modes print no structured stdout; any
 *     confirmation text they print also goes to stderr for consistency.
 *
 * Usage: tsx scripts/production/db-probe.ts <validate-only|probe|history>
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import {
  describeDatabaseUrlSafely,
  describeProductionEndpointForLog,
  parseLocalMigrationFilenames,
  reconcileMigrationVersions,
  summarizePendingVersions,
  validateDatabaseUrlStructure,
  validateProductionEndpoint,
  type LocalMigration,
} from './db-deploy-guards';

function readLocalMigrations(): LocalMigration[] {
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  const filenames = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name);
  return parseLocalMigrationFilenames(filenames);
}

async function withClient<T>(
  databaseUrl: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function readRemoteVersions(databaseUrl: string): Promise<string[]> {
  return withClient(databaseUrl, async client => {
    const result = await client.query<{ version: string }>(
      'SELECT version FROM supabase_migrations.schema_migrations'
    );
    return result.rows.map(row => row.version);
  });
}

async function main() {
  const mode = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL;
  const expectedProjectRef = process.env.EXPECTED_SUPABASE_PROJECT_REF;

  if (mode !== 'validate-only' && mode !== 'probe' && mode !== 'history') {
    console.error(
      `Unknown mode "${mode}". Expected one of: validate-only, probe, history.`
    );
    process.exit(1);
    return;
  }

  if (mode === 'validate-only') {
    const descriptor = validateProductionEndpoint(
      databaseUrl,
      expectedProjectRef
    );
    console.error(describeProductionEndpointForLog(descriptor));
    console.error('DATABASE_URL structural and identity validation passed.');
    return;
  }

  validateDatabaseUrlStructure(databaseUrl);
  console.error(
    `Target: ${JSON.stringify(describeDatabaseUrlSafely(databaseUrl as string))}`
  );

  if (mode === 'probe') {
    await withClient(databaseUrl as string, async client => {
      const result = await client.query('SELECT 1 AS ok');
      if (result.rows[0]?.ok !== 1) {
        throw new Error(
          'Read-only connectivity probe did not return the expected result.'
        );
      }
    });
    console.error('Read-only connectivity probe (SELECT 1) succeeded.');
    return;
  }

  // mode === 'history' — used both pre-mutation and post-deploy. Stdout must
  // contain exactly one JSON document and nothing else.
  const localMigrations = readLocalMigrations();
  const rawRemoteVersions = await readRemoteVersions(databaseUrl as string);
  const reconciliation = reconcileMigrationVersions(
    localMigrations,
    rawRemoteVersions
  );
  const summary = summarizePendingVersions(reconciliation);

  console.error(
    `Migration-history read: ${reconciliation.localVersionCount} local, ${reconciliation.remoteUniqueVersionCount} remote, ${summary.pendingMigrationCount} pending (digest ${summary.pendingDigest.slice(0, 12)}...).`
  );

  process.stdout.write(
    `${JSON.stringify({
      localVersionCount: reconciliation.localVersionCount,
      remoteUniqueVersionCount: reconciliation.remoteUniqueVersionCount,
      remoteOnlyVersionCount: reconciliation.remoteOnlyVersions.length,
      pendingMigrationCount: summary.pendingMigrationCount,
      firstPendingVersion: summary.firstPendingVersion,
      lastPendingVersion: summary.lastPendingVersion,
      pendingDigest: summary.pendingDigest,
      latestApplied: reconciliation.latestApplied,
    })}\n`
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
