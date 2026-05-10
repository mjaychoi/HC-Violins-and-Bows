COMMENT ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]
) IS
  'Atomically creates a client and links; returns JSONB { client, connections }. p_tags is optional.';
