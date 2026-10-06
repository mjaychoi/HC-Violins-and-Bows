#!/usr/bin/env tsx
/**
 * ONE-OFF, READ-ONLY schema audit for issue #154.
 *
 * Answers exactly one question, per environment: do
 * `public.instrument_images` and `public.instrument_certificates` actually
 * have an `org_id` column in a hosted database? The repository's migrations
 * never create one (both tables are tenant-scoped transitively through
 * `instrument_id -> instruments.org_id`), yet the generated
 * `src/types/database.ts` declared one on both tables until PR #153
 * (`bdf16bd`) removed it. A generator reads its output from a live
 * database, so either that database had the columns (real drift) or the
 * file was hand-edited. This script settles that, read-only.
 *
 * This file is intentionally disposable: it ships on a throwaway branch
 * whose pull request is closed, never merged.
 *
 * Safety properties, all enforced at runtime rather than assumed:
 *   - the only SQL issued is ONE `SELECT` against `information_schema`,
 *     pinned in `AUDIT_QUERY` and validated by `assertQueryIsReadOnly()`
 *     before any connection is opened;
 *   - it runs inside `BEGIN READ ONLY`, and read-only mode is verified at
 *     the Postgres session level (`SHOW transaction_read_only` must return
 *     exactly `on`) rather than inferred from `BEGIN` succeeding;
 *   - a `SET LOCAL statement_timeout` bounds the read;
 *   - the transaction always ends in `ROLLBACK`, never `COMMIT`;
 *   - no DDL, no DML, no migrations, and the Supabase CLI is never invoked.
 *
 * TLS and CA handling are delegated to the existing
 * `scripts/production/database-client-config.ts` rather than reimplemented,
 * so hosted certificate verification behaves identically to the production
 * reconciliation and staging reset paths.
 *
 * Never prints the connection string, credentials, hostnames, or project
 * refs. Stdout contract: exactly one JSON document and nothing else; all
 * diagnostics go to stderr.
 *
 * Usage: AUDIT_LABEL=staging AUDIT_DATABASE_URL=... tsx scripts/oneoff/issue-154-child-table-org-id-audit.ts
 */
import { pathToFileURL } from 'url';
import { Client } from 'pg';
import { createDatabaseClientConfig } from '../production/database-client-config';

/** The two tables under audit. Nothing else is inspected. */
export const AUDITED_TABLES = [
  'instrument_certificates',
  'instrument_images',
] as const;

const STATEMENT_TIMEOUT = '10000ms';

/**
 * The single approved query. Returns one row per audited table with only
 * the two facts issue #154 asks for: whether `org_id` is present, and the
 * table's actual column list. `actual_columns` is NULL when the table does
 * not exist at all, which is reported distinctly from "exists without
 * org_id" — the two mean very different things and must not be conflated.
 *
 * The `::text` cast on `column_name` is load-bearing: that column's type is
 * `information_schema.sql_identifier`, and node-postgres has no array
 * parser registered for it, so without the cast `array_agg` comes back as
 * the raw literal string `{a,b,c}` instead of a parsed JS array.
 */
export const AUDIT_QUERY = `
SELECT
  t.table_name,
  (SELECT count(*)::int
     FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name   = t.table_name
      AND c.column_name  = 'org_id') AS org_id_present,
  (SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position)
     FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name   = t.table_name) AS actual_columns
FROM (VALUES ('instrument_images'), ('instrument_certificates')) AS t(table_name)
ORDER BY t.table_name
`.trim();

/**
 * Statement-level allowlist. Guards against this disposable script ever
 * being edited into something that writes: the query must be a single
 * `SELECT` with no statement separator and no mutating keyword.
 */
const FORBIDDEN_SQL = [
  'insert',
  'update',
  'delete',
  'drop',
  'alter',
  'create',
  'truncate',
  'grant',
  'revoke',
  'comment',
  'copy',
  'call',
  'do',
  'vacuum',
  'refresh',
  'commit',
  'merge',
  'set ',
] as const;

export function assertQueryIsReadOnly(sql: string): void {
  const normalized = sql.trim().toLowerCase();

  if (!normalized.startsWith('select')) {
    throw new Error('Audit query must begin with SELECT. Refusing to run.');
  }
  if (normalized.includes(';')) {
    throw new Error(
      'Audit query must be a single statement with no ";" separator. Refusing to run.'
    );
  }
  for (const keyword of FORBIDDEN_SQL) {
    if (normalized.includes(keyword)) {
      throw new Error(
        `Audit query contains the forbidden keyword "${keyword.trim()}". Refusing to run.`
      );
    }
  }
}

