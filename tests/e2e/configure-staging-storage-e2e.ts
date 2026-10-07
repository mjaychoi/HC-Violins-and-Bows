/**
 * CI step: decide the staging storage E2E mode and hand the app its storage
 * env. Fail-closed; see ./staging-storage.ts and
 * docs/ops/staging-storage-e2e.md.
 *
 *   npx tsx tests/e2e/configure-staging-storage-e2e.ts           # configure
 *   npx tsx tests/e2e/configure-staging-storage-e2e.ts --verify  # next step
 *
 * Configure: resolves the mode, writes `mode=<disabled|enabled>` to
 * $GITHUB_OUTPUT, and appends the app storage env to $GITHUB_ENV (only the
 * mode marker when disabled). Verify: re-resolves and proves the env later
 * steps actually see matches it (placeholder + no credentials when disabled;
 * the validated staging bucket, credentials, and e2e/<scopeKey> prefix when
 * enabled).
 *
 * Prints mode, reason, and the run-scoped object prefix only — never bucket
 * names, credentials, or URLs.
 *
 * Lives under tests/ (not scripts/) because it imports tests/e2e helpers and
 * .vercelignore drops tests/.
 */
import { appendFileSync } from 'fs';

import {
  assertEffectiveStorageEnv,
  assertInertPlaceholderStorageEnv,
  buildStagingStorageGithubEnv,
  resolveStagingStorageE2E,
} from './staging-storage';

function requireFile(name: 'GITHUB_ENV' | 'GITHUB_OUTPUT'): string {
  const file = process.env[name]?.trim();
  if (!file) {
    throw new Error(
      `${name} is not set; this step must run in GitHub Actions.`
    );
  }
  return file;
}

function main(): void {
  const resolution = resolveStagingStorageE2E(process.env);
  const verify = process.argv.includes('--verify');

  if (verify) {
    assertEffectiveStorageEnv(process.env, resolution);
  } else {
    if (resolution.mode === 'disabled') {
      assertInertPlaceholderStorageEnv(process.env);
    }
    appendFileSync(
      requireFile('GITHUB_ENV'),
      `${buildStagingStorageGithubEnv(resolution).join('\n')}\n`
    );
    appendFileSync(requireFile('GITHUB_OUTPUT'), `mode=${resolution.mode}\n`);
  }

  console.log(
    JSON.stringify({
      stagingStorage: resolution.mode,
      step: verify ? 'verify' : 'configure',
      ...(resolution.mode === 'disabled'
        ? {
            reason: resolution.reason,
            note: 'placeholder bucket, no credentials; storage-dependent E2E cannot run',
          }
        : { objectPrefix: resolution.objectPrefix }),
    })
  );
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Staging storage E2E configuration failed.'
  );
  process.exit(1);
}
