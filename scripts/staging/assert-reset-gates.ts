#!/usr/bin/env tsx
/**
 * CLI for hosted staging database-reset gates.
 *
 * Usage:
 *   tsx scripts/staging/assert-reset-gates.ts confirm
 *   tsx scripts/staging/assert-reset-gates.ts guard
 *   tsx scripts/staging/assert-reset-gates.ts inventory
 *   tsx scripts/staging/assert-reset-gates.ts classify
 *
 * Does not print secrets or connection strings.
 */
import fs from 'fs';
import { pathToFileURL } from 'url';
import {
  classifyResetOutcome,
  evaluateResetDispatchGates,
  isResetClassification,
  parseOptionalCount,
  readCheckedOutCanonicalMigrations,
  ResetGateError,
  assertResetSafetyGates,
} from './reset-gates';

function envOrEmpty(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function writeGithubOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile || /[\r\n]/.test(value)) {
    return;
  }
  fs.appendFileSync(outputFile, `${name}=${value}\n`);
}

function confirm(): void {
  const decision = evaluateResetDispatchGates({
    resetStagingConfirmed: envOrEmpty('RESET_STAGING_CONFIRMED'),
    expectedStagingProjectRef: envOrEmpty('EXPECTED_STAGING_PROJECT_REF'),
    configuredStagingProjectRef: envOrEmpty('STAGING_SUPABASE_PROJECT_REF'),
  });

  if (!decision.eligible) {
    writeGithubOutput('eligible', 'false');
    writeGithubOutput('explicit_confirmation', 'false');
    writeGithubOutput('classification', decision.classification);
    console.error(decision.classification);
    console.error(decision.reason);
    process.exit(1);
  }

  writeGithubOutput('eligible', 'true');
  writeGithubOutput('explicit_confirmation', 'true');
  writeGithubOutput('classification', 'eligible');
  console.log(
    'Reset confirmation accepted. Expected ref matches the configured staging ref.'
  );
}

function guard(): void {
  try {
    assertResetSafetyGates(process.env);
  } catch (error) {
    const classification =
      error instanceof ResetGateError
        ? error.classification
        : 'BLOCKED_SAFETY_GUARD';
    const message = error instanceof Error ? error.message : String(error);
    writeGithubOutput('target_verified', 'false');
    writeGithubOutput(
      'production_rejected',
      /production/i.test(message) ? 'true' : 'false'
    );
    writeGithubOutput('classification', classification);
    console.error(classification);
    console.error(message);
    process.exit(1);
  }

  writeGithubOutput('target_verified', 'true');
  writeGithubOutput('production_rejected', 'true');
  writeGithubOutput('classification', '');
  console.log(
    JSON.stringify({
      ok: true,
      targetVerified: true,
      productionRejected: true,
      localFallbackRejected: true,
    })
  );
}

function inventory(): void {
  const recorded = readCheckedOutCanonicalMigrations();
  if (
    recorded.migrationCount < 1 ||
    !recorded.firstMigration ||
    !recorded.lastMigration
  ) {
    console.error(
      'BLOCKED_SAFETY_GUARD: checked-out canonical migration set is empty.'
    );
    process.exit(1);
  }
  writeGithubOutput('count', String(recorded.migrationCount));
  writeGithubOutput('first', recorded.firstMigration);
  writeGithubOutput('last', recorded.lastMigration);
  process.stdout.write(
    `${JSON.stringify({
      migrationCount: recorded.migrationCount,
      firstMigration: recorded.firstMigration,
      lastMigration: recorded.lastMigration,
    })}\n`
  );
}

function classify(): void {
  const classification = classifyResetOutcome({
    confirmClassification: envOrEmpty('RESET_CONFIRM_CLASSIFICATION'),
    guardOutcome: envOrEmpty('RESET_GUARD_OUTCOME'),
    guardClassification: envOrEmpty('RESET_GUARD_CLASSIFICATION'),
    probeOutcome: envOrEmpty('RESET_PROBE_OUTCOME'),
    tlsVerified: envOrEmpty('RESET_TLS_VERIFIED') === 'true',
    resetExecuted: envOrEmpty('RESET_EXECUTED') === 'true',
    resetCommandOutcome: envOrEmpty('RESET_COMMAND_OUTCOME'),
    equalityOutcome: envOrEmpty('RESET_EQUALITY_OUTCOME'),
    verifySetOutcome: envOrEmpty('RESET_VERIFY_SET_OUTCOME'),
    postflightOutcome: envOrEmpty('RESET_POSTFLIGHT_OUTCOME'),
    postflightPassed: envOrEmpty('RESET_POSTFLIGHT_PASSED') === 'true',
    objectsOutcome: envOrEmpty('RESET_OBJECTS_OUTCOME'),
    sqlAuditsOutcome: envOrEmpty('RESET_SQL_AUDITS_OUTCOME'),
    remoteOnlyAfter: parseOptionalCount(envOrEmpty('RESET_REMOTE_ONLY_AFTER')),
    localOnlyAfter: parseOptionalCount(envOrEmpty('RESET_LOCAL_ONLY_AFTER')),
    remoteCountAfter: parseOptionalCount(
      envOrEmpty('RESET_REMOTE_COUNT_AFTER')
    ),
    localCount: parseOptionalCount(envOrEmpty('RESET_LOCAL_COUNT')),
  });
  if (!isResetClassification(classification)) {
    throw new Error('Reset classification was not one of the allowed values.');
  }
  process.stdout.write(`${classification}\n`);
}

function main(): void {
  const mode = process.argv[2];
  if (mode === 'confirm') {
    confirm();
    return;
  }
  if (mode === 'guard') {
    guard();
    return;
  }
  if (mode === 'inventory') {
    inventory();
    return;
  }
  if (mode === 'classify') {
    classify();
    return;
  }
  throw new Error(
    `Unknown mode "${mode ?? ''}". Expected one of: confirm, guard, inventory, classify.`
  );
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
