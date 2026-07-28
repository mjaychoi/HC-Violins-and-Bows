DROP FUNCTION IF EXISTS public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.create_client_with_connections_atomic(
  p_name            TEXT,
  p_email           TEXT DEFAULT NULL,
  p_phone           TEXT DEFAULT NULL,
  p_client_number   TEXT DEFAULT NULL,
  p_links           JSONB DEFAULT '[]'::JSONB,
  p_tags            TEXT[] DEFAULT NULL,
  p_interest        TEXT DEFAULT NULL,
  p_note            TEXT DEFAULT NULL,
  p_first_name      TEXT DEFAULT NULL,
  p_last_name       TEXT DEFAULT NULL
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
  v_interest     TEXT := NULLIF(trim(COALESCE(p_interest, '')), '');
  v_note         TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
  v_first        TEXT := NULLIF(trim(COALESCE(p_first_name, '')), '');
  v_last         TEXT := NULLIF(trim(COALESCE(p_last_name, '')), '');
  v_name         TEXT := NULLIF(trim(COALESCE(p_name, '')), '');
  v_space        INT;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF v_first IS NULL AND v_last IS NULL AND v_name IS NOT NULL THEN
    v_space := POSITION(' ' IN v_name);
    IF v_space > 0 THEN
      v_first := BTRIM(SUBSTRING(v_name FROM 1 FOR v_space - 1));
      v_last := NULLIF(BTRIM(SUBSTRING(v_name FROM v_space + 1)), '');
    ELSE
      v_first := v_name;
    END IF;
  ELSIF v_first IS NOT NULL OR v_last IS NOT NULL THEN
    v_name := NULLIF(BTRIM(CONCAT_WS(' ', v_first, v_last)), '');
  END IF;

  IF v_first IS NULL AND v_last IS NULL THEN
    RAISE EXCEPTION 'Client name is required';
  END IF;

  INSERT INTO public.clients (
    org_id,
    name,
    first_name,
    last_name,
    email,
    phone,
    client_number,
    tags,
    interest,
    note
  )
  VALUES (
    v_org_id,
    v_name,
    v_first,
    v_last,
    NULLIF(trim(COALESCE(p_email, '')), ''),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_client_number, '')), ''),
    v_tags,
    v_interest,
    v_note
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
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT, TEXT, TEXT
) TO authenticated;

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
BEGIN
  RETURN public.create_client_with_connections_atomic(
    p_name,
    p_email,
    p_phone,
    p_client_number,
    p_links,
    p_tags,
    NULL,
    NULL,
    NULL,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]
) TO authenticated;
