/** @jest-environment node */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const stagingRef = 'stagingexample1234';
const productionRef = 'prodrefexample9999';
const passwordMarker = 'postflightpasswordmarker';
const certMarker = 'POSTFLIGHTCACERTMARKERMUSTNOTBELOGGED';

const serviceRoleKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0YWdpbmdleGFtcGxlMTIzNCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTk1NzM0NTIwMH0.signature';

const ROLLBACK_REGRESSION = [
  'scripts/supabase/tenant_reference_consistency.test.sql',
  'scripts/supabase/reference_integrity.test.sql',
  'scripts/supabase/reference_integrity_role_context.test.sql',
  'scripts/supabase/client_rpc_authenticated_runtime_compatibility.test.sql',
] as const;

const SELECT_ONLY = [
  'scripts/supabase/final_security_audit_readonly.sql',
  'scripts/supabase/final_security_audit_pg17_guard.sql',
  'scripts/supabase/production_hardening_audit.sql',
  'scripts/supabase/tenant_isolation_audit_readonly.sql',
  'scripts/supabase/release_validation_audit.sql',
] as const;

const PERSISTENT_MUTATION = [
  'scripts/supabase/final_security_audit.sql',
  'scripts/supabase/tenant_isolation_audit.sql',
] as const;

const FORBIDDEN_SQL =
  /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/;

const POSTFLIGHT_RUNNER = 'scripts/staging/run-pr58-postflight-audits.sh';
const OPERATIONAL_RUNNER = 'scripts/staging/run-pr58-audits.sh';

function listedSql(script: string): string[] {
  return [...script.matchAll(/scripts\/supabase\/[A-Za-z0-9_.-]+\.sql/g)].map(
    match => match[0]
  );
}

function codeLines(sql: string): string[] {
  return sql
    .split('\n')
    .map(line => line.replace(/--.*$/, '').trim())
    .filter(line => line.length > 0 && !line.startsWith('\\'));
}

function stagingDatabaseUrl(ref: string): string {
  return `postgresql://postgres.${ref}:${passwordMarker}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
}

function hostedIdentity(
  overrides: Record<string, string> = {}
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    STAGING_SUPABASE_PROJECT_REF: stagingRef,
    PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
    STAGING_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
    STAGING_SUPABASE_ANON_KEY: 'anon-key',
    STAGING_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    STAGING_DATABASE_URL: stagingDatabaseUrl(stagingRef),
    STAGING_APP_BASE_URL: '',
    AUTH_MATRIX_BASE_URL: '',
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    DATABASE_URL: '',
    ...overrides,
  };
}

function writeFakePsql(binDir: string, logPath: string): void {
  const psqlPath = path.join(binDir, 'psql');
  fs.writeFileSync(
    psqlPath,
    `#!/bin/sh\nprintf '%s\\n' "$@" >> ${JSON.stringify(logPath)}\nprintf '\\n---\\n' >> ${JSON.stringify(logPath)}\nexit 0\n`
  );
  fs.chmodSync(psqlPath, 0o755);
}

