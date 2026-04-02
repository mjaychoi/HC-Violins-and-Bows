# Send Notifications Edge Function

This Edge Function sends daily email notifications to users about their maintenance tasks.

## Setup

### 1. Environment Variables

Set the following environment variables in your Supabase project:

```bash
# Resend API Key (for sending emails)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Application URL (for links in emails)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Supabase credentials (automatically available in Edge Functions)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Required invocation secret for cron/server-side callers only
SEND_NOTIFICATIONS_SECRET=your_long_random_secret
```

### 2. Deploy the Function

```bash
# Using Supabase CLI
supabase functions deploy send-notifications

# Or manually via Supabase Dashboard
# Go to Edge Functions > New Function > Upload
```

### 3. Set up Cron Job

In Supabase Dashboard:

1. Go to Database > Cron Jobs
2. Create a new cron job with:
   - Name: `send-daily-notifications`
   - Schedule: `0 9 * * *` (Every day at 9:00 AM UTC)
   - Function: `send-notifications`

Or use SQL:

```sql
SELECT cron.schedule(
  'send-daily-notifications',
  '0 9 * * *', -- Every day at 9:00 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-send-notifications-secret', 'YOUR_SEND_NOTIFICATIONS_SECRET'
    )
  );
  $$
);
```

Important:

- Do not invoke this function with `anon` or user bearer tokens.
- This function uses the service role internally and must only be called by trusted server-side automation.
- The function rejects requests that do not include `x-send-notifications-secret`.

### 4. Configure Resend

1. Sign up at https://resend.com
2. Create an API key
3. Verify your domain (optional but recommended)
4. Add the API key to Supabase environment variables

## How it Works

1. The function runs daily at the scheduled time (default: 9:00 AM)
2. It fetches all users with email notifications enabled
3. For each user, it:
   - Fetches their pending/in-progress maintenance tasks
   - Classifies tasks as overdue, today, or upcoming
   - Generates an HTML email
   - Sends the email via Resend API
   - Updates `last_notification_sent_at` timestamp

## Email Content

The email includes:

- **Overdue tasks**: Tasks that are past their due date
- **Due today**: Tasks due today
- **Upcoming tasks**: Tasks due in the configured number of days (default: 3 days and 1 day before)

Each task shows:

- Task title
- Instrument information (maker, type, serial number)
- Task type
- Days until/since due date

## User Settings

Users can configure their notification preferences via the `notification_settings` table:

- `email_notifications`: Enable/disable email notifications
- `notification_time`: Time to send notifications (currently not used by cron, but can be used for filtering)
- `days_before_due`: Array of days before due date to send reminders (e.g., [3, 1] for D-3 and D-1)
- `enabled`: Master switch for all notifications

## Testing

You can test the function manually:

```bash
# Using Supabase CLI
supabase functions invoke send-notifications \
  --header "x-send-notifications-secret: $SEND_NOTIFICATIONS_SECRET"

# Or via curl
curl -X POST https://your-project.supabase.co/functions/v1/send-notifications \
  -H "x-send-notifications-secret: $SEND_NOTIFICATIONS_SECRET"
```

## Troubleshooting

- **No emails sent**: Check that `RESEND_API_KEY` is set correctly
- **Function errors**: Check Edge Function logs in Supabase Dashboard
- **Users not receiving emails**: Verify:
  - User has `email_notifications = true` in `notification_settings`
  - User has `enabled = true` in `notification_settings`
  - User has a valid email in `auth.users`
  - Resend domain is verified (if using custom domain)
- **401 Unauthorized**: Verify `SEND_NOTIFICATIONS_SECRET` matches the `x-send-notifications-secret` header sent by your cron or server
