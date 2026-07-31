-- F4: A completed sale must leave the instrument's relationships in a
-- non-contradictory state:
--   * exactly one canonical Sold relationship exists (the purchaser's);
--   * no other client keeps an active Owned relationship (Owned is
--     unique-per-instrument already; once the instrument sells, any prior
--     owner's current-ownership claim is superseded by the sale);
--   * no stale Booked relationship for another client continues to imply
--     the instrument is available for a pending booking.
--
-- Interested relationships for clients other than the purchaser are left
-- untouched: "Interested" is a passive historical expression of interest,
-- not a claim of current ownership or availability, so it does not
-- contradict a Sold instrument and product policy for its long-term
-- handling is unresolved (see F4/F18 audit notes). Deleting it would
-- destroy history without evidence that this is the intended behavior.
--
-- The purchaser's own pre-existing relationship (Interested, Booked, or
-- Owned) is canonicalized in place (converted to Sold) instead of being
-- replaced by a brand-new row, preserving its display_order/notes/history.
-- If duplicate rows already exist for the purchaser+instrument pair (no
-- uniqueness constraint prevents that today - see F9), only the oldest is
-- kept and converted; the rest are removed so exactly one canonical Sold
-- relationship exists afterward.
CREATE OR REPLACE FUNCTION public.create_sale_atomic(
  p_sale_price    NUMERIC,
  p_sale_date     DATE,
  p_client_id     UUID,
  p_instrument_id UUID,
  p_notes         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id                  UUID := public.org_id();
  v_sale_id                 UUID;
  v_instrument_status       TEXT;
  v_purchaser_connection_id UUID;
BEGIN
  IF v_org_id IS NULL         THEN RAISE EXCEPTION 'Organization context required'; END IF;
  IF NOT public.is_admin()    THEN RAISE EXCEPTION 'Admin role required'; END IF;
  IF p_sale_price IS NULL OR p_sale_price = 0 THEN RAISE EXCEPTION 'Sale price cannot be zero'; END IF;

  IF p_instrument_id IS NOT NULL THEN
    SELECT status INTO v_instrument_status
    FROM public.instruments
    WHERE id = p_instrument_id AND org_id = v_org_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;
    IF v_instrument_status = 'Sold' THEN RAISE EXCEPTION 'Instrument is already sold'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.sales_history
      WHERE instrument_id = p_instrument_id AND org_id = v_org_id AND sale_price > 0
    ) THEN
      RAISE EXCEPTION 'Instrument already has a completed sale record';
    END IF;

    -- Lock every existing relationship row for this instrument up front so
    -- concurrent sale/connection writes for the same instrument serialize
    -- against this transaction instead of racing on the reconciliation below.
    PERFORM 1 FROM public.client_instruments
    WHERE instrument_id = p_instrument_id AND org_id = v_org_id
    FOR UPDATE;
  END IF;

  INSERT INTO public.sales_history (sale_price, sale_date, client_id, instrument_id, notes, org_id)
  VALUES (p_sale_price, p_sale_date, p_client_id, p_instrument_id, p_notes, v_org_id)
  RETURNING id INTO v_sale_id;

  IF p_instrument_id IS NOT NULL THEN
    UPDATE public.instruments
    SET status = 'Sold',
        reserved_reason        = NULL,
        reserved_by_user_id    = NULL,
        reserved_connection_id = NULL
    WHERE id = p_instrument_id AND org_id = v_org_id;

    IF p_client_id IS NOT NULL THEN
      SELECT id INTO v_purchaser_connection_id
      FROM public.client_instruments
      WHERE client_id = p_client_id AND instrument_id = p_instrument_id AND org_id = v_org_id
      ORDER BY created_at ASC, id ASC
      LIMIT 1;

      IF v_purchaser_connection_id IS NOT NULL THEN
        UPDATE public.client_instruments
        SET relationship_type = 'Sold'
        WHERE id = v_purchaser_connection_id;

        -- Remove any duplicate purchaser+instrument rows so only one
        -- canonical Sold relationship remains for the purchaser.
        DELETE FROM public.client_instruments
        WHERE client_id = p_client_id
          AND instrument_id = p_instrument_id
          AND org_id = v_org_id
          AND id <> v_purchaser_connection_id;
      ELSE
        INSERT INTO public.client_instruments (client_id, instrument_id, relationship_type, org_id)
        VALUES (p_client_id, p_instrument_id, 'Sold', v_org_id)
        RETURNING id INTO v_purchaser_connection_id;
      END IF;
    END IF;

    -- Reconcile every other client's active relationship for this
    -- instrument: Owned/Booked claims from anyone other than the purchaser
    -- can no longer be true once the instrument is Sold.
    DELETE FROM public.client_instruments
    WHERE instrument_id = p_instrument_id
      AND org_id = v_org_id
      AND relationship_type IN ('Owned', 'Booked')
      AND (v_purchaser_connection_id IS NULL OR id <> v_purchaser_connection_id);
  END IF;

  RETURN v_sale_id;
END;
$$;
