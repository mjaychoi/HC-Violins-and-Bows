// Supabase Edge Function: Send daily email notifications for maintenance tasks
// Run via cron job (daily at 9:00 AM)

// @ts-expect-error - Deno URL import, works at runtime but TypeScript doesn't understand it
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error - Deno URL import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

interface NotificationSettings {
  user_id: string;
  email_notifications: boolean;
  notification_time: string;
  days_before_due: number[];
  enabled: boolean;
}

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
  try {
    if (!SEND_NOTIFICATIONS_SECRET) {
      logError('SEND_NOTIFICATIONS_SECRET is not configured');
      return jsonResponse({ error: 'Function misconfigured' }, 500);
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    if (!hasValidInvocationSecret(req)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
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
      logError('Error fetching notification settings:', settingsError);
      return jsonResponse(
        { error: 'Failed to fetch notification settings' },
        500
      );
    }

    if (!settings || settings.length === 0) {
      return jsonResponse(
        {
          message: 'No users with email notifications enabled',
        },
        200
      );
    }

    // Get user emails from auth.users
    const userIds = settings.map(s => s.user_id);
    const { data: users, error: usersError } =
      await supabase.auth.admin.listUsers();

    if (usersError) {
      logError('Error fetching users:', usersError);
      return jsonResponse({ error: 'Failed to fetch users' }, 500);
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
        logWarn(`No email found for user ${setting.user_id}`);
        continue;
      }

      // Security hardening: do not send maintenance task digests unless the
      // recipient can be derived from the task rows with an explicit join/filter.
      // The current schema used by this function does not provide that mapping.
      results.push({
        user_id: setting.user_id,
        status: 'skipped',
        error:
          'Maintenance notifications disabled: recipient scoping is not defined for maintenance_tasks.',
      });
      logWarn(
        `Skipping maintenance notifications for user ${setting.user_id}: recipient scoping is undefined`
      );
      continue;
    }

    return jsonResponse(
      {
        message: 'Notifications processed',
        results,
        timestamp: new Date().toISOString(),
      },
      200
    );
  } catch (error) {
    logError('Error in send-notifications function:', error);
    return jsonResponse(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
