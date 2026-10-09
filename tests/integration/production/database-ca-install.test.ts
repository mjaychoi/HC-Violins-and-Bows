/** @jest-environment node */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('production database CA installation', () => {
  let root: string;
  let pem: string;
  let runner: string;
  let githubEnv: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'production-ca-'));
    const certPath = path.join(root, 'test.crt');
    const generated = spawnSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=Local CA Fixture',
      '-keyout',
      path.join(root, 'test.key'),
      '-out',
      certPath,
    ]);
    if (generated.status !== 0)
      throw new Error('Could not create local test CA.');
    pem = fs.readFileSync(certPath, 'utf8');
  });

  beforeEach(() => {
    runner = fs.mkdtempSync(path.join(root, 'runner-'));
    githubEnv = path.join(runner, 'github-env');
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  function install(overrides: Partial<NodeJS.ProcessEnv> = {}) {
    return spawnSync('bash', ['scripts/production/install-database-ca.sh'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PRODUCTION_DATABASE_CA_CERT: pem,
        RUNNER_TEMP: runner,
        GITHUB_ENV: githubEnv,
        ...overrides,
      },
    });
  }

  it('installs a parseable CA privately outside the workspace without logging it', () => {
    const result = install();
    expect(result.status).toBe(0);
    const installed = path.join(runner, 'production-database-ca.crt');
    expect(fs.readFileSync(installed, 'utf8')).toContain(pem.trim());
    expect(fs.statSync(installed).mode & 0o777).toBe(0o600);
    const exported = fs.readFileSync(githubEnv, 'utf8');
    expect(exported).toContain(`DATABASE_CA_CERT_PATH=${installed}\n`);
    expect(exported).toContain('DATABASE_CA_CERT_REQUIRED=true\n');
    expect(`${result.stdout}${result.stderr}${exported}`).not.toContain(
      pem.trim()
    );
    expect(`${result.stdout}${result.stderr}${exported}`).not.toContain(
      'BEGIN CERTIFICATE'
    );
  });

  it('fails without the production CA even when staging material is available', () => {
    const result = install({
      PRODUCTION_DATABASE_CA_CERT: '',
      STAGING_DATABASE_CA_CERT: pem,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PRODUCTION_DATABASE_CA_CERT is required');
    expect(fs.existsSync(githubEnv)).toBe(false);
    expect(fs.existsSync(path.join(runner, 'production-database-ca.crt'))).toBe(
      false
    );
  });

  it.each(['RUNNER_TEMP', 'GITHUB_ENV'])('fails without %s', name => {
    const result = install({ [name]: '' });
    expect(result.status).not.toBe(0);
    expect(fs.existsSync(githubEnv)).toBe(false);
  });

  it('rejects malformed PEM contents, removes the file, and exports no trust configuration', () => {
    const secret = 'PRIVATEINVALIDCERTIFICATEBODY';
    const result = install({
      PRODUCTION_DATABASE_CA_CERT: `-----BEGIN CERTIFICATE-----\n${secret}\n-----END CERTIFICATE-----`,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not a valid PEM certificate');
    expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
    expect(fs.existsSync(githubEnv)).toBe(false);
    expect(fs.existsSync(path.join(runner, 'production-database-ca.crt'))).toBe(
      false
    );
  });
});
