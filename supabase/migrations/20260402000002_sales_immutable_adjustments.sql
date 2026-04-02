BEGIN;

ALTER TABLE public.sales_history
ADD COLUMN IF NOT EXISTS adjustment_of_sale_id UUID REFERENCES public.sales_history(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_history
ADD COLUMN IF NOT EXISTS entry_kind TEXT;

UPDATE public.sales_history
SET entry_kind = CASE
  WHEN sale_price < 0 THEN 'refund'
  ELSE 'sale'
END
WHERE entry_kind IS NULL;

ALTER TABLE public.sales_history
ALTER COLUMN entry_kind SET DEFAULT 'sale';

ALTER TABLE public.sales_history
ALTER COLUMN entry_kind SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_history_entry_kind_check'
  ) THEN
    ALTER TABLE public.sales_history
    ADD CONSTRAINT sales_history_entry_kind_check
    CHECK (entry_kind IN ('sale', 'refund', 'undo_refund', 'adjustment'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS sales_history_adjustment_of_sale_id_idx
ON public.sales_history(adjustment_of_sale_id);

CREATE UNIQUE INDEX IF NOT EXISTS sales_history_one_refund_per_sale_idx
ON public.sales_history(adjustment_of_sale_id)
WHERE entry_kind = 'refund';

CREATE UNIQUE INDEX IF NOT EXISTS sales_history_one_undo_refund_per_refund_idx
ON public.sales_history(adjustment_of_sale_id)
WHERE entry_kind = 'undo_refund';

CREATE OR REPLACE FUNCTION public.create_sale_adjustment_atomic(
  p_source_sale_id UUID,
  p_adjustment_kind TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_source RECORD;
  v_adjustment_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF p_adjustment_kind NOT IN ('refund', 'undo_refund') THEN
    RAISE EXCEPTION 'Unsupported sale adjustment kind';
  END IF;

  SELECT *
    INTO v_source
  FROM public.sales_history
  WHERE id = p_source_sale_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF p_adjustment_kind = 'refund' THEN
    IF v_source.sale_price <= 0 OR v_source.entry_kind <> 'sale' THEN
      RAISE EXCEPTION 'Only completed sale entries can be refunded';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sales_history
      WHERE adjustment_of_sale_id = p_source_sale_id
        AND org_id = v_org_id
        AND entry_kind = 'refund'
    ) THEN
      RAISE EXCEPTION 'Sale has already been refunded';
    END IF;

    INSERT INTO public.sales_history (
      instrument_id,
      client_id,
      sale_price,
      sale_date,
      notes,
      org_id,
      adjustment_of_sale_id,
      entry_kind
    )
    VALUES (
      v_source.instrument_id,
      v_source.client_id,
      -ABS(v_source.sale_price),
      v_source.sale_date,
      COALESCE(p_notes, v_source.notes),
      v_org_id,
      p_source_sale_id,
      'refund'
    )
    RETURNING id INTO v_adjustment_id;

    RETURN v_adjustment_id;
  END IF;

  IF v_source.sale_price >= 0 OR v_source.entry_kind <> 'refund' THEN
    RAISE EXCEPTION 'Only refund entries can be reversed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sales_history
    WHERE adjustment_of_sale_id = p_source_sale_id
      AND org_id = v_org_id
      AND entry_kind = 'undo_refund'
  ) THEN
    RAISE EXCEPTION 'Refund has already been undone';
  END IF;

  INSERT INTO public.sales_history (
    instrument_id,
    client_id,
    sale_price,
    sale_date,
    notes,
    org_id,
    adjustment_of_sale_id,
    entry_kind
  )
  VALUES (
    v_source.instrument_id,
    v_source.client_id,
    ABS(v_source.sale_price),
    v_source.sale_date,
    COALESCE(p_notes, v_source.notes),
    v_org_id,
    p_source_sale_id,
    'undo_refund'
  )
  RETURNING id INTO v_adjustment_id;

  RETURN v_adjustment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_adjustment_atomic(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_adjustment_atomic(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
