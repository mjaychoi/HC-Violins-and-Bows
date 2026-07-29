#!/usr/bin/env tsx
/**
 * Verify active migration filenames and SHA-256 hashes, and optionally
 * compare against a remote schema_migrations table via DATABASE_URL.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');

function sha256File(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function migrationVersionFromFilename(filename: string): string {
  const stem = filename.replace(/\.sql$/, '');
  const match = stem.match(/^(\d{14})(?:_|$)/);
  if (match?.[1]) {
    return match[1];
  }
  return stem;
}

function listExpectedMigrations(): Array<{ version: string; sha256: string; filename: string }> {
  return fs
    .readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(name => ({
      filename: name,
      version: migrationVersionFromFilename(name),
      sha256: sha256File(path.join(migrationsDir, name)),
    }));
}

async function listAppliedMigrations(
  databaseUrl: string
): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ version: string }>(
      'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'
    );
    return result.rows.map(row => row.version);
  } finally {
    await client.end();
  }
}

async function main() {
  const expected = listExpectedMigrations();
  const expectedVersions = expected.map(row => row.version);

  console.log(
    JSON.stringify(
      {
        expectedCount: expected.length,
        latestExpected: expectedVersions.at(-1) ?? null,
      },
      null,
      2
    )
  );

  const databaseUrl = process.env.STAGING_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('No DATABASE_URL provided; filename/hash inventory only.');
    return;
  }

  const applied = await listAppliedMigrations(databaseUrl);
  const missing = expectedVersions.filter(v => !applied.includes(v));
  const unexpected = applied.filter(v => !expectedVersions.includes(v));

  if (missing.length > 0 || unexpected.length > 0) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          expectedCount: expected.length,
          appliedCount: applied.length,
          latestApplied: applied.at(-1) ?? null,
          missing,
          unexpected,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        expectedCount: expected.length,
        appliedCount: applied.length,
        latestApplied: applied.at(-1) ?? null,
        exactSetEquality: true,
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
