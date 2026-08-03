#!/usr/bin/env tsx
/**
 * Production migration-deploy helper: secret-safe structural URL validation,
 * a read-only connectivity probe, and a migration-history read.
 *
 * Invoked only from .github/workflows/production-db-deploy.yml, after the
 * `production` GitHub Environment has granted approval. Never logs
 * credentials or full connection strings.
 *
 * Usage: tsx scripts/production/db-probe.ts <validate-only|probe|history>
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import {
  computePendingCount,
  validateDatabaseUrlStructure,
} from './db-deploy-guards';

function countLocalMigrations(): number {
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  return fs.readdirSync(dir).filter(name => name.endsWith('.sql')).length;
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

async function main() {
  const mode = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL;

  const { masked } = validateDatabaseUrlStructure(databaseUrl);
  console.log(`Target (masked): ${masked}`);

  if (mode === 'validate-only') {
    console.log('DATABASE_URL structural validation passed.');
    return;
  }

  if (mode === 'probe') {
    await withClient(databaseUrl as string, async client => {
      const result = await client.query('SELECT 1 AS ok');
      if (result.rows[0]?.ok !== 1) {
        throw new Error(
          'Read-only connectivity probe did not return the expected result.'
        );
      }
    });
    console.log('Read-only connectivity probe (SELECT 1) succeeded.');
    return;
  }

  if (mode === 'history') {
    const totalLocalMigrations = countLocalMigrations();
    const applied = await withClient(databaseUrl as string, async client => {
      const result = await client.query<{ version: string }>(
        'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'
      );
      return result.rows.map(row => row.version);
    });
    const pendingMigrationCount = computePendingCount(
      totalLocalMigrations,
      applied.length
    );

    console.log(
      JSON.stringify(
        {
          totalLocalMigrations,
          appliedMigrationCount: applied.length,
          pendingMigrationCount,
          latestApplied: applied.at(-1) ?? null,
        },
        null,
        2
      )
    );
    return;
  }

  console.error(
    `Unknown mode "${mode}". Expected one of: validate-only, probe, history.`
  );
  process.exit(1);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
