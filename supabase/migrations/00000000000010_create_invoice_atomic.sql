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
BEGIN
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization context missing'; END IF;

  INSERT INTO public.invoices (
    org_id, client_id, invoice_date, due_date, subtotal, tax, total, currency, status, notes,
    business_name, business_address, business_phone, business_email,
    bank_account_holder, bank_name, bank_swift_code, bank_account_number,
    default_conditions, default_exchange_rate
  ) VALUES (
    v_org_id,
    NULLIF(p_invoice->>'client_id', '')::uuid,
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
