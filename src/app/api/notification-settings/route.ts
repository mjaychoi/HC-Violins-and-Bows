import { NextRequest, NextResponse } from 'next/server';
import { createSafeErrorResponse } from '@/utils/errorSanitization';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';

function ok(data: unknown, metadata?: Record<string, unknown>) {
  return NextResponse.json({ data, error: null, metadata }, { status: 200 });
}

function fail(error: string, status: number) {
  return NextResponse.json({ data: null, error, metadata: null }, { status });
}

/**
 * GET /api/notification-settings
 * Get current user's notification settings
 */
async function getHandler(request: NextRequest, auth: AuthContext) {
  const { data, error } = await auth.userSupabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', auth.user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = not found, which is OK (will create default)
    const appError = new Error(
      `Failed to fetch notification settings: ${error.message}`
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }

  // Return default settings if not found
  if (!data) {
    return ok({
      user_id: auth.user.id,
      email_notifications: true,
      notification_time: '09:00',
      days_before_due: [3, 1],
      enabled: true,
      last_notification_sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return ok(data);
}

/**
 * POST /api/notification-settings
 * Create or update user's notification settings
 */
async function postHandler(request: NextRequest, auth: AuthContext) {
  const body = await request.json();
  const { email_notifications, notification_time, days_before_due, enabled } =
    body;

  // Validate input
  if (
    notification_time &&
    !/^([01]\d|2[0-3]):([0-5]\d)$/.test(notification_time)
  ) {
    return fail('Invalid notification_time format. Use HH:MM', 400);
  }

  if (days_before_due && !Array.isArray(days_before_due)) {
    return fail('days_before_due must be an array', 400);
  }

  // Upsert notification settings
  const { data, error } = await auth.userSupabase
    .from('notification_settings')
    .upsert(
      {
        user_id: auth.user.id,
        email_notifications: email_notifications ?? true,
        notification_time: notification_time || '09:00',
        days_before_due: days_before_due || [3, 1],
        enabled: enabled ?? true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    )
    .select()
    .single();

  if (error) {
    const appError = new Error(
      `Failed to upsert notification settings: ${error.message}`
    );
    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }

  return ok(data);
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
export const POST = withSentryRoute(withAuthRoute(postHandler));
