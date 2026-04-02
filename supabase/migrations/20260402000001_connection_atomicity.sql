BEGIN;

CREATE OR REPLACE FUNCTION public.assert_bookable_instrument_state(
  p_instrument_id UUID,
  p_org_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
  FROM public.instruments
  WHERE id = p_instrument_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instrument not found';
  END IF;

  IF v_status = 'Sold' THEN
    RAISE EXCEPTION 'Booked relationship cannot be assigned to a sold instrument.';
  END IF;

  IF v_status = 'Maintenance' THEN
    RAISE EXCEPTION 'Booked relationship cannot be assigned while the instrument is in maintenance.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_booked_instrument_state(
  p_instrument_id UUID,
  p_org_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_status TEXT;
  v_reserved_reason TEXT;
  v_reserved_by_user_id UUID;
  v_reserved_connection_id UUID;
  v_booked_count BIGINT;
BEGIN
  SELECT
    status,
    reserved_reason,
    reserved_by_user_id,
    reserved_connection_id
  INTO
    v_status,
    v_reserved_reason,
    v_reserved_by_user_id,
    v_reserved_connection_id
  FROM public.instruments
  WHERE id = p_instrument_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instrument not found';
  END IF;

  SELECT COUNT(*)
    INTO v_booked_count
  FROM public.client_instruments
  WHERE instrument_id = p_instrument_id
    AND org_id = p_org_id
    AND relationship_type = 'Booked';

  IF v_booked_count > 0 THEN
    IF v_status = 'Sold' THEN
      RAISE EXCEPTION 'Booked relationship cannot be assigned to a sold instrument.';
    END IF;

    IF v_status = 'Maintenance' THEN
      RAISE EXCEPTION 'Booked relationship cannot be assigned while the instrument is in maintenance.';
    END IF;

    IF v_status <> 'Booked' THEN
      UPDATE public.instruments
      SET status = 'Booked'
      WHERE id = p_instrument_id
        AND org_id = p_org_id;
    END IF;
    RETURN;
  END IF;

  IF v_status = 'Booked' THEN
    UPDATE public.instruments
    SET
      status = CASE
        WHEN v_reserved_reason IS NOT NULL THEN 'Reserved'
        ELSE 'Available'
      END,
      reserved_reason = v_reserved_reason,
      reserved_by_user_id = v_reserved_by_user_id,
      reserved_connection_id = v_reserved_connection_id
    WHERE id = p_instrument_id
      AND org_id = p_org_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_connection_atomic(
  p_client_id UUID,
  p_instrument_id UUID,
  p_relationship_type TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_connection_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF p_relationship_type = 'Sold' THEN
    RAISE EXCEPTION 'Sold relationship cannot be created directly. Use the sales API.';
  END IF;

  IF p_relationship_type = 'Booked' THEN
    PERFORM public.assert_bookable_instrument_state(p_instrument_id, v_org_id);
  END IF;

  INSERT INTO public.client_instruments (
    client_id,
    instrument_id,
    relationship_type,
    notes,
    org_id
  )
  VALUES (
    p_client_id,
    p_instrument_id,
    p_relationship_type,
    p_notes,
    v_org_id
  )
  RETURNING id INTO v_connection_id;

  IF p_relationship_type = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(p_instrument_id, v_org_id);
  END IF;

  RETURN v_connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_connection_atomic(
  p_connection_id UUID,
  p_updates JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_current RECORD;
  v_next_client_id UUID;
  v_next_instrument_id UUID;
  v_next_relationship_type TEXT;
  v_next_notes TEXT;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  SELECT *
    INTO v_current
  FROM public.client_instruments
  WHERE id = p_connection_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;

  v_next_client_id := CASE
    WHEN p_updates ? 'client_id' THEN NULLIF(p_updates->>'client_id', '')::uuid
    ELSE v_current.client_id
  END;

  v_next_instrument_id := CASE
    WHEN p_updates ? 'instrument_id' THEN NULLIF(p_updates->>'instrument_id', '')::uuid
    ELSE v_current.instrument_id
  END;

  v_next_relationship_type := CASE
    WHEN p_updates ? 'relationship_type' THEN p_updates->>'relationship_type'
    ELSE v_current.relationship_type
  END;

  v_next_notes := CASE
    WHEN p_updates ? 'notes' THEN p_updates->>'notes'
    ELSE v_current.notes
  END;

  IF v_current.relationship_type = 'Sold'
     AND v_next_relationship_type <> 'Sold' THEN
    RAISE EXCEPTION 'Sold connections cannot be moved to another relationship.';
  END IF;

  IF v_next_relationship_type = 'Sold'
     AND v_current.relationship_type <> 'Sold' THEN
    RAISE EXCEPTION 'Sold relationship cannot be assigned directly. Use the sales API.';
  END IF;

  IF v_next_relationship_type = 'Booked' THEN
    PERFORM public.assert_bookable_instrument_state(v_next_instrument_id, v_org_id);
  END IF;

  UPDATE public.client_instruments
  SET
    client_id = v_next_client_id,
    instrument_id = v_next_instrument_id,
    relationship_type = v_next_relationship_type,
    notes = v_next_notes
  WHERE id = p_connection_id
    AND org_id = v_org_id;

  IF v_current.instrument_id IS NOT NULL
     AND v_current.relationship_type = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(v_current.instrument_id, v_org_id);
  END IF;

  IF v_next_instrument_id IS NOT NULL
     AND v_next_relationship_type = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(v_next_instrument_id, v_org_id);
  END IF;

  RETURN p_connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_connection_atomic(
  p_connection_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_current RECORD;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  SELECT *
    INTO v_current
  FROM public.client_instruments
  WHERE id = p_connection_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;

  DELETE FROM public.client_instruments
  WHERE id = p_connection_id
    AND org_id = v_org_id;

  IF v_current.instrument_id IS NOT NULL
     AND v_current.relationship_type = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(v_current.instrument_id, v_org_id);
  END IF;

  RETURN p_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_bookable_instrument_state(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_booked_instrument_state(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_connection_atomic(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_connection_atomic(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_connection_atomic(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assert_bookable_instrument_state(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_booked_instrument_state(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_connection_atomic(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_connection_atomic(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_connection_atomic(UUID) TO authenticated;

COMMIT;
