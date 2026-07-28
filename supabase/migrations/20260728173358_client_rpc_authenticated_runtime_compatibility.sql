-- Keep the legacy five-argument RPC compatible with the canonical name-part
-- persistence contract. The canonical function owns validation and fallback.
CREATE OR REPLACE FUNCTION public.create_client_with_connections_atomic(
  p_name          TEXT,
  p_email         TEXT DEFAULT NULL,
  p_phone         TEXT DEFAULT NULL,
  p_client_number TEXT DEFAULT NULL,
  p_links         JSONB DEFAULT '[]'::JSONB
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
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );
END;
$$;

-- All overloads execute with the caller's table privileges and RLS context.
ALTER FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB
) SECURITY INVOKER;
ALTER FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]
) SECURITY INVOKER;
ALTER FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT, TEXT, TEXT
) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- Minimum table privileges required by the invoker RPC call graph.
GRANT SELECT, INSERT ON TABLE public.clients TO authenticated;
GRANT SELECT, INSERT ON TABLE public.client_instruments TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.instruments TO authenticated;

-- The Data API's unauthenticated role must not reach these tenant tables.
REVOKE ALL ON TABLE public.clients FROM anon;
REVOKE ALL ON TABLE public.client_instruments FROM anon;
REVOKE ALL ON TABLE public.instruments FROM anon;
