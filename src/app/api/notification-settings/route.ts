import { NextRequest } from 'next/server';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { requireOrgContext } from '@/app/api/_utils/withAuthRoute';
import { apiHandler } from '@/app/api/_utils/apiHandler';
import { errorHandler } from '@/utils/errorHandler';

const NOTIFICATION_DELIVERY_SUPPORTED = false;

function buildDefaultNotificationSettings(auth: AuthContext) {
  const now = new Date().toISOString();
  return {
    org_id: auth.orgId!,
    user_id: auth.user.id,
    email_notifications: false,
    notification_time: '09:00',
    days_before_due: [3, 1],
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
          payload: { error: 'Organization context required' },
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
          },
          metadata: { usedDefaultSettings: true },
        };
      }

      return {
        payload: { data: toEffectiveNotificationSettings(data) },
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
          payload: { error: 'Organization context required' },
          status: 403,
        };
      }

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') {
        return {
          payload: { error: 'Invalid JSON body' },
          status: 400,
        };
      }

      const {
        email_notifications,
        notification_time,
        days_before_due,
        enabled,
      } = body as Record<string, unknown>;

      if (
        notification_time &&
        (typeof notification_time !== 'string' ||
          !/^([01]\d|2[0-3]):([0-5]\d)$/.test(notification_time))
      ) {
        return {
          payload: { error: 'Invalid notification_time format. Use HH:MM' },
          status: 400,
        };
      }

      if (days_before_due && !Array.isArray(days_before_due)) {
        return {
          payload: {
            error: 'days_before_due must be an array',
            success: false,
          },
          status: 400,
        };
      }

      // Note: if NOTIFICATION_DELIVERY_SUPPORTED is false, we still save the
      // preference (toEffectiveNotificationSettings clamps values to false at read time).
      const upsertData = {
        org_id: auth.orgId!,
        user_id: auth.user.id,
        email_notifications:
          typeof email_notifications === 'boolean'
            ? email_notifications
            : false,
        notification_time:
          typeof notification_time === 'string' && notification_time
            ? notification_time
            : '09:00',
        days_before_due:
          Array.isArray(days_before_due) && days_before_due.length > 0
            ? days_before_due
            : [3, 1],
        enabled: typeof enabled === 'boolean' ? enabled : false,
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
        payload: { data: toEffectiveNotificationSettings(data) },
      };
    }
  );
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
export const POST = withSentryRoute(withAuthRoute(postHandler));
