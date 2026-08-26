'use strict';

/**
 * Classify security-scan exit status for GitHub Actions summaries.
 * Keep this mapping in sync with .github/workflows/security.yml.
 */

function classifyProductionAudit(exitCode) {
  return Number(exitCode) === 0 ? 'PASS' : 'FAIL';
}

function classifyFullAudit(exitCode) {
  if (exitCode === null || exitCode === undefined || exitCode === '') {
    return 'TOOL_ERROR';
  }
  const code = Number(exitCode);
  if (!Number.isInteger(code)) {
    return 'TOOL_ERROR';
  }
  if (code === 0) return 'PASS';
  if (code === 1) return 'ADVISORY_FINDINGS';
  return 'TOOL_ERROR';
}

function classifySnyk({ tokenPresent, ran, exitCode, githubOutcome }) {
  if (!tokenPresent) return 'SKIPPED_NO_TOKEN';
  if (typeof exitCode === 'number') {
    if (exitCode === 0) return 'PASS';
    if (exitCode === 1) return 'FINDINGS';
    return 'TOOL_ERROR';
  }
  if (githubOutcome === 'success') return 'PASS';
  if (githubOutcome === 'failure') return 'FINDINGS';
  if (ran === false) return 'TOOL_ERROR';
  return 'TOOL_ERROR';
}

function parseArgs(argv) {
  const [kind, ...rest] = argv;
  if (kind === 'prod' || kind === 'production') {
    return classifyProductionAudit(rest[0]);
  }
  if (kind === 'full') {
    return classifyFullAudit(rest[0]);
  }
  if (kind === 'snyk') {
    const tokenPresent = !rest.includes('--no-token');
    const outcomeIdx = rest.indexOf('--outcome');
    const exitIdx = rest.indexOf('--exit');
    const ran = !rest.includes('--did-not-run');
    const githubOutcome = outcomeIdx >= 0 ? rest[outcomeIdx + 1] : undefined;
    const exitCode = exitIdx >= 0 ? Number(rest[exitIdx + 1]) : undefined;
    return classifySnyk({
      tokenPresent,
      ran,
      exitCode: Number.isInteger(exitCode) ? exitCode : undefined,
      githubOutcome,
    });
  }
  throw new Error('Usage: classify-security-exit.cjs <prod|full|snyk> [args]');
}

module.exports = {
  classifyProductionAudit,
  classifyFullAudit,
  classifySnyk,
  parseArgs,
};

if (require.main === module) {
  process.stdout.write(`${parseArgs(process.argv.slice(2))}\n`);
}
