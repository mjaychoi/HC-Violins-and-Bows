/**
 * Read-only staging migration-history query.
 *
 * Does not reconcile local and remote versions and does not invoke the
 * Supabase CLI. The transaction is verified read-only and always rolls back.
 * Callers must not log the connection string.
 */
import { Client } from 'pg';
import { createDatabaseClientConfig } from '../production/database-client-config';

export function requireStagingDatabaseUrl(
  databaseUrl: string | undefined
): string {
  const value = databaseUrl?.trim() ?? '';
  if (!value) {
    throw new Error(
      'STAGING_DATABASE_URL is required (no DATABASE_URL fallback).'
    );
  }
  return value;
}

export async function withStagingReadOnlyClient<T>(
  databaseUrl: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client(createDatabaseClientConfig(databaseUrl));
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const mode = await client.query<{ transaction_read_only: string }>(
      'SHOW transaction_read_only'
    );
    if (mode.rows[0]?.transaction_read_only !== 'on') {
      throw new Error(
        'Read-only transaction enforcement failed. Refusing to continue.'
      );
    }
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    return await fn(client);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The transaction never commits.
    }
    await client.end();
  }
}

export async function readRemoteMigrationVersionsReadOnly(
  databaseUrl: string
): Promise<string[]> {
  return withStagingReadOnlyClient(databaseUrl, async client => {
    const result = await client.query<{ version: string }>(
      'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'
    );
    return result.rows.map(row => row.version);
  });
}
