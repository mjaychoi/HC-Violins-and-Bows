-- update_connection_atomic and delete_connection_atomic each do a
-- `SELECT ... FOR UPDATE` (which requires only org_id = org_id(), per the
-- client_instruments_select RLS policy) to load and lock the row, then a
-- separate UPDATE/DELETE (which additionally requires is_admin(), per the
-- client_instruments_update/client_instruments_delete RLS policies). RLS
-- silently filters an UPDATE/DELETE a caller isn't allowed to perform down
-- to zero affected rows rather than raising - it does not error. Neither
-- function checked FOUND after that second statement, so a same-org,
-- non-admin caller invoking the RPC directly (bypassing the Next.js API's
-- own requireAdmin check) would see the row located and locked by the
-- SELECT, then silently have the UPDATE/DELETE dropped by RLS, and still
-- get back the connection id as if the write had succeeded.
--
-- This mirrors the FOUND check reorder_connections_atomic already has
-- (00000000000049_reorder_connections_atomic.sql:34-36) for the same
-- reason. CREATE OR REPLACE FUNCTION on an unchanged signature preserves
-- existing grants, so no accompanying REVOKE/GRANT migration is needed.
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
  v_next_relationship  TEXT;
  v_next_notes         TEXT;
BEGIN
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization context required'; END IF;

  IF p_updates ? 'client_id' OR p_updates ? 'instrument_id' THEN
    RAISE EXCEPTION 'CONNECTION_REASSIGNMENT_UNSUPPORTED: Reassigning a connection''s client_id/instrument_id is not supported. Create a new connection instead.';
  END IF;

  SELECT * INTO v_current FROM public.client_instruments
  WHERE id = p_connection_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;

  v_next_relationship  := CASE WHEN p_updates ? 'relationship_type' THEN p_updates->>'relationship_type'                 ELSE v_current.relationship_type END;
  v_next_notes         := CASE WHEN p_updates ? 'notes'             THEN p_updates->>'notes'                             ELSE v_current.notes             END;

  IF v_current.relationship_type = 'Sold' AND v_next_relationship <> 'Sold' THEN
    RAISE EXCEPTION 'Sold connections cannot be moved to another relationship.';
  END IF;
  IF v_next_relationship = 'Sold' AND v_current.relationship_type <> 'Sold' THEN
    RAISE EXCEPTION 'Sold relationship cannot be assigned directly. Use the sales API.';
  END IF;
  IF v_next_relationship = 'Booked' THEN
    PERFORM public.assert_bookable_instrument_state(v_current.instrument_id, v_org_id);
  END IF;

  UPDATE public.client_instruments SET
    relationship_type = v_next_relationship,
    notes             = v_next_notes
  WHERE id = p_connection_id AND org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found or update not permitted';
  END IF;

  IF v_current.instrument_id IS NOT NULL
     AND (v_current.relationship_type = 'Booked' OR v_next_relationship = 'Booked') THEN
    PERFORM public.reconcile_booked_instrument_state(v_current.instrument_id, v_org_id);
  END IF;

  RETURN p_connection_id;
END;
$$;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found or delete not permitted';
  END IF;

  IF v_current.instrument_id IS NOT NULL AND v_current.relationship_type = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(v_current.instrument_id, v_org_id);
  END IF;

  RETURN p_connection_id;
END;
$$;
