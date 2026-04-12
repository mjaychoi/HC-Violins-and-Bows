-- ============================================================
-- Auth helpers — JWT claim extractors and role helpers.
--
-- IMPORTANT: These are in the PUBLIC schema, NOT auth schema.
-- Supabase manages the auth schema and may wipe custom functions
-- there during platform upgrades.  All RLS policies and RPCs
-- must call public.org_id(), public.is_admin(), public.user_role().
-- ============================================================

-- ──────────────────────────────────────────────
-- updated_at trigger function (shared by all tables)
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────
-- public.org_id()
-- Reads org_id from app_metadata (server-controlled claim only).
-- Clients cannot spoof this via user_metadata.
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'org_id'),
    (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
    (auth.jwt() ->> 'org_id'),
    (auth.jwt() ->> 'organization_id')
  )::uuid
$$;

-- ──────────────────────────────────────────────
-- public.user_role()
-- Returns 'admin' or 'member'.  Reads only from app_metadata.
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN lower(trim(COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'app_role',
      auth.jwt() ->> 'role',
      auth.jwt() ->> 'app_role',
      'member'
    ))) = 'admin' THEN 'admin'
    ELSE 'member'
  END
$$;

-- ──────────────────────────────────────────────
-- public.is_admin()
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.user_role() = 'admin'
$$;
