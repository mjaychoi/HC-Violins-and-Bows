-- F2: enforce invoice financial invariants at the database transaction boundary.
--
-- Before this migration the only place that checked
--   * item.amount = qty * rate
--   * invoice.subtotal = SUM(item.amount)
--   * invoice.total = subtotal + tax
-- was the Next.js API layer (src/app/api/invoices/financialValidation.ts).
-- Any authenticated caller invoking public.create_invoice_atomic /
-- public.update_invoice_atomic directly (PostgREST RPC, psql, service client)
-- could persist arithmetically inconsistent money. financialValidation.ts stays
-- in place as defense in depth, but it is no longer the sole enforcement point.
--
-- Money precision contract: every money column involved is NUMERIC(12,2)
-- (public.invoices.subtotal/tax/total, public.invoice_items.rate/amount) and
-- public.invoice_items.qty is INTEGER. Canonical rounding is therefore
-- ROUND(<expr>, 2), which is half-away-from-zero in PostgreSQL and matches the
-- application's Math.round(value * 100) / 100 cent rounding.
--
-- Validation runs AFTER the invoice row and its items are written, against the
-- persisted rows, so it cannot be bypassed by crafting the JSON payload, and it
-- covers the "update aggregates without touching items" case for free. Because
-- the whole RPC body is one transaction, RAISE EXCEPTION rolls the invoice and
-- every line item back together - a rejected request leaves no partial state.
--
-- Errors are stable and machine readable: the SQLSTATE is 23514 (check
-- violation) and the message is prefixed with a fixed code, mirrored in DETAIL
-- as JSON and in HINT, so the API layer can map them without pattern-matching
-- free-form PostgreSQL text. See src/app/api/invoices/rpcErrors.ts.
--
-- Both RPCs are replaced with CREATE OR REPLACE FUNCTION on their existing
-- signatures, so PostgreSQL preserves the REVOKE/GRANT state established by
-- 00000000000011/12 and 00000000000026/27; no re-grant is required and no
-- manual, untracked GRANT is introduced. The helper function below is new and
-- therefore gets its own REVOKE/GRANT migrations.

