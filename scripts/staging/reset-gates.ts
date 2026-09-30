/**
 * Confirmation, identity, and classification gates for the disposable
 * hosted-staging database reset.
 *
 * Target selection uses the verified STAGING_DATABASE_URL only. Linked
 * project metadata under supabase/.temp is never read. Nothing in this
 * module logs secrets or connection strings.
 */
import fs from 'fs';
import path from 'path';
import tls from 'tls';
import type { ConnectionOptions } from 'tls';
import type { ClientConfig } from 'pg';
import {
  assertValidProjectRefFormat,
  extractProjectRefFromDatabaseUrl,
  loadHostedStagingRehearsalEnvironmentFromProcessEnv,
  normalizeProjectRefInput,
  type EnvMap,
  type StagingEnvironment,
} from './env-guard';
import { formatLibpqVerifyFullConnectionString } from '../production/database-client-config';

export const RESET_CLASSIFICATIONS = [
  'BLOCKED_MISSING_CONFIRMATION',
  'BLOCKED_TARGET_MISMATCH',
  'BLOCKED_SAFETY_GUARD',
  'RESET_COMMAND_FAILED',
  'RESET_FAILED_POSTFLIGHT',
  'RESET_EXECUTED_PASS',
] as const;

export type ResetClassification = (typeof RESET_CLASSIFICATIONS)[number];

export const POST_RESET_ACCEPTANCE_RECREATION = [
  'synthetic admin account',
  'auth-matrix admin/member fixtures',
  'app_base_url Vault secret',
  'orphan_cleanup_secret Vault secret',
] as const;

const MIGRATION_FILENAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

export const PREFLIGHT_BLOCK_REASONS = [
  'BLOCKED_CONNECTIVITY',
  'BLOCKED_TLS_CONFIGURATION',
  'BLOCKED_SELECT1',
] as const;

export type PreflightBlockReason = (typeof PREFLIGHT_BLOCK_REASONS)[number];

export class ResetGateError extends Error {
  readonly classification: ResetClassification;
  readonly preflightCause: PreflightBlockReason | null;

  constructor(
    classification: ResetClassification,
    message: string,
    preflightCause: PreflightBlockReason | null = null
  ) {
    super(message);
    this.name = 'ResetGateError';
    this.classification = classification;
    this.preflightCause = preflightCause;
  }
}

export type ResetDispatchDecision =
  | { eligible: true; approvedProjectRef: string }
  | {
      eligible: false;
      classification: Extract<
        ResetClassification,
        'BLOCKED_MISSING_CONFIRMATION' | 'BLOCKED_TARGET_MISMATCH'
      >;
      reason: string;
    };

/**
 * Mutation is permitted only when the operator typed the literal yes and
 * the expected ref equals the configured staging ref. This comparison does
 * not open a database connection.
 */
export function evaluateResetDispatchGates(input: {
  resetStagingConfirmed: string;
  expectedStagingProjectRef: string;
  configuredStagingProjectRef: string;
}): ResetDispatchDecision {
  if (input.resetStagingConfirmed.trim() !== 'yes') {
    return {
      eligible: false,
      classification: 'BLOCKED_MISSING_CONFIRMATION',
      reason:
        'reset_staging_confirmed must be the literal yes before any staging database reset.',
    };
  }

  let expected: string;
  let configured: string;
  try {
    expected = normalizeProjectRefInput(
      input.expectedStagingProjectRef,
      'expected_staging_project_ref'
    );
    configured = normalizeProjectRefInput(
      input.configuredStagingProjectRef,
      'STAGING_SUPABASE_PROJECT_REF'
    );
    assertValidProjectRefFormat(expected, 'expected_staging_project_ref');
    assertValidProjectRefFormat(configured, 'STAGING_SUPABASE_PROJECT_REF');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      eligible: false,
      classification: 'BLOCKED_TARGET_MISMATCH',
      reason: message,
    };
  }

  if (expected !== configured) {
    return {
      eligible: false,
      classification: 'BLOCKED_TARGET_MISMATCH',
      reason:
        'expected_staging_project_ref does not match STAGING_SUPABASE_PROJECT_REF.',
    };
  }

  return { eligible: true, approvedProjectRef: configured };
}

export function classifyStagingGuardFailure(
  message: string
): Extract<
  ResetClassification,
  'BLOCKED_TARGET_MISMATCH' | 'BLOCKED_SAFETY_GUARD'
> {
  if (/do not match|does not match approved staging ref/i.test(message)) {
    return 'BLOCKED_TARGET_MISMATCH';
  }
  return 'BLOCKED_SAFETY_GUARD';
}

