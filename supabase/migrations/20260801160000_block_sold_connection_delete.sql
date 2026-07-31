-- F3: Sold relationships are the durable record of a completed sale. The
-- ordinary connection-delete path must never remove them; only the existing
-- sales refund/adjustment workflow (create_sale_adjustment_atomic via
-- update_instrument_sale_transition_atomic) may change a completed sale's
-- state. This migration adds that guard without introducing any new
-- privileged deletion/force-delete path.
--
-- The exception message is prefixed with the stable token
-- SOLD_CONNECTION_IMMUTABLE so the API layer can map it to a 409 response
-- using the error code/message contract instead of brittle free-text
-- matching on unrelated phrases.
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

  IF v_current.relationship_type = 'Sold' THEN
    RAISE EXCEPTION 'SOLD_CONNECTION_IMMUTABLE: Sold relationships cannot be deleted. Use the sales refund/adjustment workflow instead.';
  END IF;

  DELETE FROM public.client_instruments
  WHERE id = p_connection_id AND org_id = v_org_id;

  IF v_current.instrument_id IS NOT NULL AND v_current.relationship_type = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(v_current.instrument_id, v_org_id);
  END IF;

  RETURN p_connection_id;
END;
$$;
