-- Schedules a periodic HTTP job (via pg_net + pg_cron) to retry deletion
-- of orphaned storage objects logged in public.orphaned_storage_objects.
--
-- Prerequisites (run once by a superuser):
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--   GRANT USAGE ON SCHEMA cron TO postgres;
--
-- Required Supabase Vault secrets (set via the Supabase dashboard or CLI):
--   orphan_cleanup_secret  →  same value as ORPHAN_CLEANUP_SECRET in your app env
--   app_base_url           →  e.g. https://your-app.vercel.app
--
-- The job runs every 15 minutes.  Adjust the schedule as needed.

SELECT cron.schedule(
  'orphan-storage-cleanup',       -- job name (unique)
  '*/15 * * * *',                 -- every 15 minutes
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_base_url') || '/api/admin/orphan-cleanup',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'orphan_cleanup_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
