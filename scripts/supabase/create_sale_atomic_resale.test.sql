-- Permanent regression tests: create_sale_atomic active-sale / resale guard.
--
-- Prerequisites (local disposable DB):
--   1. Schema + RPCs applied (including 20260803131709_create_sale_atomic_active_sale_guard)
--   2. auth.jwt() / auth.uid() stubs that honor request.jwt.claims (see
--      scripts/supabase/sale_resale_test_bootstrap.sql for a disposable harness)
--
-- Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/create_sale_atomic_resale.test.sql
--
-- Expect: script completes without error. Each assertion RAISES on failure.

\set ON_ERROR_STOP on

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
  v_org_a UUID := 'a0000000-0000-4000-8000-000000000001';
  v_org_b UUID := 'b0000000-0000-4000-8000-000000000002';
  v_user_admin UUID := '11111111-1111-4111-8111-111111111111';
  v_user_member UUID := '22222222-2222-4222-8222-222222222222';
  v_client_a UUID := 'c0000000-0000-4000-8000-000000000001';
  v_client_b UUID := 'c0000000-0000-4000-8000-000000000002';
  v_inst UUID := 'd0000000-0000-4000-8000-000000000001';
  v_inst_other_org UUID := 'd0000000-0000-4000-8000-000000000002';
  v_sale1 UUID;
  v_sale2 UUID;
  v_sale3 UUID;
  v_refund1 UUID;
  v_refund_partial_id UUID;
  v_idem_sale UUID;
  v_idem_sale_retry UUID;
  v_hist_count INTEGER;
  v_hist_sale_ids UUID[];
  v_status TEXT;
  v_caught TEXT;
  v_net NUMERIC;
