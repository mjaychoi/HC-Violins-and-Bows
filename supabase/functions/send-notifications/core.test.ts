import {
  buildNoEnabledNotificationsResponse,
  buildNotificationsUnavailableResponse,
  type NotificationSettings,
} from './core';

describe('send-notifications core', () => {
  const invocationId = 'req-123';
  const timestamp = '2026-04-03T12:00:00.000Z';

  it('returns an honest empty-state response when no settings are enabled', () => {
    const response = buildNoEnabledNotificationsResponse(
      timestamp,
      invocationId
    );

    expect(response).toEqual({
      status: 200,
      payload: {
        message: 'No users with email notifications enabled',
        invocation_id: invocationId,
        timestamp,
      },
    });
  });

  it('returns 503 with per-user unsupported results when delivery is unavailable', () => {
    const settings: NotificationSettings[] = [
      {
        org_id: 'org-1',
        user_id: 'user-1',
        email_notifications: true,
        notification_time: '09:00',
        days_before_due: [1, 3],
        enabled: true,
      },
    ];

    const response = buildNotificationsUnavailableResponse(
      settings,
      timestamp,
      invocationId
    );

    expect(response.status).toBe(503);
    expect(response.payload).toMatchObject({
      error: 'Notification delivery unavailable',
      message: expect.stringContaining(
        'disabled until tenant-safe recipient scoping'
      ),
      invocation_id: invocationId,
      timestamp,
    });
    expect(response.payload.results).toEqual([
      {
        org_id: 'org-1',
        user_id: 'user-1',
        status: 'unsupported',
        error:
          'Maintenance notifications are disabled: recipient scoping is not implemented.',
      },
    ]);
  });
});
