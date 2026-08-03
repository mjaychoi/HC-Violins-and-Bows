-- Permanent regression tests: sale-price precision/maximum/sign contract at
-- the RPC and CHECK-constraint layer, after
-- 20260804010000_enforce_sale_price_precision_and_maximum.sql.
--
-- Prerequisites (local disposable DB):
--   1. Schema + RPCs applied through 20260804010000_enforce_sale_price_precision_and_maximum.sql
--   2. auth.jwt() / auth.uid() stubs honoring request.jwt.claims (see
--      scripts/supabase/sale_resale_test_bootstrap.sql)
--
-- Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/sale_price_contract.test.sql
--
-- Expect: script completes without error. Each assertion RAISES on failure.
--
-- NOT covered here (see other scripts): concurrency (test #12 in the task
-- checklist) is exercised by
-- scripts/supabase/create_sale_atomic_resale_concurrency.test.sh, which is
-- unaffected by this migration — it exercises the pre-existing active-sale
-- guard, not price validation, so it is not duplicated here.

\set ON_ERROR_STOP on

-- Keep the permanent contract test hermetic even when it is run against a
-- long-lived local database. Every fixture and assertion below is rolled
-- back after the DO block completes successfully.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_jwt(p_org_id UUID, p_role TEXT, p_user_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', COALESCE(p_user_id::text, '11111111-1111-4111-8111-111111111111'),
      'role', 'authenticated',
      'app_metadata', json_build_object(
        'org_id', p_org_id,
        'role', p_role
      )
    )::text,
    true
  );
END;
$$;

DO $$
DECLARE
  v_org UUID := 'a0000000-0000-4000-8000-0000000000f1';
  v_user_admin UUID := '11111111-1111-4111-8111-111111111111';
  v_client UUID := 'c0000000-0000-4000-8000-0000000000f1';
  v_client_2 UUID := 'c0000000-0000-4000-8000-0000000000f2';
  v_client_3 UUID := 'c0000000-0000-4000-8000-0000000000f3';
  v_inst_1 UUID := 'd0000000-0000-4000-8000-0000000000f1';
  v_inst_2 UUID := 'd0000000-0000-4000-8000-0000000000f2';
  v_inst_3 UUID := 'd0000000-0000-4000-8000-0000000000f3';
  v_inst_4 UUID := 'd0000000-0000-4000-8000-0000000000f4';
  v_inst_5 UUID := 'd0000000-0000-4000-8000-0000000000f5';
  v_inst_6 UUID := 'd0000000-0000-4000-8000-0000000000f6';
  v_inst_7 UUID := 'd0000000-0000-4000-8000-0000000000f7';
  v_purchaser_connection UUID := 'e0000000-0000-4000-8000-0000000000f1';
  v_sale UUID;
  v_sale_retry UUID;
  v_refund UUID;
  v_net NUMERIC;
  v_caught TEXT;
