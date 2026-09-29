/** @jest-environment node */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SECRET_MARKER = 'CERTIFICATEBODYMUSTNOTBELOGGED';
const PEM = `-----BEGIN CERTIFICATE-----\n${SECRET_MARKER}\n-----END CERTIFICATE-----\n`;

function runInstall(env: NodeJS.ProcessEnv) {
  return spawnSync('bash', ['scripts/staging/install-database-ca.sh'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
}

describe('staging database CA install', () => {
  let dir = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-ca-install-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes the CA outside the workspace and does not print it', () => {
    const githubEnv = path.join(dir, 'github-env');
    const runnerTemp = path.join(dir, 'runner');
    fs.mkdirSync(runnerTemp);
    const result = runInstall({
      ...process.env,
      STAGING_DATABASE_CA_CERT: PEM,
      RUNNER_TEMP: runnerTemp,
      GITHUB_ENV: githubEnv,
    });

    const combined = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(0);
    expect(combined).not.toContain(SECRET_MARKER);
    expect(combined).not.toContain('BEGIN CERTIFICATE');
    expect(combined).toMatch(/contents not printed/);

    const installed = fs.readFileSync(
      path.join(runnerTemp, 'staging-database-ca.crt'),
      'utf8'
    );
    expect(installed).toContain('BEGIN CERTIFICATE');
    expect(installed).toContain(SECRET_MARKER);
    const mode = fs.statSync(
      path.join(runnerTemp, 'staging-database-ca.crt')
    ).mode;
    expect(mode & 0o777).toBe(0o600);

    const exported = fs.readFileSync(githubEnv, 'utf8');
    expect(exported).toContain('DATABASE_CA_CERT_PATH=');
    expect(exported).toContain('DATABASE_CA_CERT_REQUIRED=true');
    expect(exported).not.toContain(SECRET_MARKER);
    expect(exported).not.toContain('BEGIN CERTIFICATE');
  });

  it('fails clearly when the hosted CA secret is missing or not a PEM', () => {
    const githubEnv = path.join(dir, 'github-env');
    const runnerTemp = path.join(dir, 'runner');
    fs.mkdirSync(runnerTemp);

    const missing = runInstall({
      ...process.env,
      STAGING_DATABASE_CA_CERT: '',
      RUNNER_TEMP: runnerTemp,
      GITHUB_ENV: githubEnv,
    });
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toMatch(/STAGING_DATABASE_CA_CERT is required/);
    expect(missing.stdout).not.toContain(SECRET_MARKER);

    const invalid = runInstall({
      ...process.env,
      STAGING_DATABASE_CA_CERT: SECRET_MARKER,
      RUNNER_TEMP: runnerTemp,
      GITHUB_ENV: githubEnv,
    });
    expect(invalid.status).not.toBe(0);
    expect(invalid.stderr).toMatch(/not a PEM certificate/);
    expect(`${invalid.stdout}\n${invalid.stderr}`).not.toContain(SECRET_MARKER);
    expect(
      fs.existsSync(path.join(runnerTemp, 'staging-database-ca.crt'))
    ).toBe(false);
  });
});
