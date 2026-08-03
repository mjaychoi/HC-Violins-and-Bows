-- Permanent regression tests: fail-closed enforcement of the instrument
-- `Sold` boundary at the database level (trigger + RLS), independent of
-- the HTTP API.
--
-- Prerequisites (local disposable DB):
--   scripts/supabase/instrument_sold_boundary_test_bootstrap.sql, followed
--   by the real migration chain through
--   supabase/migrations/20260803140000_restore_instrument_sold_boundary_fail_closed.sql
--   (see that bootstrap file's header comment for the exact file list).
--
-- Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/supabase/instrument_sold_boundary_enforcement.test.sql
--
-- Expect: script completes without error (exit 0). Each assertion RAISEs
-- on failure, which aborts the script (ON_ERROR_STOP).
--
-- All direct-UPDATE assertions run as the `authenticated` role (the same
-- role executeInstrumentPatch.ts's user-scoped Supabase client uses),
-- which — per scripts/supabase/instrument_sold_boundary_test_bootstrap.sql —
-- holds real SELECT/INSERT/UPDATE/DELETE grants on public.instruments.
-- That matters: without those grants a blocked UPDATE would prove nothing
-- about the trigger, only that the role lacks table privileges.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_jwt(p_org_id UUID, p_role TEXT, p_user_id UUID)
RETURNS void
LANGUAGE sql
AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user_id,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', p_org_id, 'role', p_role)
    )::text,
    false
  );
$$;

-- ============================================================
-- Fixtures
-- ============================================================
DO $$
DECLARE
  v_org_a UUID := 'e0000000-0000-4000-8000-000000000001';
  v_org_b UUID := 'e0000000-0000-4000-8000-000000000002';
BEGIN
  INSERT INTO public.organizations (id, name) VALUES
    (v_org_a, 'Boundary Test Org A'),
    (v_org_b, 'Boundary Test Org B')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.clients (id, org_id, name, first_name, last_name) VALUES
    ('e1000000-0000-4000-8000-000000000001', v_org_a, 'Boundary Client A', 'Boundary', 'Client A')
  ON CONFLICT (id) DO NOTHING;
END $$;

\set org_a 'e0000000-0000-4000-8000-000000000001'
\set org_b 'e0000000-0000-4000-8000-000000000002'
\set user_admin_a '11111111-1111-4111-8111-100000000001'
\set user_member_a '11111111-1111-4111-8111-100000000002'
\set user_admin_b '11111111-1111-4111-8111-100000000003'
\set client_a 'e1000000-0000-4000-8000-000000000001'

-- ============================================================
-- Tests 1-2: direct non-Sold -> Sold update fails
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Violin', 'BOUND-001', 'Available', 1000),
    ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Violin', 'BOUND-002', 'Maintenance', 1000)
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
END $$;

