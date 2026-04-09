export interface NotificationSettings {
  org_id: string;
  user_id: string;
  email_notifications: boolean;
  notification_time: string;
  days_before_due: number[];
  enabled: boolean;
}

export interface NotificationResultItem {
  org_id: string;
  user_id: string;
  status: string;
  error: string;
}

export interface NotificationWorkerResponse {
  status: number;
  payload: {
    message: string;
    invocation_id: string;
    timestamp: string;
    error?: string;
    results?: NotificationResultItem[];
  };
}

export function buildNoEnabledNotificationsResponse(
  timestamp: string,
  invocationId: string
): NotificationWorkerResponse {
  return {
    status: 200,
    payload: {
      message: 'No users with email notifications enabled',
      invocation_id: invocationId,
      timestamp,
    },
  };
}

export function buildNotificationsUnavailableResponse(
  settings: NotificationSettings[],
  timestamp: string,
  invocationId: string
): NotificationWorkerResponse {
  return {
    status: 503,
    payload: {
      error: 'Notification delivery unavailable',
      message:
        'Maintenance notifications are disabled until tenant-safe recipient scoping is implemented.',
      invocation_id: invocationId,
      results: settings.map(setting => ({
        org_id: setting.org_id,
        user_id: setting.user_id,
        status: 'unsupported',
        error:
          'Maintenance notifications are disabled: recipient scoping is not implemented.',
      })),
      timestamp,
    },
  };
}
