-- Tenant reference consistency regression tests.
-- Run after: supabase db reset --local --no-seed && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/tenant_reference_consistency.test.sql
-- Expect: all DO blocks complete without uncaught exceptions; failures are caught internally.
-- All mutations run inside the outer transaction and ROLLBACK at the end.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_org_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_user_a UUID := '99999999-9999-4999-8999-999999999999';
  v_client_a UUID := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  v_client_b UUID := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
  v_missing_client UUID := '11111111-1111-4111-8111-111111111111';
  v_instrument_a UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5';
  v_instrument_b UUID := 'ffffffff-ffff-4fff-8fff-fffffffffff6';
  v_instrument_sale_ok UUID := '10101010-1010-4101-8101-010101010101';
  v_instrument_sale_fail UUID := '20202020-2020-4202-8202-020202020202';
  v_instrument_sale_idem_fail UUID := '30303030-3030-4303-8303-030303030303';
  v_sale_a UUID;
  v_sale_atomic_ok UUID;
  v_invoice_a UUID;
  v_invoice_atomic_ok UUID;
  v_invoice_update_a UUID;
  v_caught TEXT;
  v_sales_count INTEGER;
  v_instrument_status TEXT;
  v_invoice_count INTEGER;
  v_invoice_item_count INTEGER;
  v_idem_count INTEGER;
  v_invoice_client_id UUID;
  v_generic_client_error CONSTANT TEXT := 'Client not found in current organization';
