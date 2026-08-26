#!/usr/bin/env tsx
/**
 * Writes a secret-safe hosted staging migration-rehearsal evidence file.
 * Usage: tsx scripts/staging/write-rehearsal-evidence.ts [outputPath]
 */
import fs from 'fs';
import path from 'path';
import { STAGING_REHEARSAL_CLASSIFICATIONS } from './rehearsal-gates';

const FORBIDDEN_SUBSTRINGS = [
  'postgres://',
  'postgresql://',
  'eyJ',
  'service_role',
  'PASSWORD=',
  'password=',
];

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function assertSecretSafe(value: string, label: string): void {
  const lower = value.toLowerCase();
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(needle.toLowerCase())) {
      throw new Error(
        `Refusing to write rehearsal evidence: ${label} looks like a secret.`
      );
    }
  }
}

function main(): void {
  const outputPath = path.resolve(
    process.argv[2] ?? 'staging-migration-rehearsal.json'
  );

  const classification = env('REHEARSAL_FINAL_CLASSIFICATION');
  if (
    !STAGING_REHEARSAL_CLASSIFICATIONS.includes(
      classification as (typeof STAGING_REHEARSAL_CLASSIFICATIONS)[number]
    )
  ) {
    throw new Error(
      `Unknown rehearsal classification "${classification || '(empty)'}".`
    );
  }

  const evidence = {
    repositorySha: env('REHEARSAL_SHA'),
    workflowRunId: env('GITHUB_RUN_ID'),
    recordedAtUtc: new Date().toISOString(),
    targetClassification: 'hosted-staging',
    productionTargetRejected: true,
    productionDatabaseTouched: 'NO',
    supabaseCliVersion: env('REHEARSAL_CLI_VERSION'),
    rehearsalMode: env('REHEARSAL_MODE'),
    localMigrationCount: env('REHEARSAL_LOCAL_COUNT'),
    remoteCountBefore: env('REHEARSAL_REMOTE_BEFORE'),
    pendingCountBefore: env('REHEARSAL_PENDING_BEFORE'),
    pendingDigest: env('REHEARSAL_PENDING_DIGEST'),
    firstPendingVersion: env('REHEARSAL_FIRST_PENDING') || null,
    lastPendingVersion: env('REHEARSAL_LAST_PENDING') || null,
    predeployAudits: {
      salePrice: env('REHEARSAL_SALE_PRICE_AUDIT'),
      saleLifecycle: env('REHEARSAL_SALE_LIFECYCLE_AUDIT'),
    },
    migrationApplyExecuted: env('REHEARSAL_APPLY_EXECUTED') === 'true',
    migrationApplyResult: env('REHEARSAL_APPLY_RESULT') || 'not_run',
    remoteCountAfter: env('REHEARSAL_REMOTE_AFTER') || null,
    pendingCountAfter: env('REHEARSAL_PENDING_AFTER') || null,
    authoritativePostflight: env('REHEARSAL_POSTFLIGHT') || 'not_run',
    stagingMigrationSetVerification:
      env('REHEARSAL_MIGRATION_SET') || 'not_run',
    hostedSqlAudits: env('REHEARSAL_SQL_AUDITS') || 'not_run',
    health: env('REHEARSAL_HEALTH') || 'not_run',
    readiness: env('REHEARSAL_READINESS') || 'not_run',
    synthetic: env('REHEARSAL_SYNTHETIC') || 'not_run',
    finalClassification: classification,
  };

  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  assertSecretSafe(serialized, 'evidence document');
  fs.writeFileSync(outputPath, serialized, 'utf8');
  process.stdout.write(serialized);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
