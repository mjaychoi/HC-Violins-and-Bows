import { NextRequest } from 'next/server';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { requireOrgContext } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { errorHandler } from '@/utils/errorHandler';

const NOTIFICATION_DELIVERY_SUPPORTED = false;

const DEFAULT_NOTIFICATION_TIME = '09:00';
const DEFAULT_DAYS_BEFORE_DUE = [3, 1] as const;
const MAX_DAYS_BEFORE_DUE_COUNT = 10;
const MAX_DAYS_BEFORE_DUE = 365;

type NotificationSettingsInput = {
  email_notifications?: boolean;
  notification_time?: string;
  days_before_due?: number[];
  enabled?: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonObject(
  request: NextRequest
): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; error: string }
> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON body',
    };
  }

  if (!isObject(body)) {
    return {
      ok: false,
      error: 'Invalid JSON body',
    };
  }

  return {
    ok: true,
    body,
  };
}

function parseNotificationTime(
  value: unknown
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
      error: 'notification_time must be a string',
    };
  }

  const trimmed = value.trim();

  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed)) {
    return {
      ok: false,
      error: 'Invalid notification_time format. Use HH:MM',
    };
  }

  return {
    ok: true,
    value: trimmed,
  };
}

function parseDaysBeforeDue(
  value: unknown
): { ok: true; value: number[] | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: 'days_before_due must be an array',
    };
  }

  if (value.length === 0) {
    return {
      ok: true,
      value: [...DEFAULT_DAYS_BEFORE_DUE],
    };
  }

  if (value.length > MAX_DAYS_BEFORE_DUE_COUNT) {
    return {
      ok: false,
      error: `days_before_due cannot contain more than ${MAX_DAYS_BEFORE_DUE_COUNT} values`,
    };
  }

  const parsed = value.map(item => {
    if (typeof item === 'number') return item;

    if (typeof item === 'string' && item.trim()) {
      return Number(item.trim());
    }

    return Number.NaN;
  });

  if (
    parsed.some(
      item => !Number.isInteger(item) || item < 0 || item > MAX_DAYS_BEFORE_DUE
    )
  ) {
    return {
      ok: false,
      error: `days_before_due values must be integers between 0 and ${MAX_DAYS_BEFORE_DUE}`,
    };
  }

  const uniqueSorted = Array.from(new Set(parsed)).sort((a, b) => b - a);

  return {
    ok: true,
    value: uniqueSorted,
  };
}

function parseOptionalBoolean(
  value: unknown,
  fieldName: string
): { ok: true; value: boolean | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== 'boolean') {
    return {
      ok: false,
      error: `${fieldName} must be a boolean`,
    };
  }

  return {
    ok: true,
    value,
  };
}

function parseNotificationSettingsInput(
  body: Record<string, unknown>
):
  | { ok: true; value: NotificationSettingsInput }
  | { ok: false; error: string } {
  const emailNotifications = parseOptionalBoolean(
    body.email_notifications,
    'email_notifications'
  );
  if (!emailNotifications.ok) return emailNotifications;

  const enabled = parseOptionalBoolean(body.enabled, 'enabled');
  if (!enabled.ok) return enabled;

  const notificationTime = parseNotificationTime(body.notification_time);
  if (!notificationTime.ok) return notificationTime;

  const daysBeforeDue = parseDaysBeforeDue(body.days_before_due);
  if (!daysBeforeDue.ok) return daysBeforeDue;

  return {
    ok: true,
    value: {
      email_notifications: emailNotifications.value,
      enabled: enabled.value,
      notification_time: notificationTime.value,
      days_before_due: daysBeforeDue.value,
    },
  };
}

function buildDefaultNotificationSettings(auth: AuthContext) {
  const now = new Date().toISOString();

  return {
    org_id: auth.orgId!,
    user_id: auth.user.id,
    email_notifications: false,
    notification_time: DEFAULT_NOTIFICATION_TIME,
    days_before_due: [...DEFAULT_DAYS_BEFORE_DUE],
    enabled: false,
    last_notification_sent_at: null,
    created_at: now,
    updated_at: now,
  };
}