BEGIN
  INSERT INTO public.organizations (id, name) VALUES
    (v_org_a, 'Tenant Isolation Org A'),
    (v_org_b, 'Tenant Isolation Org B');

  INSERT INTO public.clients (id, org_id, name) VALUES
    (v_client_a, v_org_a, 'Client A'),
    (v_client_b, v_org_b, 'Client B');

  INSERT INTO public.instruments (id, org_id, type, serial_number, status) VALUES
    (v_instrument_a, v_org_a, 'Violin', 'TI-A-001', 'Available'),
    (v_instrument_b, v_org_b, 'Violin', 'TI-B-001', 'Available'),
    (v_instrument_sale_ok, v_org_a, 'Violin', 'TI-A-SALE-OK', 'Available'),
    (v_instrument_sale_fail, v_org_a, 'Violin', 'TI-A-SALE-FAIL', 'Available'),
    (v_instrument_sale_idem_fail, v_org_a, 'Violin', 'TI-A-SALE-IDEM', 'Available');

  -- ── Trigger-level direct INSERT/UPDATE guards ───────────────────────────

  INSERT INTO public.sales_history (
    org_id, instrument_id, client_id, sale_price, sale_date
  ) VALUES (
    v_org_a, v_instrument_a, v_client_a, 1000, CURRENT_DATE
  )
  RETURNING id INTO v_sale_a;

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

  BEGIN
    INSERT INTO public.sales_history (
      org_id, instrument_id, client_id, sale_price, sale_date
    ) VALUES (
      v_org_a, v_instrument_a, v_missing_client, 1000, CURRENT_DATE
    );
    RAISE EXCEPTION 'expected missing client insert to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%Referenced client not found%' THEN
      RAISE;
    END IF;
  END;

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

  INSERT INTO public.invoices (org_id, client_id, subtotal, total)
  VALUES (v_org_a, v_client_a, 100, 100)
  RETURNING id INTO v_invoice_a;

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

  INSERT INTO public.invoices (org_id, client_id, subtotal, total)
  VALUES (v_org_a, NULL, 50, 50);

  -- ── create_sale_atomic ──────────────────────────────────────────────────

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_user_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object(
        'org_id', v_org_a::text,
        'role', 'admin'
      )
    )::text,
    true
  );

  v_sale_atomic_ok := public.create_sale_atomic(
    1500, CURRENT_DATE, v_client_a, v_instrument_sale_ok, 'same-org sale atomic'
  );

  IF v_sale_atomic_ok IS NULL THEN
    RAISE EXCEPTION 'create_sale_atomic same-org path returned NULL';
  END IF;

  SELECT status INTO v_instrument_status
  FROM public.instruments
  WHERE id = v_instrument_sale_ok;

  IF v_instrument_status <> 'Sold' THEN
    RAISE EXCEPTION 'create_sale_atomic same-org path did not mark instrument Sold (got %)', v_instrument_status;
  END IF;

  SELECT COUNT(*) INTO v_sales_count
  FROM public.sales_history
  WHERE instrument_id = v_instrument_sale_fail;

  SELECT status INTO v_instrument_status
  FROM public.instruments
  WHERE id = v_instrument_sale_fail;

  BEGIN
    PERFORM public.create_sale_atomic(
      1600, CURRENT_DATE, v_client_b, v_instrument_sale_fail, 'foreign-org client'
    );
    RAISE EXCEPTION 'expected create_sale_atomic foreign-org client to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%must match referenced parent organization%'
       AND v_caught NOT LIKE '%must belong to the same organization%' THEN
      RAISE;
    END IF;
  END;

  IF (
    SELECT COUNT(*) FROM public.sales_history
    WHERE instrument_id = v_instrument_sale_fail
  ) <> v_sales_count THEN
    RAISE EXCEPTION 'create_sale_atomic failure left sales_history rows behind';
  END IF;

  IF (
    SELECT status FROM public.instruments WHERE id = v_instrument_sale_fail
  ) <> v_instrument_status THEN
    RAISE EXCEPTION 'create_sale_atomic failure changed instrument status';
  END IF;

  -- ── create_sale_atomic_idempotent ─────────────────────────────────────

  BEGIN
    PERFORM public.create_sale_atomic_idempotent(
      'tenant-test/sales',
      'sale-idem-foreign-client',
      'hash-foreign-client',
      1700,
      CURRENT_DATE,
      v_client_b,
      v_instrument_sale_idem_fail,
      'foreign-org idempotent sale'
    );
    RAISE EXCEPTION 'expected create_sale_atomic_idempotent foreign-org client to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%must match referenced parent organization%'
       AND v_caught NOT LIKE '%must belong to the same organization%' THEN
      RAISE;
    END IF;
  END;

  SELECT COUNT(*) INTO v_idem_count
  FROM public.sales_idempotency_keys
  WHERE org_id = v_org_a
    AND user_id = v_user_a
    AND route_key = 'tenant-test/sales'
    AND idempotency_key = 'sale-idem-foreign-client';

  IF v_idem_count <> 0 THEN
    RAISE EXCEPTION 'create_sale_atomic_idempotent failure left idempotency reservation (count=%)', v_idem_count;
  END IF;

  -- ── create_invoice_atomic ───────────────────────────────────────────────

  v_invoice_atomic_ok := public.create_invoice_atomic(
    jsonb_build_object(
      'client_id', v_client_a::text,
      'subtotal', 200,
      'total', 200,
      'status', 'draft'
    ),
    jsonb_build_array(
      jsonb_build_object(
        'description', 'same-org line item',
        'qty', 1,
        'rate', 200,
        'amount', 200,
        'display_order', 0
      )
    )
  );

  IF v_invoice_atomic_ok IS NULL THEN
    RAISE EXCEPTION 'create_invoice_atomic same-org path returned NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.invoice_items
    WHERE invoice_id = v_invoice_atomic_ok
  ) THEN
    RAISE EXCEPTION 'create_invoice_atomic same-org path did not create invoice_items';
  END IF;

  SELECT COUNT(*) INTO v_invoice_count FROM public.invoices;
  SELECT COUNT(*) INTO v_invoice_item_count FROM public.invoice_items;

  BEGIN
    PERFORM public.create_invoice_atomic(
      jsonb_build_object(
        'client_id', v_client_b::text,
        'subtotal', 300,
        'total', 300
      ),
      jsonb_build_array(
        jsonb_build_object(
          'description', 'foreign-org item',
          'qty', 1,
          'rate', 300,
          'amount', 300
        )
      )
    );
    RAISE EXCEPTION 'expected create_invoice_atomic foreign-org client to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught <> v_generic_client_error THEN
      RAISE EXCEPTION 'expected generic client error %, got: %', v_generic_client_error, v_caught;
    END IF;
  END;

  IF (SELECT COUNT(*) FROM public.invoices) <> v_invoice_count THEN
    RAISE EXCEPTION 'create_invoice_atomic foreign-org failure created invoice rows';
  END IF;

  IF (SELECT COUNT(*) FROM public.invoice_items) <> v_invoice_item_count THEN
    RAISE EXCEPTION 'create_invoice_atomic foreign-org failure created invoice_items rows';
  END IF;

  BEGIN
    PERFORM public.create_invoice_atomic(
      jsonb_build_object(
        'client_id', v_missing_client::text,
        'subtotal', 400,
        'total', 400
      ),
      '[]'::jsonb
    );
    RAISE EXCEPTION 'expected create_invoice_atomic missing client to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught <> v_generic_client_error THEN
      RAISE EXCEPTION 'expected generic client error %, got: %', v_generic_client_error, v_caught;
    END IF;
  END;

  IF (SELECT COUNT(*) FROM public.invoices) <> v_invoice_count THEN
    RAISE EXCEPTION 'create_invoice_atomic missing-client failure created invoice rows';
  END IF;

  IF (SELECT COUNT(*) FROM public.invoice_items) <> v_invoice_item_count THEN
    RAISE EXCEPTION 'create_invoice_atomic missing-client failure created invoice_items rows';
  END IF;

  -- ── create_invoice_atomic_idempotent ────────────────────────────────────

  BEGIN
    PERFORM public.create_invoice_atomic_idempotent(
      'tenant-test/invoices',
      'invoice-idem-foreign-client',
      'hash-invoice-foreign',
      jsonb_build_object(
        'client_id', v_client_b::text,
        'subtotal', 500,
        'total', 500
      ),
      '[]'::jsonb
    );
    RAISE EXCEPTION 'expected create_invoice_atomic_idempotent foreign-org client to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught <> v_generic_client_error THEN
      RAISE EXCEPTION 'expected generic client error %, got: %', v_generic_client_error, v_caught;
    END IF;
  END;

  SELECT COUNT(*) INTO v_idem_count
  FROM public.invoice_idempotency_keys
  WHERE org_id = v_org_a
    AND user_id = v_user_a
    AND route_key = 'tenant-test/invoices'
    AND idempotency_key = 'invoice-idem-foreign-client';

  IF v_idem_count <> 0 THEN
    RAISE EXCEPTION 'create_invoice_atomic_idempotent failure left idempotency reservation (count=%)', v_idem_count;
  END IF;

  -- ── update_invoice_atomic ───────────────────────────────────────────────

  INSERT INTO public.invoices (org_id, client_id, subtotal, total, status)
  VALUES (v_org_a, v_client_a, 600, 600, 'draft')
  RETURNING id INTO v_invoice_update_a;

  BEGIN
    PERFORM public.update_invoice_atomic(
      v_invoice_update_a,
      jsonb_build_object('client_id', v_client_b::text),
      NULL
    );
    RAISE EXCEPTION 'expected update_invoice_atomic cross-org client change to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%must match client organization%' THEN
      RAISE;
    END IF;
  END;

  SELECT client_id INTO v_invoice_client_id
  FROM public.invoices
  WHERE id = v_invoice_update_a;

  IF v_invoice_client_id IS DISTINCT FROM v_client_a THEN
    RAISE EXCEPTION 'update_invoice_atomic failure mutated invoice.client_id';
  END IF;

  -- ── service_role direct cross-org INSERT (trigger defense) ──────────────

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    BEGIN
      SET LOCAL ROLE service_role;
      INSERT INTO public.sales_history (
        org_id, instrument_id, client_id, sale_price, sale_date
      ) VALUES (
        v_org_a, v_instrument_a, v_client_b, 1000, CURRENT_DATE
      );
      RESET ROLE;
      RAISE EXCEPTION 'expected service_role cross-org sales_history insert to fail';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RESET ROLE;
        RAISE NOTICE 'service-role cross-org INSERT test: NOT EXECUTED (service_role lacks INSERT on sales_history)';
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
        RESET ROLE;
        IF v_caught NOT LIKE '%must match referenced parent organization%'
           AND v_caught NOT LIKE '%must belong to the same organization%' THEN
          RAISE;
        END IF;
        RAISE NOTICE 'service-role cross-org INSERT test: EXECUTED (trigger rejected insert)';
    END;
  ELSE
    RAISE NOTICE 'service-role cross-org INSERT test: NOT EXECUTED (service_role role missing)';
  END IF;

  RAISE NOTICE 'tenant reference consistency SQL tests passed';
END
$$;

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