-- ──────────────────────────────────────────────
-- Shared invariant helper
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_invoice_financial_invariants(
  p_invoice_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_subtotal          NUMERIC;
  v_tax               NUMERIC;
  v_total             NUMERIC;
  v_computed_subtotal NUMERIC;
  v_nan               CONSTANT NUMERIC := 'NaN'::numeric;
BEGIN
  SELECT i.subtotal, COALESCE(i.tax, 0), i.total
    INTO v_subtotal, v_tax, v_total
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: Invoice not found'
      USING ERRCODE = '23514',
            DETAIL  = '{"error_code":"INVOICE_NOT_FOUND"}',
            HINT    = 'INVOICE_NOT_FOUND';
  END IF;

  -- NUMERIC(12,2) rejects Infinity as out of range but accepts the NaN value,
  -- and NaN silently defeats every ordinary comparison below (in PostgreSQL
  -- NaN sorts greater than all numbers, so `NaN < 0` is false). Reject it
  -- explicitly before anything else.
  IF v_subtotal = v_nan OR v_tax = v_nan OR v_total = v_nan THEN
    RAISE EXCEPTION 'INVOICE_NON_FINITE_AMOUNT: Invoice amounts must be finite numbers'
      USING ERRCODE = '23514',
            DETAIL  = '{"error_code":"INVOICE_NON_FINITE_AMOUNT"}',
            HINT    = 'INVOICE_NON_FINITE_AMOUNT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_items it
    WHERE it.invoice_id = p_invoice_id
      AND (it.rate = v_nan OR it.amount = v_nan)
  ) THEN
    RAISE EXCEPTION 'INVOICE_NON_FINITE_AMOUNT: Invoice item amounts must be finite numbers'
      USING ERRCODE = '23514',
            DETAIL  = '{"error_code":"INVOICE_NON_FINITE_AMOUNT"}',
            HINT    = 'INVOICE_NON_FINITE_AMOUNT';
  END IF;

  -- Sign contract. The API additionally requires qty > 0; the database enforces
  -- the strictly weaker non-negative rule so that it never rejects rows the
  -- current schema defaults (qty DEFAULT 0) allow, while still making negative
  -- money impossible to persist.
  IF v_subtotal < 0 OR v_tax < 0 OR v_total < 0 THEN
    RAISE EXCEPTION 'INVOICE_NEGATIVE_AMOUNT: Invoice subtotal, tax and total cannot be negative'
      USING ERRCODE = '23514',
            DETAIL  = '{"error_code":"INVOICE_NEGATIVE_AMOUNT"}',
            HINT    = 'INVOICE_NEGATIVE_AMOUNT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_items it
    WHERE it.invoice_id = p_invoice_id
      AND (it.qty < 0 OR it.rate < 0 OR it.amount < 0)
  ) THEN
    RAISE EXCEPTION 'INVOICE_NEGATIVE_AMOUNT: Invoice item quantity, rate and amount cannot be negative'
      USING ERRCODE = '23514',
            DETAIL  = '{"error_code":"INVOICE_NEGATIVE_AMOUNT"}',
            HINT    = 'INVOICE_NEGATIVE_AMOUNT';
  END IF;

  -- 1. Every line-item amount equals quantity multiplied by rate.
  IF EXISTS (
    SELECT 1
    FROM public.invoice_items it
    WHERE it.invoice_id = p_invoice_id
      AND it.amount IS DISTINCT FROM ROUND(it.qty::numeric * it.rate, 2)
  ) THEN
    RAISE EXCEPTION 'INVOICE_ITEM_AMOUNT_MISMATCH: Invoice item amount must equal qty * rate'
      USING ERRCODE = '23514',
            DETAIL  = '{"error_code":"INVOICE_ITEM_AMOUNT_MISMATCH"}',
            HINT    = 'INVOICE_ITEM_AMOUNT_MISMATCH';
  END IF;

  -- 2. Invoice subtotal equals the sum of canonical item amounts.
  SELECT COALESCE(ROUND(SUM(it.amount), 2), 0)
    INTO v_computed_subtotal
  FROM public.invoice_items it
  WHERE it.invoice_id = p_invoice_id;

  IF ROUND(v_subtotal, 2) IS DISTINCT FROM v_computed_subtotal THEN
    RAISE EXCEPTION 'INVOICE_SUBTOTAL_MISMATCH: Invoice subtotal must equal the sum of item amounts'
      USING ERRCODE = '23514',
            DETAIL  = '{"error_code":"INVOICE_SUBTOTAL_MISMATCH"}',
            HINT    = 'INVOICE_SUBTOTAL_MISMATCH';
  END IF;

  -- 3. Invoice total equals subtotal plus tax.
  IF ROUND(v_total, 2) IS DISTINCT FROM ROUND(v_computed_subtotal + v_tax, 2) THEN
    RAISE EXCEPTION 'INVOICE_TOTAL_MISMATCH: Invoice total must equal subtotal + tax'
      USING ERRCODE = '23514',
            DETAIL  = '{"error_code":"INVOICE_TOTAL_MISMATCH"}',
            HINT    = 'INVOICE_TOTAL_MISMATCH';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_invoice_financial_invariants(UUID) IS
  'F2: validates persisted invoice arithmetic (item amount = qty * rate, subtotal = SUM(amounts), total = subtotal + tax, non-negative and finite money) inside the caller''s transaction. Raises a 23514 exception with a stable code prefix on violation.';

-- ──────────────────────────────────────────────
-- create_invoice_atomic
--
-- Same signature as 00000000000010 / 20260728130000, so existing grants are
-- preserved. Body is the 20260728130000 version (which added the cross-tenant
-- client check for F1) plus the financial invariant assertion.
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

  -- F2: reject arithmetically inconsistent money. Raising here aborts the whole
  -- RPC transaction, so neither the invoice nor any line item survives.
  PERFORM public.assert_invoice_financial_invariants(v_invoice_id);

  RETURN v_invoice_id;
END;
$$;

