-- Migration: persist reserved-state provenance on instruments
-- Created: 2026-04-01

ALTER TABLE public.instruments
  ADD COLUMN IF NOT EXISTS reserved_reason TEXT,
  ADD COLUMN IF NOT EXISTS reserved_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS reserved_connection_id UUID;

COMMENT ON COLUMN public.instruments.reserved_reason IS
  'Why the instrument should return to Reserved after temporary Booked state.';
COMMENT ON COLUMN public.instruments.reserved_by_user_id IS
  'Which authenticated user most recently set or confirmed the Reserved basis.';
COMMENT ON COLUMN public.instruments.reserved_connection_id IS
  'Optional related connection id that explains the current Reserved basis.';

CREATE OR REPLACE FUNCTION public.create_sale_atomic(
  p_sale_price NUMERIC,
  p_sale_date DATE,
  p_client_id UUID,
  p_instrument_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_sale_id UUID;
  v_instrument_status TEXT;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF p_sale_price IS NULL OR p_sale_price = 0 THEN
    RAISE EXCEPTION 'Sale price cannot be zero';
  END IF;

  IF p_instrument_id IS NOT NULL THEN
    SELECT status
      INTO v_instrument_status
    FROM public.instruments
    WHERE id = p_instrument_id
      AND org_id = v_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Instrument not found';
    END IF;

    IF v_instrument_status = 'Sold' THEN
      RAISE EXCEPTION 'Instrument is already sold';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sales_history
      WHERE instrument_id = p_instrument_id
        AND org_id = v_org_id
        AND sale_price > 0
    ) THEN
      RAISE EXCEPTION 'Instrument already has a completed sale record';
    END IF;
  END IF;

  INSERT INTO public.sales_history (
    sale_price,
    sale_date,
    client_id,
    instrument_id,
    notes,
    org_id
  )
  VALUES (
    p_sale_price,
    p_sale_date,
    p_client_id,
    p_instrument_id,
    p_notes,
    v_org_id
  )
  RETURNING id INTO v_sale_id;

  IF p_instrument_id IS NOT NULL THEN
    UPDATE public.instruments
    SET status = 'Sold',
        reserved_reason = NULL,
        reserved_by_user_id = NULL,
        reserved_connection_id = NULL
    WHERE id = p_instrument_id
      AND org_id = v_org_id;
  END IF;

  IF p_client_id IS NOT NULL AND p_instrument_id IS NOT NULL THEN
    UPDATE public.client_instruments
    SET relationship_type = 'Sold'
    WHERE client_id = p_client_id
      AND instrument_id = p_instrument_id
      AND org_id = v_org_id;

    IF NOT FOUND THEN
      INSERT INTO public.client_instruments (
        client_id,
        instrument_id,
        relationship_type,
        org_id
      )
      VALUES (
        p_client_id,
        p_instrument_id,
        'Sold',
        v_org_id
      );
    END IF;
  END IF;

  RETURN v_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_atomic(NUMERIC, DATE, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_atomic(NUMERIC, DATE, UUID, UUID, TEXT) TO authenticated;
