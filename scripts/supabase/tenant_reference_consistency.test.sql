-- Tenant reference consistency regression tests.
-- Run after: supabase db reset --local --no-seed && psql ... -f this file
-- Expect: all DO blocks complete without uncaught exceptions; failures are caught internally.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_org_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_client_a UUID := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  v_client_b UUID := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
  v_instrument_a UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5';
  v_instrument_b UUID := 'ffffffff-ffff-4fff-8fff-fffffffffff6';
  v_sale_a UUID;
  v_invoice_a UUID;
  v_caught TEXT;
BEGIN
  INSERT INTO public.organizations (id, name) VALUES
    (v_org_a, 'Tenant Isolation Org A'),
    (v_org_b, 'Tenant Isolation Org B');

  INSERT INTO public.clients (id, org_id, name) VALUES
    (v_client_a, v_org_a, 'Client A'),
    (v_client_b, v_org_b, 'Client B');

  INSERT INTO public.instruments (id, org_id, type, serial_number, status) VALUES
    (v_instrument_a, v_org_a, 'Violin', 'TI-A-001', 'Available'),
    (v_instrument_b, v_org_b, 'Violin', 'TI-B-001', 'Available');

  -- 1) same-org sale succeeds
  INSERT INTO public.sales_history (
    org_id, instrument_id, client_id, sale_price, sale_date
  ) VALUES (
    v_org_a, v_instrument_a, v_client_a, 1000, CURRENT_DATE
  )
  RETURNING id INTO v_sale_a;

  -- 2) cross-org client fails
  BEGIN
    INSERT INTO public.sales_history (
      org_id, instrument_id, client_id, sale_price, sale_date
    ) VALUES (
      v_org_a, v_instrument_a, v_client_b, 1000, CURRENT_DATE
    );
    RAISE EXCEPTION 'expected cross-org client insert to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%must match referenced parent organization%'
       AND v_caught NOT LIKE '%must belong to the same organization%' THEN
      RAISE;
    END IF;
  END;

  -- 3) cross-org instrument fails
  BEGIN
    INSERT INTO public.sales_history (
      org_id, instrument_id, client_id, sale_price, sale_date
    ) VALUES (
      v_org_a, v_instrument_b, v_client_a, 1000, CURRENT_DATE
    );
    RAISE EXCEPTION 'expected cross-org instrument insert to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%must match referenced parent organization%'
       AND v_caught NOT LIKE '%must belong to the same organization%' THEN
      RAISE;
    END IF;
  END;

  -- 4) explicit org_id mismatch with same-org parents fails
  BEGIN
    INSERT INTO public.sales_history (
      org_id, instrument_id, client_id, sale_price, sale_date
    ) VALUES (
      v_org_b, v_instrument_a, v_client_a, 1000, CURRENT_DATE
    );
    RAISE EXCEPTION 'expected explicit org_id mismatch to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%must match referenced parent organization%' THEN
      RAISE;
    END IF;
  END;

  -- 5) missing client fails
  BEGIN
    INSERT INTO public.sales_history (
      org_id, instrument_id, client_id, sale_price, sale_date
    ) VALUES (
      v_org_a, v_instrument_a, '11111111-1111-4111-8111-111111111111', 1000, CURRENT_DATE
    );
    RAISE EXCEPTION 'expected missing client insert to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%Referenced client not found%' THEN
      RAISE;
    END IF;
  END;

  -- 6) cross-org adjustment reference fails
  BEGIN
    INSERT INTO public.sales_history (
      org_id, instrument_id, client_id, sale_price, sale_date,
      adjustment_of_sale_id, entry_kind
    ) VALUES (
      v_org_b, v_instrument_b, v_client_b, -1000, CURRENT_DATE,
      v_sale_a, 'refund'
    );
    RAISE EXCEPTION 'expected cross-org adjustment insert to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%must match referenced parent organization%'
       AND v_caught NOT LIKE '%Adjustment sale must belong to the same organization%' THEN
      RAISE;
    END IF;
  END;

  -- 7) same-org invoice succeeds
  INSERT INTO public.invoices (org_id, client_id, subtotal, total)
  VALUES (v_org_a, v_client_a, 100, 100)
  RETURNING id INTO v_invoice_a;

  -- 8) cross-org invoice client fails
  BEGIN
    INSERT INTO public.invoices (org_id, client_id, subtotal, total)
    VALUES (v_org_a, v_client_b, 100, 100);
    RAISE EXCEPTION 'expected cross-org invoice insert to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%must match client organization%' THEN
      RAISE;
    END IF;
  END;

  -- 9) invoice UPDATE cross-org client fails
  BEGIN
    UPDATE public.invoices
    SET client_id = v_client_b
    WHERE id = v_invoice_a;
    RAISE EXCEPTION 'expected cross-org invoice update to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%must match client organization%' THEN
      RAISE;
    END IF;
  END;

  -- 10) null client invoice still allowed
  INSERT INTO public.invoices (org_id, client_id, subtotal, total)
  VALUES (v_org_a, NULL, 50, 50);

  RAISE NOTICE 'tenant reference consistency SQL tests passed';
END
$$;

-- Audit queries (expect zero rows on clean DB)
SELECT 'sales_history instrument org mismatch' AS check_name, COUNT(*) AS mismatch_count
FROM public.sales_history sh
JOIN public.instruments i ON i.id = sh.instrument_id
WHERE sh.instrument_id IS NOT NULL AND sh.org_id <> i.org_id
UNION ALL
SELECT 'sales_history client org mismatch', COUNT(*)
FROM public.sales_history sh
JOIN public.clients c ON c.id = sh.client_id
WHERE sh.client_id IS NOT NULL AND sh.org_id <> c.org_id
UNION ALL
SELECT 'sales_history adjustment org mismatch', COUNT(*)
FROM public.sales_history adj
JOIN public.sales_history src ON src.id = adj.adjustment_of_sale_id
WHERE adj.adjustment_of_sale_id IS NOT NULL AND adj.org_id <> src.org_id
UNION ALL
SELECT 'invoices client org mismatch', COUNT(*)
FROM public.invoices inv
JOIN public.clients c ON c.id = inv.client_id
WHERE inv.client_id IS NOT NULL AND inv.org_id <> c.org_id;

ROLLBACK;
