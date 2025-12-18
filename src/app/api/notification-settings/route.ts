import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { createSafeErrorResponse } from '@/utils/errorSanitization';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity } from '@/types/errors';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/notification-settings
 * Get current user's notification settings
 *
 * Note: This endpoint should be called from client-side with the user's session token.
 * In a production app, you might want to use Next.js middleware or getServerSession.
 */
async function getHandler(request: NextRequest) {
  try {
    const supabase = getServerSupabase();

    // Get user from Authorization header or cookies
    // For Supabase, we typically get the session from cookies via getSupabaseClient
    // But for API routes, we need to extract from headers

    // For now, we'll use a simpler approach: get all settings and filter client-side
    // In production, you should verify the JWT token properly

    // This is a simplified implementation - in production, verify the session properly
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a client with the user's token to verify it
    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid token' },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found, which is OK (will create default)
      throw error;
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
  } catch (error) {
    captureException(
      error,
      'NotificationSettingsAPI.GET',
      {},
      ErrorSeverity.MEDIUM
    );
    const safeError = createSafeErrorResponse(error, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

/**
 * POST /api/notification-settings
 * Create or update user's notification settings
 */
async function postHandler(request: NextRequest) {
  try {
    // Get user from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a client with the user's token
    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid token' },
        { status: 401 }
      );
    }

    // Use service role client for database operations (RLS will handle permissions)
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
      throw error;
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    captureException(
      error,
      'NotificationSettingsAPI.POST',
      {},
      ErrorSeverity.MEDIUM
    );
    const safeError = createSafeErrorResponse(error, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return getHandler(request);
}

export async function POST(request: NextRequest) {
  return postHandler(request);
}
