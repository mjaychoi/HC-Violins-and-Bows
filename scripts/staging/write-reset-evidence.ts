#!/usr/bin/env tsx
/**
 * Secret-safe evidence for a hosted staging database reset.
 * Usage: tsx scripts/staging/write-reset-evidence.ts [outputPath]
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { EnvMap } from './env-guard';
import {
  isPreflightBlockReason,
  isResetClassification,
  parseOptionalCount,
  POST_RESET_ACCEPTANCE_RECREATION,
  type PreflightBlockReason,
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

function envValue(env: EnvMap, name: string): string {
  return env[name]?.trim() ?? '';
}

function parseTriState(raw: string): boolean | null {
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return null;
}

function parsePreflightCause(raw: string): PreflightBlockReason | null {
  return isPreflightBlockReason(raw) ? raw : null;
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

export function buildResetEvidence(env: EnvMap) {
  const classification = envValue(env, 'RESET_FINAL_CLASSIFICATION');
  if (!isResetClassification(classification)) {
    throw new Error(
      `Unknown reset classification "${classification || '(empty)'}".`
    );
  }

  const postflightPassed =
    envValue(env, 'RESET_POSTFLIGHT_PASSED') === 'true'
      ? true
      : envValue(env, 'RESET_POSTFLIGHT_OUTCOME') === 'failure'
        ? false
        : null;
  const catalogPostflight =
    outcomeLabel(
      envValue(env, 'RESET_POSTFLIGHT_OUTCOME'),
      postflightPassed
    ) === 'pass' &&
    outcomeLabel(envValue(env, 'RESET_OBJECTS_OUTCOME')) === 'pass'
      ? 'pass'
      : outcomeLabel(
            envValue(env, 'RESET_POSTFLIGHT_OUTCOME'),
            postflightPassed
          ) === 'fail' ||
          outcomeLabel(envValue(env, 'RESET_OBJECTS_OUTCOME')) === 'fail'
        ? 'fail'
        : 'not_run';

  return {
    checkedOutSha: envValue(env, 'RESET_CHECKED_OUT_SHA'),
    targetVerified: envValue(env, 'RESET_TARGET_VERIFIED') === 'true',
    productionRejected: envValue(env, 'RESET_PRODUCTION_REJECTED') === 'true',
    explicitConfirmation:
      envValue(env, 'RESET_EXPLICIT_CONFIRMATION') === 'true',
    clientConnectionVerified:
      envValue(env, 'RESET_CLIENT_CONNECTION_VERIFIED') === 'true',
    select1Passed: envValue(env, 'RESET_SELECT1_PASSED') === 'true',
    clientTlsVerificationConfigured:
      envValue(env, 'RESET_CLIENT_TLS_VERIFICATION_CONFIGURED') === 'true',
    backendPgStatSsl: parseTriState(envValue(env, 'RESET_BACKEND_PG_STAT_SSL')),
    clientTransportEncrypted: parseTriState(
      envValue(env, 'RESET_CLIENT_TRANSPORT_ENCRYPTED')
    ),
    clientTransportAuthorized: parseTriState(
      envValue(env, 'RESET_CLIENT_TRANSPORT_AUTHORIZED')
    ),
    preflightCause: parsePreflightCause(envValue(env, 'RESET_PREFLIGHT_CAUSE')),
    tlsVerified: envValue(env, 'RESET_TLS_VERIFIED') === 'true',
    preResetRemoteMigrationCount: parseOptionalCount(
      envValue(env, 'RESET_PRE_REMOTE_COUNT')
    ),
    resetExecuted: envValue(env, 'RESET_EXECUTED') === 'true',
    localMigrationCount: parseOptionalCount(envValue(env, 'RESET_LOCAL_COUNT')),
    remoteMigrationCountAfter: parseOptionalCount(
      envValue(env, 'RESET_REMOTE_COUNT_AFTER')
    ),
    remoteOnlyAfter: parseOptionalCount(
      envValue(env, 'RESET_REMOTE_ONLY_AFTER')
    ),
    localOnlyAfter: parseOptionalCount(envValue(env, 'RESET_LOCAL_ONLY_AFTER')),
    catalogPostflight,
    sqlAudits: outcomeLabel(envValue(env, 'RESET_SQL_AUDITS_OUTCOME')),
    finalClassification: classification,
    acceptanceRecreationRequired: POST_RESET_ACCEPTANCE_RECREATION,
    githubVercelTargetsChanged: false,
  };
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

function main(): void {
  const evidence = buildResetEvidence(process.env);

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
