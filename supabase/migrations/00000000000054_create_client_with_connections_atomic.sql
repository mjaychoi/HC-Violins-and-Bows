-- Atomic client insert + zero or more instrument links in one transaction.
-- Reuses public.create_connection_atomic for each link (Booked/Sold rules, RLS via JWT).

CREATE OR REPLACE FUNCTION public.create_client_with_connections_atomic(
  p_name            TEXT,
  p_email           TEXT DEFAULT NULL,
  p_phone           TEXT DEFAULT NULL,
  p_client_number   TEXT DEFAULT NULL,
  p_links           JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id      UUID := public.org_id();
  v_client_id   UUID;
  rec           RECORD;
  v_conn_id     UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Client name is required';
  END IF;

  INSERT INTO public.clients (org_id, name, email, phone, client_number)
  VALUES (
    v_org_id,
    trim(p_name),
    NULLIF(trim(COALESCE(p_email, '')), ''),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_client_number, '')), '')
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

  RETURN v_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_with_connections_atomic(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_with_connections_atomic(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;
