#!/usr/bin/env tsx
/**
 * CLI wrapper for hosted staging migration-rehearsal gates.
 *
 * Usage:
 *   tsx scripts/staging/assert-rehearsal-gates.ts staging-db-url
 *   tsx scripts/staging/assert-rehearsal-gates.ts apply
 */
import {
  assertStagingDatabaseUrlPresent,
  evaluateApplyEligibility,
} from './rehearsal-gates';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function main(): void {
  const mode = process.argv[2];

  if (mode === 'staging-db-url') {
    assertStagingDatabaseUrlPresent(process.env.STAGING_DATABASE_URL);
    console.log('STAGING_DATABASE_URL is present (value not printed).');
    return;
  }

  if (mode === 'apply') {
    const result = evaluateApplyEligibility({
      confirmedSha: requireEnv('CONFIRMED_SHA'),
      actualSha: requireEnv('ACTUAL_SHA'),
      confirmedPendingCount: requireEnv('CONFIRMED_PENDING_COUNT'),
      actualPendingCount: requireEnv('ACTUAL_PENDING_COUNT'),
      confirmedPendingDigest: requireEnv('CONFIRMED_PENDING_DIGEST'),
      actualPendingDigest: requireEnv('ACTUAL_PENDING_DIGEST'),
      stagingMutationConfirmed: requireEnv('STAGING_MUTATION_CONFIRMED'),
      remoteOnlyCount: Number.parseInt(requireEnv('REMOTE_ONLY_COUNT'), 10),
    });

    process.stdout.write(`${JSON.stringify(result)}\n`);

    if (!result.eligible && result.classification !== 'NO_PENDING_MIGRATIONS') {
      console.error(result.reason);
      process.exit(1);
    }
    return;
  }

  throw new Error(
    `Unknown mode "${mode}". Expected one of: staging-db-url, apply.`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
