CREATE OR REPLACE FUNCTION public.create_sale_adjustment_atomic(
  p_source_sale_id  UUID,
  p_adjustment_kind TEXT,
  p_notes           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id        UUID := public.org_id();
  v_source        RECORD;
  v_adjustment_id UUID;
BEGIN
  IF v_org_id IS NULL      THEN RAISE EXCEPTION 'Organization context required'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin role required'; END IF;
  IF p_adjustment_kind NOT IN ('refund', 'undo_refund') THEN
    RAISE EXCEPTION 'Unsupported sale adjustment kind';
  END IF;

  SELECT * INTO v_source FROM public.sales_history
  WHERE id = p_source_sale_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;

  IF p_adjustment_kind = 'refund' THEN
    IF v_source.sale_price <= 0 OR v_source.entry_kind <> 'sale' THEN
      RAISE EXCEPTION 'Only completed sale entries can be refunded';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.sales_history
      WHERE adjustment_of_sale_id = p_source_sale_id AND org_id = v_org_id AND entry_kind = 'refund'
    ) THEN RAISE EXCEPTION 'Sale has already been refunded'; END IF;

    INSERT INTO public.sales_history (
      instrument_id, client_id, sale_price, sale_date, notes,
      org_id, adjustment_of_sale_id, entry_kind
    ) VALUES (
      v_source.instrument_id, v_source.client_id,
      -ABS(v_source.sale_price), v_source.sale_date,
      COALESCE(p_notes, v_source.notes), v_org_id,
      p_source_sale_id, 'refund'
    )
    RETURNING id INTO v_adjustment_id;
    RETURN v_adjustment_id;
  END IF;

  IF v_source.sale_price >= 0 OR v_source.entry_kind <> 'refund' THEN
    RAISE EXCEPTION 'Only refund entries can be reversed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sales_history
    WHERE adjustment_of_sale_id = p_source_sale_id AND org_id = v_org_id AND entry_kind = 'undo_refund'
  ) THEN RAISE EXCEPTION 'Refund has already been undone'; END IF;

  INSERT INTO public.sales_history (
    instrument_id, client_id, sale_price, sale_date, notes,
    org_id, adjustment_of_sale_id, entry_kind
  ) VALUES (
    v_source.instrument_id, v_source.client_id,
    ABS(v_source.sale_price), v_source.sale_date,
    COALESCE(p_notes, v_source.notes), v_org_id,
    p_source_sale_id, 'undo_refund'
  )
  RETURNING id INTO v_adjustment_id;
  RETURN v_adjustment_id;
END;
$$;