BEGIN
  INSERT INTO public.organizations (id, name) VALUES (v_org, 'Price Contract Test Org')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.clients (id, org_id, name, first_name, last_name)
  VALUES (v_client, v_org, 'Price Test Client', 'Price Test', 'Client')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.clients (id, org_id, name, first_name, last_name) VALUES
    (v_client_2, v_org, 'Price Test Client Two', 'Price Test', 'Client Two'),
    (v_client_3, v_org, 'Price Test Client Three', 'Price Test', 'Client Three')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    (v_inst_1, v_org, 'Violin', 'PRICE-001', 'Available', 1000),
    (v_inst_2, v_org, 'Violin', 'PRICE-002', 'Available', 1000),
    (v_inst_3, v_org, 'Violin', 'PRICE-003', 'Available', 1000),
    (v_inst_4, v_org, 'Violin', 'PRICE-004', 'Available', 1000),
    (v_inst_5, v_org, 'Violin', 'PRICE-005', 'Available', 1000),
    (v_inst_6, v_org, 'Violin', 'PRICE-006', 'Available', 1000),
    (v_inst_7, v_org, 'Violin', 'PRICE-007', 'Available', 1000)
  ON CONFLICT (id) DO UPDATE SET status = 'Available', org_id = EXCLUDED.org_id;
  DELETE FROM public.sales_idempotency_keys WHERE org_id = v_org;
  DELETE FROM public.sales_history WHERE instrument_id IN (v_inst_1, v_inst_2, v_inst_3, v_inst_4, v_inst_5, v_inst_6, v_inst_7);
  DELETE FROM public.client_instruments WHERE instrument_id = v_inst_7;

  PERFORM pg_temp.set_jwt(v_org, 'admin', v_user_admin);

  ------------------------------------------------------------------
  -- 1) Direct RPC call with zero fails
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.create_sale_atomic(0, CURRENT_DATE, v_client, v_inst_1, 'zero');
    RAISE EXCEPTION 'test1: expected zero price to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test1:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%cannot be zero%' THEN
      RAISE EXCEPTION 'test1: unexpected error: %', v_caught;
    END IF;
  END;

  ------------------------------------------------------------------
  -- 2) Direct RPC call with a negative sale amount fails on the sell
  --    transition (update_instrument_sale_transition_atomic), which always
  --    requires a positive price. create_sale_atomic itself intentionally
  --    does NOT reject negative amounts directly — that is the documented
  --    POST /api/sales standalone-refund-entry carve-out (see the migration
  --    header comment and src/app/api/sales/route.ts). Both behaviors are
  --    asserted here so the carve-out stays deliberate, not accidental.
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.update_instrument_sale_transition_atomic(
      v_inst_1,
      jsonb_build_object('status', 'Sold'),
      -500, CURRENT_DATE, v_client, 'negative sell attempt',
      (SELECT updated_at FROM public.instruments WHERE id = v_inst_1)
    );
    RAISE EXCEPTION 'test2: expected negative sell price to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test2:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%positive number%' THEN
      RAISE EXCEPTION 'test2: unexpected error: %', v_caught;
    END IF;
  END;

  -- Documented carve-out: create_sale_atomic called directly still accepts
  -- a negative amount (this is what POST /api/sales relies on).
  v_sale := public.create_sale_atomic(-250, CURRENT_DATE, v_client, NULL, 'carve-out check');
  IF NOT EXISTS (SELECT 1 FROM public.sales_history WHERE id = v_sale AND sale_price = -250) THEN
    RAISE EXCEPTION 'test2b: expected negative standalone sale row to be stored as-is';
  END IF;

  ------------------------------------------------------------------
  -- 3) Direct RPC call with excess fractional precision fails
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.create_sale_atomic(99.999, CURRENT_DATE, v_client, v_inst_2, 'excess precision');
    RAISE EXCEPTION 'test3: expected excess-precision price to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test3:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%more than two decimal places%' THEN
      RAISE EXCEPTION 'test3: unexpected error: %', v_caught;
    END IF;
  END;

  ------------------------------------------------------------------
  -- 4) Direct RPC call above the maximum fails
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.create_sale_atomic(1000000000.01, CURRENT_DATE, v_client, v_inst_2, 'above max');
    RAISE EXCEPTION 'test4: expected above-maximum price to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test4:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%exceeds the maximum%' THEN
      RAISE EXCEPTION 'test4: unexpected error: %', v_caught;
    END IF;
  END;

  ------------------------------------------------------------------
  -- 5) Direct insert violating the new CHECK constraints fails
  ------------------------------------------------------------------
  BEGIN
    INSERT INTO public.sales_history (org_id, instrument_id, client_id, sale_price, sale_date, entry_kind)
    VALUES (v_org, NULL, v_client, 1000000000.01, CURRENT_DATE, 'sale');
    RAISE EXCEPTION 'test5a: expected max-magnitude CHECK to reject direct insert';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  BEGIN
    INSERT INTO public.sales_history (org_id, instrument_id, client_id, sale_price, sale_date, entry_kind, adjustment_of_sale_id)
    VALUES (v_org, NULL, v_client, 50, CURRENT_DATE, 'refund', v_sale);
    RAISE EXCEPTION 'test5b: expected refund-sign CHECK to reject a positive refund row';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  BEGIN
    INSERT INTO public.sales_history (org_id, instrument_id, client_id, sale_price, sale_date, entry_kind, adjustment_of_sale_id)
    VALUES (v_org, NULL, v_client, -50, CURRENT_DATE, 'undo_refund', v_sale);
    RAISE EXCEPTION 'test5c: expected undo_refund-sign CHECK to reject a negative undo_refund row';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  ------------------------------------------------------------------
  -- 6) Valid two-decimal amount succeeds
  ------------------------------------------------------------------
  v_sale := public.create_sale_atomic(1234.56, CURRENT_DATE, v_client, v_inst_2, 'two decimals');
  IF NOT EXISTS (SELECT 1 FROM public.sales_history WHERE id = v_sale AND sale_price = 1234.56) THEN
    RAISE EXCEPTION 'test6: expected exact two-decimal amount stored';
  END IF;

  ------------------------------------------------------------------
  -- 7) Exact maximum succeeds
  ------------------------------------------------------------------
  v_sale := public.create_sale_atomic(1000000000, CURRENT_DATE, v_client, v_inst_3, 'exact max');
  IF NOT EXISTS (SELECT 1 FROM public.sales_history WHERE id = v_sale AND sale_price = 1000000000) THEN
    RAISE EXCEPTION 'test7: expected exact-maximum amount stored';
  END IF;

  ------------------------------------------------------------------
  -- 8) Refund exactly negates the stored sale; 9) sale + full refund nets
  --    exactly zero
  ------------------------------------------------------------------
  v_sale := public.create_sale_atomic(100.10, CURRENT_DATE, v_client, v_inst_4, 'refund exactness');
  v_refund := public.create_sale_adjustment_atomic(v_sale, 'refund', 'full refund');
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_history WHERE id = v_refund AND sale_price = -100.10
  ) THEN
    RAISE EXCEPTION 'test8: expected refund of exactly -100.10, got %',
      (SELECT sale_price FROM public.sales_history WHERE id = v_refund);
  END IF;

  SELECT SUM(sale_price) INTO v_net
  FROM public.sales_history
  WHERE org_id = v_org
    AND (id = v_sale OR adjustment_of_sale_id = v_sale);
  IF v_net <> 0 THEN
    RAISE EXCEPTION 'test9: expected exact zero lifecycle net, got %', v_net;
  END IF;

  ------------------------------------------------------------------
  -- 10) Idempotent retry returns the same sale and amount
  ------------------------------------------------------------------
  DELETE FROM public.sales_idempotency_keys
    WHERE org_id = v_org AND idempotency_key = 'price-idem-1';
  v_sale := public.create_sale_atomic_idempotent(
    'POST:/api/sales', 'price-idem-1', 'hash-price-1',
    777.77, CURRENT_DATE, v_client, v_inst_5, 'idempotent'
  );
  v_sale_retry := public.create_sale_atomic_idempotent(
    'POST:/api/sales', 'price-idem-1', 'hash-price-1',
    777.77, CURRENT_DATE, v_client, v_inst_5, 'idempotent'
  );
  IF v_sale IS DISTINCT FROM v_sale_retry THEN
    RAISE EXCEPTION 'test10: idempotent retry must return same sale id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_history WHERE id = v_sale AND sale_price = 777.77) THEN
    RAISE EXCEPTION 'test10: expected exact amount preserved on retry';
  END IF;

  ------------------------------------------------------------------
  -- 11) The origin/main lifecycle still rejects a new positive sale for an
  --     instrument with positive sale history, even after a full refund row.
  --     The price migration must not silently introduce resale behavior.
  ------------------------------------------------------------------
  v_sale := public.create_sale_atomic(500.50, CURRENT_DATE, v_client, v_inst_6, 'first sale of pair');
  PERFORM public.create_sale_adjustment_atomic(v_sale, 'refund', 'refund first');
  BEGIN
    PERFORM public.create_sale_atomic(600.75, CURRENT_DATE, v_client, v_inst_6, 'blocked resale');
    RAISE EXCEPTION 'test11: expected origin/main completed-sale guard to reject resale';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test11:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%already sold%' AND v_caught NOT LIKE '%completed sale record%' THEN
      RAISE EXCEPTION 'test11: unexpected error: %', v_caught;
    END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.sales_history WHERE id = v_sale AND sale_price = 500.50) THEN
    RAISE EXCEPTION 'test11: expected original sale amount unchanged after blocked resale';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_history
    WHERE adjustment_of_sale_id = v_sale AND entry_kind = 'refund' AND sale_price = -500.50
  ) THEN
    RAISE EXCEPTION 'test11: expected first-lifecycle refund amount unchanged after resale';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sales_history
    WHERE instrument_id = v_inst_6 AND entry_kind = 'sale' AND sale_price = 600.75
  ) THEN
    RAISE EXCEPTION 'test11: blocked resale must not create sale history';
  END IF;

  ------------------------------------------------------------------
  -- 12) Main-RPC preservation: purchaser normalization/deduplication,
  --     stale Owned/Booked cleanup, and certificate_name patching all
  --     survive the price-only function replacement.
  ------------------------------------------------------------------
  INSERT INTO public.client_instruments (
    id, org_id, client_id, instrument_id, relationship_type, notes, created_at
  ) VALUES
    (v_purchaser_connection, v_org, v_client, v_inst_7, 'Interested', 'oldest purchaser row', NOW() - INTERVAL '2 days'),
    (gen_random_uuid(), v_org, v_client, v_inst_7, 'Booked', 'duplicate purchaser row', NOW() - INTERVAL '1 day'),
    (gen_random_uuid(), v_org, v_client_2, v_inst_7, 'Owned', 'stale owner', NOW()),
    (gen_random_uuid(), v_org, v_client_3, v_inst_7, 'Booked', 'stale booking', NOW());

  PERFORM public.update_instrument_sale_transition_atomic(
    v_inst_7,
    jsonb_build_object(
      'status', 'Sold',
      'certificate', true,
      'certificate_name', 'Preserved Certificate'
    ),
    888.88, CURRENT_DATE, v_client, 'RPC preservation',
    (SELECT updated_at FROM public.instruments WHERE id = v_inst_7)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.client_instruments
    WHERE id = v_purchaser_connection
      AND client_id = v_client
      AND instrument_id = v_inst_7
      AND relationship_type = 'Sold'
      AND notes = 'oldest purchaser row'
  ) THEN
    RAISE EXCEPTION 'test12: oldest purchaser relationship must be normalized in place';
  END IF;
  IF (SELECT COUNT(*) FROM public.client_instruments WHERE client_id = v_client AND instrument_id = v_inst_7) <> 1 THEN
    RAISE EXCEPTION 'test12: duplicate purchaser relationships must be removed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_instruments
    WHERE instrument_id = v_inst_7 AND relationship_type IN ('Owned', 'Booked')
  ) THEN
    RAISE EXCEPTION 'test12: stale Owned/Booked relationships must be removed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.instruments
    WHERE id = v_inst_7
      AND status = 'Sold'
      AND certificate IS TRUE
      AND certificate_name = 'Preserved Certificate'
  ) THEN
    RAISE EXCEPTION 'test12: certificate_name and certificate patch fields must be preserved';
  END IF;

  RAISE NOTICE 'sale_price_contract tests 1-12 PASSED';
END;
$$;

ROLLBACK;
