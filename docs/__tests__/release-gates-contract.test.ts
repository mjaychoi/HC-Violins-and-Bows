import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const root = process.cwd();

function read(pathFromRoot: string) {
  return readFileSync(join(root, pathFromRoot), 'utf8');
}

describe('release gate contracts', () => {
  const pkg = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
    packageManager: string;
    engines: { node: string };
  };
  const vercel = JSON.parse(read('vercel.json')) as {
    installCommand: string;
    buildCommand: string;
  };
  const security = read('.github/workflows/security.yml');
  const ci = read('.github/workflows/ci.yml');
  const codeQuality = read('.github/workflows/code-quality.yml');
  const deployment = read('docs/DEPLOYMENT.md');

  it('enforces zero-warning lint in the authoritative lint command', () => {
    expect(pkg.scripts.lint).toContain('eslint .');
    expect(pkg.scripts.lint).toContain('--max-warnings=0');
  });

  it('fails the authoritative lint flags when a single warning is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lint-warning-'));
    const file = join(dir, 'unused-warning.js');
    writeFileSync(file, 'const unusedReleaseGateWarning = 1;\n');
    try {
      const result = spawnSync(
        process.execPath,
        [
          join(root, 'node_modules/eslint/bin/eslint.js'),
          file,
          '--max-warnings=0',
        ],
        { cwd: root, encoding: 'utf8' }
      );
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/unused/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps GitHub CI and Vercel on lockfile installs and Node 20 / npm 11.7.0', () => {
    expect(pkg.packageManager).toBe('npm@11.7.0');
    expect(pkg.engines.node).toBe('20.x');
    expect(vercel.installCommand).toBe('npm ci');
    for (const workflow of [ci, codeQuality, security]) {
      expect(workflow).toMatch(/npm ci/);
      expect(workflow).not.toMatch(/^\s+run:\s+npm install\s*$/m);
    }
  });

  it('keeps deploy:build as check:env then schema:ready then build', () => {
    expect(pkg.scripts['deploy:build']).toBe(
      'npm run check:env && npm run schema:ready && npm run build'
    );
    expect(vercel.buildCommand).toBe('npm run deploy:build');
  });

  it('keeps production npm audit blocking at high severity for production deps', () => {
    const prodBlock = security.split('Audit production dependencies')[1];
    const prodStep = prodBlock.split('Audit full dependency tree')[0];
    expect(prodStep).toContain('npm audit --omit=dev --audit-level=high');
    expect(prodStep).not.toMatch(/continue-on-error:\s*true/);
    expect(prodStep).not.toContain('|| true');
  });

  it('labels full npm audit as advisory and Snyk missing-token as SKIPPED', () => {
    const fullBlock = security.split('Audit full dependency tree')[1];
    const fullStep = fullBlock.split('Check Snyk token')[0];
    expect(fullStep).toContain('npm audit --audit-level=high');
    expect(fullStep).toMatch(/continue-on-error:\s*true/);
    expect(security).toContain('ADVISORY_FINDINGS');
    expect(security).toContain('SKIPPED_NO_TOKEN');
    expect(security).toContain('FINDINGS_OR_TOOL_ERROR');
    expect(security).toContain('snyk --no-token');
    expect(security).not.toContain('|| true');
  });

  it('does not print SNYK_TOKEN or other credential values in the security workflow', () => {
    expect(security).not.toMatch(/echo\s+"?\$SNYK_TOKEN/);
    expect(security).not.toMatch(/echo\s+.*secrets\.SNYK_TOKEN/);
    expect(security).not.toContain('printenv');
    expect(security).toContain('GITHUB_STEP_SUMMARY');
  });

  it('documents required vs advisory vs operationally unverified release gates', () => {
    expect(deployment).toMatch(/Release gate matrix/i);
    expect(deployment).toMatch(/AUTOMATED \/ REQUIRED/i);
    expect(deployment).toMatch(/ADVISORY \/ SUPPLEMENTAL/i);
    expect(deployment).toMatch(/OPERATIONAL \/ NOT YET PROVEN/i);
    expect(deployment).toMatch(/zero-warning lint/i);
    expect(deployment).toMatch(/SKIPPED_NO_TOKEN/);
    expect(deployment).toMatch(/FINDINGS_OR_TOOL_ERROR/);
    expect(deployment).toMatch(/VERCEL_PREVIEW_UNRESOLVED|Vercel Preview/);
    expect(deployment).not.toMatch(/production release certified/i);
  });
});