function toEffectiveNotificationSettings<T extends Record<string, unknown>>(
  settings: T
): T {
  if (NOTIFICATION_DELIVERY_SUPPORTED) {
    return settings;
  }

  return {
    ...settings,
    email_notifications: false,
    enabled: false,
  };
}

function getStoredNotificationBooleans(input: NotificationSettingsInput) {
  if (NOTIFICATION_DELIVERY_SUPPORTED) {
    return {
      email_notifications: input.email_notifications ?? false,
      enabled: input.enabled ?? false,
    };
  }

  return {
    email_notifications: false,
    enabled: false,
  };
}

async function getHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'GET',
      path: 'NotificationSettingsAPI',
      context: 'NotificationSettingsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const { data, error } = await auth.userSupabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', auth.user.id)
        .eq('org_id', auth.orgId!)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw errorHandler.handleSupabaseError(
          error,
          'Fetch notification settings'
        );
      }

      if (!data) {
        return {
          payload: {
            data: toEffectiveNotificationSettings(
              buildDefaultNotificationSettings(auth)
            ),
            success: true,
          },
          metadata: {
            usedDefaultSettings: true,
            notificationDeliverySupported: NOTIFICATION_DELIVERY_SUPPORTED,
            scope: { enforced: true, orgId: auth.orgId, userId: auth.user.id },
          },
        };
      }

      return {
        payload: {
          data: toEffectiveNotificationSettings(data),
          success: true,
        },
        metadata: {
          notificationDeliverySupported: NOTIFICATION_DELIVERY_SUPPORTED,
          scope: { enforced: true, orgId: auth.orgId, userId: auth.user.id },
        },
      };
    }
  );
}

async function postHandler(request: NextRequest, auth: AuthContext) {
  return apiHandler(
    request,
    {
      method: 'POST',
      path: 'NotificationSettingsAPI',
      context: 'NotificationSettingsAPI',
    },
    async () => {
      const orgContextError = requireOrgContext(auth);
      if (orgContextError) {
        return {
          payload: { error: 'Organization context required', success: false },
          status: 403,
        };
      }

      const bodyResult = await readJsonObject(request);
      if (!bodyResult.ok) {
        return {
          payload: { error: bodyResult.error, success: false },
          status: 400,
        };
      }

      const parsed = parseNotificationSettingsInput(bodyResult.body);
      if (!parsed.ok) {
        return {
          payload: {
            error: parsed.error,
            success: false,
          },
          status: 400,
        };
      }

      const input = parsed.value;
      const storedBooleans = getStoredNotificationBooleans(input);

      const upsertData = {
        org_id: auth.orgId!,
        user_id: auth.user.id,
        email_notifications: storedBooleans.email_notifications,
        notification_time: input.notification_time ?? DEFAULT_NOTIFICATION_TIME,
        days_before_due:
          input.days_before_due && input.days_before_due.length > 0
            ? input.days_before_due
            : [...DEFAULT_DAYS_BEFORE_DUE],
        enabled: storedBooleans.enabled,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await auth.userSupabase
        .from('notification_settings')
        .upsert(upsertData, { onConflict: 'org_id,user_id' })
        .select()
        .single();

      if (error) {
        throw errorHandler.handleSupabaseError(
          error,
          'Upsert notification settings'
        );
      }

      return {
        payload: {
          data: toEffectiveNotificationSettings(data),
          success: true,
        },
        metadata: {
          notificationDeliverySupported: NOTIFICATION_DELIVERY_SUPPORTED,
          scope: { enforced: true, orgId: auth.orgId, userId: auth.user.id },
        },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
export const POST = withSentryRoute(withAuthRoute(postHandler));
