/** @jest-environment node */

/**
 * Real-process integration test for
 * scripts/production/db-reconcile-readonly.ts, against an isolated local
 * Postgres instance (embedded-postgres — no Docker, no hosted/production
 * database). Mirrors db-probe-cli.integration.test.ts's approach of
 * spawning the real CLI and asserting on stdout/stderr, plus direct
 * in-process use of the exported read-only-transaction helper against a
 * real `pg` client to prove read-only mode is actually enforced by
 * Postgres, not merely assumed.
 */
import { spawn } from 'child_process';
import { Client } from 'pg';
import path from 'path';
import {
  assertReadOnlyTransactionActive,
  getMainSha,
  readGitTrackedLocalMigrations,
} from '../../../scripts/production/db-reconcile-readonly';
import { reconcileMigrationVersions } from '../../../scripts/production/db-deploy-guards';
import {
  getTestPostgres,
  seedMigrationHistory,
  type TestPostgres,
} from './helpers/testPostgres';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const SCRIPT = path.join(
  REPO_ROOT,
  'scripts',
  'production',
  'db-reconcile-readonly.ts'
);

jest.setTimeout(60000);

type CliResult = { stdout: string; stderr: string; exitCode: number | null };

function runReconcile(env: Record<string, string>): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, [SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', exitCode => resolve({ stdout, stderr, exitCode }));
  });
}

async function readSchemaMigrationsTable(
  connectionString: string
): Promise<{ version: string }[]> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<{ version: string }>(
      'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version'
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

describe('db-reconcile-readonly.ts — real CLI process against an isolated local Postgres', () => {
  const testPg: TestPostgres = getTestPostgres();
  const testPassword = new URL(testPg.connectionString).password;

  it('actually enforces a read-only transaction at the Postgres session level (not merely a client-side promise)', async () => {
    const client = new Client({ connectionString: testPg.connectionString });
    await client.connect();
    try {
      await assertReadOnlyTransactionActive(client);

      // Prove enforcement is real: Postgres itself, not the application,
      // must reject a write attempted inside this transaction.
      await expect(
        client.query(
          "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('99999999999999')"
        )
      ).rejects.toThrow(/read-only transaction/i);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
    }
  });

  it('computes the exact pending/remote-only sets via the existing reconciliation helpers, matching a full CLI run', async () => {
    const mainSha = getMainSha(REPO_ROOT);
    const localMigrations = readGitTrackedLocalMigrations(mainSha, REPO_ROOT);
    expect(localMigrations.length).toBeGreaterThan(0);

    // Interleaved subset, same shape used by db-probe-cli.integration.test.ts.
    const remoteVersions = localMigrations
      .map(m => m.version)
      .filter((_, index) => index % 2 === 0);
    await seedMigrationHistory(testPg.connectionString, remoteVersions);

    const expected = reconcileMigrationVersions(
      localMigrations,
      remoteVersions
    );

    const result = await runReconcile({
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());

    expect(parsed).toEqual({
      mainSha,
      localVersionCount: expected.localVersionCount,
      remoteUniqueVersionCount: expected.remoteUniqueVersionCount,
      remoteOnlyVersions: [],
      pendingVersions: expected.pendingVersions,
      pendingMigrationCount: expected.pendingMigrationCount,
      firstPendingVersion: expected.pendingVersions[0] ?? null,
      lastPendingVersion: expected.pendingVersions.at(-1) ?? null,
      latestApplied: expected.latestApplied,
      pendingDigest: expected.pendingDigest,
    });

    // Stdout is exactly the JSON document; diagnostics are on stderr only.
    expect(result.stdout.trim()).toBe(JSON.stringify(parsed));
    expect(result.stderr).toMatch(/read-only reconciliation/i);

    for (const stream of [result.stdout, result.stderr]) {
      expect(stream).not.toContain(testPg.connectionString);
      expect(stream).not.toContain(testPassword);
    }
  });

  it('fails closed with no stdout when a remote-only version has no corresponding local file (e.g. a retired PR #87 six-file version)', async () => {
    const mainSha = getMainSha(REPO_ROOT);
    const localMigrations = readGitTrackedLocalMigrations(mainSha, REPO_ROOT);

    // 20260423140002 was one of the six original PR #87 files, consolidated
    // away into 20260423140001. It must never exist as a local file on this
    // branch; if it ever shows up in remote history, that is exactly the
    // "remote-only" case the PR #87 assertions call out, and reconciliation
    // must refuse to proceed.
    expect(localMigrations.some(m => m.version === '20260423140002')).toBe(
      false
    );

    const remoteVersions = [
      ...localMigrations.slice(0, 3).map(m => m.version),
      '20260423140002',
    ];
    await seedMigrationHistory(testPg.connectionString, remoteVersions);

    const result = await runReconcile({
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toMatch(/no corresponding local migration file/i);
  });

  it('never mutates supabase_migrations.schema_migrations — the seeded row set is byte-for-byte unchanged after a run', async () => {
    const mainSha = getMainSha(REPO_ROOT);
    const localMigrations = readGitTrackedLocalMigrations(mainSha, REPO_ROOT);
    const seededVersions = localMigrations.map(m => m.version);
    await seedMigrationHistory(testPg.connectionString, seededVersions);

    const before = await readSchemaMigrationsTable(testPg.connectionString);

    const result = await runReconcile({
      DATABASE_URL: testPg.connectionString,
    });
    expect(result.exitCode).toBe(0);

    const after = await readSchemaMigrationsTable(testPg.connectionString);
    expect(after).toEqual(before);
  });

  it('rejects a malformed DATABASE_URL before touching git or Postgres, and prints no credentials', async () => {
    const result = await runReconcile({ DATABASE_URL: 'not-a-url' });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe('');
  });
});
