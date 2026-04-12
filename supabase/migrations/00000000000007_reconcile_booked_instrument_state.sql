CREATE OR REPLACE FUNCTION public.reconcile_booked_instrument_state(
  p_instrument_id UUID,
  p_org_id        UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_status                 TEXT;
  v_reserved_reason        TEXT;
  v_reserved_by_user_id    UUID;
  v_reserved_connection_id UUID;
  v_booked_count           BIGINT;
BEGIN
  SELECT status, reserved_reason, reserved_by_user_id, reserved_connection_id
    INTO v_status, v_reserved_reason, v_reserved_by_user_id, v_reserved_connection_id
  FROM public.instruments
  WHERE id = p_instrument_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;

  SELECT COUNT(*) INTO v_booked_count
  FROM public.client_instruments
  WHERE instrument_id = p_instrument_id
    AND org_id = p_org_id
    AND relationship_type = 'Booked';

  IF v_booked_count > 0 THEN
    IF v_status = 'Sold' THEN
      RAISE EXCEPTION 'Booked relationship cannot be assigned to a sold instrument.';
    END IF;
    IF v_status = 'Maintenance' THEN
      RAISE EXCEPTION 'Booked relationship cannot be assigned while instrument is in maintenance.';
    END IF;
    IF v_status <> 'Booked' THEN
      UPDATE public.instruments
      SET status = 'Booked'
      WHERE id = p_instrument_id AND org_id = p_org_id;
    END IF;
    RETURN;
  END IF;

  IF v_status = 'Booked' THEN
    UPDATE public.instruments SET
      status = CASE
        WHEN v_reserved_reason IS NOT NULL THEN 'Reserved'
        ELSE 'Available'
      END,
      reserved_reason        = v_reserved_reason,
      reserved_by_user_id    = v_reserved_by_user_id,
      reserved_connection_id = v_reserved_connection_id
    WHERE id = p_instrument_id AND org_id = p_org_id;
  END IF;
END;
$$;
