-- Post-push bootstrap (Supabase SQL Editor or psql).
-- 1) If you already ran `supabase db push` including 00000000000053_storage_buckets.sql,
--    skip the "Storage buckets" section below.
-- 2) Pick one org UUID and use the SAME value in Auth → Users → app_metadata.org_id (and role).
--    Example org id below is fixed for easy copy-paste; change if it collides.

-- ─── Storage buckets (skip if migration 53 applied) ───
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('instrument-images', 'instrument-images', false),
  ('instrument-certificates', 'instrument-certificates', false),
  ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- ─── Organization ───
INSERT INTO public.organizations (id, name)
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'HC Violins and Bows'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Minimal instrument (org-scoped) ───
INSERT INTO public.instruments (id, org_id, type, status)
VALUES (
  '00000000-0000-4000-8000-000000000002'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Violin',
  'Available'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Minimal maintenance task (calendar smoke test) ───
INSERT INTO public.maintenance_tasks (
  id,
  org_id,
  instrument_id,
  task_type,
  title,
  received_date,
  status
)
VALUES (
  '00000000-0000-4000-8000-000000000003'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000002'::uuid,
  'maintenance',
  'Post-migration smoke test',
  CURRENT_DATE,
  'pending'
)
ON CONFLICT (id) DO NOTHING;

-- ─── Auth (Dashboard): set user Raw app meta JSON, e.g. ───
-- {
--   "org_id": "00000000-0000-4000-8000-000000000001",
--   "role": "admin"
-- }

-- ─── Verification: schema ───
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'maintenance_tasks'
-- ORDER BY ordinal_position;
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'instruments'
-- ORDER BY ordinal_position;

-- ─── Verification: maintenance_tasks RLS policies ───
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'maintenance_tasks';
