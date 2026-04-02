-- Migration: make invoice writes atomic via RPC wrappers
-- Created: 2026-04-01

CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
  p_invoice JSONB,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_invoice_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context missing';
  END IF;

  INSERT INTO public.invoices (
    org_id,
    client_id,
    invoice_date,
    due_date,
    subtotal,
    tax,
    total,
    currency,
    status,
    notes,
    business_name,
    business_address,
    business_phone,
    business_email,
    bank_account_holder,
    bank_name,
    bank_swift_code,
    bank_account_number,
    default_conditions,
    default_exchange_rate
  )
  VALUES (
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
    p_invoice->>'business_name',
    p_invoice->>'business_address',
    p_invoice->>'business_phone',
    p_invoice->>'business_email',
    p_invoice->>'bank_account_holder',
    p_invoice->>'bank_name',
    p_invoice->>'bank_swift_code',
    p_invoice->>'bank_account_number',
    p_invoice->>'default_conditions',
    p_invoice->>'default_exchange_rate'
  )
  RETURNING id INTO v_invoice_id;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invoice items payload must be an array';
  END IF;

  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.invoice_items (
      org_id,
      invoice_id,
      instrument_id,
      description,
      qty,
      rate,
      amount,
      image_url,
      display_order
    )
    SELECT
      v_org_id,
      v_invoice_id,
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

CREATE OR REPLACE FUNCTION public.update_invoice_atomic(
  p_invoice_id UUID,
  p_invoice JSONB DEFAULT '{}'::jsonb,
  p_items JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context missing';
  END IF;

  PERFORM 1
  FROM public.invoices
  WHERE id = p_invoice_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF jsonb_typeof(COALESCE(p_invoice, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Invoice payload must be an object';
  END IF;

  UPDATE public.invoices
  SET
    client_id = CASE
      WHEN p_invoice ? 'client_id' THEN NULLIF(p_invoice->>'client_id', '')::uuid
      ELSE client_id
    END,
    invoice_date = CASE
      WHEN p_invoice ? 'invoice_date' THEN NULLIF(p_invoice->>'invoice_date', '')::date
      ELSE invoice_date
    END,
    due_date = CASE
      WHEN p_invoice ? 'due_date' THEN NULLIF(p_invoice->>'due_date', '')::date
      ELSE due_date
    END,
    subtotal = CASE
      WHEN p_invoice ? 'subtotal' THEN NULLIF(p_invoice->>'subtotal', '')::numeric
      ELSE subtotal
    END,
    tax = CASE
      WHEN p_invoice ? 'tax' THEN NULLIF(p_invoice->>'tax', '')::numeric
      ELSE tax
    END,
    total = CASE
      WHEN p_invoice ? 'total' THEN NULLIF(p_invoice->>'total', '')::numeric
      ELSE total
    END,
    currency = CASE
      WHEN p_invoice ? 'currency' THEN NULLIF(p_invoice->>'currency', '')
      ELSE currency
    END,
    status = CASE
      WHEN p_invoice ? 'status' THEN NULLIF(p_invoice->>'status', '')
      ELSE status
    END,
    notes = CASE
      WHEN p_invoice ? 'notes' THEN p_invoice->>'notes'
      ELSE notes
    END,
    business_name = CASE
      WHEN p_invoice ? 'business_name' THEN p_invoice->>'business_name'
      ELSE business_name
    END,
    business_address = CASE
      WHEN p_invoice ? 'business_address' THEN p_invoice->>'business_address'
      ELSE business_address
    END,
    business_phone = CASE
      WHEN p_invoice ? 'business_phone' THEN p_invoice->>'business_phone'
      ELSE business_phone
    END,
    business_email = CASE
      WHEN p_invoice ? 'business_email' THEN p_invoice->>'business_email'
      ELSE business_email
    END,
    bank_account_holder = CASE
      WHEN p_invoice ? 'bank_account_holder' THEN p_invoice->>'bank_account_holder'
      ELSE bank_account_holder
    END,
    bank_name = CASE
      WHEN p_invoice ? 'bank_name' THEN p_invoice->>'bank_name'
      ELSE bank_name
    END,
    bank_swift_code = CASE
      WHEN p_invoice ? 'bank_swift_code' THEN p_invoice->>'bank_swift_code'
      ELSE bank_swift_code
    END,
    bank_account_number = CASE
      WHEN p_invoice ? 'bank_account_number' THEN p_invoice->>'bank_account_number'
      ELSE bank_account_number
    END,
    default_conditions = CASE
      WHEN p_invoice ? 'default_conditions' THEN p_invoice->>'default_conditions'
      ELSE default_conditions
    END,
    default_exchange_rate = CASE
      WHEN p_invoice ? 'default_exchange_rate' THEN p_invoice->>'default_exchange_rate'
      ELSE default_exchange_rate
    END
  WHERE id = p_invoice_id
    AND org_id = v_org_id;

  IF p_items IS NOT NULL THEN
    IF jsonb_typeof(p_items) <> 'array' THEN
      RAISE EXCEPTION 'Invoice items payload must be an array';
    END IF;

    DELETE FROM public.invoice_items
    WHERE invoice_id = p_invoice_id
      AND org_id = v_org_id;

    IF jsonb_array_length(p_items) > 0 THEN
      INSERT INTO public.invoice_items (
        org_id,
        invoice_id,
        instrument_id,
        description,
        qty,
        rate,
        amount,
        image_url,
        display_order
      )
      SELECT
        v_org_id,
        p_invoice_id,
        NULLIF(item->>'instrument_id', '')::uuid,
        item->>'description',
        COALESCE(NULLIF(item->>'qty', '')::integer, 0),
        COALESCE(NULLIF(item->>'rate', '')::numeric, 0),
        COALESCE(NULLIF(item->>'amount', '')::numeric, 0),
        item->>'image_url',
        COALESCE(NULLIF(item->>'display_order', '')::integer, 0)
      FROM jsonb_array_elements(p_items) AS item;
    END IF;
  END IF;

  RETURN p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_atomic(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_invoice_atomic(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_atomic(UUID, JSONB, JSONB) TO authenticated;
