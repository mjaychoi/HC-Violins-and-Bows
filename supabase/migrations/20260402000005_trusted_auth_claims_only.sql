BEGIN;

-- SECURITY: org and role claims must come only from server-controlled claims.
-- After applying this migration, force clients to refresh or re-authenticate so
-- existing sessions pick up tokens minted without user_metadata-based auth.

CREATE OR REPLACE FUNCTION auth.org_id()
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

CREATE OR REPLACE FUNCTION auth.user_role()
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

CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT auth.user_role() = 'admin'
$$;

COMMIT;
