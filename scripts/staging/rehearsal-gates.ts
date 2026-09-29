/**
 * Hosted staging migration-rehearsal confirmation gates.
 *
 * Reuses production SHA / pending-count / pending-digest acknowledgements.
 * Does not read secrets or log connection strings.
 */
import {
  assertOperatorAcknowledgement,
  assertPendingCountMatches,
  assertPendingDigestMatches,
  assertShaMatches,
  normalizePendingDigest,
  parseNonNegativeInteger,
} from '../production/db-deploy-guards';

export const STAGING_REHEARSAL_CLASSIFICATIONS = [
  'REHEARSAL_EXECUTED_PASS',
  'INSPECT_ONLY',
  'NO_PENDING_MIGRATIONS',
  'BLOCKED_MISSING_ENV',
  'BLOCKED_SAFETY_GUARD',
  'FAILED_PREFLIGHT',
  'FAILED_MIGRATION_APPLY',
  'FAILED_POSTFLIGHT',
] as const;

export type StagingRehearsalClassification =
  (typeof STAGING_REHEARSAL_CLASSIFICATIONS)[number];

export function assertStagingDatabaseUrlPresent(
  stagingDatabaseUrl: string | undefined | null
): string {
  const value = stagingDatabaseUrl?.trim() ?? '';
  if (!value) {
    throw new Error(
      'STAGING_DATABASE_URL is required before hosted staging mutation (no DATABASE_URL fallback).'
    );
  }
  return value;
}

export function assertStagingMutationConfirmed(value: string): void {
  assertOperatorAcknowledgement(value, 'staging mutation confirmation');
}

export type ApplyConfirmationInput = {
  confirmedSha: string;
  actualSha: string;
  confirmedPendingCount: string;
  actualPendingCount: string;
  confirmedPendingDigest: string;
  actualPendingDigest: string;
  stagingMutationConfirmed: string;
  remoteOnlyCount: number;
};

export type ApplyEligibility =
  | { eligible: true; pendingCount: number }
  | {
      eligible: false;
      classification: Extract<
        StagingRehearsalClassification,
        'NO_PENDING_MIGRATIONS' | 'FAILED_PREFLIGHT' | 'BLOCKED_SAFETY_GUARD'
      >;
      reason: string;
    };

/**
 * Recompute-vs-confirm gates for apply mode. Never treats a prior inspect
 * artifact as authoritative: callers must pass freshly computed actuals.
 */
