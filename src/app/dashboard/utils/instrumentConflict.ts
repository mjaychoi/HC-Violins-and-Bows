import { ApiResponseError } from '@/utils/handleApiResponse';

export const INSTRUMENT_CONFLICT_CODE = 'INSTRUMENT_CONFLICT';

export const INSTRUMENT_CONFLICT_MESSAGE =
  'This record was updated elsewhere. Refresh and try again.';

export const INSTRUMENT_RELOAD_LATEST_LABEL = 'Reload latest';

export function isInstrumentConflictError(error: unknown): boolean {
  if (error instanceof ApiResponseError) {
    return (
      error.status === 409 && error.error_code === INSTRUMENT_CONFLICT_CODE
    );
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { status?: unknown; error_code?: unknown };
  return (
    candidate.status === 409 &&
    candidate.error_code === INSTRUMENT_CONFLICT_CODE
  );
}
