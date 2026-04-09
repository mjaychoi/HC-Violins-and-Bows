// Supabase Edge Function: Send daily email notifications for maintenance tasks
// Run via cron job (daily at 9:00 AM)

// @ts-expect-error - Deno URL import, works at runtime but TypeScript doesn't understand it
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error - Deno URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildNoEnabledNotificationsResponse,
  buildNotificationsUnavailableResponse,
  type NotificationSettings,
} from './core.ts';
import { getOrCreateInvocationId } from '../_shared/invocation.ts';

// Simple logger for Deno (replaces Node.js logger from src/utils/logger)
// Note: Cannot import from src/utils/logger as it's Node.js code, not compatible with Deno
const logWarn = (...args: unknown[]) => console.warn('[WARN]', ...args);
const logError = (...args: unknown[]) => console.error('[ERROR]', ...args);

// Declare Deno global for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SEND_NOTIFICATIONS_SECRET = Deno.env.get('SEND_NOTIFICATIONS_SECRET')!;

const NOTIFICATION_DELIVERY_SUPPORTED = false;

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function hasValidInvocationSecret(req: Request): boolean {
  const providedSecret = req.headers.get('x-send-notifications-secret')?.trim();
  return Boolean(
    SEND_NOTIFICATIONS_SECRET &&
    providedSecret &&
    providedSecret === SEND_NOTIFICATIONS_SECRET
  );
}

serve(async req => {
  const invocationId = getOrCreateInvocationId(req);
  try {
    if (!SEND_NOTIFICATIONS_SECRET) {
      logError(`[${invocationId}] SEND_NOTIFICATIONS_SECRET is not configured`);
      return jsonResponse(
        { error: 'Function misconfigured', invocation_id: invocationId },
        500
      );
    }

    if (req.method !== 'POST') {
      return jsonResponse(
        { error: 'Method not allowed', invocation_id: invocationId },
        405
      );
    }

    if (!hasValidInvocationSecret(req)) {
      return jsonResponse(
        { error: 'Unauthorized', invocation_id: invocationId },
        401
      );
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all authenticated users with email notifications enabled
    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('enabled', true)
      .eq('email_notifications', true);

    if (settingsError) {
      logError(
        `[${invocationId}] Error fetching notification settings:`,
        settingsError
      );
      return jsonResponse(
        {
          error: 'Failed to fetch notification settings',
          invocation_id: invocationId,
        },
        500
      );
    }

    if (!settings || settings.length === 0) {
      const response = buildNoEnabledNotificationsResponse(
        new Date().toISOString(),
        invocationId
      );
      return jsonResponse(response.payload, response.status);
    }

    if (!NOTIFICATION_DELIVERY_SUPPORTED) {
      const response = buildNotificationsUnavailableResponse(
        settings as NotificationSettings[],
        new Date().toISOString(),
        invocationId
      );

      logWarn(
        `[${invocationId}] Notification delivery unavailable: recipient scoping is undefined for ${(settings as NotificationSettings[]).length} enabled settings`
      );

      return jsonResponse(response.payload, response.status);
    }

    // Get user emails from auth.users
    const userIds = settings.map(s => s.user_id);
    const { data: users, error: usersError } =
      await supabase.auth.admin.listUsers();

    if (usersError) {
      logError(`[${invocationId}] Error fetching users:`, usersError);
      return jsonResponse(
        { error: 'Failed to fetch users', invocation_id: invocationId },
        500
      );
    }

    const userEmails = new Map<string, string>();
    users?.users.forEach(user => {
      if (userIds.includes(user.id) && user.email) {
        userEmails.set(user.id, user.email);
      }
    });

    // Process notifications for each user
    type ResultItem = {
      user_id: string;
      status: string;
      error?: string;
      notificationCount?: number;
    };
    const results: ResultItem[] = [];
    for (const setting of settings as NotificationSettings[]) {
      const userEmail = userEmails.get(setting.user_id);
      if (!userEmail) {
        logWarn(`[${invocationId}] No email found for user ${setting.user_id}`);
        continue;
      }

      results.push({
        user_id: setting.user_id,
        status: 'skipped',
        error: `Notification delivery not implemented for ${userEmail}`,
      });
    }

    return jsonResponse(
      {
        message: 'Notifications processed',
        invocation_id: invocationId,
        results,
        timestamp: new Date().toISOString(),
      },
      200
    );
  } catch (error) {
    logError(`[${invocationId}] Error in send-notifications function:`, error);
    return jsonResponse(
      {
        error: 'Internal server error',
        invocation_id: invocationId,
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
