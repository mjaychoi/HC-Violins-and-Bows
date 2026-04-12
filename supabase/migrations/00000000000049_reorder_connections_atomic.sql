CREATE OR REPLACE FUNCTION public.reorder_connections_atomic(p_orders JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id        UUID := public.org_id();
  v_item          JSONB;
  v_connection_id UUID;
  v_display_order INTEGER;
BEGIN
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization context required'; END IF;
  IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' THEN
    RAISE EXCEPTION 'orders must be an array';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_orders) LOOP
    BEGIN
      v_connection_id := (v_item->>'id')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid connection ID: %', v_item->>'id';
    END;

    BEGIN
      v_display_order := (v_item->>'display_order')::INTEGER;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid display_order for connection %', v_item->>'id';
    END;

    UPDATE public.client_instruments
    SET display_order = v_display_order
    WHERE id = v_connection_id AND org_id = v_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Connection not found in organization: %', v_item->>'id';
    END IF;
  END LOOP;
END;
$$;