BEGIN
  -- Fixture orgs / parties
  INSERT INTO public.organizations (id, name) VALUES
    (v_org_a, 'Resale Test Org A'),
    (v_org_b, 'Resale Test Org B')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.clients (id, org_id, name, first_name, last_name) VALUES
    (v_client_a, v_org_a, 'Client A', 'Client', 'A'),
    (v_client_b, v_org_b, 'Client B', 'Client', 'B')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    (v_inst, v_org_a, 'Violin', 'RESALE-A-001', 'Available', 5000),
    (v_inst_other_org, v_org_b, 'Violin', 'RESALE-B-001', 'Available', 5000)
  ON CONFLICT (id) DO UPDATE
    SET status = 'Available', org_id = EXCLUDED.org_id;

  -- Clean prior history for this instrument (test re-entrancy)
  DELETE FROM public.sales_idempotency_keys WHERE org_id IN (v_org_a, v_org_b);
  DELETE FROM public.sales_history WHERE instrument_id IN (v_inst, v_inst_other_org);
  UPDATE public.instruments SET status = 'Available' WHERE id IN (v_inst, v_inst_other_org);

  PERFORM pg_temp.set_jwt(v_org_a, 'admin', v_user_admin);

  ------------------------------------------------------------------
  -- 1) Initial sale succeeds
  ------------------------------------------------------------------
  v_sale1 := public.create_sale_atomic(1000, CURRENT_DATE, v_client_a, v_inst, 'first sale');
  IF v_sale1 IS NULL THEN
    RAISE EXCEPTION 'test1: expected sale id';
  END IF;
  SELECT status INTO v_status FROM public.instruments WHERE id = v_inst;
  IF v_status <> 'Sold' THEN
    RAISE EXCEPTION 'test1: expected Sold status, got %', v_status;
  END IF;

  ------------------------------------------------------------------
  -- 2) Duplicate sale before refund fails
  ------------------------------------------------------------------
  -- Reset status to Available to isolate the active-sale predicate
  -- (status Sold alone would also block). Use direct update with trigger
  -- temporarily... Actually Sold blocks via status. Force Available while
  -- leaving active sale row, which models inconsistent-but-predicate-relevant state,
  -- OR keep Sold and expect 'already sold'. Spec wants active-sale protection:
  -- put instrument back to Available without refunding (simulate status drift)
  -- by disabling trigger briefly is heavy; instead leave Sold and also test
  -- after refund. For pure active-sale: refund path tested later.
  -- Here: attempt while Sold → must fail.
  BEGIN
    PERFORM public.create_sale_atomic(1100, CURRENT_DATE, v_client_a, v_inst, 'dup before refund');
    RAISE EXCEPTION 'test2: expected duplicate sale to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%already sold%'
       AND v_caught NOT LIKE '%completed sale record%' THEN
      RAISE EXCEPTION 'test2: unexpected error: %', v_caught;
    END IF;
  END;

  ------------------------------------------------------------------
  -- 3) Same idempotency key is safe (returns original, no duplicate)
  ------------------------------------------------------------------
  -- First put instrument Available via full refund transition so we can
  -- exercise idempotent create on a clean available instrument with history.
  -- Use a second instrument path: refund current sale first for later tests.
  -- For idempotency, use a fresh instrument cycle after refund below.
  -- Defer detailed idempotency until after first refund+resale setup...
  -- Actually run idempotency on a brand-new instrument.
  DECLARE
    v_inst_idem UUID := 'd0000000-0000-4000-8000-000000000010';
  BEGIN
    INSERT INTO public.instruments (id, org_id, type, serial_number, status, price)
    VALUES (v_inst_idem, v_org_a, 'Violin', 'RESALE-IDEM-001', 'Available', 2000)
    ON CONFLICT (id) DO UPDATE SET status = 'Available';
    DELETE FROM public.sales_history WHERE instrument_id = v_inst_idem;
    DELETE FROM public.sales_idempotency_keys
    WHERE org_id = v_org_a AND idempotency_key = 'idem-resale-1';

    v_idem_sale := public.create_sale_atomic_idempotent(
      'POST /api/sales',
      'idem-resale-1',
      'hash-resale-1',
      2000,
      CURRENT_DATE,
      v_client_a,
      v_inst_idem,
      'idem sale'
    );
    v_idem_sale_retry := public.create_sale_atomic_idempotent(
      'POST /api/sales',
      'idem-resale-1',
      'hash-resale-1',
      2000,
      CURRENT_DATE,
      v_client_a,
      v_inst_idem,
      'idem sale'
    );
    IF v_idem_sale IS DISTINCT FROM v_idem_sale_retry THEN
      RAISE EXCEPTION 'test3: idempotent retry must return same sale id';
    END IF;
    SELECT COUNT(*) INTO v_hist_count
    FROM public.sales_history
    WHERE instrument_id = v_inst_idem AND entry_kind = 'sale';
    IF v_hist_count <> 1 THEN
      RAISE EXCEPTION 'test3: expected exactly 1 sale row, got %', v_hist_count;
    END IF;
  END;

  ------------------------------------------------------------------
  -- 4) Different idempotency key cannot bypass duplicate-sale protection
  ------------------------------------------------------------------
  DECLARE
    v_inst_idem UUID := 'd0000000-0000-4000-8000-000000000010';
  BEGIN
    BEGIN
      PERFORM public.create_sale_atomic_idempotent(
        'POST /api/sales',
        'idem-resale-2',
        'hash-resale-2',
        2100,
        CURRENT_DATE,
        v_client_a,
        v_inst_idem,
        'should fail'
      );
      RAISE EXCEPTION 'test4: expected second idempotency key sale to fail';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
      IF v_caught LIKE '%test4:%' THEN
        RAISE;
      END IF;
      IF v_caught NOT LIKE '%already sold%'
         AND v_caught NOT LIKE '%completed sale record%' THEN
        RAISE EXCEPTION 'test4: unexpected error: %', v_caught;
      END IF;
    END;
  END;

  ------------------------------------------------------------------
  -- 5) Partial refund does not allow resale
  -- Schema's create_sale_adjustment_atomic only writes full refunds, so
  -- simulate a partial refund row directly (smaller absolute amount).
  ------------------------------------------------------------------
  -- Prepare: refund full sale1 via transition, then create a controlled
  -- partial scenario on a dedicated instrument.
  DECLARE
    v_inst_partial UUID := 'd0000000-0000-4000-8000-000000000011';
    v_sale_partial UUID;
  BEGIN
    INSERT INTO public.instruments (id, org_id, type, serial_number, status, price)
    VALUES (v_inst_partial, v_org_a, 'Violin', 'RESALE-PARTIAL-001', 'Available', 3000)
    ON CONFLICT (id) DO UPDATE SET status = 'Available';
    DELETE FROM public.sales_history WHERE instrument_id = v_inst_partial;

    v_sale_partial := public.create_sale_atomic(
      3000, CURRENT_DATE, v_client_a, v_inst_partial, 'partial scenario sale'
    );

    -- Force Available while keeping sale, then insert partial refund of -1000
    -- so net = 2000 > 0 (still active). Bypass status trigger via session_replication_role
    -- is too broad; use update through a path that allows Sold→Available (post-migration).
    PERFORM public.update_instrument_sale_transition_atomic(
      v_inst_partial,
      jsonb_build_object('status', 'Available'),
      NULL, NULL, NULL, 'will replace with partial',
      (SELECT updated_at FROM public.instruments WHERE id = v_inst_partial)
    );
    -- That created a FULL refund. Remove it and insert a partial refund instead.
    DELETE FROM public.sales_history
    WHERE instrument_id = v_inst_partial AND entry_kind = 'refund';
    INSERT INTO public.sales_history (
      org_id, instrument_id, client_id, sale_price, sale_date,
      entry_kind, adjustment_of_sale_id, notes
    ) VALUES (
      v_org_a, v_inst_partial, v_client_a, -1000, CURRENT_DATE,
      'refund', v_sale_partial, 'simulated partial refund'
    )
    RETURNING id INTO v_refund_partial_id;

    v_net := public.sale_lifecycle_net_amount(v_sale_partial, v_org_a);
    IF v_net <= 0 THEN
      RAISE EXCEPTION 'test5 setup: expected positive net after partial refund, got %', v_net;
    END IF;

    BEGIN
      PERFORM public.create_sale_atomic(
        3200, CURRENT_DATE, v_client_a, v_inst_partial, 'blocked by partial'
      );
      RAISE EXCEPTION 'test5: expected resale after partial refund to fail';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
      IF v_caught LIKE '%test5:%' THEN
        RAISE;
      END IF;
      IF v_caught NOT LIKE '%completed sale record%' THEN
        RAISE EXCEPTION 'test5: unexpected error: %', v_caught;
      END IF;
    END;
  END;

  ------------------------------------------------------------------
  -- 6) Full refund allows resale
  ------------------------------------------------------------------
  PERFORM public.update_instrument_sale_transition_atomic(
    v_inst,
    jsonb_build_object('status', 'Available'),
    NULL, NULL, NULL, 'full refund of first sale',
    (SELECT updated_at FROM public.instruments WHERE id = v_inst)
  );
  SELECT status INTO v_status FROM public.instruments WHERE id = v_inst;
  IF v_status <> 'Available' THEN
    RAISE EXCEPTION 'test6: expected Available after refund, got %', v_status;
  END IF;
  IF public.instrument_has_active_sale(v_inst, v_org_a) THEN
    RAISE EXCEPTION 'test6: expected no active sale after full refund';
  END IF;

  v_sale2 := public.create_sale_atomic(1500, CURRENT_DATE, v_client_a, v_inst, 'resale');
  IF v_sale2 IS NULL OR v_sale2 = v_sale1 THEN
    RAISE EXCEPTION 'test6: expected distinct resale id';
  END IF;

  ------------------------------------------------------------------
  -- 7) Resale creates a distinct sale history entry
  ------------------------------------------------------------------
  SELECT COUNT(*), ARRAY_AGG(id ORDER BY created_at)
    INTO v_hist_count, v_hist_sale_ids
  FROM public.sales_history
  WHERE instrument_id = v_inst AND entry_kind = 'sale';
  IF v_hist_count < 2 THEN
    RAISE EXCEPTION 'test7: expected >= 2 sale rows, got %', v_hist_count;
  END IF;
  IF NOT (v_sale1 = ANY (v_hist_sale_ids) AND v_sale2 = ANY (v_hist_sale_ids)) THEN
    RAISE EXCEPTION 'test7: both sale ids must remain queryable';
  END IF;
  -- Original sale row unchanged (still positive price, first notes)
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_history
    WHERE id = v_sale1 AND sale_price = 1000 AND notes = 'first sale'
  ) THEN
    RAISE EXCEPTION 'test7: historical first sale must remain unchanged';
  END IF;

  ------------------------------------------------------------------
  -- 8) Duplicate sale after resale fails
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.create_sale_atomic(1600, CURRENT_DATE, v_client_a, v_inst, 'dup after resale');
    RAISE EXCEPTION 'test8: expected duplicate after resale to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE '%test8:%' THEN
      RAISE;
    END IF;
    IF v_caught NOT LIKE '%already sold%'
       AND v_caught NOT LIKE '%completed sale record%' THEN
      RAISE EXCEPTION 'test8: unexpected error: %', v_caught;
    END IF;
  END;

  ------------------------------------------------------------------
  -- 9) Full refund of resale allows a later third sale
  ------------------------------------------------------------------
  PERFORM public.update_instrument_sale_transition_atomic(
    v_inst,
    jsonb_build_object('status', 'Available'),
    NULL, NULL, NULL, 'full refund of resale',
    (SELECT updated_at FROM public.instruments WHERE id = v_inst)
  );
  v_sale3 := public.create_sale_atomic(1700, CURRENT_DATE, v_client_a, v_inst, 'third sale');
  IF v_sale3 IS NULL OR v_sale3 IN (v_sale1, v_sale2) THEN
    RAISE EXCEPTION 'test9: expected new third sale id';
  END IF;
  SELECT COUNT(*) INTO v_hist_count
  FROM public.sales_history
  WHERE instrument_id = v_inst AND entry_kind = 'sale';
  IF v_hist_count <> 3 THEN
    RAISE EXCEPTION 'test9: expected 3 historical sale rows, got %', v_hist_count;
  END IF;

  ------------------------------------------------------------------
  -- 12) Failure during sale creation rolls back instrument status + history
  -- Force failure after lock by using sale_price = 0 (rejected before insert).
  ------------------------------------------------------------------
  DECLARE
    v_inst_fail UUID := 'd0000000-0000-4000-8000-000000000012';
    v_count_before INTEGER;
    v_status_before TEXT;
  BEGIN
    INSERT INTO public.instruments (id, org_id, type, serial_number, status, price)
    VALUES (v_inst_fail, v_org_a, 'Violin', 'RESALE-FAIL-001', 'Available', 100)
    ON CONFLICT (id) DO UPDATE SET status = 'Available';
    DELETE FROM public.sales_history WHERE instrument_id = v_inst_fail;
    SELECT status INTO v_status_before FROM public.instruments WHERE id = v_inst_fail;
    SELECT COUNT(*) INTO v_count_before FROM public.sales_history WHERE instrument_id = v_inst_fail;

    BEGIN
      PERFORM public.create_sale_atomic(0, CURRENT_DATE, v_client_a, v_inst_fail, 'should fail');
      RAISE EXCEPTION 'test12: expected zero price to fail';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
      IF v_caught LIKE '%test12:%' THEN
        RAISE;
      END IF;
      IF v_caught NOT LIKE '%cannot be zero%' THEN
        RAISE EXCEPTION 'test12: unexpected error: %', v_caught;
      END IF;
    END;

    IF (SELECT status FROM public.instruments WHERE id = v_inst_fail) IS DISTINCT FROM v_status_before THEN
      RAISE EXCEPTION 'test12: status changed after failed sale';
    END IF;
    IF (SELECT COUNT(*) FROM public.sales_history WHERE instrument_id = v_inst_fail) <> v_count_before THEN
      RAISE EXCEPTION 'test12: sale history changed after failed sale';
    END IF;
  END;

  ------------------------------------------------------------------
  -- 13) Failure during refund rolls back both sides
  ------------------------------------------------------------------
  DECLARE
    v_inst_ref_fail UUID := 'd0000000-0000-4000-8000-000000000013';
    v_sale_ref UUID;
    v_status_before TEXT;
    v_refund_count_before INTEGER;
  BEGIN
    INSERT INTO public.instruments (id, org_id, type, serial_number, status, price)
    VALUES (v_inst_ref_fail, v_org_a, 'Violin', 'RESALE-REFFAIL-001', 'Available', 100)
    ON CONFLICT (id) DO UPDATE SET status = 'Available';
    DELETE FROM public.sales_history WHERE instrument_id = v_inst_ref_fail;
    v_sale_ref := public.create_sale_atomic(
      400, CURRENT_DATE, v_client_a, v_inst_ref_fail, 'refund fail target'
    );
    SELECT status INTO v_status_before FROM public.instruments WHERE id = v_inst_ref_fail;
    SELECT COUNT(*) INTO v_refund_count_before
    FROM public.sales_history WHERE instrument_id = v_inst_ref_fail AND entry_kind = 'refund';

    -- Stale CAS updated_at forces failure inside transition before/at conflict
    BEGIN
      PERFORM public.update_instrument_sale_transition_atomic(
        v_inst_ref_fail,
        jsonb_build_object('status', 'Available'),
        NULL, NULL, NULL, 'cas fail',
        '2000-01-01T00:00:00Z'::timestamptz
      );
      RAISE EXCEPTION 'test13: expected CAS conflict';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
      IF v_caught LIKE '%test13:%' THEN
        RAISE;
      END IF;
      IF v_caught NOT LIKE '%instrument_concurrency_conflict%' THEN
        RAISE EXCEPTION 'test13: unexpected error: %', v_caught;
      END IF;
    END;

    IF (SELECT status FROM public.instruments WHERE id = v_inst_ref_fail) IS DISTINCT FROM v_status_before THEN
      RAISE EXCEPTION 'test13: status changed after failed refund';
    END IF;
    IF (
      SELECT COUNT(*) FROM public.sales_history
      WHERE instrument_id = v_inst_ref_fail AND entry_kind = 'refund'
    ) <> v_refund_count_before THEN
      RAISE EXCEPTION 'test13: refund row created after failed refund';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sales_history WHERE id = v_sale_ref AND sale_price = 400) THEN
      RAISE EXCEPTION 'test13: original sale must remain';
    END IF;
  END;

  ------------------------------------------------------------------
  -- 14) Cross-organization instrument ID is inaccessible
  ------------------------------------------------------------------
  BEGIN
    PERFORM public.create_sale_atomic(
      900, CURRENT_DATE, v_client_a, v_inst_other_org, 'cross org'
    );
    RAISE EXCEPTION 'test14: expected cross-org instrument to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE '%test14:%' THEN
      RAISE;
    END IF;
    IF v_caught NOT LIKE '%Instrument not found%' THEN
      RAISE EXCEPTION 'test14: unexpected error: %', v_caught;
    END IF;
  END;

  ------------------------------------------------------------------
  -- 15) Non-admin caller cannot invoke the mutation successfully
  ------------------------------------------------------------------
  PERFORM pg_temp.set_jwt(v_org_a, 'member', v_user_member);
  BEGIN
    PERFORM public.create_sale_atomic(
      500, CURRENT_DATE, v_client_a,
      'd0000000-0000-4000-8000-000000000014',
      'member blocked'
    );
    RAISE EXCEPTION 'test15: expected non-admin to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE '%test15:%' THEN
      RAISE;
    END IF;
    IF v_caught NOT LIKE '%Admin role required%' THEN
      RAISE EXCEPTION 'test15: unexpected error: %', v_caught;
    END IF;
  END;

  ------------------------------------------------------------------
  -- 16) Existing historical refunded data remains queryable and unchanged
  ------------------------------------------------------------------
  PERFORM pg_temp.set_jwt(v_org_a, 'admin', v_user_admin);
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_history
    WHERE id = v_sale1 AND notes = 'first sale' AND sale_price = 1000 AND entry_kind = 'sale'
  ) THEN
    RAISE EXCEPTION 'test16: first sale history missing/changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_history
    WHERE adjustment_of_sale_id = v_sale1 AND entry_kind = 'refund' AND sale_price = -1000
  ) THEN
    RAISE EXCEPTION 'test16: first sale refund history missing/changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_history
    WHERE id = v_sale2 AND notes = 'resale' AND sale_price = 1500
  ) THEN
    RAISE EXCEPTION 'test16: resale history missing/changed';
  END IF;

  RAISE NOTICE 'create_sale_atomic_resale tests 1-9,12-16 PASSED (10-11 concurrency run separately)';
END;
$$;