SET ROLE authenticated;
SELECT pg_temp.set_jwt(:'org_a'::uuid, 'admin', :'user_admin_a'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    UPDATE public.instruments SET status = 'Sold' WHERE id = 'f0000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'test1: expected direct Available->Sold update to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test1:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test1: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    UPDATE public.instruments SET status = 'Sold' WHERE id = 'f0000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'test2: expected direct Maintenance->Sold update to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test2:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test2: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000001') <> 'Available' THEN
    RAISE EXCEPTION 'test1: instrument status changed despite blocked update';
  END IF;
  IF (SELECT status FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000002') <> 'Maintenance' THEN
    RAISE EXCEPTION 'test2: instrument status changed despite blocked update';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_history WHERE instrument_id IN
    ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002')) THEN
    RAISE EXCEPTION 'tests1-2: unexpected sales_history row from a blocked direct update';
  END IF;
  RAISE NOTICE 'tests 1-2 PASSED (direct Available/Maintenance -> Sold blocked)';
END $$;

-- ============================================================
-- Tests 3-4: direct Sold -> non-Sold update fails
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'Violin', 'BOUND-003', 'Sold', 1000),
    ('f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', 'Violin', 'BOUND-004', 'Sold', 1000)
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
END $$;

SET ROLE authenticated;
SELECT pg_temp.set_jwt(:'org_a'::uuid, 'admin', :'user_admin_a'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    UPDATE public.instruments SET status = 'Available' WHERE id = 'f0000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'test3: expected direct Sold->Available update to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test3:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test3: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    UPDATE public.instruments SET status = 'Maintenance' WHERE id = 'f0000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'test4: expected direct Sold->Maintenance update to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test4:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test4: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000003') <> 'Sold' THEN
    RAISE EXCEPTION 'test3: instrument status changed despite blocked update';
  END IF;
  IF (SELECT status FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000004') <> 'Sold' THEN
    RAISE EXCEPTION 'test4: instrument status changed despite blocked update';
  END IF;
  RAISE NOTICE 'tests 3-4 PASSED (direct Sold -> Available/Maintenance blocked)';
END $$;

-- ============================================================
-- Test 5: atomic sell RPC succeeds, creates exactly one sale
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', 'Violin', 'BOUND-005', 'Available', 1000)
  ON CONFLICT (id) DO UPDATE SET status = 'Available';
  DELETE FROM public.sales_history WHERE instrument_id = 'f0000000-0000-4000-8000-000000000005';
END $$;

SET ROLE authenticated;
SELECT pg_temp.set_jwt(:'org_a'::uuid, 'admin', :'user_admin_a'::uuid);

DO $$
DECLARE
  v_result public.instruments;
  v_sale_count INTEGER;
BEGIN
  SELECT * INTO v_result FROM public.update_instrument_sale_transition_atomic(
    'f0000000-0000-4000-8000-000000000005',
    jsonb_build_object('status', 'Sold'),
    750, CURRENT_DATE, 'e1000000-0000-4000-8000-000000000001', 'test5 sale',
    (SELECT updated_at FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000005')
  );
  IF v_result.status <> 'Sold' THEN
    RAISE EXCEPTION 'test5: expected Sold status after sell RPC, got %', v_result.status;
  END IF;
  SELECT COUNT(*) INTO v_sale_count FROM public.sales_history
  WHERE instrument_id = 'f0000000-0000-4000-8000-000000000005' AND entry_kind = 'sale';
  IF v_sale_count <> 1 THEN
    RAISE EXCEPTION 'test5: expected exactly 1 sale row, got %', v_sale_count;
  END IF;
  RAISE NOTICE 'test 5 PASSED (atomic sell RPC)';
END $$;

-- ============================================================
-- Test 6: atomic refund RPC succeeds, creates exactly one refund
-- ============================================================
DO $$
DECLARE
  v_result public.instruments;
  v_refund_count INTEGER;
BEGIN
  SELECT * INTO v_result FROM public.update_instrument_sale_transition_atomic(
    'f0000000-0000-4000-8000-000000000005',
    jsonb_build_object('status', 'Available'),
    NULL, NULL, NULL, 'test6 refund',
    (SELECT updated_at FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000005')
  );
  IF v_result.status <> 'Available' THEN
    RAISE EXCEPTION 'test6: expected Available status after refund RPC, got %', v_result.status;
  END IF;
  SELECT COUNT(*) INTO v_refund_count FROM public.sales_history
  WHERE instrument_id = 'f0000000-0000-4000-8000-000000000005' AND entry_kind = 'refund';
  IF v_refund_count <> 1 THEN
    RAISE EXCEPTION 'test6: expected exactly 1 refund row, got %', v_refund_count;
  END IF;
  RAISE NOTICE 'test 6 PASSED (atomic refund RPC)';
END $$;

-- ============================================================
-- Test 7: direct update after a completed refund still cannot bypass RPC
-- ============================================================
DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    UPDATE public.instruments SET status = 'Sold' WHERE id = 'f0000000-0000-4000-8000-000000000005';
    RAISE EXCEPTION 'test7: expected direct update after refund to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test7:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test7: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000005') <> 'Available' THEN
    RAISE EXCEPTION 'test7: instrument status changed despite blocked update';
  END IF;
  RAISE NOTICE 'test 7 PASSED (post-refund direct update still blocked)';
END $$;

-- ============================================================
-- Test 8: a failed refund insert leaves the instrument Sold
--
-- Constructed failure: create_sale_adjustment_atomic's own guard checks
-- `EXISTS (... WHERE adjustment_of_sale_id = p_source_sale_id AND
-- org_id = v_org_id AND entry_kind = 'refund')`, org-scoped. The unique
-- index sales_history_one_refund_per_sale_idx that would otherwise catch
-- a duplicate refund at INSERT time is NOT org-scoped. We pre-insert (as
-- superuser, simulating a pre-existing data anomaly — not reachable
-- through the RPC by any single org) a refund row for org_b pointing at
-- an org_a sale via adjustment_of_sale_id. update_instrument_sale_
-- transition_atomic's org-scoped "refundable" lookup still finds the sale
-- refundable (no org_a refund exists), calls create_sale_adjustment_atomic,
-- whose own org-scoped guard also doesn't see the org_b row and proceeds
-- to INSERT — which then hits the global unique index and fails for real,
-- inside the same transaction as the instrument UPDATE that follows it.
-- ============================================================
DO $$
DECLARE
  v_sale_id UUID;
BEGIN
  -- Delete any leftover cross-org anomaly rows from a prior run of this
  -- script first (adjustment_of_sale_id has ON DELETE RESTRICT), then the
  -- instrument's own history.
  DELETE FROM public.sales_history
  WHERE adjustment_of_sale_id IN (
    SELECT id FROM public.sales_history WHERE instrument_id = 'f0000000-0000-4000-8000-000000000008'
  );
  DELETE FROM public.sales_history WHERE instrument_id = 'f0000000-0000-4000-8000-000000000008';
  DELETE FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000008';
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('f0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000001', 'Violin', 'BOUND-008', 'Sold', 1000);

  INSERT INTO public.sales_history (id, org_id, instrument_id, client_id, sale_price, sale_date, entry_kind)
  VALUES (gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000008',
          'e1000000-0000-4000-8000-000000000001', 900, CURRENT_DATE, 'sale')
  RETURNING id INTO v_sale_id;

  -- Cross-org refund anomaly the unique index (not org-scoped) will still
  -- enforce. Bypass triggers for this one INSERT (session_replication_role
  -- = replica) to actually construct the anomaly: since
  -- 20260728130000_enforce_tenant_reference_consistency.sql,
  -- enforce_sales_history_org_consistency_trigger (an ORIGIN, not RLS,
  -- trigger -- fires for every role including superuser) independently
  -- rejects any ordinary INSERT with a mismatched org_id, which is a
  -- second, even earlier layer catching this exact anomaly today. This
  -- still faithfully simulates "a pre-existing data anomaly, not reachable
  -- through the RPC by any single org" as originally documented above.
  PERFORM set_config('session_replication_role', 'replica', true);
  INSERT INTO public.sales_history (org_id, instrument_id, client_id, sale_price, sale_date, entry_kind, adjustment_of_sale_id)
  VALUES ('e0000000-0000-4000-8000-000000000002', NULL, NULL, -900, CURRENT_DATE, 'refund', v_sale_id);
  PERFORM set_config('session_replication_role', 'origin', true);

  PERFORM set_config('app.test_sale8_id', v_sale_id::text, false);
END $$;

SET ROLE authenticated;
SELECT pg_temp.set_jwt(:'org_a'::uuid, 'admin', :'user_admin_a'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    PERFORM public.update_instrument_sale_transition_atomic(
      'f0000000-0000-4000-8000-000000000008',
      jsonb_build_object('status', 'Available'),
      NULL, NULL, NULL, 'test8 refund attempt',
      (SELECT updated_at FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000008')
    );
    RAISE EXCEPTION 'test8: expected refund insert to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test8:%' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
DO $$
DECLARE
  v_refund_count_a INTEGER;
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000008') <> 'Sold' THEN
    RAISE EXCEPTION 'test8: instrument left non-Sold after failed refund insert';
  END IF;
  SELECT COUNT(*) INTO v_refund_count_a FROM public.sales_history
  WHERE instrument_id = 'f0000000-0000-4000-8000-000000000008'
    AND entry_kind = 'refund' AND org_id = 'e0000000-0000-4000-8000-000000000001';
  IF v_refund_count_a <> 0 THEN
    RAISE EXCEPTION 'test8: unexpected org_a refund row after failed refund insert';
  END IF;
  RAISE NOTICE 'test 8 PASSED (failed refund insert rolled back, instrument stayed Sold)';
END $$;

-- ============================================================
-- Test 9: a failed sale insert leaves the instrument non-Sold
--
-- Real INSERT-level failure: p_client_id references a non-existent
-- client, violating sales_history's client_id FK inside create_sale_atomic,
-- which runs before the instrument UPDATE.
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('f0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000001', 'Violin', 'BOUND-009', 'Available', 1000)
  ON CONFLICT (id) DO UPDATE SET status = 'Available';
  DELETE FROM public.sales_history WHERE instrument_id = 'f0000000-0000-4000-8000-000000000009';
END $$;

SET ROLE authenticated;
SELECT pg_temp.set_jwt(:'org_a'::uuid, 'admin', :'user_admin_a'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    PERFORM public.create_sale_atomic(
      600, CURRENT_DATE, 'ffffffff-0000-4000-8000-0000000000ff'::uuid,
      'f0000000-0000-4000-8000-000000000009', 'test9 sale, bad client fk'
    );
    RAISE EXCEPTION 'test9: expected sale insert to fail on client FK violation';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test9:%' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000009') = 'Sold' THEN
    RAISE EXCEPTION 'test9: instrument marked Sold despite failed sale insert';
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.sales_history WHERE instrument_id = 'f0000000-0000-4000-8000-000000000009';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'test9: unexpected sales_history row after failed sale insert';
  END IF;
  RAISE NOTICE 'test 9 PASSED (failed sale insert rolled back, instrument stayed non-Sold)';
END $$;

-- ============================================================
-- Test 10: concurrency — see
-- scripts/supabase/create_sale_atomic_resale_concurrency.test.sh,
-- run separately (needs two live psql connections) against a DB with
-- 20260803140000 applied. Documented here, not duplicated inline.
-- ============================================================
SELECT 'test 10: run scripts/supabase/create_sale_atomic_resale_concurrency.test.sh separately' AS note;

-- ============================================================
-- Test 11: transaction-local bypass is unavailable in a later transaction
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('f0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', 'Violin', 'BOUND-011', 'Sold', 1000)
  ON CONFLICT (id) DO UPDATE SET status = 'Sold';
END $$;

-- Set the GUC 'on' and let this transaction (a single top-level statement,
-- autocommitted) end.
SELECT set_config('app.instrument_sold_transition_authorized', 'on', true);

-- New transaction/statement: the is_local=true GUC must not have survived.
DO $$
DECLARE
  v_setting TEXT;
BEGIN
  v_setting := current_setting('app.instrument_sold_transition_authorized', true);
  IF v_setting IS NOT NULL AND v_setting = 'on' THEN
    RAISE EXCEPTION 'test11: transaction-local GUC leaked into a later transaction';
  END IF;
END $$;

SET ROLE authenticated;
SELECT pg_temp.set_jwt(:'org_a'::uuid, 'admin', :'user_admin_a'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    UPDATE public.instruments SET status = 'Available' WHERE id = 'f0000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'test11: expected direct update to still fail in a later transaction';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test11:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test11: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000011') <> 'Sold' THEN
    RAISE EXCEPTION 'test11: instrument status changed despite blocked update';
  END IF;
  RAISE NOTICE 'test 11 PASSED (transaction-local bypass GUC does not leak across transactions)';
END $$;

-- ============================================================
-- Test 12: non-admin and cross-organization calls remain blocked
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('f0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000001', 'Violin', 'BOUND-012', 'Available', 1000)
  ON CONFLICT (id) DO UPDATE SET status = 'Available';
END $$;

-- 12a: non-admin (member) in the correct org: RLS WITH CHECK requires
-- is_admin(), so this UPDATE must affect 0 rows (silently filtered by RLS,
-- not a raised exception).
SET ROLE authenticated;
SELECT pg_temp.set_jwt(:'org_a'::uuid, 'member', :'user_member_a'::uuid);

DO $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public.instruments SET status = 'Sold' WHERE id = 'f0000000-0000-4000-8000-000000000012';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'test12a: non-admin direct update unexpectedly affected % row(s)', v_rows;
  END IF;
END $$;

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    PERFORM public.update_instrument_sale_transition_atomic(
      'f0000000-0000-4000-8000-000000000012',
      jsonb_build_object('status', 'Sold'), 500, CURRENT_DATE, NULL, 'test12a rpc',
      (SELECT updated_at FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000012')
    );
    RAISE EXCEPTION 'test12a: expected non-admin RPC call to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test12a:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Admin role required%' THEN
      RAISE EXCEPTION 'test12a: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

-- 12b: admin, but wrong org: RLS org_id filter hides the row entirely.
SELECT pg_temp.set_jwt(:'org_b'::uuid, 'admin', :'user_admin_b'::uuid);

DO $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public.instruments SET status = 'Sold' WHERE id = 'f0000000-0000-4000-8000-000000000012';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'test12b: cross-org direct update unexpectedly affected % row(s)', v_rows;
  END IF;
END $$;

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    PERFORM public.update_instrument_sale_transition_atomic(
      'f0000000-0000-4000-8000-000000000012',
      jsonb_build_object('status', 'Sold'), 500, CURRENT_DATE, NULL, 'test12b rpc',
      NULL
    );
    RAISE EXCEPTION 'test12b: expected cross-org RPC call to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test12b:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Instrument not found%' THEN
      RAISE EXCEPTION 'test12b: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000012') <> 'Available' THEN
    RAISE EXCEPTION 'test12: instrument status changed despite non-admin/cross-org blocks';
  END IF;
  RAISE NOTICE 'test 12 PASSED (non-admin and cross-org calls blocked)';
END $$;

-- ============================================================
-- Service-role sanity check (requirement 7): even a BYPASSRLS role is
-- still stopped by the trigger, which runs for every role.
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('f0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000001', 'Violin', 'BOUND-013', 'Available', 1000)
  ON CONFLICT (id) DO UPDATE SET status = 'Available';
END $$;

SET ROLE service_role;

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    UPDATE public.instruments SET status = 'Sold' WHERE id = 'f0000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'test_service_role: expected direct update to fail even with RLS bypassed';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test_service_role:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test_service_role: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'f0000000-0000-4000-8000-000000000013') <> 'Available' THEN
    RAISE EXCEPTION 'test_service_role: instrument status changed despite RLS-bypassing role';
  END IF;
  RAISE NOTICE 'test service_role PASSED (BYPASSRLS role still blocked by trigger)';
END $$;

SELECT 'instrument_sold_boundary_enforcement tests 1-9, 11-12 + service_role check PASSED (10 runs separately)' AS result;
