-- Persist client tags (e.g. Owner, Musician) for list/detail display.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.clients.tags IS
  'Application tags (e.g. Owner, Musician). Distinct from RLS/tenant.';

-- Recreate atomic create RPC with tags on insert (6th param).
DROP FUNCTION IF EXISTS public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB
);

CREATE OR REPLACE FUNCTION public.create_client_with_connections_atomic(
  p_name            TEXT,
  p_email           TEXT DEFAULT NULL,
  p_phone           TEXT DEFAULT NULL,
  p_client_number   TEXT DEFAULT NULL,
  p_links           JSONB DEFAULT '[]'::JSONB,
  p_tags            TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id       UUID := public.org_id();
  v_client_id    UUID;
  rec            RECORD;
  v_conn_id      UUID;
  v_client       JSONB;
  v_connections  JSONB;
  v_tags         TEXT[] := COALESCE(p_tags, ARRAY[]::text[]);
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Client name is required';
  END IF;

  INSERT INTO public.clients (org_id, name, email, phone, client_number, tags)
  VALUES (
    v_org_id,
    trim(p_name),
    NULLIF(trim(COALESCE(p_email, '')), ''),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_client_number, '')), ''),
    v_tags
  )
  RETURNING id INTO v_client_id;

  FOR rec IN
    SELECT
      (j.value->>'instrument_id')::uuid AS iid,
      COALESCE(NULLIF(trim(j.value->>'relationship_type'), ''), 'Interested') AS rtype,
      NULLIF(j.value->>'notes', '') AS nnotes
    FROM jsonb_array_elements(COALESCE(p_links, '[]'::jsonb)) AS j(value)
  LOOP
    v_conn_id := public.create_connection_atomic(
      v_client_id,
      rec.iid,
      rec.rtype,
      rec.nnotes
    );
  END LOOP;

  SELECT to_jsonb(c) INTO v_client
  FROM public.clients c
  WHERE c.id = v_client_id;

  SELECT coalesce(
    (
      SELECT jsonb_agg(to_jsonb(ci) ORDER BY ci.display_order, ci.created_at)
      FROM public.client_instruments ci
      WHERE ci.client_id = v_client_id
    ),
    '[]'::jsonb
  )
  INTO v_connections;

  RETURN jsonb_build_object('client', v_client, 'connections', v_connections);
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]
) TO authenticated;

COMMENT ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]
) IS
  'Atomically creates a client and links; returns JSONB { client, connections }. p_tags is optional.';