export function assertResetSafetyGates(env: EnvMap): StagingEnvironment {
  try {
    return loadHostedStagingRehearsalEnvironmentFromProcessEnv(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ResetGateError(classifyStagingGuardFailure(message), message);
  }
}

export function assertVerifyFullDatabaseUrl(databaseUrl: string): void {
  const lower = databaseUrl.toLowerCase();
  if (
    lower.includes('sslmode=no-verify') ||
    lower.includes('sslmode=disable') ||
    lower.includes('rejectunauthorized=false') ||
    !lower.includes('sslmode=verify-full') ||
    !lower.includes('sslrootcert=')
  ) {
    throw new ResetGateError(
      'BLOCKED_SAFETY_GUARD',
      'Staging reset requires sslmode=verify-full and sslrootcert. Certificate verification stays enabled.'
    );
  }
}

/**
 * Argv for Supabase CLI 2.111.0. `--db-url` is mutually exclusive with
 * `--linked` and `--local`. `--yes` only acknowledges the CLI prompt after
 * the workflow gates have already passed; it is not the operator confirmation.
 */
export function buildStagingDbResetArgs(databaseUrl: string): string[] {
  if (!databaseUrl.trim()) {
    throw new ResetGateError(
      'BLOCKED_SAFETY_GUARD',
      'Refusing to build a staging reset command without a database URL.'
    );
  }
  return ['db', 'reset', '--db-url', databaseUrl, '--no-seed', '--yes'];
}

export function assertResetArgsIgnoreLinkedState(
  args: readonly string[]
): void {
  const forbidden = new Set(['--linked', '--local', 'link']);
  for (const arg of args) {
    if (
      forbidden.has(arg) ||
      arg.includes('project-ref') ||
      arg.includes('.temp')
    ) {
      throw new ResetGateError(
        'BLOCKED_SAFETY_GUARD',
        'Staging reset must use only the verified database URL. Linked project metadata and --linked are forbidden.'
      );
    }
  }
  if (args[0] !== 'db' || args[1] !== 'reset' || args[2] !== '--db-url') {
    throw new ResetGateError(
      'BLOCKED_SAFETY_GUARD',
      'Staging reset command must be supabase db reset --db-url.'
    );
  }
}

export type PreparedStagingDbReset = {
  args: string[];
  databaseUrl: string;
  approvedProjectRef: string;
};

export function prepareStagingDbReset(env: EnvMap): PreparedStagingDbReset {
  const decision = evaluateResetDispatchGates({
    resetStagingConfirmed: env.RESET_STAGING_CONFIRMED ?? '',
    expectedStagingProjectRef: env.EXPECTED_STAGING_PROJECT_REF ?? '',
    configuredStagingProjectRef:
      env.STAGING_SUPABASE_PROJECT_REF ?? env.STAGING_PROJECT_REF ?? '',
  });
  if (!decision.eligible) {
    throw new ResetGateError(decision.classification, decision.reason);
  }

  const environment = assertResetSafetyGates(env);
  if (environment.approvedProjectRef !== decision.approvedProjectRef) {
    throw new ResetGateError(
      'BLOCKED_TARGET_MISMATCH',
      'Approved staging ref changed between confirmation and the environment guard.'
    );
  }

  const caPath = env.DATABASE_CA_CERT_PATH?.trim() ?? '';
  if (env.DATABASE_CA_CERT_REQUIRED !== 'true' || !caPath) {
    throw new ResetGateError(
      'BLOCKED_SAFETY_GUARD',
      'DATABASE_CA_CERT_PATH is required and certificate verification must stay enabled.'
    );
  }

  let databaseUrl: string;
  try {
    databaseUrl = formatLibpqVerifyFullConnectionString(
      environment.databaseUrl,
      caPath
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ResetGateError('BLOCKED_SAFETY_GUARD', message);
  }

  assertVerifyFullDatabaseUrl(databaseUrl);
  const dbRef = extractProjectRefFromDatabaseUrl(databaseUrl);
  if (dbRef !== environment.approvedProjectRef) {
    throw new ResetGateError(
      'BLOCKED_TARGET_MISMATCH',
      'Verified reset URL does not identify the approved staging project.'
    );
  }
  if (databaseUrl.toLowerCase().includes(environment.productionProjectRef)) {
    throw new ResetGateError(
      'BLOCKED_SAFETY_GUARD',
      'Verified reset URL contains the production project ref.'
    );
  }

  const args = buildStagingDbResetArgs(databaseUrl);
  assertResetArgsIgnoreLinkedState(args);
  return {
    args,
    databaseUrl,
    approvedProjectRef: environment.approvedProjectRef,
  };
}

export type PreflightProbeSignals = {
  clientConnectionVerified: boolean;
  select1Passed: boolean;
  clientTlsVerificationConfigured: boolean;
  /**
   * Optional `pg_stat_ssl.ssl` observation for the Postgres backend.
   * Through a Supabase pooler this is not the runner's TLS session.
   * It must not set `tlsVerified`.
   */
  backendPgStatSsl: boolean | null;
};

export type PreflightProbeDecision = PreflightProbeSignals & {
  /** Client-side verification only. Independent of `backendPgStatSsl`. */
  tlsVerified: boolean;
  preflightCause: PreflightBlockReason | null;
};

const PREFLIGHT_BLOCK_MESSAGES: Record<PreflightBlockReason, string> = {
  BLOCKED_CONNECTIVITY:
    'BLOCKED_CONNECTIVITY: Pre-reset client connection or read-only transaction failed.',
  BLOCKED_TLS_CONFIGURATION:
    'BLOCKED_TLS_CONFIGURATION: Pre-reset client TLS verification is not configured. A trusted CA, rejectUnauthorized, and hostname verification are required.',
  BLOCKED_SELECT1: 'BLOCKED_SELECT1: Pre-reset SELECT 1 failed.',
};

export function preflightBlockMessage(cause: PreflightBlockReason): string {
  return PREFLIGHT_BLOCK_MESSAGES[cause];
}

export function isPreflightBlockReason(
  value: string
): value is PreflightBlockReason {
  return (PREFLIGHT_BLOCK_REASONS as readonly string[]).includes(value);
}

function trustedCaLoaded(ca: ConnectionOptions['ca']): boolean {
  if (typeof ca === 'string' || Buffer.isBuffer(ca)) {
    return ca.includes('-----BEGIN CERTIFICATE-----');
  }
  if (Array.isArray(ca)) {
    return ca.some(entry => trustedCaLoaded(entry));
  }
  return false;
}

/**
 * True only when the Node client config is the verified staging TLS path:
 * CA required, a PEM CA loaded, `rejectUnauthorized: true`, and
 * `tls.checkServerIdentity`. A boolean `ssl: true` or a disabled
 * verification flag is not enough.
 */
export function isClientTlsVerificationConfigured(
  env: EnvMap,
  config: ClientConfig
): boolean {
  if (env.DATABASE_CA_CERT_REQUIRED !== 'true') {
    return false;
  }
  const ssl = config.ssl;
  if (!ssl || typeof ssl !== 'object') {
    return false;
  }
  return (
    trustedCaLoaded(ssl.ca) &&
    ssl.rejectUnauthorized === true &&
    ssl.checkServerIdentity === tls.checkServerIdentity
  );
}

/**
 * Runner-side TLS proof for a Supabase pooler connection.
 *
 * `pg_stat_ssl` describes the Postgres backend session. That session is
 * not the GitHub runner → pooler TLS connection, so `backendPgStatSsl`
 * is ignored here. `tlsVerified` is true only when the client TLS config
 * is verified, the client connected, and `SELECT 1` returned 1.
 */
export function evaluatePreflightProbeSignals(
  input: PreflightProbeSignals
): PreflightProbeDecision {
  let preflightCause: PreflightBlockReason | null = null;
  if (!input.clientTlsVerificationConfigured) {
    preflightCause = 'BLOCKED_TLS_CONFIGURATION';
  } else if (!input.clientConnectionVerified) {
    preflightCause = 'BLOCKED_CONNECTIVITY';
  } else if (!input.select1Passed) {
    preflightCause = 'BLOCKED_SELECT1';
  }

  return {
    clientConnectionVerified: input.clientConnectionVerified,
    select1Passed: input.select1Passed,
    clientTlsVerificationConfigured: input.clientTlsVerificationConfigured,
    backendPgStatSsl: input.backendPgStatSsl,
    tlsVerified: preflightCause === null,
    preflightCause,
  };
}

export function assertPreflightProbeSignals(
  input: PreflightProbeSignals
): PreflightProbeDecision {
  const decision = evaluatePreflightProbeSignals(input);
  if (decision.preflightCause) {
    throw new ResetGateError(
      'BLOCKED_SAFETY_GUARD',
      preflightBlockMessage(decision.preflightCause),
      decision.preflightCause
    );
  }
  return decision;
}

export type CanonicalMigrationInventory = {
  migrationCount: number;
  firstMigration: string | null;
  lastMigration: string | null;
  versions: string[];
};

export function readCanonicalMigrationInventory(
  migrationsDir: string
): CanonicalMigrationInventory {
  const filenames = fs
    .readdirSync(migrationsDir)
    .filter(name => MIGRATION_FILENAME.test(name))
    .sort();
  const versions = filenames.map(name => {
    const match = MIGRATION_FILENAME.exec(name);
    return match?.[1] ?? name;
  });
  return {
    migrationCount: filenames.length,
    firstMigration: filenames[0] ?? null,
    lastMigration: filenames.at(-1) ?? null,
    versions,
  };
}

export function readCheckedOutCanonicalMigrations(
  repoRoot = process.cwd()
): CanonicalMigrationInventory {
  return readCanonicalMigrationInventory(
    path.join(repoRoot, 'supabase', 'migrations')
  );
}

export type MigrationSetComparison = {
  localMigrationCount: number;
  remoteMigrationCount: number;
  remoteOnlyCount: number;
  localOnlyCount: number;
  exact: boolean;
};

export function compareCanonicalMigrationSets(
  localVersions: readonly string[],
  remoteVersions: readonly string[]
): MigrationSetComparison {
  const localSet = new Set(localVersions);
  const remoteSet = new Set(remoteVersions);
  let remoteOnlyCount = 0;
  let localOnlyCount = 0;
  for (const version of remoteSet) {
    if (!localSet.has(version)) {
      remoteOnlyCount += 1;
    }
  }
  for (const version of localSet) {
    if (!remoteSet.has(version)) {
      localOnlyCount += 1;
    }
  }
  const exact =
    remoteOnlyCount === 0 &&
    localOnlyCount === 0 &&
    localVersions.length === remoteVersions.length &&
    localSet.size === localVersions.length &&
    remoteSet.size === remoteVersions.length &&
    localSet.size === remoteSet.size;

  return {
    localMigrationCount: localVersions.length,
    remoteMigrationCount: remoteVersions.length,
    remoteOnlyCount,
    localOnlyCount,
    exact,
  };
}

export function assertExactMigrationEquality(
  comparison: MigrationSetComparison
): void {
  if (
    !comparison.exact ||
    comparison.remoteOnlyCount !== 0 ||
    comparison.localOnlyCount !== 0 ||
    comparison.remoteMigrationCount !== comparison.localMigrationCount
  ) {
    throw new ResetGateError(
      'RESET_FAILED_POSTFLIGHT',
      'Post-reset migration history is not an exact match of the canonical local set.'
    );
  }
}

export type ResetOutcomeInput = {
  confirmClassification: string;
  guardOutcome: string;
  guardClassification: string;
  probeOutcome: string;
  tlsVerified: boolean;
  resetExecuted: boolean;
  resetCommandOutcome: string;
  equalityOutcome: string;
  verifySetOutcome: string;
  postflightOutcome: string;
  postflightPassed: boolean;
  objectsOutcome: string;
  sqlAuditsOutcome: string;
  remoteOnlyAfter: number | null;
  localOnlyAfter: number | null;
  remoteCountAfter: number | null;
  localCount: number | null;
};

function isExactPostResetSet(input: ResetOutcomeInput): boolean {
  return (
    input.equalityOutcome === 'success' &&
    input.verifySetOutcome === 'success' &&
    input.postflightOutcome === 'success' &&
    input.postflightPassed &&
    input.objectsOutcome === 'success' &&
    input.sqlAuditsOutcome === 'success' &&
    input.remoteOnlyAfter === 0 &&
    input.localOnlyAfter === 0 &&
    input.remoteCountAfter !== null &&
    input.localCount !== null &&
    input.remoteCountAfter === input.localCount
  );
}

export function classifyResetOutcome(
  input: ResetOutcomeInput
): ResetClassification {
  if (input.confirmClassification === 'BLOCKED_MISSING_CONFIRMATION') {
    return 'BLOCKED_MISSING_CONFIRMATION';
  }
  if (
    input.confirmClassification === 'BLOCKED_TARGET_MISMATCH' ||
    input.guardClassification === 'BLOCKED_TARGET_MISMATCH'
  ) {
    return 'BLOCKED_TARGET_MISMATCH';
  }
  if (
    input.guardOutcome !== 'success' ||
    input.probeOutcome !== 'success' ||
    !input.tlsVerified ||
    !input.resetExecuted
  ) {
    if (
      input.guardOutcome === 'success' &&
      input.probeOutcome === 'success' &&
      input.tlsVerified &&
      input.resetCommandOutcome === 'failure'
    ) {
      return 'RESET_COMMAND_FAILED';
    }
    return 'BLOCKED_SAFETY_GUARD';
  }
  if (input.resetCommandOutcome === 'failure') {
    return 'RESET_COMMAND_FAILED';
  }
  if (!isExactPostResetSet(input)) {
    return 'RESET_FAILED_POSTFLIGHT';
  }
  return 'RESET_EXECUTED_PASS';
}

export function parseOptionalCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

export function isResetClassification(
  value: string
): value is ResetClassification {
  return (RESET_CLASSIFICATIONS as readonly string[]).includes(value);
}
