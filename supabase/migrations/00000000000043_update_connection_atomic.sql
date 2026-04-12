CREATE OR REPLACE FUNCTION public.update_connection_atomic(
  p_connection_id UUID,
  p_updates       JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id             UUID := public.org_id();
  v_current            RECORD;
  v_next_client_id     UUID;
  v_next_instrument_id UUID;
  v_next_relationship  TEXT;
  v_next_notes         TEXT;
BEGIN
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization context required'; END IF;

  SELECT * INTO v_current FROM public.client_instruments
  WHERE id = p_connection_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;

  v_next_client_id     := CASE WHEN p_updates ? 'client_id'         THEN NULLIF(p_updates->>'client_id','')::uuid        ELSE v_current.client_id         END;
  v_next_instrument_id := CASE WHEN p_updates ? 'instrument_id'     THEN NULLIF(p_updates->>'instrument_id','')::uuid    ELSE v_current.instrument_id     END;
  v_next_relationship  := CASE WHEN p_updates ? 'relationship_type' THEN p_updates->>'relationship_type'                 ELSE v_current.relationship_type END;
  v_next_notes         := CASE WHEN p_updates ? 'notes'             THEN p_updates->>'notes'                             ELSE v_current.notes             END;

  IF v_current.relationship_type = 'Sold' AND v_next_relationship <> 'Sold' THEN
    RAISE EXCEPTION 'Sold connections cannot be moved to another relationship.';
  END IF;
  IF v_next_relationship = 'Sold' AND v_current.relationship_type <> 'Sold' THEN
    RAISE EXCEPTION 'Sold relationship cannot be assigned directly. Use the sales API.';
  END IF;
  IF v_next_relationship = 'Booked' THEN
    PERFORM public.assert_bookable_instrument_state(v_next_instrument_id, v_org_id);
  END IF;

  UPDATE public.client_instruments SET
    client_id         = v_next_client_id,
    instrument_id     = v_next_instrument_id,
    relationship_type = v_next_relationship,
    notes             = v_next_notes
  WHERE id = p_connection_id AND org_id = v_org_id;

  IF v_current.instrument_id IS NOT NULL AND v_current.relationship_type = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(v_current.instrument_id, v_org_id);
  END IF;
  IF v_next_instrument_id IS NOT NULL AND v_next_relationship = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(v_next_instrument_id, v_org_id);
  END IF;

  RETURN p_connection_id;
END;
$$;
