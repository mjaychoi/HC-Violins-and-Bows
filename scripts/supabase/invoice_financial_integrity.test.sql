-- Invoice financial-integrity / initial-status / delete-immutability regression tests.
-- Covers audit findings F2, F3 and F5.
--
-- Run after: npx supabase db reset --local --no-seed
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/invoice_financial_integrity.test.sql
--
-- Expect: all DO blocks complete without uncaught exceptions; expected failures
-- are caught internally and asserted on the stable error-code prefix, never on
-- arbitrary PostgreSQL text.
-- All mutations run inside the outer transaction and ROLLBACK at the end.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org        UUID := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  v_user       UUID := 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
  v_client     UUID := 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
  v_invoice_id UUID;
  v_other_id   UUID;
  v_caught     TEXT;
  v_count      BIGINT;
  v_subtotal   NUMERIC;
  v_tax        NUMERIC;
  v_total      NUMERIC;
  v_status     TEXT;

  -- Non-round cent-level fixture: qty 3 x rate 19.99 = amount 59.97,
  -- tax 4.95, total 64.92.
  v_valid_items CONSTANT JSONB := jsonb_build_array(
    jsonb_build_object(
      'description', 'Bow rehair',
      'qty', 3,
      'rate', 19.99,
      'amount', 59.97,
      'display_order', 0
    )
  );
  v_valid_invoice CONSTANT JSONB := jsonb_build_object(
    'client_id', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3',
    'subtotal', 59.97,
    'tax', 4.95,
    'total', 64.92,
    'currency', 'USD',
    'status', 'draft'
  );
