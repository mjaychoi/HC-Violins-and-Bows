COMMENT ON FUNCTION public.create_client_with_connections_atomic(
  TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT
) IS
  'Atomically creates a client and links; persists tags, interest, and note; returns JSONB { client, connections }.';
