BEGIN;

CREATE OR REPLACE FUNCTION public.update_instrument_sale_transition_atomic(
  p_instrument_id UUID,
  p_patch JSONB DEFAULT '{}'::jsonb,
  p_sale_price NUMERIC DEFAULT NULL,
  p_sale_date DATE DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_sales_note TEXT DEFAULT NULL
)
RETURNS public.instruments
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_current public.instruments%ROWTYPE;
  v_result public.instruments%ROWTYPE;
  v_next_status TEXT;
  v_refund_source_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF NOT auth.is_admin() THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF jsonb_typeof(COALESCE(p_patch, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Instrument patch payload must be an object';
  END IF;

  SELECT *
  INTO v_current
  FROM public.instruments
  WHERE id = p_instrument_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instrument not found';
  END IF;

  v_next_status := COALESCE(NULLIF(p_patch->>'status', ''), v_current.status);

  IF v_current.status <> 'Sold' AND v_next_status = 'Sold' THEN
    IF p_sale_price IS NULL OR p_sale_price <= 0 THEN
      RAISE EXCEPTION 'Sale price must be a positive number when marking an instrument as Sold';
    END IF;

    PERFORM public.create_sale_atomic(
      p_sale_price,
      COALESCE(p_sale_date, CURRENT_DATE),
      p_client_id,
      p_instrument_id,
      p_sales_note
    );
  ELSIF v_current.status = 'Sold' AND v_next_status <> 'Sold' THEN
    SELECT sh.id
    INTO v_refund_source_id
    FROM public.sales_history AS sh
    WHERE sh.instrument_id = p_instrument_id
      AND sh.org_id = v_org_id
      AND sh.entry_kind = 'sale'
      AND NOT EXISTS (
        SELECT 1
        FROM public.sales_history AS refund
        WHERE refund.adjustment_of_sale_id = sh.id
          AND refund.org_id = v_org_id
          AND refund.entry_kind = 'refund'
      )
    ORDER BY sh.sale_date DESC, sh.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_refund_source_id IS NULL THEN
      RAISE EXCEPTION 'No refundable sale entry found for instrument';
    END IF;

    PERFORM public.create_sale_adjustment_atomic(
      v_refund_source_id,
      'refund',
      p_sales_note
    );
  END IF;

  UPDATE public.instruments
  SET
    status = CASE
      WHEN p_patch ? 'status' THEN NULLIF(p_patch->>'status', '')
      ELSE status
    END,
    maker = CASE
      WHEN p_patch ? 'maker' THEN p_patch->>'maker'
      ELSE maker
    END,
    type = CASE
      WHEN p_patch ? 'type' THEN p_patch->>'type'
      ELSE type
    END,
    subtype = CASE
      WHEN p_patch ? 'subtype' THEN p_patch->>'subtype'
      ELSE subtype
    END,
    year = CASE
      WHEN p_patch ? 'year' THEN NULLIF(p_patch->>'year', '')::integer
      ELSE year
    END,
    certificate = CASE
      WHEN p_patch ? 'certificate' THEN NULLIF(p_patch->>'certificate', '')::boolean
      ELSE certificate
    END,
    cost_price = CASE
      WHEN p_patch ? 'cost_price' THEN NULLIF(p_patch->>'cost_price', '')::numeric
      ELSE cost_price
    END,
    consignment_price = CASE
      WHEN p_patch ? 'consignment_price' THEN NULLIF(p_patch->>'consignment_price', '')::numeric
      ELSE consignment_price
    END,
    size = CASE
      WHEN p_patch ? 'size' THEN p_patch->>'size'
      ELSE size
    END,
    weight = CASE
      WHEN p_patch ? 'weight' THEN p_patch->>'weight'
      ELSE weight
    END,
    price = CASE
      WHEN p_patch ? 'price' THEN NULLIF(p_patch->>'price', '')::numeric
      ELSE price
    END,
    ownership = CASE
      WHEN p_patch ? 'ownership' THEN p_patch->>'ownership'
      ELSE ownership
    END,
    note = CASE
      WHEN p_patch ? 'note' THEN p_patch->>'note'
      ELSE note
    END,
    serial_number = CASE
      WHEN p_patch ? 'serial_number' THEN p_patch->>'serial_number'
      ELSE serial_number
    END,
    reserved_reason = CASE
      WHEN p_patch ? 'reserved_reason' THEN p_patch->>'reserved_reason'
      ELSE reserved_reason
    END,
    reserved_by_user_id = CASE
      WHEN p_patch ? 'reserved_by_user_id' THEN NULLIF(p_patch->>'reserved_by_user_id', '')::uuid
      ELSE reserved_by_user_id
    END,
    reserved_connection_id = CASE
      WHEN p_patch ? 'reserved_connection_id' THEN NULLIF(p_patch->>'reserved_connection_id', '')::uuid
      ELSE reserved_connection_id
    END
  WHERE id = p_instrument_id
    AND org_id = v_org_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_instrument_sale_transition_atomic(UUID, JSONB, NUMERIC, DATE, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_instrument_sale_transition_atomic(UUID, JSONB, NUMERIC, DATE, UUID, TEXT) TO authenticated;

COMMIT;
