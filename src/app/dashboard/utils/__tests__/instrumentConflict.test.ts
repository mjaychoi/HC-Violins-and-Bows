import { ApiResponseError } from '@/utils/handleApiResponse';
import {
  INSTRUMENT_CONFLICT_CODE,
  isInstrumentConflictError,
} from '../instrumentConflict';

describe('isInstrumentConflictError', () => {
  it('detects 409 INSTRUMENT_CONFLICT', () => {
    expect(
      isInstrumentConflictError(
        new ApiResponseError('conflict', {
          status: 409,
          error_code: INSTRUMENT_CONFLICT_CODE,
        })
      )
    ).toBe(true);
  });

  it('ignores non-409 and other error codes', () => {
    expect(
      isInstrumentConflictError(
        new ApiResponseError('server', {
          status: 500,
          error_code: INSTRUMENT_CONFLICT_CODE,
        })
      )
    ).toBe(false);
    expect(
      isInstrumentConflictError(
        new ApiResponseError('sold', {
          status: 409,
          error_code: 'SOLD_TRANSITION',
        })
      )
    ).toBe(false);
    expect(isInstrumentConflictError(new Error('Network error'))).toBe(false);
  });
});
