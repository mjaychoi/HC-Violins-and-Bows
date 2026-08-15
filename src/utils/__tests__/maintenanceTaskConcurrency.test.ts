import {
  isMaintenanceTaskStaleVersionError,
  parseExpectedUpdatedAt,
  MAINTENANCE_TASK_STALE_VERSION,
} from '../maintenanceTaskConcurrency';
import { ApiResponseError } from '../handleApiResponse';

describe('parseExpectedUpdatedAt', () => {
  it('accepts ISO timestamps used as maintenance task versions', () => {
    expect(parseExpectedUpdatedAt('2024-01-15T00:00:00Z')).toEqual({
      ok: true,
      value: '2024-01-15T00:00:00Z',
    });
  });

  it('treats missing and blank values as missing', () => {
    expect(parseExpectedUpdatedAt(undefined)).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(parseExpectedUpdatedAt(null)).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(parseExpectedUpdatedAt('')).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(parseExpectedUpdatedAt('   ')).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('rejects malformed timestamps', () => {
    expect(parseExpectedUpdatedAt('not-a-timestamp')).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(parseExpectedUpdatedAt('2024-01-15')).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(parseExpectedUpdatedAt(123)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('isMaintenanceTaskStaleVersionError', () => {
  it('detects the stable stale-version contract', () => {
    expect(
      isMaintenanceTaskStaleVersionError(
        new ApiResponseError('stale', {
          status: 409,
          error_code: MAINTENANCE_TASK_STALE_VERSION,
        })
      )
    ).toBe(true);
  });

  it('does not treat other 409s as stale task versions', () => {
    expect(
      isMaintenanceTaskStaleVersionError(
        new ApiResponseError('transition', {
          status: 409,
          error_code: 'TASK_STATUS_CONFLICT',
        })
      )
    ).toBe(false);
  });
});
