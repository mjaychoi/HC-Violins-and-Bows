/** @jest-environment node */

/**
 * Real-process integration test: launches
 * `scripts/production/run-predeploy-audit.ts` as an actual child process
 * against an isolated local Postgres instance (embedded-postgres — no
 * Docker, no hosted/production database) and asserts on captured
 * stdout/stderr/exit-code and on the database itself. This is the
 * regression test for the pre-deploy audit gate described in
 * docs/PRODUCTION_MIGRATION_WORKFLOW.md: every one of a gated migration's
 * audit statements must return zero rows or the deploy job must stop before
 * `supabase db push`, and the audit itself must never write anything.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from 'pg';
import { getTestPostgres, type TestPostgres } from './helpers/testPostgres';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const TSX_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
const SCRIPT = path.join(
  REPO_ROOT,
  'scripts',
  'production',
  'run-predeploy-audit.ts'
);

jest.setTimeout(60000);

type CliResult = { stdout: string; stderr: string; exitCode: number | null };

function runAudit(
  sqlFile: string,
  expectedStatementCount: string,
  env: Record<string, string>
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, [SCRIPT, sqlFile, expectedStatementCount], {
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

function writeFixture(sql: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hcvb-predeploy-audit-'));
  const file = path.join(dir, 'audit.sql');
  fs.writeFileSync(file, sql, 'utf8');
  return file;
}

describe('run-predeploy-audit.ts — real CLI process against an isolated local Postgres', () => {
  const testPg: TestPostgres = getTestPostgres();
  const testPassword = new URL(testPg.connectionString).password;

  beforeAll(async () => {
    const client = new Client({ connectionString: testPg.connectionString });
    await client.connect();
    try {
      await client.query('DROP TABLE IF EXISTS predeploy_audit_fixture');
      await client.query(
        'CREATE TABLE predeploy_audit_fixture (id serial primary key, flagged boolean NOT NULL)'
      );
      await client.query(
        'INSERT INTO predeploy_audit_fixture (flagged) VALUES (false), (false), (true)'
      );
    } finally {
      await client.end();
    }
  });

  it('passes and emits pure JSON when every audit statement returns zero rows', async () => {
    const sqlFile = writeFixture(
      [
        '-- 1) always empty',
        'SELECT * FROM predeploy_audit_fixture WHERE 1 = 0;',
        '-- 2) also always empty',
        'SELECT * FROM predeploy_audit_fixture WHERE id < 0;',
      ].join('\n')
    );

    const result = await runAudit(sqlFile, '2', {
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed).toEqual({
      sqlFile,
      statementCount: 2,
      results: [
        { index: 1, rowCount: 0 },
        { index: 2, rowCount: 0 },
      ],
      passed: true,
    });
    expect(result.stderr).toMatch(/passed: all audits returned zero rows/i);

    for (const stream of [result.stdout, result.stderr]) {
      expect(stream).not.toContain(testPg.connectionString);
      expect(stream).not.toContain(testPassword);
    }
  });

  it('fails when any statement returns a non-zero row count, even one documented as informational', async () => {
    const sqlFile = writeFixture(
      [
        '-- 1) empty',
        'SELECT * FROM predeploy_audit_fixture WHERE 1 = 0;',
        '-- 2) informational only, expected non-empty on a healthy tenant — still fails the gate',
        'SELECT * FROM predeploy_audit_fixture WHERE flagged = true;',
      ].join('\n')
    );

    const result = await runAudit(sqlFile, '2', {
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.passed).toBe(false);
    expect(parsed.results[1]).toEqual({ index: 2, rowCount: 1 });
    expect(result.stderr).toMatch(/FAILED.*indexes: 2/i);
  });

  it('fails closed on a SQL error partway through and never commits (read-only enforced by Postgres)', async () => {
    const sqlFile = writeFixture(
      [
        '-- 1) valid',
        'SELECT * FROM predeploy_audit_fixture WHERE 1 = 0;',
        '-- 2) attempted write — must be rejected by the READ ONLY transaction',
        'INSERT INTO predeploy_audit_fixture (flagged) VALUES (false);',
      ].join('\n')
    );

    const result = await runAudit(sqlFile, '2', {
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toMatch(/read-only/i);

    const client = new Client({ connectionString: testPg.connectionString });
    await client.connect();
    try {
      const count = await client.query(
        'SELECT COUNT(*)::int AS n FROM predeploy_audit_fixture'
      );
      expect(count.rows[0].n).toBe(3);
    } finally {
      await client.end();
    }
  });

  it('fails closed when the parsed statement count does not match the expected count (tamper/edit detection)', async () => {
    const sqlFile = writeFixture(
      'SELECT * FROM predeploy_audit_fixture WHERE 1 = 0;'
    );

    const result = await runAudit(sqlFile, '9', {
      DATABASE_URL: testPg.connectionString,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toMatch(/has 1 statement\(s\), expected exactly 9/i);
  });

  it('fails closed when the audit file does not exist', async () => {
    const result = await runAudit(
      path.join(os.tmpdir(), 'does-not-exist-audit.sql'),
      '9',
      { DATABASE_URL: testPg.connectionString }
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toMatch(/not found/i);
  });
});