BEGIN
  INSERT INTO public.organizations (id, name) VALUES (v_org, 'Invoice Integrity Org');

  INSERT INTO public.clients (id, org_id, name, first_name, last_name)
  VALUES (v_client, v_org, 'Integrity Client', 'Integrity', 'Client');

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_user::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org::text, 'role', 'admin')
    )::text,
    true
  );

  -- ════════════════════════════════════════════════════════════════════════
  -- F2 - create_invoice_atomic financial invariants
  -- ════════════════════════════════════════════════════════════════════════

  -- Happy path first: exact cent-level values must still succeed.
  v_invoice_id := public.create_invoice_atomic(v_valid_invoice, v_valid_items);

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'valid cent-level create_invoice_atomic returned NULL';
  END IF;

  SELECT subtotal, tax, total INTO v_subtotal, v_tax, v_total
  FROM public.invoices WHERE id = v_invoice_id;

  IF v_subtotal <> 59.97 OR v_tax <> 4.95 OR v_total <> 64.92 THEN
    RAISE EXCEPTION 'valid cent-level invoice persisted wrong money: % / % / %',
      v_subtotal, v_tax, v_total;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.invoice_items WHERE invoice_id = v_invoice_id AND amount = 59.97;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'valid cent-level invoice item not persisted (count=%)', v_count;
  END IF;

  -- 1. item amount <> qty * rate
  BEGIN
    PERFORM public.create_invoice_atomic(
      jsonb_build_object('subtotal', 100, 'tax', 0, 'total', 100),
      jsonb_build_array(jsonb_build_object(
        'description', 'tampered', 'qty', 2, 'rate', 10, 'amount', 100, 'display_order', 0
      ))
    );
    RAISE EXCEPTION 'expected create with item amount mismatch to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_ITEM_AMOUNT_MISMATCH:%' THEN RAISE; END IF;
  END;

  -- 2. subtotal <> SUM(item amounts)
  BEGIN
    PERFORM public.create_invoice_atomic(
      jsonb_build_object('subtotal', 999, 'tax', 0, 'total', 999),
      jsonb_build_array(jsonb_build_object(
        'description', 'ok item', 'qty', 2, 'rate', 10, 'amount', 20, 'display_order', 0
      ))
    );
    RAISE EXCEPTION 'expected create with subtotal mismatch to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_SUBTOTAL_MISMATCH:%' THEN RAISE; END IF;
  END;

  -- 3. total <> subtotal + tax
  BEGIN
    PERFORM public.create_invoice_atomic(
      jsonb_build_object('subtotal', 20, 'tax', 5, 'total', 20),
      jsonb_build_array(jsonb_build_object(
        'description', 'ok item', 'qty', 2, 'rate', 10, 'amount', 20, 'display_order', 0
      ))
    );
    RAISE EXCEPTION 'expected create with total mismatch to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_TOTAL_MISMATCH:%' THEN RAISE; END IF;
  END;

  -- 4a. negative invoice-level money
  BEGIN
    PERFORM public.create_invoice_atomic(
      jsonb_build_object('subtotal', -20, 'tax', 0, 'total', -20),
      jsonb_build_array(jsonb_build_object(
        'description', 'negative', 'qty', 2, 'rate', -10, 'amount', -20, 'display_order', 0
      ))
    );
    RAISE EXCEPTION 'expected create with negative money to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_NEGATIVE_AMOUNT:%' THEN RAISE; END IF;
  END;

  -- 4b. non-finite (NaN) money. NUMERIC(12,2) accepts NaN, and NaN defeats
  -- ordinary comparisons, so this must be rejected explicitly.
  BEGIN
    PERFORM public.create_invoice_atomic(
      jsonb_build_object('subtotal', 'NaN', 'tax', 0, 'total', 'NaN'),
      '[]'::jsonb
    );
    RAISE EXCEPTION 'expected create with NaN money to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_NON_FINITE_AMOUNT:%' THEN RAISE; END IF;
  END;

  -- 5. No invoice or partial line-item state remains after any rejection.
  SELECT COUNT(*) INTO v_count FROM public.invoices WHERE org_id = v_org;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'rejected creates left % invoice rows behind (expected 1)', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.invoice_items WHERE org_id = v_org;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'rejected creates left % invoice_item rows behind (expected 1)', v_count;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- F2 - update_invoice_atomic financial invariants
  -- ════════════════════════════════════════════════════════════════════════

  -- Valid update with new cent-level items must still succeed.
  PERFORM public.update_invoice_atomic(
    v_invoice_id,
    jsonb_build_object('subtotal', 39.98, 'tax', 3.30, 'total', 43.28),
    jsonb_build_array(jsonb_build_object(
      'description', 'Bow rehair', 'qty', 2, 'rate', 19.99, 'amount', 39.98, 'display_order', 0
    ))
  );

  SELECT subtotal, tax, total INTO v_subtotal, v_tax, v_total
  FROM public.invoices WHERE id = v_invoice_id;

  IF v_subtotal <> 39.98 OR v_tax <> 3.30 OR v_total <> 43.28 THEN
    RAISE EXCEPTION 'valid update persisted wrong money: % / % / %', v_subtotal, v_tax, v_total;
  END IF;

  -- Update with tampered item amount.
  BEGIN
    PERFORM public.update_invoice_atomic(
      v_invoice_id,
      jsonb_build_object('subtotal', 100, 'tax', 0, 'total', 100),
      jsonb_build_array(jsonb_build_object(
        'description', 'tampered', 'qty', 2, 'rate', 10, 'amount', 100, 'display_order', 0
      ))
    );
    RAISE EXCEPTION 'expected update with item amount mismatch to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_ITEM_AMOUNT_MISMATCH:%' THEN RAISE; END IF;
  END;

  -- Update that changes stored totals WITHOUT supplying items (p_items NULL).
  -- This is the aggregate-only tampering path: the assertion still reads the
  -- persisted line items.
  BEGIN
    PERFORM public.update_invoice_atomic(
      v_invoice_id,
      jsonb_build_object('subtotal', 5000, 'total', 5003.30),
      NULL
    );
    RAISE EXCEPTION 'expected aggregate-only update to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_SUBTOTAL_MISMATCH:%' THEN RAISE; END IF;
  END;

  -- Update total only.
  BEGIN
    PERFORM public.update_invoice_atomic(
      v_invoice_id, jsonb_build_object('total', 1), NULL
    );
    RAISE EXCEPTION 'expected total-only update to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_TOTAL_MISMATCH:%' THEN RAISE; END IF;
  END;

  -- Negative update.
  BEGIN
    PERFORM public.update_invoice_atomic(
      v_invoice_id,
      jsonb_build_object('subtotal', -10, 'tax', 0, 'total', -10),
      jsonb_build_array(jsonb_build_object(
        'description', 'neg', 'qty', 1, 'rate', -10, 'amount', -10, 'display_order', 0
      ))
    );
    RAISE EXCEPTION 'expected negative update to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_NEGATIVE_AMOUNT:%' THEN RAISE; END IF;
  END;

  -- Every rejected update must have left the last valid state intact.
  SELECT subtotal, tax, total INTO v_subtotal, v_tax, v_total
  FROM public.invoices WHERE id = v_invoice_id;

  IF v_subtotal <> 39.98 OR v_tax <> 3.30 OR v_total <> 43.28 THEN
    RAISE EXCEPTION 'rejected updates mutated stored money: % / % / %',
      v_subtotal, v_tax, v_total;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'rejected updates left % invoice_item rows (expected 1)', v_count;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- F3 - initial invoice status
  -- ════════════════════════════════════════════════════════════════════════

  -- draft is always allowed (already proven above); sent is the supported
  -- create-and-send initial status.
  v_other_id := public.create_invoice_atomic(
    jsonb_build_object('subtotal', 0, 'tax', 0, 'total', 0, 'status', 'sent'),
    '[]'::jsonb
  );

  SELECT status INTO v_status FROM public.invoices WHERE id = v_other_id;
  IF v_status <> 'sent' THEN
    RAISE EXCEPTION 'create-as-sent did not persist sent (got %)', v_status;
  END IF;

  -- Empty/missing status normalizes to draft.
  v_other_id := public.create_invoice_atomic(
    jsonb_build_object('subtotal', 0, 'tax', 0, 'total', 0), '[]'::jsonb
  );
  SELECT status INTO v_status FROM public.invoices WHERE id = v_other_id;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'create without status did not default to draft (got %)', v_status;
  END IF;

  -- paid / overdue / cancelled are rejected through the RPC ...
  BEGIN
    PERFORM public.create_invoice_atomic(
      jsonb_build_object('subtotal', 0, 'tax', 0, 'total', 0, 'status', 'paid'), '[]'::jsonb
    );
    RAISE EXCEPTION 'expected create-as-paid to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVALID_INITIAL_INVOICE_STATUS:%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_invoice_atomic(
      jsonb_build_object('subtotal', 0, 'tax', 0, 'total', 0, 'status', 'overdue'), '[]'::jsonb
    );
    RAISE EXCEPTION 'expected create-as-overdue to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVALID_INITIAL_INVOICE_STATUS:%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_invoice_atomic(
      jsonb_build_object('subtotal', 0, 'tax', 0, 'total', 0, 'status', 'cancelled'), '[]'::jsonb
    );
    RAISE EXCEPTION 'expected create-as-cancelled to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVALID_INITIAL_INVOICE_STATUS:%' THEN RAISE; END IF;
  END;

  -- ... and through a direct table INSERT that bypasses the RPC entirely.
  BEGIN
    INSERT INTO public.invoices (org_id, subtotal, total, status)
    VALUES (v_org, 0, 0, 'paid');
    RAISE EXCEPTION 'expected direct INSERT as paid to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVALID_INITIAL_INVOICE_STATUS:%' THEN RAISE; END IF;
  END;

  -- Existing post-creation transitions must still behave as before:
  -- draft -> sent -> paid remains legal, paid -> draft remains illegal.
  UPDATE public.invoices SET status = 'sent' WHERE id = v_invoice_id;
  UPDATE public.invoices SET status = 'paid' WHERE id = v_invoice_id;

  SELECT status INTO v_status FROM public.invoices WHERE id = v_invoice_id;
  IF v_status <> 'paid' THEN
    RAISE EXCEPTION 'draft->sent->paid transition broke (got %)', v_status;
  END IF;

  BEGIN
    UPDATE public.invoices SET status = 'draft' WHERE id = v_invoice_id;
    RAISE EXCEPTION 'expected paid->draft transition to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%Invalid invoice status transition%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'invoice F2/F3 SQL tests passed';