/**
 * Begins a read-only transaction and verifies read-only mode took effect at
 * the Postgres session level. Mirrors
 * scripts/production/db-reconcile-readonly.ts.
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
      `Read-only transaction enforcement failed: SHOW transaction_read_only returned "${value}", expected "on". Refusing to read schema.`
    );
  }
}

export type TableAudit = {
  table: string;
  exists: boolean;
  orgIdPresent: boolean;
  actualColumns: string[];
};

type AuditRow = {
  table_name: string;
  org_id_present: number;
  actual_columns: string[] | null;
};

export function toAudits(rows: AuditRow[]): TableAudit[] {
  return rows.map(row => ({
    table: row.table_name,
    exists: row.actual_columns !== null,
    orgIdPresent: Number(row.org_id_present) > 0,
    actualColumns: row.actual_columns ?? [],
  }));
}

/**
 * Asserts the target database is the project this job intends to read, so a
 * misconfigured secret cannot silently point the audit at the wrong
 * environment. Compares against the host only; never prints either value.
 */
export function assertExpectedProjectRef(
  connectionString: string,
  expectedRef: string
): void {
  const ref = expectedRef.trim();
  if (!ref) {
    throw new Error(
      'EXPECTED_PROJECT_REF is required so the audit cannot read an unintended database.'
    );
  }
  if (!connectionString.includes(ref)) {
    throw new Error(
      'The configured database URL does not reference the expected project ref for this environment. Refusing to connect.'
    );
  }
}

export async function auditReadOnly(
  databaseUrl: string
): Promise<TableAudit[]> {
  assertQueryIsReadOnly(AUDIT_QUERY);

  const client = new Client(createDatabaseClientConfig(databaseUrl));
  await client.connect();
  try {
    await assertReadOnlyTransactionActive(client);
    await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
    const result = await client.query<AuditRow>(AUDIT_QUERY);
    return toAudits(result.rows);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Best-effort cleanup only. This transaction issued no write, so
      // there is nothing load-bearing to roll back, and a failed ROLLBACK
      // (e.g. an already-broken connection) must never mask the real error.
    }
    await client.end();
  }
}

function renderMarkdown(label: string, audits: TableAudit[]): string {
  const lines = [
    `#### ${label}`,
    '',
    '| table | org_id_present | actual columns |',
    '| --- | --- | --- |',
  ];

  for (const audit of audits) {
    const columns = audit.exists
      ? `\`${audit.actualColumns.join(', ')}\``
      : '_table not present_';
    lines.push(
      `| \`${audit.table}\` | **${audit.orgIdPresent ? 1 : 0}** | ${columns} |`
    );
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const label = process.env.AUDIT_LABEL?.trim();
  const databaseUrl = process.env.AUDIT_DATABASE_URL?.trim();
  const expectedRef = process.env.EXPECTED_PROJECT_REF?.trim() ?? '';

  if (!label) {
    throw new Error('AUDIT_LABEL is required (e.g. "staging").');
  }
  if (!databaseUrl) {
    throw new Error(
      'AUDIT_DATABASE_URL is required and was empty. Refusing to continue.'
    );
  }

  assertExpectedProjectRef(databaseUrl, expectedRef);

  const audits = await auditReadOnly(databaseUrl);
  const drifted = audits.filter(a => a.orgIdPresent).map(a => a.table);

  // stdout: exactly one JSON document.
  process.stdout.write(
    `${JSON.stringify({ environment: label, audits, drifted }, null, 2)}\n`
  );

  // Human-readable copy goes to the job summary, never to stdout.
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const { appendFileSync } = await import('fs');
    appendFileSync(summaryPath, `${renderMarkdown(label, audits)}\n\n`);
  }

  if (drifted.length > 0) {
    console.error(
      `DRIFT DETECTED in ${label}: org_id exists on ${drifted.join(', ')}. Reported, not modified — this audit never issues DDL.`
    );
  } else {
    console.error(
      `No org_id drift in ${label}: neither audited table has an org_id column.`
    );
  }
}

// Mirrors scripts/production/db-reconcile-readonly.ts: only run main() when
// this file is the actual CLI entry point, so importing its exports (for the
// local verification in the pull request description) has no side effects.
function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
