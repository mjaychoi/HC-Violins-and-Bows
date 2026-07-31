-- F13 (hardening pass): the 20260801170000 migration made client_id/instrument_id
-- reassignment via update_connection_atomic a silent no-op - the RPC ignored
-- the fields and still applied any other requested changes (e.g. notes),
-- returning success. That is exactly the "ignore and return success" /
-- "partially update other fields while silently dropping the reassignment
-- request" outcome the product contract must not allow: a direct RPC caller
-- (bypassing the Next.js API layer, which already rejects these fields with
-- an explicit 400 - see src/app/api/connections/route.ts) would see no
-- error and could reasonably believe the reassignment took effect.
--
-- This migration replaces the no-op with an explicit, stable, controlled
-- exception (CONNECTION_REASSIGNMENT_UNSUPPORTED) raised before any part of
-- p_updates is applied, so a rejected request never partially mutates the
-- row (relationship_type/notes included) and never returns a connection id
-- implying success. This is a CREATE OR REPLACE FUNCTION on the same
-- signature as the prior migration, so it does not require re-issuing the
-- REVOKE/GRANT pair: PostgreSQL preserves existing object privileges across
-- CREATE OR REPLACE FUNCTION for an unchanged signature. A database that
-- applied only this migration on top of the pre-F13 baseline (never having
-- run 20260801170000) still ends up with the correct grants, because
-- 20260801170000/1/2 remain in the migration set and run first.
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

  -- F13: reassigning a connection's client_id/instrument_id is not a
  -- supported product operation (no UI, no documented workflow). Reject it
  -- explicitly and immediately - before locking/reading the row or applying
  -- any other field in the same request - so the caller gets a clear,
  -- stable error instead of a false impression of success or a partial
  -- update. The API layer separately rejects these fields with an explicit
  -- 400 (see src/app/api/connections/route.ts) for callers going through
  -- the Next.js API, but this RPC must enforce the same contract for any
  -- caller that invokes it directly.
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

  IF v_current.instrument_id IS NOT NULL
     AND (v_current.relationship_type = 'Booked' OR v_next_relationship = 'Booked') THEN
    PERFORM public.reconcile_booked_instrument_state(v_current.instrument_id, v_org_id);
  END IF;

  RETURN p_connection_id;
END;
$$;
