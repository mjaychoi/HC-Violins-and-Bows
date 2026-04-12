CREATE OR REPLACE FUNCTION public.delete_connection_atomic(p_connection_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id  UUID := public.org_id();
  v_current RECORD;
BEGIN
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization context required'; END IF;

  SELECT * INTO v_current FROM public.client_instruments
  WHERE id = p_connection_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;

  DELETE FROM public.client_instruments
  WHERE id = p_connection_id AND org_id = v_org_id;

  IF v_current.instrument_id IS NOT NULL AND v_current.relationship_type = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(v_current.instrument_id, v_org_id);
  END IF;

  RETURN p_connection_id;
END;
$$;
