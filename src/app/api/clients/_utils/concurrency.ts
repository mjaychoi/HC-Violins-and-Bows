export const CLIENT_STALE_VERSION_CODE = 'CLIENT_STALE_VERSION';
export const CLIENT_EXPECTED_UPDATED_AT_REQUIRED_CODE =
  'CLIENT_EXPECTED_UPDATED_AT_REQUIRED';
export const CLIENT_EXPECTED_UPDATED_AT_INVALID_CODE =
  'CLIENT_EXPECTED_UPDATED_AT_INVALID';

export const CLIENT_STALE_CONFLICT_MESSAGE =
  'This client was updated elsewhere. Review the latest version before saving again.';

export type ExpectedUpdatedAtParseResult =
  | { ok: true; expectedUpdatedAt: string }
  | { ok: false; error: string; error_code: string };

export function parseExpectedUpdatedAt(
  value: unknown
): ExpectedUpdatedAtParseResult {
  if (typeof value !== 'string' || !value.trim()) {
    return {
      ok: false,
      error: 'expected_updated_at is required to update a client',
      error_code: CLIENT_EXPECTED_UPDATED_AT_REQUIRED_CODE,
    };
  }

  const expectedUpdatedAt = value.trim();
  if (Number.isNaN(Date.parse(expectedUpdatedAt))) {
    return {
      ok: false,
      error: 'expected_updated_at must be a valid timestamp',
      error_code: CLIENT_EXPECTED_UPDATED_AT_INVALID_CODE,
    };
  }

  return { ok: true, expectedUpdatedAt };
}

export function isClientStaleConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const status = 'status' in error ? error.status : undefined;
  const errorCode = 'error_code' in error ? error.error_code : undefined;

  return status === 409 && errorCode === CLIENT_STALE_VERSION_CODE;
}
