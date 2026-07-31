-- F13: reassigning a connection's client_id/instrument_id is not a supported
-- product operation (no UI, no documented workflow). update_connection_atomic
-- previously honored these fields if present in p_updates, and did so without
-- verifying the new client/instrument belonged to the same organization,
-- which is a latent cross-organization data-integrity gap for any caller
-- invoking the RPC directly (bypassing the Next.js API layer).
--
-- This migration makes reassignment a no-op at the database layer regardless
-- of caller, so the invariant holds even for direct RPC calls. The API layer
-- separately rejects these fields with an explicit 400 (see
-- src/app/api/connections/route.ts) so legitimate callers get clear feedback.
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

  SELECT * INTO v_current FROM public.client_instruments
  WHERE id = p_connection_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;

  -- client_id and instrument_id are intentionally not read from p_updates:
  -- reassignment is unsupported. Only relationship_type and notes are
  -- mutable via this RPC.
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

  IF v_current.instrument_id IS NOT NULL
     AND (v_current.relationship_type = 'Booked' OR v_next_relationship = 'Booked') THEN
    PERFORM public.reconcile_booked_instrument_state(v_current.instrument_id, v_org_id);
  END IF;

  RETURN p_connection_id;
END;
$$;
