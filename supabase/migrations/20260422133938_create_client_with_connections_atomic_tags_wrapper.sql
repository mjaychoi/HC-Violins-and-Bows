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
    NULL
  );
END;
$$;
