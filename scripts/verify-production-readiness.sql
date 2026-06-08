-- Production readiness verification queries.
-- Run these in the Supabase SQL editor (or psql) after unpausing the project.

-- ────────────────────────────────────────────────────────────
-- 1. Confirm all recent migrations were applied
-- ────────────────────────────────────────────────────────────
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260608000001',   -- orphaned_storage_objects table
  '20260608000002',   -- orphan_cleanup_cron job
  '20260608000003'    -- audit_log table
)
ORDER BY version;
-- Expected: 3 rows.  Missing row = migration not applied → run supabase db push.

-- ────────────────────────────────────────────────────────────
-- 2. Confirm orphaned_storage_objects table + RLS exists
-- ────────────────────────────────────────────────────────────
SELECT
  tablename,
  rowsecurity   -- must be true
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'orphaned_storage_objects';

SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'orphaned_storage_objects';
-- Expected policies: orphaned_storage_objects_select, orphaned_storage_objects_insert, orphaned_storage_objects_delete

-- ────────────────────────────────────────────────────────────
-- 3. Confirm audit_log table + RLS exists
-- ────────────────────────────────────────────────────────────
SELECT
  tablename,
  rowsecurity   -- must be true
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'audit_log';

SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'audit_log';
-- Expected policies: audit_log_select_admin (SELECT, authenticated), audit_log_insert_service_role (INSERT, service_role)

-- ────────────────────────────────────────────────────────────
-- 4. Confirm pg_cron job is registered
-- ────────────────────────────────────────────────────────────
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'orphan-storage-cleanup';
-- Expected: 1 row, active = true, schedule = '*/15 * * * *'
-- If 0 rows: pg_cron extension was not enabled before the migration ran.
--   Fix: GRANT USAGE ON SCHEMA cron TO postgres; then re-run the migration body manually.

-- ────────────────────────────────────────────────────────────
-- 5. Confirm pg_cron + pg_net extensions are enabled
-- ────────────────────────────────────────────────────────────
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pg_cron', 'pg_net');
-- Expected: 2 rows.  Missing = extension not enabled.
--   Enable via: Supabase Dashboard > Database > Extensions > enable pg_cron / pg_net.

-- ────────────────────────────────────────────────────────────
-- 6. Confirm Vault secrets are set
-- ────────────────────────────────────────────────────────────
SELECT name,
       CASE WHEN decrypted_secret IS NOT NULL AND decrypted_secret <> '' THEN 'SET' ELSE 'MISSING' END AS status
FROM vault.decrypted_secrets
WHERE name IN ('orphan_cleanup_secret', 'app_base_url');
-- Expected: 2 rows both showing 'SET'.
-- To set: Supabase Dashboard > Vault > New Secret.
--   orphan_cleanup_secret = same value as ORPHAN_CLEANUP_SECRET in your app env
--   app_base_url          = e.g. https://your-app.vercel.app

-- ────────────────────────────────────────────────────────────
-- 7. Smoke-test audit_log admin-only org-scoped RLS
--    (run as authenticated user with admin role in their org)
-- ────────────────────────────────────────────────────────────
-- As admin user: should see rows only for their org.
SELECT id, org_id, actor_id, action, created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 20;

-- As member user (different role):
-- The same query should return 0 rows (RLS policy requires role = 'admin' in org_members).

-- ────────────────────────────────────────────────────────────
-- 8. Smoke-test orphan cleanup endpoint (after setting ORPHAN_CLEANUP_SECRET)
-- ────────────────────────────────────────────────────────────
-- curl -X POST https://your-app.vercel.app/api/admin/orphan-cleanup \
--   -H "Authorization: Bearer <ORPHAN_CLEANUP_SECRET>" \
--   -H "Content-Type: application/json" \
--   -d '{}'
-- Expected: 200 { "processed": 0, "cleaned": 0, "stillFailing": 0, "errors": [] }

-- ────────────────────────────────────────────────────────────
-- 9. Type regeneration command (run locally after unpausing)
-- ────────────────────────────────────────────────────────────
-- supabase gen types typescript \
--   --project-id dmilmlhquttcozxlpfxw \
--   > src/types/database.ts
-- Then run: npx tsc --noEmit   (must stay clean)
