-- Enforce tenant reference consistency for sales_history and invoices.
-- Blocks cross-org parent references at the DB invariant layer (BEFORE INSERT/UPDATE triggers).

-- ──────────────────────────────────────────────
-- Preflight: fail closed if inconsistent rows exist
-- ──────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sales_history sh
    JOIN public.instruments i ON i.id = sh.instrument_id
    WHERE sh.instrument_id IS NOT NULL
      AND sh.org_id <> i.org_id
  ) THEN
    RAISE EXCEPTION
      'Cannot install tenant consistency guard: sales_history instrument org mismatch exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sales_history sh
    JOIN public.clients c ON c.id = sh.client_id
    WHERE sh.client_id IS NOT NULL
      AND sh.org_id <> c.org_id
  ) THEN
    RAISE EXCEPTION
      'Cannot install tenant consistency guard: sales_history client org mismatch exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sales_history adj
    JOIN public.sales_history src ON src.id = adj.adjustment_of_sale_id
    WHERE adj.adjustment_of_sale_id IS NOT NULL
      AND adj.org_id <> src.org_id
  ) THEN
    RAISE EXCEPTION
      'Cannot install tenant consistency guard: sales_history adjustment org mismatch exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices inv
    JOIN public.clients c ON c.id = inv.client_id
    WHERE inv.client_id IS NOT NULL
      AND inv.org_id <> c.org_id
  ) THEN
    RAISE EXCEPTION
      'Cannot install tenant consistency guard: invoices client org mismatch exists';
  END IF;
END
$$;

-- ──────────────────────────────────────────────
-- sales_history: org_id must match referenced parents
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_sales_history_org_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_instrument_org UUID;
  v_client_org     UUID;
  v_expected_org   UUID;
  v_adjustment_org UUID;
BEGIN
  IF NEW.instrument_id IS NOT NULL THEN
    SELECT org_id INTO v_instrument_org
    FROM public.instruments
    WHERE id = NEW.instrument_id;

    IF v_instrument_org IS NULL THEN
      RAISE EXCEPTION 'Referenced instrument not found';
    END IF;
  END IF;

  IF NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO v_client_org
    FROM public.clients
    WHERE id = NEW.client_id;

    IF v_client_org IS NULL THEN
      RAISE EXCEPTION 'Referenced client not found';
    END IF;
  END IF;

  IF v_instrument_org IS NOT NULL
     AND v_client_org IS NOT NULL
     AND v_instrument_org <> v_client_org THEN
    RAISE EXCEPTION 'Sale instrument and client must belong to the same organization';
  END IF;

  v_expected_org := COALESCE(v_instrument_org, v_client_org);

  IF NEW.adjustment_of_sale_id IS NOT NULL THEN
    SELECT org_id INTO v_adjustment_org
    FROM public.sales_history
    WHERE id = NEW.adjustment_of_sale_id;

    IF v_adjustment_org IS NULL THEN
      RAISE EXCEPTION 'Referenced sale not found';
    END IF;

    IF v_expected_org IS NOT NULL AND v_adjustment_org <> v_expected_org THEN
      RAISE EXCEPTION 'Adjustment sale must belong to the same organization as referenced parents';
    END IF;

    v_expected_org := v_adjustment_org;
  END IF;

  IF NEW.org_id IS NULL AND v_expected_org IS NOT NULL THEN
    NEW.org_id := v_expected_org;
  END IF;

  IF v_expected_org IS NOT NULL
     AND NEW.org_id IS DISTINCT FROM v_expected_org THEN
    RAISE EXCEPTION 'sales_history.org_id must match referenced parent organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_sales_history_org_consistency_trigger
  ON public.sales_history;

CREATE TRIGGER enforce_sales_history_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.sales_history
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sales_history_org_consistency();

-- ──────────────────────────────────────────────
-- invoices: client_id must belong to invoice org
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_invoices_org_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_org UUID;
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT org_id INTO v_client_org
  FROM public.clients
  WHERE id = NEW.client_id;

  IF v_client_org IS NULL THEN
    RAISE EXCEPTION 'Client not found in current organization';
  END IF;

  IF NEW.org_id IS DISTINCT FROM v_client_org THEN
    RAISE EXCEPTION 'invoices.org_id must match client organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invoices_org_consistency_trigger
  ON public.invoices;

CREATE TRIGGER enforce_invoices_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invoices_org_consistency();

-- ──────────────────────────────────────────────
-- RPC defense in depth: create_invoice_atomic
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
  p_invoice JSONB,
  p_items   JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id     UUID := public.org_id();
  v_invoice_id UUID;
  v_client_id  UUID;
BEGIN
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization context missing'; END IF;

  v_client_id := NULLIF(p_invoice->>'client_id', '')::uuid;

  IF v_client_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = v_client_id
        AND c.org_id = v_org_id
    ) THEN
      RAISE EXCEPTION 'Client not found in current organization';
    END IF;
  END IF;

  INSERT INTO public.invoices (
    org_id, client_id, invoice_date, due_date, subtotal, tax, total, currency, status, notes,
    business_name, business_address, business_phone, business_email,
    bank_account_holder, bank_name, bank_swift_code, bank_account_number,
    default_conditions, default_exchange_rate
  ) VALUES (
    v_org_id,
    v_client_id,
    COALESCE(NULLIF(p_invoice->>'invoice_date', '')::date, CURRENT_DATE),
    NULLIF(p_invoice->>'due_date', '')::date,
    COALESCE(NULLIF(p_invoice->>'subtotal', '')::numeric, 0),
    NULLIF(p_invoice->>'tax', '')::numeric,
    COALESCE(NULLIF(p_invoice->>'total', '')::numeric, 0),
    COALESCE(NULLIF(p_invoice->>'currency', ''), 'USD'),
    COALESCE(NULLIF(p_invoice->>'status', ''), 'draft'),
    p_invoice->>'notes',
    p_invoice->>'business_name',  p_invoice->>'business_address',
    p_invoice->>'business_phone',  p_invoice->>'business_email',
    p_invoice->>'bank_account_holder', p_invoice->>'bank_name',
    p_invoice->>'bank_swift_code', p_invoice->>'bank_account_number',
    p_invoice->>'default_conditions', p_invoice->>'default_exchange_rate'
  )
  RETURNING id INTO v_invoice_id;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invoice items payload must be an array';
  END IF;

  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.invoice_items (
      org_id, invoice_id, instrument_id, description, qty, rate, amount, image_url, display_order
    )
    SELECT
      v_org_id, v_invoice_id,
      NULLIF(item->>'instrument_id', '')::uuid,
      item->>'description',
      COALESCE(NULLIF(item->>'qty', '')::integer, 0),
      COALESCE(NULLIF(item->>'rate', '')::numeric, 0),
      COALESCE(NULLIF(item->>'amount', '')::numeric, 0),
      item->>'image_url',
      COALESCE(NULLIF(item->>'display_order', '')::integer, 0)
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS item;
  END IF;

  RETURN v_invoice_id;
END;
$$;
