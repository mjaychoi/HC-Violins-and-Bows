-- V7-003 — database-enforced financial confidentiality regression tests.
-- Run after:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/supabase/financial_confidentiality_test_bootstrap.sql \
--     -f supabase/migrations/20260804020000_harden_sale_lifecycle_authorization.sql \
--     -f supabase/migrations/20260814160000_enforce_financial_confidentiality_db_boundary.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/supabase/financial_confidentiality.test.sql
-- All mutations run inside the outer transaction and ROLLBACK at the end.
--
-- Covers TEST-1 through TEST-14 from the V7-003 implementation task:
--   TEST-1/2   member cannot read instrument cost_price/consignment_price
--   TEST-3     member SELECT * cannot bypass the restriction
--   TEST-4     admin can obtain instrument financials
--   TEST-5     member ordinary instrument reads still succeed
--   TEST-6     cross-org instrument denial remains intact
--   TEST-7     member cannot obtain sales financial data
--   TEST-8     admin sales access still works
--   TEST-9     member cannot obtain admin-only invoice financial data
--   TEST-10    admin invoice access still works
--   TEST-11    anon receives no new access
--   TEST-12    sale_lifecycle_net_amount RPC bypass is blocked
--   TEST-13    supported member/admin write paths do not regress
--   TEST-14    admin financial workflows (totals aggregate) still work

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_org_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_admin_a UUID := '11111111-1111-4111-8111-111111111111';
  v_member_a UUID := '22222222-2222-4222-8222-222222222222';
  v_member_b UUID := '33333333-3333-4333-8333-333333333333';
  v_admin_b UUID := '44444444-4444-4444-8444-444444444444';
  v_client_a UUID := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  v_instrument_a UUID := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
  v_instrument_b UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  v_sale_a UUID;
  v_sale_a2 UUID;
  v_invoice_a UUID := 'ffffffff-ffff-4fff-8fff-fffffffffff1';
  v_caught TEXT;
  v_caught_code TEXT;
  v_row_count BIGINT;
  v_numeric NUMERIC;
  v_cost_price NUMERIC;
  v_consignment_price NUMERIC;
  v_sale_price NUMERIC;
  v_revenue NUMERIC;
  v_avg_ticket NUMERIC;