export function evaluateApplyEligibility(
  input: ApplyConfirmationInput
): ApplyEligibility {
  try {
    assertShaMatches(input.confirmedSha, input.actualSha);
    const reviewedCount = parseNonNegativeInteger(
      input.confirmedPendingCount,
      'Reviewed pending migration count'
    );
    const actualCount = parseNonNegativeInteger(
      input.actualPendingCount,
      'Actual pending migration count'
    );
    assertPendingCountMatches(reviewedCount, actualCount);
    assertPendingDigestMatches(
      normalizePendingDigest(
        input.confirmedPendingDigest,
        'Reviewed pending-migration-set digest'
      ),
      normalizePendingDigest(
        input.actualPendingDigest,
        'Actual pending-migration-set digest'
      )
    );
    assertStagingMutationConfirmed(input.stagingMutationConfirmed);
  } catch (error) {
    return {
      eligible: false,
      classification: 'FAILED_PREFLIGHT',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (input.remoteOnlyCount > 0) {
    return {
      eligible: false,
      classification: 'BLOCKED_SAFETY_GUARD',
      reason:
        'Remote-only migrations are present; refusing hosted staging mutation.',
    };
  }

  const pendingCount = parseNonNegativeInteger(
    input.actualPendingCount,
    'Actual pending migration count'
  );

  if (pendingCount === 0) {
    return {
      eligible: false,
      classification: 'NO_PENDING_MIGRATIONS',
      reason: 'Pending migration count is zero; supabase db push will not run.',
    };
  }

  return { eligible: true, pendingCount };
}

export type InspectClassificationInput = {
  probeOutcome: string;
  historyOutcome: string;
  /**
   * Pending count from a successful history read. Null when history did not
   * produce a count, including when the probe failed and history was skipped.
   */
  pendingCount: number | null;
};

/**
 * Inspect classifications require a successful connectivity probe and a
 * successful migration-history read.
 *
 * `INSPECT_ONLY` is only for a positive pending count after that read.
 * `NO_PENDING_MIGRATIONS` is only for a pending count of exactly zero after
 * that read. Probe or history failure is `FAILED_PREFLIGHT` even if a stale
 * pending count of zero is present.
 */
export function classifyInspectResult(input: InspectClassificationInput): {
  classification: Extract<
    StagingRehearsalClassification,
    'INSPECT_ONLY' | 'NO_PENDING_MIGRATIONS' | 'FAILED_PREFLIGHT'
  >;
} {
  if (
    input.probeOutcome !== 'success' ||
    input.historyOutcome !== 'success' ||
    input.pendingCount === null ||
    !Number.isInteger(input.pendingCount) ||
    input.pendingCount < 0
  ) {
    return { classification: 'FAILED_PREFLIGHT' };
  }
  if (input.pendingCount === 0) {
    return { classification: 'NO_PENDING_MIGRATIONS' };
  }
  return { classification: 'INSPECT_ONLY' };
}

export type RehearsalClassificationInput = {
  mode: string;
  requireSecretsOutcome: string;
  rehearsalGuardOutcome: string;
  probeOutcome: string;
  historyOutcome: string;
  pendingCount: string;
  applyGatesOutcome: string;
  applyGatesClassification: string;
  applyOutcome: string;
  applyExecuted: boolean;
  postflightOutcome: string;
  postflightPassed: boolean;
  verifySetOutcome: string;
  sqlAuditsOutcome: string;
  historyAfterOutcome: string;
  httpFailure: boolean;
  httpRequiredAndIncomplete: boolean;
};

function pendingCountFromWorkflow(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

/**
 * Final hosted-staging rehearsal classification.
 *
 * A failed or skipped connectivity probe never becomes `INSPECT_ONLY`.
 * History must have succeeded before `INSPECT_ONLY` or
 * `NO_PENDING_MIGRATIONS`. Missing database secrets and a failed staging
 * guard stay on their existing blocked classifications.
 */
export function classifyRehearsalFinal(
  input: RehearsalClassificationInput
): StagingRehearsalClassification {
  if (input.requireSecretsOutcome === 'failure') {
    return 'BLOCKED_MISSING_ENV';
  }
  if (input.rehearsalGuardOutcome === 'failure') {
    return 'BLOCKED_SAFETY_GUARD';
  }
  if (input.probeOutcome !== 'success' || input.historyOutcome !== 'success') {
    return 'FAILED_PREFLIGHT';
  }
  if (input.applyGatesOutcome === 'failure') {
    return 'FAILED_PREFLIGHT';
  }
  if (input.applyOutcome === 'failure') {
    return 'FAILED_MIGRATION_APPLY';
  }
  if (
    input.postflightOutcome === 'failure' ||
    input.verifySetOutcome === 'failure' ||
    input.sqlAuditsOutcome === 'failure' ||
    input.historyAfterOutcome === 'failure' ||
    input.httpFailure ||
    input.httpRequiredAndIncomplete
  ) {
    return 'FAILED_POSTFLIGHT';
  }

  if (input.mode === 'inspect') {
    return classifyInspectResult({
      probeOutcome: input.probeOutcome,
      historyOutcome: input.historyOutcome,
      pendingCount: pendingCountFromWorkflow(input.pendingCount),
    }).classification;
  }

  if (
    input.mode === 'apply' &&
    input.applyGatesOutcome === 'success' &&
    input.applyGatesClassification === 'NO_PENDING_MIGRATIONS'
  ) {
    return 'NO_PENDING_MIGRATIONS';
  }

  if (
    input.applyExecuted &&
    input.postflightPassed &&
    input.verifySetOutcome === 'success' &&
    input.sqlAuditsOutcome === 'success' &&
    !input.httpFailure &&
    !input.httpRequiredAndIncomplete
  ) {
    return 'REHEARSAL_EXECUTED_PASS';
  }

  return 'FAILED_PREFLIGHT';
}

export function isDbPushEligible(pendingCount: number): boolean {
  return pendingCount > 0;
}

export const TARGET_VERIFICATIONS = ['PASS', 'NOT_RUN', 'FAILED'] as const;
export type TargetVerification = (typeof TARGET_VERIFICATIONS)[number];

export const PREDEPLOY_AUDIT_RESULTS = [
  'SUCCESS',
  'FAILURE',
  'NOT_APPLICABLE',
  'NOT_EVALUATED',
] as const;
export type PredeployAuditResult = (typeof PREDEPLOY_AUDIT_RESULTS)[number];

export function classifyTargetVerification(
  guardOutcome: string | undefined | null
): TargetVerification {
  if (guardOutcome === 'success') {
    return 'PASS';
  }
  if (guardOutcome === 'failure') {
    return 'FAILED';
  }
  return 'NOT_RUN';
}

export function targetClassificationFromVerification(
  verification: TargetVerification
): 'hosted-staging' | 'unverified' {
  return verification === 'PASS' ? 'hosted-staging' : 'unverified';
}

export function productionTargetRejectedFromVerification(
  verification: TargetVerification
): true | null {
  return verification === 'PASS' ? true : null;
}

export function summarizeTargetIdentification(
  verification: TargetVerification
): 'YES' | 'NOT VERIFIED' | 'FAILED' {
  if (verification === 'PASS') {
    return 'YES';
  }
  if (verification === 'FAILED') {
    return 'FAILED';
  }
  return 'NOT VERIFIED';
}

export const DEPLOYED_APP_VALIDATION_STATUSES = [
  'not_run',
  'passed',
  'failed',
] as const;
export type DeployedAppValidationStatus =
  (typeof DEPLOYED_APP_VALIDATION_STATUSES)[number];

/**
 * Deployed-app HTTP evidence. Skipped or missing health/readiness is `not_run`,
 * never `passed`. A database rehearsal can succeed while this stays `not_run`.
 */
export function classifyDeployedAppValidation(input: {
  appUrlPresent: boolean;
  health?: string | null;
  readiness?: string | null;
  readinessWait?: string | null;
}): DeployedAppValidationStatus {
  const health = input.health?.trim() || 'not_run';
  const readiness = input.readiness?.trim() || 'not_run';
  const readinessWait = input.readinessWait?.trim() || 'not_run';

  if (
    health === 'failure' ||
    readiness === 'failure' ||
    readinessWait === 'failure'
  ) {
    return 'failed';
  }

  // No deployed URL means the HTTP checks were out of scope. A copied
  // "success" outcome must not upgrade that into a pass.
  if (!input.appUrlPresent) {
    return 'not_run';
  }

  if (health === 'success' && readiness === 'success') {
    return 'passed';
  }

  return 'not_run';
}

export function classifyPredeployAudit(input: {
  historyOutcome?: string | null;
  migrationPending?: string | null;
  auditOutcome?: string | null;
}): PredeployAuditResult {
  if (input.historyOutcome !== 'success') {
    return 'NOT_EVALUATED';
  }

  if (input.migrationPending === 'true') {
    if (input.auditOutcome === 'success') {
      return 'SUCCESS';
    }
    if (input.auditOutcome === 'failure') {
      return 'FAILURE';
    }
    return 'NOT_EVALUATED';
  }

  if (input.migrationPending === 'false') {
    return 'NOT_APPLICABLE';
  }

  return 'NOT_EVALUATED';
}
