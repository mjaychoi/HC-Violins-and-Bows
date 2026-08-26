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

export function classifyInspectResult(pendingCount: number): {
  classification: Extract<
    StagingRehearsalClassification,
    'INSPECT_ONLY' | 'NO_PENDING_MIGRATIONS'
  >;
} {
  if (pendingCount === 0) {
    return { classification: 'NO_PENDING_MIGRATIONS' };
  }
  return { classification: 'INSPECT_ONLY' };
}

export function isDbPushEligible(pendingCount: number): boolean {
  return pendingCount > 0;
}
