import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { createSafeErrorResponse } from '@/utils/errorSanitization';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { User } from '@supabase/supabase-js';

/**
 * GET /api/notification-settings
 * Get current user's notification settings
 */
async function getHandler(request: NextRequest, user: User) {
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', user.id)
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
    return NextResponse.json({
      user_id: user.id,
      email_notifications: true,
      notification_time: '09:00',
      days_before_due: [3, 1],
      enabled: true,
      last_notification_sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/notification-settings
 * Create or update user's notification settings
 */
async function postHandler(request: NextRequest, user: User) {
  const supabase = getServerSupabase();

  const body = await request.json();
  const { email_notifications, notification_time, days_before_due, enabled } =
    body;

  // Validate input
  if (
    notification_time &&
    !/^([01]\d|2[0-3]):([0-5]\d)$/.test(notification_time)
  ) {
    return NextResponse.json(
      { error: 'Invalid notification_time format. Use HH:MM' },
      { status: 400 }
    );
  }

  if (days_before_due && !Array.isArray(days_before_due)) {
    return NextResponse.json(
      { error: 'days_before_due must be an array' },
      { status: 400 }
    );
  }

  // Upsert notification settings
  const { data, error } = await supabase
    .from('notification_settings')
    .upsert(
      {
        user_id: user.id,
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

  return NextResponse.json(data, { status: 200 });
}

export const GET = withSentryRoute(withAuthRoute(getHandler));
export const POST = withSentryRoute(withAuthRoute(postHandler));
