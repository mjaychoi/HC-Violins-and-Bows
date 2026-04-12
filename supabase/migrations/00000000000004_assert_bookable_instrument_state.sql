-- One top-level statement per migration file (Supabase CLI / pgx prepared-statement splitter).

CREATE OR REPLACE FUNCTION public.assert_bookable_instrument_state(
  p_instrument_id UUID,
  p_org_id        UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public.instruments
  WHERE id = p_instrument_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;

  IF v_status = 'Sold' THEN
    RAISE EXCEPTION 'Booked relationship cannot be assigned to a sold instrument.';
  END IF;

  IF v_status = 'Maintenance' THEN
    RAISE EXCEPTION 'Booked relationship cannot be assigned while instrument is in maintenance.';
  END IF;
END;
$$;