describe('non-persistent staging postflight audits', () => {
  const postflight = fs.readFileSync(POSTFLIGHT_RUNNER, 'utf8');
  const operational = fs.readFileSync(OPERATIONAL_RUNNER, 'utf8');
  const postflightFiles = listedSql(postflight);

  it('keeps persistent backfill SQL out of the postflight runner', () => {
    expect(postflightFiles).toEqual([...ROLLBACK_REGRESSION, ...SELECT_ONLY]);
    for (const file of PERSISTENT_MUTATION) {
      expect(postflightFiles).not.toContain(file);
      expect(postflight).not.toContain(file);
    }
    expect(operational).toContain('scripts/supabase/final_security_audit.sql');
    expect(operational).toContain(
      'scripts/supabase/tenant_isolation_audit.sql'
    );
    expect(
      fs.readFileSync('scripts/supabase/final_security_audit.sql', 'utf8')
    ).toContain('Safe backfills for rows whose org can be inferred');
    expect(
      fs.readFileSync('scripts/supabase/tenant_isolation_audit.sql', 'utf8')
    ).toContain('Safe one-time backfills where org_id is inferable');
  });

  it('keeps select-only audit files free of persistent DML and DDL', () => {
    for (const file of SELECT_ONLY) {
      const sql = fs.readFileSync(file, 'utf8');
      expect(sql).not.toMatch(FORBIDDEN_SQL);
      expect(sql).not.toContain('SET org_id');
    }
  });

  it('keeps regression mutations inside an outer transaction that cannot commit', () => {
    expect(postflight).toContain(
      'psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$audit"'
    );
    for (const file of ROLLBACK_REGRESSION) {
      const sql = fs.readFileSync(file, 'utf8');
      const lines = codeLines(sql);
      expect(sql).toContain('\\set ON_ERROR_STOP on');
      expect(lines[0]).toBe('BEGIN;');
      expect(lines[lines.length - 1]).toBe('ROLLBACK;');
      expect(sql).not.toMatch(/\bCOMMIT\b/);
      const beginAt = lines.indexOf('BEGIN;');
      const rollbackAt = lines.lastIndexOf('ROLLBACK;');
      expect(beginAt).toBe(0);
      expect(rollbackAt).toBe(lines.length - 1);
      expect(rollbackAt).toBeGreaterThan(beginAt);
    }
  });
});

describe('postflight audit runner safety gates', () => {
  let dir = '';
  let binDir = '';
  let logPath = '';
  let caPath = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr58-postflight-'));
    binDir = path.join(dir, 'bin');
    fs.mkdirSync(binDir);
    logPath = path.join(dir, 'psql.log');
    writeFakePsql(binDir, logPath);
    caPath = path.join(dir, 'staging-ca.crt');
    fs.writeFileSync(
      caPath,
      `-----BEGIN CERTIFICATE-----\n${certMarker}\n-----END CERTIFICATE-----\n`
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function runPostflight(env: NodeJS.ProcessEnv) {
    return spawnSync('bash', [POSTFLIGHT_RUNNER], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...env,
        PATH: `${binDir}${path.delimiter}${env.PATH ?? ''}`,
      },
    });
  }

  it('runs without an application URL and does not call persistent audits', () => {
    const result = runPostflight(
      hostedIdentity({
        DATABASE_URL: stagingDatabaseUrl(productionRef),
        DATABASE_CA_CERT_PATH: caPath,
        DATABASE_CA_CERT_REQUIRED: 'true',
      })
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(0);
    expect(output).toContain(
      'All non-persistent staging postflight audits passed.'
    );
    expect(output).not.toContain(passwordMarker);
    expect(output).not.toContain(certMarker);
    expect(output).not.toContain('postgresql://');
    expect(output).not.toContain(productionRef);

    const log = fs.readFileSync(logPath, 'utf8');
    for (const file of [...ROLLBACK_REGRESSION, ...SELECT_ONLY]) {
      expect(log).toContain(file);
    }
    for (const file of PERSISTENT_MUTATION) {
      expect(log).not.toContain(file);
    }
    const firstUrl = log.split('\n')[0] ?? '';
    const params = new URLSearchParams(
      firstUrl.slice(firstUrl.indexOf('?') + 1)
    );
    expect(params.get('sslmode')).toBe('verify-full');
    expect(params.get('sslrootcert')).toBe(caPath);
    expect(firstUrl).toContain(stagingRef);
    expect(firstUrl).not.toContain(productionRef);
  });

  it('rejects a production database before psql', () => {
    const result = runPostflight(
      hostedIdentity({
        STAGING_DATABASE_URL: stagingDatabaseUrl(productionRef),
      })
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/production/i);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(passwordMarker);
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it('rejects a local database before psql', () => {
    const result = runPostflight(
      hostedIdentity({
        STAGING_DATABASE_URL: `postgresql://postgres:${passwordMarker}@127.0.0.1:54322/postgres`,
      })
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/local/i);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(passwordMarker);
    expect(fs.existsSync(logPath)).toBe(false);
  });
});
