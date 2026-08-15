import { ApiResponseError } from '@/utils/handleApiResponse';
import {
  CLIENT_EXPECTED_UPDATED_AT_INVALID_CODE,
  CLIENT_EXPECTED_UPDATED_AT_REQUIRED_CODE,
  CLIENT_STALE_VERSION_CODE,
  isClientStaleConflict,
  parseExpectedUpdatedAt,
} from '../concurrency';

describe('parseExpectedUpdatedAt', () => {
  it('rejects missing, empty, and non-string values', () => {
    for (const value of [undefined, null, '', '   ', 123, {}]) {
      const result = parseExpectedUpdatedAt(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error_code).toBe(
          CLIENT_EXPECTED_UPDATED_AT_REQUIRED_CODE
        );
      }
    }
  });

  it('rejects malformed timestamps', () => {
    const result = parseExpectedUpdatedAt('not-a-timestamp');
    expect(result).toEqual({
      ok: false,
      error: 'expected_updated_at must be a valid timestamp',
      error_code: CLIENT_EXPECTED_UPDATED_AT_INVALID_CODE,
    });
  });

  it('accepts a valid ISO timestamp', () => {
    expect(parseExpectedUpdatedAt('2024-01-01T00:00:00.000Z')).toEqual({
      ok: true,
      expectedUpdatedAt: '2024-01-01T00:00:00.000Z',
    });
  });
});

describe('isClientStaleConflict', () => {
  it('matches only the Client stale-version 409 contract', () => {
    expect(
      isClientStaleConflict(
        new ApiResponseError('stale', {
          status: 409,
          error_code: CLIENT_STALE_VERSION_CODE,
        })
      )
    ).toBe(true);
    expect(
      isClientStaleConflict(
        new ApiResponseError('other conflict', {
          status: 409,
          error_code: 'OTHER_CONFLICT',
        })
      )
    ).toBe(false);
    expect(
      isClientStaleConflict(
        new ApiResponseError('not found', {
          status: 404,
          error_code: CLIENT_STALE_VERSION_CODE,
        })
      )
    ).toBe(false);
  });
});
