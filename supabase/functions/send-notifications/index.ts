// Supabase Edge Function: Send daily email notifications for maintenance tasks
// Run via cron job (daily at 9:00 AM)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const APP_URL = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface MaintenanceTask {
  id: string;
  title: string;
  task_type: string;
  due_date: string | null;
  personal_due_date: string | null;
  scheduled_date: string | null;
  priority: string;
  status: string;
  instrument?: {
    maker: string | null;
    type: string | null;
    serial_number: string | null;
  };
  client?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
}

interface NotificationSettings {
  user_id: string;
  email_notifications: boolean;
  notification_time: string;
  days_before_due: number[];
  enabled: boolean;
}

interface TaskNotification {
  task: MaintenanceTask;
  type: 'overdue' | 'today' | 'upcoming';
  daysUntil: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
serve(async _req => {
  try {
    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all authenticated users with email notifications enabled
    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('enabled', true)
      .eq('email_notifications', true);

    if (settingsError) {
      console.error('Error fetching notification settings:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch notification settings' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!settings || settings.length === 0) {
      return new Response(
        JSON.stringify({
          message: 'No users with email notifications enabled',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user emails from auth.users
    const userIds = settings.map(s => s.user_id);
    const { data: users, error: usersError } =
      await supabase.auth.admin.listUsers();

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userEmails = new Map<string, string>();
    users?.users.forEach(user => {
      if (userIds.includes(user.id) && user.email) {
        userEmails.set(user.id, user.email);
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Process notifications for each user
    const results = [];
    for (const setting of settings as NotificationSettings[]) {
      const userEmail = userEmails.get(setting.user_id);
      if (!userEmail) {
        console.warn(`No email found for user ${setting.user_id}`);
        continue;
      }

      // Fetch pending/in-progress maintenance tasks for this user
      // Note: In a multi-user system, you'd filter by user_id
      // For now, we'll send notifications for all tasks
      const { data: tasks, error: tasksError } = await supabase
        .from('maintenance_tasks')
        .select(
          `
          id,
          title,
          task_type,
          due_date,
          personal_due_date,
          scheduled_date,
          priority,
          status,
          instrument:instruments(maker, type, serial_number),
          client:clients(first_name, last_name, email)
        `
        )
        .in('status', ['pending', 'in_progress'])
        .is('completed_date', null);

      if (tasksError) {
        console.error(
          `Error fetching tasks for user ${setting.user_id}:`,
          tasksError
        );
        continue;
      }

      if (!tasks || tasks.length === 0) {
        continue;
      }

      // Classify tasks into notifications
      const notifications: TaskNotification[] = [];
      const daysBeforeDue = setting.days_before_due || [3, 1];

      for (const task of tasks as MaintenanceTask[]) {
        // Get primary due date (due_date > personal_due_date > scheduled_date)
        const dueDateStr =
          task.due_date || task.personal_due_date || task.scheduled_date;
        if (!dueDateStr) continue;

        const dueDate = new Date(dueDateStr);
        dueDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor(
          (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff < 0) {
          // Overdue
          notifications.push({
            task,
            type: 'overdue',
            daysUntil: Math.abs(daysDiff),
          });
        } else if (daysDiff === 0) {
          // Today
          notifications.push({
            task,
            type: 'today',
            daysUntil: 0,
          });
        } else if (daysBeforeDue.includes(daysDiff)) {
          // Upcoming (D-3, D-1, etc.)
          notifications.push({
            task,
            type: 'upcoming',
            daysUntil: daysDiff,
          });
        }
      }

      if (notifications.length === 0) {
        continue;
      }

      // Generate email content
      const emailContent = generateEmailContent(notifications, APP_URL);

      // Send email using Resend
      if (RESEND_API_KEY) {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Violins & Bows <notifications@example.com>', // TODO: Update with actual sender
            to: [userEmail],
            subject: emailContent.subject,
            html: emailContent.html,
          }),
        });

        if (!emailResponse.ok) {
          const errorData = await emailResponse.text();
          console.error(`Failed to send email to ${userEmail}:`, errorData);
          results.push({
            user_id: setting.user_id,
            status: 'failed',
            error: errorData,
          });
          continue;
        }

        // Update last_notification_sent_at
        await supabase
          .from('notification_settings')
          .update({ last_notification_sent_at: new Date().toISOString() })
          .eq('user_id', setting.user_id);

        results.push({
          user_id: setting.user_id,
          email: userEmail,
          status: 'sent',
          notificationCount: notifications.length,
        });
      } else {
        // Fallback: Log to console if Resend API key is not configured
        console.log(`[Email Notification] To: ${userEmail}`);
        console.log(`Subject: ${emailContent.subject}`);
        console.log(`Body: ${emailContent.html}`);
        results.push({
          user_id: setting.user_id,
          email: userEmail,
          status: 'logged',
          notificationCount: notifications.length,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Notifications processed',
        results,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-notifications function:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

function generateEmailContent(
  notifications: TaskNotification[],
  appUrl: string
): { subject: string; html: string } {
  const overdue = notifications.filter(n => n.type === 'overdue');
  const today = notifications.filter(n => n.type === 'today');
  const upcoming = notifications.filter(n => n.type === 'upcoming');

  // Subject line
  let subject = '';
  if (overdue.length > 0) {
    subject = `[Urgent] ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} need your attention`;
  } else if (today.length > 0) {
    subject = `Today: ${today.length} task${today.length > 1 ? 's' : ''} due`;
  } else {
    subject = `Reminder: ${upcoming.length} upcoming task${upcoming.length > 1 ? 's' : ''}`;
  }

  // HTML content
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="margin: 0; color: #1a1a1a;">Task Notifications</h1>
    <p style="margin: 10px 0 0 0; color: #666;">Your maintenance task reminders</p>
  </div>

  ${
    overdue.length > 0
      ? `
  <div style="background-color: #fee; border-left: 4px solid #dc3545; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h2 style="margin: 0 0 10px 0; color: #dc3545;">⚠️ Overdue Tasks (${overdue.length})</h2>
    <ul style="margin: 0; padding-left: 20px;">
      ${overdue
        .map(
          n => `
      <li style="margin-bottom: 10px;">
        <strong>${escapeHtml(n.task.title)}</strong>
        ${n.task.instrument ? `<br><small>Instrument: ${escapeHtml(formatInstrument(n.task.instrument))}</small>` : ''}
        ${n.task.task_type ? `<br><small>Type: ${escapeHtml(n.task.task_type)}</small>` : ''}
        <br><small style="color: #dc3545;">${n.daysUntil} day${n.daysUntil > 1 ? 's' : ''} overdue</small>
      </li>`
        )
        .join('')}
    </ul>
  </div>
  `
      : ''
  }

  ${
    today.length > 0
      ? `
  <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h2 style="margin: 0 0 10px 0; color: #856404;">📅 Due Today (${today.length})</h2>
    <ul style="margin: 0; padding-left: 20px;">
      ${today
        .map(
          n => `
      <li style="margin-bottom: 10px;">
        <strong>${escapeHtml(n.task.title)}</strong>
        ${n.task.instrument ? `<br><small>Instrument: ${escapeHtml(formatInstrument(n.task.instrument))}</small>` : ''}
        ${n.task.task_type ? `<br><small>Type: ${escapeHtml(n.task.task_type)}</small>` : ''}
      </li>`
        )
        .join('')}
    </ul>
  </div>
  `
      : ''
  }

  ${
    upcoming.length > 0
      ? `
  <div style="background-color: #d1ecf1; border-left: 4px solid #0c5460; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h2 style="margin: 0 0 10px 0; color: #0c5460;">📋 Upcoming Tasks (${upcoming.length})</h2>
    <ul style="margin: 0; padding-left: 20px;">
      ${upcoming
        .map(
          n => `
      <li style="margin-bottom: 10px;">
        <strong>${escapeHtml(n.task.title)}</strong>
        ${n.task.instrument ? `<br><small>Instrument: ${escapeHtml(formatInstrument(n.task.instrument))}</small>` : ''}
        ${n.task.task_type ? `<br><small>Type: ${escapeHtml(n.task.task_type)}</small>` : ''}
        <br><small>Due in ${n.daysUntil} day${n.daysUntil > 1 ? 's' : ''}</small>
      </li>`
        )
        .join('')}
    </ul>
  </div>
  `
      : ''
  }

  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
    <a href="${appUrl}/calendar" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Calendar</a>
  </div>

  <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center;">
    <p>You're receiving this email because you have email notifications enabled in your settings.</p>
    <p><a href="${appUrl}/settings" style="color: #007bff;">Manage notification settings</a></p>
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}

function formatInstrument(instrument: {
  maker: string | null;
  type: string | null;
  serial_number: string | null;
}): string {
  const parts: string[] = [];
  if (instrument.maker) parts.push(instrument.maker);
  if (instrument.type) parts.push(instrument.type);
  if (instrument.serial_number) parts.push(`#${instrument.serial_number}`);
  return parts.length > 0 ? parts.join(' ') : 'Unknown instrument';
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