-- ──────────────────────────────────────────────
-- update_invoice_atomic
--
-- Same signature as 00000000000025, so existing grants are preserved. Body is
-- unchanged apart from the trailing invariant assertion, which also covers
-- "change stored aggregates without supplying items" (p_items IS NULL): the
-- assertion reads the persisted line items either way.
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_invoice_atomic(
  p_invoice_id UUID,
  p_invoice    JSONB DEFAULT '{}'::jsonb,
  p_items      JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id UUID := public.org_id();
BEGIN
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization context missing'; END IF;

  PERFORM 1 FROM public.invoices
  WHERE id = p_invoice_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  UPDATE public.invoices SET
    client_id             = CASE WHEN p_invoice ? 'client_id'             THEN NULLIF(p_invoice->>'client_id','')::uuid         ELSE client_id             END,
    invoice_date          = CASE WHEN p_invoice ? 'invoice_date'          THEN NULLIF(p_invoice->>'invoice_date','')::date       ELSE invoice_date          END,
    due_date              = CASE WHEN p_invoice ? 'due_date'              THEN NULLIF(p_invoice->>'due_date','')::date           ELSE due_date              END,
    subtotal              = CASE WHEN p_invoice ? 'subtotal'              THEN NULLIF(p_invoice->>'subtotal','')::numeric        ELSE subtotal              END,
    tax                   = CASE WHEN p_invoice ? 'tax'                   THEN NULLIF(p_invoice->>'tax','')::numeric             ELSE tax                   END,
    total                 = CASE WHEN p_invoice ? 'total'                 THEN NULLIF(p_invoice->>'total','')::numeric           ELSE total                 END,
    currency              = CASE WHEN p_invoice ? 'currency'              THEN NULLIF(p_invoice->>'currency','')                 ELSE currency              END,
    status                = CASE WHEN p_invoice ? 'status'                THEN NULLIF(p_invoice->>'status','')                   ELSE status                END,
    notes                 = CASE WHEN p_invoice ? 'notes'                 THEN p_invoice->>'notes'                               ELSE notes                 END,
    business_name         = CASE WHEN p_invoice ? 'business_name'         THEN p_invoice->>'business_name'                       ELSE business_name         END,
    business_address      = CASE WHEN p_invoice ? 'business_address'      THEN p_invoice->>'business_address'                    ELSE business_address      END,
    business_phone        = CASE WHEN p_invoice ? 'business_phone'        THEN p_invoice->>'business_phone'                      ELSE business_phone        END,
    business_email        = CASE WHEN p_invoice ? 'business_email'        THEN p_invoice->>'business_email'                      ELSE business_email        END,
    bank_account_holder   = CASE WHEN p_invoice ? 'bank_account_holder'   THEN p_invoice->>'bank_account_holder'                 ELSE bank_account_holder   END,
    bank_name             = CASE WHEN p_invoice ? 'bank_name'             THEN p_invoice->>'bank_name'                           ELSE bank_name             END,
    bank_swift_code       = CASE WHEN p_invoice ? 'bank_swift_code'       THEN p_invoice->>'bank_swift_code'                     ELSE bank_swift_code       END,
    bank_account_number   = CASE WHEN p_invoice ? 'bank_account_number'   THEN p_invoice->>'bank_account_number'                 ELSE bank_account_number   END,
    default_conditions    = CASE WHEN p_invoice ? 'default_conditions'    THEN p_invoice->>'default_conditions'                  ELSE default_conditions    END,
    default_exchange_rate = CASE WHEN p_invoice ? 'default_exchange_rate' THEN p_invoice->>'default_exchange_rate'               ELSE default_exchange_rate END
  WHERE id = p_invoice_id AND org_id = v_org_id;

  IF p_items IS NOT NULL THEN
    IF jsonb_typeof(p_items) <> 'array' THEN
      RAISE EXCEPTION 'Invoice items payload must be an array';
    END IF;

    DELETE FROM public.invoice_items
    WHERE invoice_id = p_invoice_id AND org_id = v_org_id;

    IF jsonb_array_length(p_items) > 0 THEN
      INSERT INTO public.invoice_items (
        org_id, invoice_id, instrument_id, description, qty, rate, amount, image_url, display_order
      )
      SELECT
        v_org_id, p_invoice_id,
        NULLIF(item->>'instrument_id','')::uuid,
        item->>'description',
        COALESCE(NULLIF(item->>'qty','')::integer, 0),
        COALESCE(NULLIF(item->>'rate','')::numeric, 0),
        COALESCE(NULLIF(item->>'amount','')::numeric, 0),
        item->>'image_url',
        COALESCE(NULLIF(item->>'display_order','')::integer, 0)
      FROM jsonb_array_elements(p_items) AS item;
    END IF;
  END IF;

  -- F2: same assertion as create. Aborts the transaction, so a rejected update
  -- leaves the previous invoice and line-item rows untouched.
  PERFORM public.assert_invoice_financial_invariants(p_invoice_id);

  RETURN p_invoice_id;
END;
$$;