END
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- F5 - hard-delete immutability
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org      UUID := 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  v_draft    UUID;
  v_sent     UUID;
  v_paid     UUID;
  v_overdue  UUID;
  v_cancel   UUID;
  v_caught   TEXT;
  v_count    BIGINT;
BEGIN
  -- Build one invoice per protected status, each with a line item, using only
  -- legal transitions from the enforced initial states.
  INSERT INTO public.invoices (org_id, subtotal, tax, total, status)
  VALUES (v_org, 10, 0, 10, 'draft') RETURNING id INTO v_draft;
  INSERT INTO public.invoice_items (org_id, invoice_id, description, qty, rate, amount)
  VALUES (v_org, v_draft, 'draft item', 1, 10, 10);

  INSERT INTO public.invoices (org_id, subtotal, tax, total, status)
  VALUES (v_org, 10, 0, 10, 'sent') RETURNING id INTO v_sent;
  INSERT INTO public.invoice_items (org_id, invoice_id, description, qty, rate, amount)
  VALUES (v_org, v_sent, 'sent item', 1, 10, 10);

  INSERT INTO public.invoices (org_id, subtotal, tax, total, status)
  VALUES (v_org, 10, 0, 10, 'sent') RETURNING id INTO v_paid;
  UPDATE public.invoices SET status = 'paid' WHERE id = v_paid;
  INSERT INTO public.invoice_items (org_id, invoice_id, description, qty, rate, amount)
  VALUES (v_org, v_paid, 'paid item', 1, 10, 10);

  INSERT INTO public.invoices (org_id, subtotal, tax, total, status)
  VALUES (v_org, 10, 0, 10, 'sent') RETURNING id INTO v_overdue;
  UPDATE public.invoices SET status = 'overdue' WHERE id = v_overdue;
  INSERT INTO public.invoice_items (org_id, invoice_id, description, qty, rate, amount)
  VALUES (v_org, v_overdue, 'overdue item', 1, 10, 10);

  INSERT INTO public.invoices (org_id, subtotal, tax, total, status)
  VALUES (v_org, 10, 0, 10, 'sent') RETURNING id INTO v_cancel;
  UPDATE public.invoices SET status = 'cancelled' WHERE id = v_cancel;
  INSERT INTO public.invoice_items (org_id, invoice_id, description, qty, rate, amount)
  VALUES (v_org, v_cancel, 'cancelled item', 1, 10, 10);

  -- sent / paid / overdue / cancelled deletions are all rejected.
  BEGIN
    DELETE FROM public.invoices WHERE id = v_sent;
    RAISE EXCEPTION 'expected sent invoice delete to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_IMMUTABLE:%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.invoices WHERE id = v_paid;
    RAISE EXCEPTION 'expected paid invoice delete to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_IMMUTABLE:%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.invoices WHERE id = v_overdue;
    RAISE EXCEPTION 'expected overdue invoice delete to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_IMMUTABLE:%' THEN RAISE; END IF;
  END;

  -- cancelled is NOT treated as a disposable draft: no documented policy in
  -- this repository says otherwise, and cancellation is reachable from sent.
  BEGIN
    DELETE FROM public.invoices WHERE id = v_cancel;
    RAISE EXCEPTION 'expected cancelled invoice delete to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'INVOICE_IMMUTABLE:%' THEN RAISE; END IF;
  END;

  -- Rejected deletion leaves the invoice AND its line items unchanged.
  SELECT COUNT(*) INTO v_count FROM public.invoices
  WHERE id IN (v_sent, v_paid, v_overdue, v_cancel);
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'protected invoices were removed (remaining=%)', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.invoice_items
  WHERE invoice_id IN (v_sent, v_paid, v_overdue, v_cancel);
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'protected invoice items were removed (remaining=%)', v_count;
  END IF;

  -- Draft deletion is still allowed and still cascades to line items.
  DELETE FROM public.invoices WHERE id = v_draft;

  SELECT COUNT(*) INTO v_count FROM public.invoices WHERE id = v_draft;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'draft invoice was not deleted';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.invoice_items WHERE invoice_id = v_draft;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'draft invoice items did not cascade (remaining=%)', v_count;
  END IF;

  -- Repeating the draft deletion is a safe no-op (0 rows affected, no error).
  DELETE FROM public.invoices WHERE id = v_draft;

  RAISE NOTICE 'invoice F5 SQL tests passed';
END
$$;

-- Post-conditions readable in the psql transcript.
SELECT 'invoice item amount <> qty * rate' AS check_name, COUNT(*) AS violation_count
FROM public.invoice_items it
WHERE it.amount IS DISTINCT FROM ROUND(it.qty::numeric * it.rate, 2)
UNION ALL
SELECT 'invoice subtotal <> SUM(item amounts)', COUNT(*)
FROM public.invoices inv
WHERE ROUND(inv.subtotal, 2) IS DISTINCT FROM (
  SELECT COALESCE(ROUND(SUM(it.amount), 2), 0)
  FROM public.invoice_items it WHERE it.invoice_id = inv.id
)
UNION ALL
SELECT 'invoice total <> subtotal + tax', COUNT(*)
FROM public.invoices inv
WHERE ROUND(inv.total, 2) IS DISTINCT FROM ROUND(inv.subtotal + COALESCE(inv.tax, 0), 2);

ROLLBACK;
