CREATE OR REPLACE FUNCTION public.create_connection_atomic(
  p_client_id         UUID,
  p_instrument_id     UUID,
  p_relationship_type TEXT,
  p_notes             TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id        UUID := public.org_id();
  v_connection_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id = p_client_id
      AND org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Client not found in organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.instruments
    WHERE id = p_instrument_id
      AND org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Instrument not found in organization';
  END IF;

  IF p_relationship_type = 'Sold' THEN
    RAISE EXCEPTION 'Sold relationship cannot be created directly. Use the sales API.';
  END IF;

  IF p_relationship_type = 'Booked' THEN
    PERFORM public.assert_bookable_instrument_state(p_instrument_id, v_org_id);
  END IF;

  INSERT INTO public.client_instruments (
    client_id, instrument_id, relationship_type, notes, org_id
  ) VALUES (
    p_client_id, p_instrument_id, p_relationship_type, p_notes, v_org_id
  )
  RETURNING id INTO v_connection_id;

  IF p_relationship_type = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(p_instrument_id, v_org_id);
  END IF;

  RETURN v_connection_id;
END;
$$;
