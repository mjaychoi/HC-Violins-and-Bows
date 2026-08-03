/**
 * Isolated local PostgreSQL fixture for tests/integration/production. The
 * actual instance (a real, self-contained `embedded-postgres` Postgres
 * binary — no Docker required, never a hosted or production database, and
 * never a mock) is started once by
 * tests/integration/production/helpers/global-setup.cjs (a plain
 * CommonJS Jest globalSetup, deliberately outside this file so the
 * ESM-only `embedded-postgres` package never has to pass through Jest's
 * per-test transform pipeline) and published via `TEST_POSTGRES_URL` /
 * `TEST_POSTGRES_PORT` env vars, which Jest propagates into the worker
 * process(es) it forks after globalSetup completes.
 *
 * Only runnable via `npm run test:production-guards-integration`, which
 * wires up the matching globalSetup/globalTeardown.
 */
import { Client } from 'pg';

export type TestPostgres = {
  connectionString: string;
  port: number;
};

export function getTestPostgres(): TestPostgres {
  const connectionString = process.env.TEST_POSTGRES_URL;
  const port = process.env.TEST_POSTGRES_PORT;

  if (!connectionString || !port) {
    throw new Error(
      'TEST_POSTGRES_URL/TEST_POSTGRES_PORT are not set. Run these tests via `npm run test:production-guards-integration`, which wires up global-setup.cjs.'
    );
  }

  return { connectionString, port: Number.parseInt(port, 10) };
}

/**
 * (Re)creates supabase_migrations.schema_migrations from scratch and seeds
 * it with exactly `versions`. Always drops and recreates the table first so
 * each call is a full, order-independent reset — callers never need to
 * worry about state left behind by a previous seed in the same test file.
 *
 * Deliberately has no primary key / uniqueness constraint — real
 * Supabase-managed Postgres enforces `version` as a primary key, but tests
 * need to be able to seed duplicate rows to exercise duplicate-history
 * detection.
 */
export async function seedMigrationHistory(
  connectionString: string,
  versions: readonly string[]
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
    await client.query(
      'DROP TABLE IF EXISTS supabase_migrations.schema_migrations'
    );
    await client.query(
      `CREATE TABLE supabase_migrations.schema_migrations (
         version text,
         statements text[],
         name text
       )`
    );
    for (const version of versions) {
      await client.query(
        'INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1)',
        [version]
      );
    }
  } finally {
    await client.end();
  }
}
