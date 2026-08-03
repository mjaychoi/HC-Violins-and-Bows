#!/usr/bin/env tsx
/**
 * Generic read-only pre-deploy audit runner for
 * .github/workflows/production-db-deploy.yml.
 *
 * Runs every top-level statement in a `.sql` audit file inside a single
 * `BEGIN READ ONLY` transaction, always ends with `ROLLBACK` (success or
 * failure — this script never commits anything), and fails closed if:
 *   - the file does not exist,
 *   - the number of statements parsed does not exactly equal
 *     `expectedStatementCount` (a stray/dropped statement is a configuration
 *     error, not a silent skip),
 *   - any statement returns one or more rows,
 *   - any statement errors (including a write statement, which the
 *     read-only transaction itself rejects).
 *
 * Currently wired to exactly one caller: the sale-price contract pre-deploy
 * audit (scripts/supabase/sale_price_predeploy_audit.sql, 9 statements),
 * conditional on migration 20260804010000 being in the pending set — see
 * SALE_PRICE_PRECISION_MIGRATION_VERSION in db-deploy-guards.ts and
 * docs/PRODUCTION_MIGRATION_WORKFLOW.md. Deliberately generic (sql file path
 * + expected statement count as arguments, not a hardcoded file/schema) so a
 * future migration-specific audit can reuse it without duplicating the
 * transaction/rollback/row-count-gate logic.
 *
 * Operator policy (see docs/PRODUCTION_MIGRATION_WORKFLOW.md): every
 * statement in the gated audit file blocks deployment if non-empty, even one
 * documented in the file's own comments as informational/expected-non-empty
 * on a healthy tenant. This script enforces that policy uniformly — it does
 * not special-case any statement index.
 *
 * Never mutates data (enforced by Postgres itself via `BEGIN READ ONLY`, not
 * merely by convention) and never logs the DATABASE_URL, credentials, host,
 * or project ref. Stdout contract: exactly one JSON document and nothing
 * else; all diagnostics go to stderr.
 *
 * Usage: tsx scripts/production/run-predeploy-audit.ts <sqlFilePath> <expectedStatementCount>
 */
import fs from 'fs';
import { Client } from 'pg';
import {
  describeDatabaseUrlSafely,
  splitSqlStatements,
  validateDatabaseUrlStructure,
} from './db-deploy-guards';

export type AuditStatementResult = {
  index: number;
  rowCount: number;
};

export type AuditResult = {
  sqlFile: string;
  statementCount: number;
  results: AuditStatementResult[];
  passed: boolean;
};

async function main() {
  const sqlFile = process.argv[2];
  const expectedStatementCountRaw = process.argv[3];
  const databaseUrl = process.env.DATABASE_URL;

  if (!sqlFile) {
    throw new Error(
      'Usage: run-predeploy-audit.ts <sqlFilePath> <expectedStatementCount>'
    );
  }
  if (!expectedStatementCountRaw || !/^\d+$/.test(expectedStatementCountRaw)) {
    throw new Error('<expectedStatementCount> must be a non-negative integer.');
  }
  const expectedStatementCount = Number.parseInt(expectedStatementCountRaw, 10);

  if (!fs.existsSync(sqlFile)) {
    throw new Error(
      `Pre-deploy audit file not found: ${sqlFile}. Refusing to deploy without the audit this migration requires.`
    );
  }

  const sql = fs.readFileSync(sqlFile, 'utf8');
  const statements = splitSqlStatements(sql);

  if (statements.length !== expectedStatementCount) {
    throw new Error(
      `Pre-deploy audit file ${sqlFile} has ${statements.length} statement(s), expected exactly ${expectedStatementCount}. Refusing to run a changed audit without explicit review.`
    );
  }

  validateDatabaseUrlStructure(databaseUrl);
  console.error(
    `Target: ${JSON.stringify(describeDatabaseUrlSafely(databaseUrl as string))}`
  );
  console.error(
    `Running pre-deploy audit: ${sqlFile} (${statements.length} statements, read-only transaction).`
  );

  const client = new Client({ connectionString: databaseUrl as string });
  await client.connect();

  let result: AuditResult;
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30000ms'");

    const results: AuditStatementResult[] = [];
    for (let i = 0; i < statements.length; i++) {
      const queryResult = await client.query(statements[i]);
      const rowCount = queryResult.rows.length;
      results.push({ index: i + 1, rowCount });
      console.error(`Audit ${i + 1}/${statements.length}: ${rowCount} row(s).`);
    }

    result = {
      sqlFile,
      statementCount: statements.length,
      results,
      passed: results.every(r => r.rowCount === 0),
    };
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure during teardown — the transaction is
      // read-only, so there is nothing it could have persisted.
    }
    await client.end();
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);

  if (!result.passed) {
    const nonZero = result.results.filter(r => r.rowCount !== 0);
    console.error(
      `Pre-deploy audit FAILED: ${nonZero.length} of ${result.statementCount} audit(s) returned non-zero rows (indexes: ${nonZero.map(r => r.index).join(', ')}). Refusing to deploy. Investigate before re-running.`
    );
    process.exit(1);
  }

  console.error('Pre-deploy audit passed: all audits returned zero rows.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
