/** @jest-environment node */

/**
 * Real-process integration test: launches `scripts/production/db-probe.ts`
 * as an actual child process against an isolated local Postgres instance
 * (embedded-postgres — no Docker, no hosted/production database) and
 * asserts on captured stdout/stderr directly. This is the load-bearing
 * regression test for the stdout/JSON contract described in
 * db-probe.ts: `history` mode must write exactly one JSON document to
 * stdout and nothing else, because the workflow does
 * `db-probe.ts history | tee history.json` and then `JSON.parse()`s the
 * file — any stray stdout text breaks every deployment run before
 * mutation.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  parseLocalMigrationFilenames,
  reconcileMigrationVersions,
} from '../../../scripts/production/db-deploy-guards';
import {
  getTestPostgres,
  seedMigrationHistory,
  type TestPostgres,
} from './helpers/testPostgres';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const DB_PROBE_SCRIPT = path.join(
  REPO_ROOT,
  'scripts',
  'production',
  'db-probe.ts'
);

jest.setTimeout(60000);

type CliResult = { stdout: string; stderr: string; exitCode: number | null };

function runDbProbe(
  mode: string,
  env: Record<string, string>
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, [DB_PROBE_SCRIPT, mode], {
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

function readRealLocalMigrations() {
  const localDir = path.join(REPO_ROOT, 'supabase', 'migrations');
  const filenames = fs.readdirSync(localDir).filter(f => f.endsWith('.sql'));
  return parseLocalMigrationFilenames(filenames);
}

describe('db-probe.ts — real CLI process against an isolated local Postgres', () => {
  const testPg: TestPostgres = getTestPostgres();
  const testPassword = new URL(testPg.connectionString).password;

  it('emits pure JSON on stdout for `history`, matching the real interleaved local migration set, with all diagnostics on stderr', async () => {
    const localMigrations = readRealLocalMigrations();
    expect(localMigrations.length).toBeGreaterThan(0);

    // Interleaved subset (every other version) rather than a contiguous
    // prefix/suffix, exercising the same "real interleaved-set shape" as
    // production reconciliation.
    const remoteVersions = localMigrations
      .map(m => m.version)
      .filter((_, index) => index % 2 === 0);
    await seedMigrationHistory(testPg.connectionString, remoteVersions);

    const expected = reconcileMigrationVersions(
      localMigrations,
      remoteVersions
    );

    const result = await runDbProbe('history', {
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).toBe(0);

    // (3) JSON.parse(stdout) succeeds.
    const trimmed = result.stdout.trim();
    expect(() => JSON.parse(trimmed)).not.toThrow();
    const parsed = JSON.parse(trimmed);

    expect(parsed).toEqual({
      localVersionCount: expected.localVersionCount,
      remoteUniqueVersionCount: expected.remoteUniqueVersionCount,
      remoteOnlyVersionCount: 0,
      pendingMigrationCount: expected.pendingMigrationCount,
      firstPendingVersion: expected.pendingVersions[0] ?? null,
      lastPendingVersion: expected.pendingVersions.at(-1) ?? null,
      pendingDigest: expected.pendingDigest,
      latestApplied: expected.latestApplied,
      salePriceMigrationPending:
        expected.pendingVersions.includes('20260804010000'),
      saleLifecycleMigrationPending:
        expected.pendingVersions.includes('20260804020000'),
    });

    // (4) stdout contains no target/log prefix — the whole trimmed stdout
    // is exactly the JSON document, nothing before or after it.
    expect(result.stdout).not.toMatch(/target/i);
    expect(result.stdout).not.toMatch(/migration-history read/i);
    expect(trimmed).toBe(JSON.stringify(parsed));

    // (5) stderr contains only sanitized diagnostics, including the target
    // description and the reconciliation summary.
    expect(result.stderr).toMatch(/migration-history read/i);
    expect(result.stderr).toMatch(/target/i);

    // (6) no connection URL or credential in either stream.
    for (const stream of [result.stdout, result.stderr]) {
      expect(stream).not.toContain(testPg.connectionString);
      expect(stream).not.toContain(testPassword);
      expect(stream).not.toContain(`:${testPg.port}`);
    }
  });

  it('reports salePriceMigrationPending as a single bounded boolean, true only when 20260804010000 is actually pending', async () => {
    const localMigrations = readRealLocalMigrations();
    const hasSalePriceMigration = localMigrations.some(
      m => m.version === '20260804010000'
    );

    if (!hasSalePriceMigration) {
      // 20260804010000 ships in the PR that introduces the migration file
      // itself; on a checkout that doesn't have it yet, it can never be
      // pending, and the field must reflect that rather than erroring.
      await seedMigrationHistory(testPg.connectionString, []);
      const result = await runDbProbe('history', {
        DATABASE_URL: testPg.connectionString,
      });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.salePriceMigrationPending).toBe(false);
      return;
    }

    // Not yet applied remotely -> pending -> true.
    await seedMigrationHistory(
      testPg.connectionString,
      localMigrations
        .map(m => m.version)
        .filter(version => version !== '20260804010000')
    );
    const pendingResult = await runDbProbe('history', {
      DATABASE_URL: testPg.connectionString,
    });
    expect(
      JSON.parse(pendingResult.stdout.trim()).salePriceMigrationPending
    ).toBe(true);

    // Already applied remotely -> not pending -> false.
    await seedMigrationHistory(
      testPg.connectionString,
      localMigrations.map(m => m.version)
    );
    const convergedResult = await runDbProbe('history', {
      DATABASE_URL: testPg.connectionString,
    });
    expect(
      JSON.parse(convergedResult.stdout.trim()).salePriceMigrationPending
    ).toBe(false);
  });

  it('reports saleLifecycleMigrationPending as a single bounded boolean, true only when 20260804020000 is actually pending, independent of salePriceMigrationPending', async () => {
    const localMigrations = readRealLocalMigrations();
    const hasLifecycleMigration = localMigrations.some(
      m => m.version === '20260804020000'
    );

    if (!hasLifecycleMigration) {
      await seedMigrationHistory(testPg.connectionString, []);
      const result = await runDbProbe('history', {
        DATABASE_URL: testPg.connectionString,
      });
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed.saleLifecycleMigrationPending).toBe(false);
      return;
    }

    // Neither sale-price nor sale-lifecycle applied remotely -> both
    // pending, and reported as two independent booleans, not conflated.
    await seedMigrationHistory(
      testPg.connectionString,
      localMigrations
        .map(m => m.version)
        .filter(
          version =>
            version !== '20260804010000' && version !== '20260804020000'
        )
    );
    const bothPendingResult = await runDbProbe('history', {
      DATABASE_URL: testPg.connectionString,
    });
    const bothPendingParsed = JSON.parse(bothPendingResult.stdout.trim());
    expect(bothPendingParsed.salePriceMigrationPending).toBe(true);
    expect(bothPendingParsed.saleLifecycleMigrationPending).toBe(true);

    // Only sale-price applied remotely -> lifecycle still pending, price no
    // longer pending.
    await seedMigrationHistory(
      testPg.connectionString,
      localMigrations
        .map(m => m.version)
        .filter(version => version !== '20260804020000')
    );
    const onlyPriceAppliedResult = await runDbProbe('history', {
      DATABASE_URL: testPg.connectionString,
    });
    const onlyPriceAppliedParsed = JSON.parse(
      onlyPriceAppliedResult.stdout.trim()
    );
    expect(onlyPriceAppliedParsed.salePriceMigrationPending).toBe(false);
    expect(onlyPriceAppliedParsed.saleLifecycleMigrationPending).toBe(true);

    // Both applied remotely -> neither pending.
    await seedMigrationHistory(
      testPg.connectionString,
      localMigrations.map(m => m.version)
    );
    const bothAppliedResult = await runDbProbe('history', {
      DATABASE_URL: testPg.connectionString,
    });
    const bothAppliedParsed = JSON.parse(bothAppliedResult.stdout.trim());
    expect(bothAppliedParsed.salePriceMigrationPending).toBe(false);
    expect(bothAppliedParsed.saleLifecycleMigrationPending).toBe(false);
  });

  it('emits pure JSON for `history` even at zero pending (fully converged)', async () => {
    const localMigrations = readRealLocalMigrations();
    const allVersions = localMigrations.map(m => m.version);
    await seedMigrationHistory(testPg.connectionString, allVersions);

    const result = await runDbProbe('history', {
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.pendingMigrationCount).toBe(0);
    expect(parsed.firstPendingVersion).toBeNull();
    expect(parsed.lastPendingVersion).toBeNull();
  });

  it('`probe` mode succeeds against the isolated Postgres and leaks nothing sensitive', async () => {
    const result = await runDbProbe('probe', {
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toMatch(/read-only connectivity probe/i);

    for (const stream of [result.stdout, result.stderr]) {
      expect(stream).not.toContain(testPg.connectionString);
      expect(stream).not.toContain(testPassword);
    }
  });

  it('fails closed with no stdout when remote history contains a version with no local file', async () => {
    const localMigrations = readRealLocalMigrations();
    const remoteVersions = [
      ...localMigrations.slice(0, 3).map(m => m.version),
      '99999999999999',
    ];
    await seedMigrationHistory(testPg.connectionString, remoteVersions);

    const result = await runDbProbe('history', {
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toMatch(/no corresponding local migration file/i);
  });

  it('fails closed with no stdout on duplicate remote history', async () => {
    const localMigrations = readRealLocalMigrations();
    const oneVersion = localMigrations[0].version;
    await seedMigrationHistory(testPg.connectionString, [
      oneVersion,
      oneVersion,
    ]);

    const result = await runDbProbe('history', {
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toMatch(/duplicate/i);
  });
});
