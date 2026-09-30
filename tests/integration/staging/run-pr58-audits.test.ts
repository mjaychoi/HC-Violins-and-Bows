/** @jest-environment node */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const stagingRef = 'stagingexample1234';
const productionRef = 'prodrefexample9999';
const passwordMarker = 'auditdbpasswordmarker';
const certMarker = 'AUDITCACERTMARKERMUSTNOTBELOGGED';

const serviceRoleKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0YWdpbmdleGFtcGxlMTIzNCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTk1NzM0NTIwMH0.signature';

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

function runAudits(env: NodeJS.ProcessEnv, binDir: string) {
  return spawnSync('bash', ['scripts/staging/run-pr58-audits.sh'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...env,
      PATH: `${binDir}${path.delimiter}${env.PATH ?? ''}`,
    },
  });
}

describe('run-pr58-audits.sh hosted rehearsal guard', () => {
  let dir = '';
  let binDir = '';
  let logPath = '';
  let caPath = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr58-audits-'));
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

  function combined(result: { stdout: string; stderr: string }): string {
    return `${result.stdout}\n${result.stderr}`;
  }

  it('runs with hosted staging identity and no application URL', () => {
    const script = fs.readFileSync(
      'scripts/staging/run-pr58-audits.sh',
      'utf8'
    );
    const invocations = script
      .split('\n')
      .map(line => line.trim())
      .filter(
        line => line.includes('env-guard-cli.ts') && !line.startsWith('#')
      );
    expect(invocations).toEqual([
      'npx tsx scripts/staging/env-guard-cli.ts --hosted-rehearsal >/dev/null',
    ]);
    expect(script).toContain(
      'DATABASE_CA_CERT_PATH is required for hosted PostgreSQL certificate verification.'
    );
    expect(script).toContain('format-libpq-verify-full-url.ts');
    expect(script).toContain('DB_URL="$STAGING_DATABASE_URL"');
    expect(script).not.toContain('STAGING_DATABASE_URL:-$DATABASE_URL');

    const result = runAudits(
      hostedIdentity({
        DATABASE_URL: stagingDatabaseUrl(productionRef),
        DATABASE_CA_CERT_PATH: caPath,
        DATABASE_CA_CERT_REQUIRED: 'true',
      }),
      binDir
    );

    const output = combined(result);
    expect(result.status).toBe(0);
    expect(output).toContain('All PR #58 audit suites passed.');
    expect(output).not.toContain(passwordMarker);
    expect(output).not.toContain(certMarker);
    expect(output).not.toContain('postgresql://');
    expect(output).not.toContain(productionRef);

    const log = fs.readFileSync(logPath, 'utf8');
    const auditFiles = [...script.matchAll(/scripts\/supabase\/\S+\.sql/g)].map(
      match => match[0]
    );
    expect(auditFiles.length).toBeGreaterThan(0);
    expect(log.split('---').filter(chunk => chunk.trim()).length).toBe(
      auditFiles.length
    );
    for (const auditFile of auditFiles) {
      expect(log).toContain(auditFile);
    }
    expect(log).toContain(stagingRef);
    expect(log).not.toContain(productionRef);
    const firstUrl = log.split('\n')[0] ?? '';
    const params = new URLSearchParams(
      firstUrl.slice(firstUrl.indexOf('?') + 1)
    );
    expect(params.get('sslmode')).toBe('verify-full');
    expect(params.get('sslrootcert')).toBe(caPath);
  });

  it('rejects a production database before psql', () => {
    const result = runAudits(
      hostedIdentity({
        STAGING_DATABASE_URL: stagingDatabaseUrl(productionRef),
      }),
      binDir
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/production/i);
    expect(combined(result)).not.toContain(passwordMarker);
    expect(combined(result)).not.toContain('postgresql://');
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it('rejects a local database before psql', () => {
    const result = runAudits(
      hostedIdentity({
        STAGING_DATABASE_URL: `postgresql://postgres:${passwordMarker}@127.0.0.1:54322/postgres`,
      }),
      binDir
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/local/i);
    expect(combined(result)).not.toContain(passwordMarker);
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it('fails when staging identity is missing', () => {
    const missingRef = runAudits(
      hostedIdentity({ STAGING_SUPABASE_PROJECT_REF: '' }),
      binDir
    );
    expect(missingRef.status).not.toBe(0);
    expect(missingRef.stderr).toMatch(/incomplete|required/i);
    expect(fs.existsSync(logPath)).toBe(false);

    const missingUrl = runAudits(
      hostedIdentity({
        STAGING_DATABASE_URL: '',
        DATABASE_URL: `postgresql://postgres:${passwordMarker}@127.0.0.1:54322/postgres`,
      }),
      binDir
    );
    expect(missingUrl.status).not.toBe(0);
    expect(missingUrl.stderr).toMatch(/STAGING_DATABASE_URL is required/);
    expect(combined(missingUrl)).not.toContain(passwordMarker);
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it('still requires the CA before psql when certificate verification is mandatory', () => {
    const result = runAudits(
      hostedIdentity({
        DATABASE_CA_CERT_REQUIRED: 'true',
        DATABASE_CA_CERT_PATH: '',
      }),
      binDir
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/DATABASE_CA_CERT_PATH is required/);
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it('refuses a non-PEM CA before psql', () => {
    fs.writeFileSync(caPath, certMarker);
    const result = runAudits(
      hostedIdentity({
        DATABASE_CA_CERT_PATH: caPath,
        DATABASE_CA_CERT_REQUIRED: 'true',
      }),
      binDir
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/PEM certificate/i);
    expect(combined(result)).not.toContain(certMarker);
    expect(combined(result)).not.toContain(passwordMarker);
    expect(fs.existsSync(logPath)).toBe(false);
  });
});

describe('full hosted app validation still requires the application URL', () => {
  const workflow = fs.readFileSync(
    path.join(
      process.cwd(),
      '.github/workflows/hosted-staging-integration.yml'
    ),
    'utf8'
  );
  const hostedJob = workflow.match(
    /hosted-db-validation:[\s\S]*?(?=\n  [a-z0-9_-]+:|\n*$)/
  )?.[0];

  it('keeps the unflagged env guard before SQL audits in hosted-db-validation', () => {
    expect(hostedJob).toBeTruthy();
    const secretsStep = hostedJob!.slice(
      hostedJob!.indexOf('- name: Require hosted-staging secrets'),
      hostedJob!.indexOf('- name: Require production project-ref configuration')
    );
    expect(secretsStep).toContain('STAGING_APP_BASE_URL');
    const guardAt = hostedJob!.indexOf('- name: Staging environment guard');
    const guardStep = hostedJob!.slice(
      guardAt,
      hostedJob!.indexOf('- name: Verify migration inventory')
    );
    expect(guardStep).toContain(
      'run: npx tsx scripts/staging/env-guard-cli.ts'
    );
    expect(guardStep).not.toContain('--hosted-rehearsal');
    expect(hostedJob).not.toContain('--hosted-rehearsal');
    expect(hostedJob!.indexOf('run-pr58-audits.sh')).toBeGreaterThan(guardAt);
    expect(hostedJob!.indexOf('/api/health')).toBeGreaterThan(guardAt);
  });

  it('rejects deployed-app validation when the application URL is absent', () => {
    const env = hostedIdentity();
    const fullGuard = spawnSync(
      'npx',
      ['tsx', 'scripts/staging/env-guard-cli.ts'],
      { cwd: process.cwd(), encoding: 'utf8', env }
    );
    expect(fullGuard.status).not.toBe(0);
    expect(fullGuard.stderr).toMatch(/app base URL|incomplete/i);
    expect(`${fullGuard.stdout}\n${fullGuard.stderr}`).not.toContain(
      passwordMarker
    );

    const rehearsalGuard = spawnSync(
      'npx',
      ['tsx', 'scripts/staging/env-guard-cli.ts', '--hosted-rehearsal'],
      { cwd: process.cwd(), encoding: 'utf8', env }
    );
    expect(rehearsalGuard.status).toBe(0);
    expect(rehearsalGuard.stdout).toContain('"localFallbackRejected":true');
    expect(rehearsalGuard.stdout).toContain('"productionTargetRejected":true');
  });
});
