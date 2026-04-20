-- org_id(): invalid JWT org claims must not abort every RLS query (500 / HTML error pages).
-- Return NULL when the claim is missing, empty, or not a valid UUID.

CREATE OR REPLACE FUNCTION public.org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
BEGIN
  raw := COALESCE(
    NULLIF(btrim(auth.jwt() -> 'app_metadata' ->> 'org_id'), ''),
    NULLIF(btrim(auth.jwt() -> 'app_metadata' ->> 'organization_id'), ''),
    NULLIF(btrim(auth.jwt() ->> 'org_id'), ''),
    NULLIF(btrim(auth.jwt() ->> 'organization_id'), '')
  );

  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN raw::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;
END;
$$;

COMMENT ON FUNCTION public.org_id() IS
  'Returns current JWT org UUID from app_metadata (or top-level claims); NULL if missing or invalid.';
