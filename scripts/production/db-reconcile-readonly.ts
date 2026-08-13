#!/usr/bin/env tsx
/**
 * Authoritative, READ-ONLY production migration reconciliation.
 *
 * Runnable on its own via
 * .github/workflows/production-db-reconcile.yml, independent of
 * production-db-deploy.yml (which contains the real `supabase db push`
 * mutation path and must never be used as a reconciliation dry-run).
 *
 * `supabase migration list --linked` is NOT an approved reconciliation
 * mechanism for this repository: it was observed attempting
 * `ALTER ROLE cli_login_postgres ...` against production, i.e. a write,
 * despite being framed as a read-only listing command. This script never
 * invokes the Supabase CLI at all. The only migration-history query it runs
 * is a plain `SELECT version FROM supabase_migrations.schema_migrations`,
 * issued through the `pg` driver inside a transaction whose read-only mode
 * is verified at the Postgres session level (`SHOW transaction_read_only`
 * must return `on`, not merely assumed from `BEGIN READ ONLY` succeeding),
 * and the transaction always ends in `ROLLBACK`, never `COMMIT`.
 *
 * Endpoint identity (Supabase session-pooler host, exact project-ref match,
 * port 5432, sslmode=require) is enforced by the workflow's separate
 * `scripts/production/db-probe.ts validate-only` step before this script
 * ever runs, reusing validateProductionEndpoint in db-deploy-guards.ts
 * rather than duplicating that check here — this keeps this script
 * connectable to the isolated local Postgres instance used by
 * tests/integration/production/*.integration.test.ts, the same reason
 * postflight-catalog.ts and db-probe.ts's `history`/`probe` modes only do
 * structural validation.
 *
 * Local migrations are derived only from git-tracked files at the
 * checked-out `main` commit (`git ls-tree`), never from filesystem
 * directory enumeration, so an untracked or gitignored `.sql` file can
 * never affect the reconciled set.
 *
 * Never logs DATABASE_URL, hostnames, credentials, or project refs. Stdout
 * contract: exactly one JSON report document and nothing else; all
 * diagnostics go to stderr.
 *
 * Usage: tsx scripts/production/db-reconcile-readonly.ts
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';
import { Client } from 'pg';
import {
  describeDatabaseUrlSafely,
  parseLocalMigrationFilenames,
  reconcileMigrationVersions,
  summarizePendingVersions,
  validateDatabaseUrlStructure,
  type LocalMigration,
  type MigrationReconciliation,
} from './db-deploy-guards';

// PR #87 (fix/instrument-sale-transition-migration-consolidation-20260813)
// folded the six-file update_instrument_sale_transition_atomic migration
// chain (20260423140001-20260423140006) into a single file kept under
// version 20260423140001. These are defense-in-depth assertions layered on
// top of the general reconciliation below: reconcileMigrationVersions
// already fails closed if any retired version shows up remotely (it would
// be remote-only history with no local file), but these give that specific
// regression a named, unambiguous error instead of a generic one, and also
// catch the retired versions reappearing locally (which would silently
// defeat that remote-only check).
export const PR_87_CONSOLIDATED_VERSION = '20260423140001';
export const PR_87_RETIRED_VERSIONS = [
  '20260423140002',
  '20260423140003',
  '20260423140004',
  '20260423140005',
  '20260423140006',
] as const;

export function assertPr87MigrationInvariant(
  localVersions: readonly string[]
): void {
  const localSet = new Set(localVersions);

  if (!localSet.has(PR_87_CONSOLIDATED_VERSION)) {
    throw new Error(
      `PR #87 invariant violated: local migration set is missing the consolidated version ${PR_87_CONSOLIDATED_VERSION}.`
    );
  }

  const reappeared = PR_87_RETIRED_VERSIONS.filter(v => localSet.has(v));
  if (reappeared.length > 0) {
    throw new Error(
      `PR #87 invariant violated: retired six-file migration version(s) reappeared in the local migration set: ${reappeared.join(', ')}. These were consolidated into ${PR_87_CONSOLIDATED_VERSION} and must never exist as separate local migration files again.`
    );
  }
}

/** Reads the checked-out `main` commit SHA from git — never an input. */
export function getMainSha(cwd: string = process.cwd()): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

/**
 * Enumerates local migration filenames from the git tree object at `sha`
 * (never the filesystem/working tree), scoped to `supabase/migrations`.
 * Equivalent in spirit to `git ls-files`, but reads the commit object
 * directly so the result reflects exactly what is committed at `sha`
 * regardless of any local working-tree or index state.
 */
