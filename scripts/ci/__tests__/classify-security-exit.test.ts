import { spawnSync } from 'child_process';
import { join } from 'path';

const { classifyFullAudit, classifyProductionAudit, classifySnyk, parseArgs } =
  require('../classify-security-exit.cjs') as {
    classifyFullAudit: (exitCode: number | null | undefined | string) => string;
    classifyProductionAudit: (exitCode: number | string) => string;
    classifySnyk: (opts: {
      tokenPresent: boolean;
      ran?: boolean;
      exitCode?: number;
      githubOutcome?: string;
    }) => string;
    parseArgs: (argv: string[]) => string;
  };

const script = join(process.cwd(), 'scripts/ci/classify-security-exit.cjs');

function runCli(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
  });
}

describe('classify-security-exit', () => {
  it('treats production audit exit 0 as PASS and any other code as FAIL', () => {
    expect(classifyProductionAudit(0)).toBe('PASS');
    expect(classifyProductionAudit(1)).toBe('FAIL');
    expect(classifyProductionAudit(2)).toBe('FAIL');
    expect(parseArgs(['prod', '0'])).toBe('PASS');
    expect(parseArgs(['prod', '1'])).toBe('FAIL');
  });

  it('keeps full-audit findings advisory instead of PASS', () => {
    expect(classifyFullAudit(0)).toBe('PASS');
    expect(classifyFullAudit(1)).toBe('ADVISORY_FINDINGS');
    expect(classifyFullAudit(2)).toBe('TOOL_ERROR');
    expect(classifyFullAudit(null)).toBe('TOOL_ERROR');
    expect(parseArgs(['full', '1'])).toBe('ADVISORY_FINDINGS');
  });

  it('classifies a missing Snyk token as SKIPPED_NO_TOKEN, not PASS', () => {
    expect(classifySnyk({ tokenPresent: false })).toBe('SKIPPED_NO_TOKEN');
    expect(parseArgs(['snyk', '--no-token'])).toBe('SKIPPED_NO_TOKEN');
    expect(parseArgs(['snyk', '--no-token'])).not.toBe('PASS');
  });

  it('classifies a successful Snyk scan as PASS and findings as FINDINGS', () => {
    expect(classifySnyk({ tokenPresent: true, githubOutcome: 'success' })).toBe(
      'PASS'
    );
    expect(classifySnyk({ tokenPresent: true, githubOutcome: 'failure' })).toBe(
      'FINDINGS'
    );
    expect(classifySnyk({ tokenPresent: true, exitCode: 0 })).toBe('PASS');
    expect(classifySnyk({ tokenPresent: true, exitCode: 1 })).toBe('FINDINGS');
    expect(classifySnyk({ tokenPresent: true, ran: false })).toBe('TOOL_ERROR');
    expect(
      classifySnyk({ tokenPresent: true, githubOutcome: 'cancelled' })
    ).toBe('TOOL_ERROR');
    expect(parseArgs(['snyk', '--outcome', 'success'])).toBe('PASS');
    expect(parseArgs(['snyk', '--outcome', 'failure'])).toBe('FINDINGS');
  });

  it('CLI stdout is only the classification label', () => {
    const skipped = runCli(['snyk', '--no-token']);
    expect(skipped.status).toBe(0);
    expect(skipped.stdout.trim()).toBe('SKIPPED_NO_TOKEN');
    expect(skipped.stdout).not.toMatch(/ghp_|sk-|eyJ|AKIA/);

    const findings = runCli(['full', '1']);
    expect(findings.stdout.trim()).toBe('ADVISORY_FINDINGS');
  });
});
