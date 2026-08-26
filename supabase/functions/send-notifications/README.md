# Send Notifications Edge Function

**This function is not part of the current supported release.**

Email notification delivery is unsupported for the current launch.

- This directory is dormant reference / future-development material.
- It is **not** an application launch dependency.
- Do **not** deploy or activate this function for production.
- No supported cron deployment is currently provided.
- The notification settings API reports `notificationDeliverySupported: false` and rejects enable requests.
- Do not provision `RESEND_API_KEY` or `SEND_NOTIFICATIONS_SECRET` as part of normal production setup.
- Do not deploy or activate this path without a separate production-readiness effort.

The rest of this file is historical reference only. It does not describe a supported production feature and must not be treated as a launch runbook.

---

## Reference only: future implementation notes

This Edge Function contains an unfinished implementation that would send daily email notifications about maintenance tasks. It is not proven, not scheduled, and not operator-supported.

### Environment variables (inactive)

These secrets are **not** required for the current release:

```bash
# Resend API Key (for sending emails) — unsupported / unused
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Application URL (for links in emails)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Supabase credentials (automatically available in Edge Functions)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Required invocation secret for cron/server-side callers only
SEND_NOTIFICATIONS_SECRET=your_long_random_secret
```

### Deploy / cron (do not run for current launch)

The commands below are **not** part of production deployment. They remain here only as future-development notes.

```bash
# Using Supabase CLI — do not run for current launch
supabase functions deploy send-notifications
```

Historical cron sketch (unsupported):

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

If this path is ever revived, it must reject `anon` / user bearer tokens, use a trusted invocation secret, and complete a separate production-readiness project first.

### Intended behavior (unimplemented for launch)

A future supported version would:

1. Run on a trusted schedule
2. Fetch users with email notifications enabled
3. Classify pending/in-progress maintenance tasks
4. Send email via a verified provider
5. Record `last_notification_sent_at`

Users cannot currently enable this via `notification_settings`. Stored preference rows are not proof that delivery is active.

### Making this a supported feature later

A separate production-readiness effort would need at least:

- environment-based feature enablement
- Edge Function deployment automation
- `SEND_NOTIFICATIONS_SECRET` provisioning
- Resend verified sender/domain
- cron scheduling
- timezone semantics
- actual `notification_time` handling
- idempotency / duplicate-send prevention
- retries
- bounce/complaint handling
- delivery observability
- staging real-email receipt test
- production rollout/rollback

Do not treat this README as permission to enable any of the above in the current release.