BEGIN
  -- ── fixtures (as table owner / superuser) ─────────────────────────────
  INSERT INTO public.organizations (id, name) VALUES
    (v_org_a, 'Org A'),
    (v_org_b, 'Org B');

  INSERT INTO public.clients (id, org_id, name) VALUES
    (v_client_a, v_org_a, 'Client A');

  INSERT INTO public.instruments (
    id, org_id, type, maker, price, cost_price, consignment_price, status
  ) VALUES
    (v_instrument_a, v_org_a, 'Violin', 'Stradivarius', 3000, 1500, 800, 'Available'),
    (v_instrument_b, v_org_b, 'Violin', 'Guarneri', 5000, 2500, 1200, 'Available');

  INSERT INTO public.sales_history (
    id, org_id, instrument_id, client_id, sale_price, sale_date, entry_kind
  ) VALUES
    (gen_random_uuid(), v_org_a, v_instrument_a, v_client_a, 2500, CURRENT_DATE, 'sale')
  RETURNING id INTO v_sale_a;

  INSERT INTO public.sales_history (
    id, org_id, instrument_id, client_id, sale_price, sale_date, entry_kind
  ) VALUES
    (gen_random_uuid(), v_org_a, v_instrument_a, v_client_a, 1000, CURRENT_DATE, 'sale')
  RETURNING id INTO v_sale_a2;

  INSERT INTO public.invoices (id, org_id, client_id, subtotal, total, status) VALUES
    (v_invoice_a, v_org_a, v_client_a, 3000, 3000, 'draft');

  INSERT INTO public.invoice_items (
    id, org_id, invoice_id, instrument_id, description, qty, rate, amount
  ) VALUES
    (gen_random_uuid(), v_org_a, v_invoice_a, v_instrument_a, 'Violin', 1, 3000, 3000);

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-1/2/3 — member A cannot read cost_price/consignment_price,
  -- including via SELECT *.
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_member_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'member')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  BEGIN
    PERFORM cost_price FROM public.instruments WHERE id = v_instrument_a;
    RAISE EXCEPTION 'TEST-1 FAILED: member A read cost_price directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST-1 PASSED: member cost_price direct read DENIED';
  END;

  BEGIN
    PERFORM consignment_price FROM public.instruments WHERE id = v_instrument_a;
    RAISE EXCEPTION 'TEST-2 FAILED: member A read consignment_price directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST-2 PASSED: member consignment_price direct read DENIED';
  END;

  BEGIN
    EXECUTE 'SELECT * FROM public.instruments WHERE id = $1' USING v_instrument_a;
    RAISE EXCEPTION 'TEST-3 FAILED: member A SELECT * on instruments succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST-3 PASSED: member SELECT * BLOCKED';
  END;

  RESET ROLE;

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-4 — admin A can obtain instrument financials via the RPC.
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_admin_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'admin')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  SELECT cost_price, consignment_price
    INTO v_cost_price, v_consignment_price
    FROM public.get_instruments_financials(ARRAY[v_instrument_a]);

  IF v_cost_price IS DISTINCT FROM 1500 OR v_consignment_price IS DISTINCT FROM 800 THEN
    RAISE EXCEPTION 'TEST-4 FAILED: admin financials mismatch cost=% consignment=%',
      v_cost_price, v_consignment_price;
  END IF;
  RAISE NOTICE 'TEST-4 PASSED: admin instrument financial access PASS';

  RESET ROLE;

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-5 — member A ordinary instrument reads still succeed.
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_member_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'member')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  SELECT COUNT(*) INTO v_row_count
  FROM (
    SELECT id, maker, type, price, status
    FROM public.instruments
    WHERE id = v_instrument_a
  ) sub;

  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST-5 FAILED: member could not read ordinary instrument fields';
  END IF;
  RAISE NOTICE 'TEST-5 PASSED: member ordinary instrument access PASS';

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-6 — cross-org denial remains intact (member A cannot see org B's
  -- instrument; admin A's financials RPC returns nothing for org B ids).
  -- ═══════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_row_count
  FROM (SELECT id FROM public.instruments WHERE id = v_instrument_b) sub;

  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST-6 FAILED: member A could see org B instrument row';
  END IF;

  RESET ROLE;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_admin_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'admin')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  SELECT COUNT(*) INTO v_row_count
  FROM public.get_instruments_financials(ARRAY[v_instrument_b]);

  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST-6 FAILED: admin A financials RPC returned org B data';
  END IF;
  RAISE NOTICE 'TEST-6 PASSED: cross-org instrument denial PASS';

  RESET ROLE;

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-7 — member A cannot obtain sale_price (direct column or SELECT *).
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_member_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'member')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  BEGIN
    PERFORM sale_price FROM public.sales_history WHERE id = v_sale_a;
    RAISE EXCEPTION 'TEST-7 FAILED: member A read sale_price directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST-7 PASSED: member sale_price direct read DENIED';
  END;

  BEGIN
    EXECUTE 'SELECT * FROM public.sales_history WHERE id = $1' USING v_sale_a;
    RAISE EXCEPTION 'TEST-7b FAILED: member A SELECT * on sales_history succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST-7b PASSED: member sales_history SELECT * BLOCKED';
  END;

  -- Non-financial sale fields remain readable (existing product contract).
  SELECT COUNT(*) INTO v_row_count
  FROM (SELECT id, sale_date, notes, entry_kind FROM public.sales_history WHERE id = v_sale_a) sub;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST-7c FAILED: member lost access to non-financial sale fields';
  END IF;

  RESET ROLE;

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-8 — admin A sales access (sale_price via RPC) still works.
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_admin_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'admin')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  SELECT sale_price INTO v_sale_price
  FROM public.get_sales_financials(ARRAY[v_sale_a]);

  IF v_sale_price IS DISTINCT FROM 2500 THEN
    RAISE EXCEPTION 'TEST-8 FAILED: admin sale_price mismatch got %', v_sale_price;
  END IF;
  RAISE NOTICE 'TEST-8 PASSED: admin sales financial access PASS';

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-14 (checked here while still admin A) — totals aggregate.
  -- ═══════════════════════════════════════════════════════════════════
  SELECT revenue, avg_ticket INTO v_revenue, v_avg_ticket
  FROM public.get_sales_totals(NULL, NULL, NULL, NULL, NULL);

  IF v_revenue IS DISTINCT FROM 3500 THEN
    RAISE EXCEPTION 'TEST-14 FAILED: admin totals revenue mismatch got %', v_revenue;
  END IF;
  RAISE NOTICE 'TEST-14 PASSED: admin sales totals aggregate PASS (revenue=%)', v_revenue;

  RESET ROLE;

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-9/10 — invoice financial data is admin-only at the DB layer.
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_member_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'member')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  SELECT COUNT(*) INTO v_row_count
  FROM (SELECT id FROM public.invoices WHERE org_id = v_org_a) sub;
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST-9 FAILED: member A could read invoices (% rows)', v_row_count;
  END IF;

  SELECT COUNT(*) INTO v_row_count
  FROM (SELECT id FROM public.invoice_items WHERE org_id = v_org_a) sub;
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST-9 FAILED: member A could read invoice_items (% rows)', v_row_count;
  END IF;
  RAISE NOTICE 'TEST-9 PASSED: member invoice financial access DENIED';

  RESET ROLE;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_admin_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'admin')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  SELECT COUNT(*) INTO v_row_count
  FROM (SELECT * FROM public.invoices WHERE org_id = v_org_a) sub;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST-10 FAILED: admin A could not read invoices (% rows)', v_row_count;
  END IF;

  SELECT COUNT(*) INTO v_row_count
  FROM (SELECT * FROM public.invoice_items WHERE org_id = v_org_a) sub;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST-10 FAILED: admin A could not read invoice_items (% rows)', v_row_count;
  END IF;
  RAISE NOTICE 'TEST-10 PASSED: admin invoice access PASS';

  RESET ROLE;

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-11 — anon receives no new access.
  -- ═══════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM set_config('request.jwt.claims', '', true);
    SET LOCAL ROLE anon;
    SET LOCAL row_security = on;

    BEGIN
      PERFORM 1 FROM public.instruments LIMIT 1;
      RAISE EXCEPTION 'TEST-11 FAILED: anon read instruments';
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;

    BEGIN
      PERFORM 1 FROM public.sales_history LIMIT 1;
      RAISE EXCEPTION 'TEST-11 FAILED: anon read sales_history';
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;

    BEGIN
      PERFORM 1 FROM public.invoices LIMIT 1;
      RAISE EXCEPTION 'TEST-11 FAILED: anon read invoices';
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;

    RESET ROLE;
    RAISE NOTICE 'TEST-11 PASSED: anon access DENIED across all target tables';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      RAISE NOTICE 'TEST-11 PASSED: anon role itself lacks USAGE (fail closed)';
  END;

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-12 — sale_lifecycle_net_amount direct RPC bypass is blocked for
  -- both member and admin (same shared `authenticated` role).
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_member_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'member')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  BEGIN
    PERFORM public.sale_lifecycle_net_amount(v_sale_a, v_org_a);
    RAISE EXCEPTION 'TEST-12 FAILED: member called sale_lifecycle_net_amount directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST-12 PASSED (member): sale_lifecycle_net_amount direct RPC BLOCKED';
  END;

  RESET ROLE;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_admin_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'admin')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  BEGIN
    PERFORM public.sale_lifecycle_net_amount(v_sale_a, v_org_a);
    RAISE EXCEPTION 'TEST-12 FAILED: admin called sale_lifecycle_net_amount directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST-12 PASSED (admin): sale_lifecycle_net_amount direct RPC BLOCKED';
  END;

  RESET ROLE;

  -- ═══════════════════════════════════════════════════════════════════
  -- TEST-13 — supported write paths do not regress: admin can still
  -- UPDATE an instrument's retail price and INSERT a sale; member writes
  -- remain denied (unchanged RLS behavior, sanity-checked here).
  -- ═══════════════════════════════════════════════════════════════════
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_admin_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'admin')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  UPDATE public.instruments SET price = 3100 WHERE id = v_instrument_a;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'TEST-13 FAILED: admin could not update instrument retail price';
  END IF;

  INSERT INTO public.sales_history (
    id, org_id, instrument_id, client_id, sale_price, sale_date, entry_kind
  ) VALUES (
    gen_random_uuid(), v_org_a, v_instrument_a, v_client_a, 500, CURRENT_DATE, 'sale'
  );
  RAISE NOTICE 'TEST-13 PASSED (admin write): instrument UPDATE + sales_history INSERT PASS';

  RESET ROLE;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_member_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'member')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  UPDATE public.instruments SET price = 9999 WHERE id = v_instrument_a;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'TEST-13 FAILED: member was able to update instrument price';
  END IF;
  RAISE NOTICE 'TEST-13 PASSED (member write denial unchanged)';

  RESET ROLE;

  RAISE NOTICE 'financial_confidentiality.test.sql: ALL TESTS PASSED';
END
$$;

ROLLBACK;
