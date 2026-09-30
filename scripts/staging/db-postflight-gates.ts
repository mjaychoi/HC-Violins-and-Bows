/**
 * Classification for the manual hosted-staging database postflight.
 *
 * Safety-guard failure (identity, production/local rejection, CA install)
 * is distinct from a database check that ran and failed. Nothing here
 * connects to Postgres or mutates migration history.
 */

export const DB_POSTFLIGHT_CLASSIFICATIONS = [
  'DB_POSTFLIGHT_PASS',
  'DB_POSTFLIGHT_FAILED',
  'BLOCKED_SAFETY_GUARD',
] as const;

export type DbPostflightClassification =
  (typeof DB_POSTFLIGHT_CLASSIFICATIONS)[number];

export const DB_POSTFLIGHT_ENV = {
  guardOutcome: 'POSTFLIGHT_GUARD_OUTCOME',
  caOutcome: 'POSTFLIGHT_CA_OUTCOME',
  equalityOutcome: 'POSTFLIGHT_EQUALITY_OUTCOME',
  catalogOutcome: 'POSTFLIGHT_CATALOG_OUTCOME',
  catalogPassed: 'POSTFLIGHT_CATALOG_PASSED',
  objectsOutcome: 'POSTFLIGHT_OBJECTS_OUTCOME',
  sqlAuditsOutcome: 'POSTFLIGHT_SQL_AUDITS_OUTCOME',
  remoteOnly: 'POSTFLIGHT_REMOTE_ONLY',
  localOnly: 'POSTFLIGHT_LOCAL_ONLY',
  remoteCount: 'POSTFLIGHT_REMOTE_COUNT',
  localCount: 'POSTFLIGHT_LOCAL_COUNT',
} as const;

export type DbPostflightOutcomeInput = {
  guardOutcome: string;
  caOutcome: string;
  equalityOutcome: string;
  catalogOutcome: string;
  catalogPassed: boolean;
  objectsOutcome: string;
  sqlAuditsOutcome: string;
  remoteOnly: number | null;
  localOnly: number | null;
  remoteCount: number | null;
  localCount: number | null;
};

export function classifyDbPostflight(
  input: DbPostflightOutcomeInput
): DbPostflightClassification {
  if (input.guardOutcome !== 'success' || input.caOutcome !== 'success') {
    return 'BLOCKED_SAFETY_GUARD';
  }

  const exact =
    input.equalityOutcome === 'success' &&
    input.catalogOutcome === 'success' &&
    input.catalogPassed &&
    input.objectsOutcome === 'success' &&
    input.sqlAuditsOutcome === 'success' &&
    input.remoteOnly === 0 &&
    input.localOnly === 0 &&
    input.remoteCount !== null &&
    input.localCount !== null &&
    input.remoteCount === input.localCount;

  return exact ? 'DB_POSTFLIGHT_PASS' : 'DB_POSTFLIGHT_FAILED';
}

export function isDbPostflightClassification(
  value: string
): value is DbPostflightClassification {
  return (DB_POSTFLIGHT_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function parsePostflightCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}
