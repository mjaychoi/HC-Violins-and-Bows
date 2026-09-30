#!/usr/bin/env tsx
/**
 * Secret-safe evidence for a hosted staging database reset.
 * Usage: tsx scripts/staging/write-reset-evidence.ts [outputPath]
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  isResetClassification,
  parseOptionalCount,
  POST_RESET_ACCEPTANCE_RECREATION,
} from './reset-gates';

const FORBIDDEN_SUBSTRINGS = [
  'postgres://',
  'postgresql://',
  'eyJ',
  'service_role',
  'PASSWORD=',
  'password=',
  'sslrootcert=',
  'BEGIN CERTIFICATE',
];

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function assertSecretSafe(value: string): void {
  const lower = value.toLowerCase();
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(needle.toLowerCase())) {
      throw new Error(
        'Refusing to write reset evidence because it looks like a secret.'
      );
    }
  }
}

function outcomeLabel(
  outcome: string,
  passed: boolean | null = null
): 'pass' | 'fail' | 'not_run' {
  if (outcome === 'success' && passed !== false) {
    return 'pass';
  }
  if (outcome === 'failure' || passed === false) {
    return 'fail';
  }
  return 'not_run';
}

function main(): void {
  const classification = env('RESET_FINAL_CLASSIFICATION');
  if (!isResetClassification(classification)) {
    throw new Error(
      `Unknown reset classification "${classification || '(empty)'}".`
    );
  }

  const postflightPassed =
    env('RESET_POSTFLIGHT_PASSED') === 'true'
      ? true
      : env('RESET_POSTFLIGHT_OUTCOME') === 'failure'
        ? false
        : null;
  const catalogPostflight =
    outcomeLabel(env('RESET_POSTFLIGHT_OUTCOME'), postflightPassed) ===
      'pass' && outcomeLabel(env('RESET_OBJECTS_OUTCOME')) === 'pass'
      ? 'pass'
      : outcomeLabel(env('RESET_POSTFLIGHT_OUTCOME'), postflightPassed) ===
            'fail' || outcomeLabel(env('RESET_OBJECTS_OUTCOME')) === 'fail'
        ? 'fail'
        : 'not_run';

  const evidence = {
    checkedOutSha: env('RESET_CHECKED_OUT_SHA'),
    targetVerified: env('RESET_TARGET_VERIFIED') === 'true',
    productionRejected: env('RESET_PRODUCTION_REJECTED') === 'true',
    explicitConfirmation: env('RESET_EXPLICIT_CONFIRMATION') === 'true',
    tlsVerified: env('RESET_TLS_VERIFIED') === 'true',
    preResetRemoteMigrationCount: parseOptionalCount(
      env('RESET_PRE_REMOTE_COUNT')
    ),
    resetExecuted: env('RESET_EXECUTED') === 'true',
    localMigrationCount: parseOptionalCount(env('RESET_LOCAL_COUNT')),
    remoteMigrationCountAfter: parseOptionalCount(
      env('RESET_REMOTE_COUNT_AFTER')
    ),
    remoteOnlyAfter: parseOptionalCount(env('RESET_REMOTE_ONLY_AFTER')),
    localOnlyAfter: parseOptionalCount(env('RESET_LOCAL_ONLY_AFTER')),
    catalogPostflight,
    sqlAudits: outcomeLabel(env('RESET_SQL_AUDITS_OUTCOME')),
    finalClassification: classification,
    acceptanceRecreationRequired: POST_RESET_ACCEPTANCE_RECREATION,
    githubVercelTargetsChanged: false,
  };

  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  assertSecretSafe(serialized);

  const outputPath = path.resolve(process.argv[2] ?? 'staging-db-reset.json');
  fs.writeFileSync(outputPath, serialized);
  console.error(`Wrote reset evidence to ${path.basename(outputPath)}.`);
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