export function readGitTrackedLocalMigrations(
  sha: string,
  cwd: string = process.cwd()
): LocalMigration[] {
  const output = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', sha, '--', 'supabase/migrations'],
    { cwd, encoding: 'utf8' }
  );
  const filenames = output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => path.basename(line));
  return parseLocalMigrationFilenames(filenames);
}

/**
 * Begins a read-only transaction and verifies, at the Postgres session
 * level, that read-only mode actually took effect — not merely that
 * `BEGIN READ ONLY` returned without error. Throws unless
 * `SHOW transaction_read_only` reports exactly `on`.
 */
export async function assertReadOnlyTransactionActive(
  client: Client
): Promise<void> {
  await client.query('BEGIN READ ONLY');
  const result = await client.query<{ transaction_read_only: string }>(
    'SHOW transaction_read_only'
  );
  const value = result.rows[0]?.transaction_read_only;
  if (value !== 'on') {
    throw new Error(
      `Read-only transaction enforcement failed: SHOW transaction_read_only returned "${value}", expected "on". Refusing to read migration history.`
    );
  }
}

/**
 * Opens a connection, enforces a verified read-only transaction, runs the
 * single approved migration-history query inside it, and always rolls back
 * — even on success, since a read-only transaction never has anything to
 * commit.
 */
export async function readRemoteVersionsReadOnly(
  databaseUrl: string
): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await assertReadOnlyTransactionActive(client);
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    const result = await client.query<{ version: string }>(
      'SELECT version FROM supabase_migrations.schema_migrations'
    );
    return result.rows.map(row => row.version);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Best-effort cleanup only — this transaction never issued a write,
      // so there is nothing load-bearing to roll back. A failed ROLLBACK
      // here (e.g. connection already broken by an earlier error) must
      // never mask the original error.
    }
    await client.end();
  }
}

export type ReconciliationReport = {
  mainSha: string;
  localVersionCount: number;
  remoteUniqueVersionCount: number;
  remoteOnlyVersions: string[];
  pendingVersions: string[];
  pendingMigrationCount: number;
  firstPendingVersion: string | null;
  lastPendingVersion: string | null;
  /** Informational only — never used as a readiness signal. */
  latestApplied: string | null;
  pendingDigest: string;
};

export function buildReport(
  mainSha: string,
  reconciliation: MigrationReconciliation
): ReconciliationReport {
  const summary = summarizePendingVersions(reconciliation);
  return {
    mainSha,
    localVersionCount: reconciliation.localVersionCount,
    remoteUniqueVersionCount: reconciliation.remoteUniqueVersionCount,
    remoteOnlyVersions: reconciliation.remoteOnlyVersions,
    pendingVersions: reconciliation.pendingVersions,
    pendingMigrationCount: summary.pendingMigrationCount,
    firstPendingVersion: summary.firstPendingVersion,
    lastPendingVersion: summary.lastPendingVersion,
    latestApplied: reconciliation.latestApplied,
    pendingDigest: summary.pendingDigest,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  validateDatabaseUrlStructure(databaseUrl);
  console.error(
    `Target: ${JSON.stringify(describeDatabaseUrlSafely(databaseUrl as string))}`
  );

  const mainSha = getMainSha();
  console.error(
    `Reconciling against git-tracked local migrations at ${mainSha}.`
  );

  const localMigrations = readGitTrackedLocalMigrations(mainSha);
  assertPr87MigrationInvariant(localMigrations.map(m => m.version));

  const remoteVersions = await readRemoteVersionsReadOnly(
    databaseUrl as string
  );

  const reconciliation = reconcileMigrationVersions(
    localMigrations,
    remoteVersions
  );
  const report = buildReport(mainSha, reconciliation);

  console.error(
    `Read-only reconciliation: ${report.localVersionCount} local, ${report.remoteUniqueVersionCount} remote, ${report.pendingMigrationCount} pending (digest ${report.pendingDigest.slice(0, 12)}...).`
  );

  process.stdout.write(`${JSON.stringify(report)}\n`);
}

// Guards against main() running as a side effect of Jest importing this
// module's other exports (assertPr87MigrationInvariant, buildReport, etc.)
// in db-reconcile-readonly.test.ts. When Jest imports the module directly,
// process.argv[1] is Jest's own entry point, not this file, so this is
// false; when tsx runs this file as the actual CLI entry (both real usage
// and the spawned-child-process integration tests), it is true.
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
