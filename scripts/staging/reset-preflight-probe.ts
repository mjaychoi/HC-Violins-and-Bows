#!/usr/bin/env tsx
/**
 * Pre-reset connectivity probe. Informational migration count only.
 * Does not reconcile remote history and does not mutate.
 *
 * Stdout is one JSON document. The database URL is never printed.
 */
import { pathToFileURL } from 'url';
import fs from 'fs';
import {
  assertPreflightProbeSignals,
  assertResetSafetyGates,
} from './reset-gates';
import {
  requireStagingDatabaseUrl,
  withStagingReadOnlyClient,
} from './reset-db-read';

function writeGithubOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile || /[\r\n]/.test(value)) {
    return;
  }
  fs.appendFileSync(outputFile, `${name}=${value}\n`);
}

async function main(): Promise<void> {
  assertResetSafetyGates(process.env);
  const databaseUrl = requireStagingDatabaseUrl(
    process.env.STAGING_DATABASE_URL
  );

  const probe = await withStagingReadOnlyClient(databaseUrl, async client => {
    const selectResult = await client.query<{ ok: number }>('SELECT 1 AS ok');
    const sslResult = await client.query<{ ssl: boolean }>(
      'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()'
    );
    assertPreflightProbeSignals({
      selectOk: selectResult.rows[0]?.ok,
      ssl: sslResult.rows[0]?.ssl,
    });

    let remoteMigrationCount: number | null = null;
    try {
      const versions = await client.query<{ version: string }>(
        'SELECT version FROM supabase_migrations.schema_migrations'
      );
      remoteMigrationCount = versions.rows.length;
    } catch {
      console.error(
        'Pre-reset remote migration count is unavailable. Staging divergence is informational and does not block reset.'
      );
    }
    return { remoteMigrationCount };
  });

  writeGithubOutput('tls_verified', 'true');
  writeGithubOutput(
    'pre_reset_remote_migration_count',
    probe.remoteMigrationCount === null
      ? ''
      : String(probe.remoteMigrationCount)
  );
  process.stdout.write(
    `${JSON.stringify({
      select1: true,
      tlsVerified: true,
      targetVerified: true,
      preResetRemoteMigrationCount: probe.remoteMigrationCount,
    })}\n`
  );
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
