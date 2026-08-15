import { ApiResponseError } from '@/utils/handleApiResponse';

export const MAINTENANCE_TASK_STALE_VERSION = 'MAINTENANCE_TASK_STALE_VERSION';
export const MAINTENANCE_TASK_EXPECTED_UPDATED_AT_REQUIRED =
  'MAINTENANCE_TASK_EXPECTED_UPDATED_AT_REQUIRED';
export const MAINTENANCE_TASK_EXPECTED_UPDATED_AT_INVALID =
  'MAINTENANCE_TASK_EXPECTED_UPDATED_AT_INVALID';

export const MAINTENANCE_TASK_CONFLICT_MESSAGE =
  'This maintenance task was updated elsewhere. Review the latest version before saving again.';

/**
 * Postgres/Supabase timestamptz values as returned to the client, plus
 * the ISO-8601 forms the UI already stores on MaintenanceTask.updated_at.
 */
const EXPECTED_UPDATED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

export function parseExpectedUpdatedAt(
  value: unknown
):
  | { ok: true; value: string }
  | { ok: false; reason: 'missing' | 'malformed' } {
  if (value === undefined || value === null) {
    return { ok: false, reason: 'missing' };
  }

  if (typeof value !== 'string') {
    return { ok: false, reason: 'malformed' };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, reason: 'missing' };
  }

  if (!EXPECTED_UPDATED_AT_PATTERN.test(trimmed)) {
    return { ok: false, reason: 'malformed' };
  }

  if (!Number.isFinite(Date.parse(trimmed))) {
    return { ok: false, reason: 'malformed' };
  }

  return { ok: true, value: trimmed };
}

export function isMaintenanceTaskStaleVersionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code =
    'error_code' in error
      ? (error as { error_code?: unknown }).error_code
      : undefined;

  if (code === MAINTENANCE_TASK_STALE_VERSION) {
    return true;
  }

  return (
    error instanceof ApiResponseError &&
    error.error_code === MAINTENANCE_TASK_STALE_VERSION
  );
}
