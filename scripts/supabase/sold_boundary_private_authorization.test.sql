-- Permanent regression tests for the private, transaction-scoped
-- Sold-boundary authorization mechanism introduced in
-- supabase/migrations/20260803150000_replace_sold_boundary_guc_with_private_authorization.sql,
-- which replaces the caller-forgeable custom GUC
-- (app.instrument_sold_transition_authorized) used by
-- 20260803140000_restore_instrument_sold_boundary_fail_closed.sql.
--
-- Prerequisites (local disposable DB):
--   scripts/supabase/instrument_sold_boundary_test_bootstrap.sql, followed
--   by the real migration chain through
--   supabase/migrations/20260803150000_replace_sold_boundary_guc_with_private_authorization.sql
--   (see that bootstrap file's header comment for the file list, plus
--   20260803150000 appended at the end). Also run
--   scripts/supabase/instrument_sold_boundary_enforcement.test.sql first
--   (or after -- these tests are additive and independent).
--
-- Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/supabase/sold_boundary_private_authorization.test.sql
--
-- Expect: script completes without error (exit 0).
--
-- These tests connect as the same role that ran the migrations (the
-- table/schema owner) so they can directly manipulate
-- sale_auth.sold_transition_authorization as test fixtures -- something
-- no real `authenticated` or `service_role` caller can ever do (proven
-- separately in tests 4-5 below). That owner-only access is not a
-- weakness in the design; it is the entire point of the private schema.

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
  v_org_a UUID := 'e0000000-0000-4000-8000-000000000101';
  v_org_b UUID := 'e0000000-0000-4000-8000-000000000102';
BEGIN
  INSERT INTO public.organizations (id, name) VALUES
    (v_org_a, 'Private Auth Test Org A'),
    (v_org_b, 'Private Auth Test Org B')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.clients (id, org_id, name, first_name, last_name) VALUES
    ('e1000000-0000-4000-8000-000000000101', v_org_a, 'Private Auth Client A', 'Private Auth', 'Client A')
  ON CONFLICT (id) DO NOTHING;
END $$;

\set org_a 'e0000000-0000-4000-8000-000000000101'
\set org_b 'e0000000-0000-4000-8000-000000000102'
\set user_admin_a '11111111-1111-4111-8111-200000000001'
\set client_a 'e1000000-0000-4000-8000-000000000101'

-- ============================================================
-- Test 3: caller-set custom GUC (the old bypass mechanism) has no
-- effect on either direction any more -- direct updates still fail even
-- with the legacy GUC forged 'on'.
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('fb000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000101', 'Violin', 'PRIV-003', 'Available', 1000),
    ('fb000000-0000-4000-8000-000000000103', 'e0000000-0000-4000-8000-000000000101', 'Violin', 'PRIV-103', 'Sold', 1000);
END $$;

SET ROLE authenticated;
SELECT pg_temp.set_jwt(:'org_a'::uuid, 'admin', :'user_admin_a'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  PERFORM set_config('app.instrument_sold_transition_authorized', 'on', true);
  BEGIN
    UPDATE public.instruments SET status = 'Sold' WHERE id = 'fb000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'test3a: expected forged legacy GUC to have no effect';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test3a:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test3a: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  PERFORM set_config('app.instrument_sold_transition_authorized', 'on', true);
  BEGIN
    UPDATE public.instruments SET status = 'Available' WHERE id = 'fb000000-0000-4000-8000-000000000103';
    RAISE EXCEPTION 'test3b: expected forged legacy GUC to have no effect';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test3b:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test3b: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'fb000000-0000-4000-8000-000000000003') <> 'Available' THEN
    RAISE EXCEPTION 'test3: instrument status changed despite blocked update';
  END IF;
  IF (SELECT status FROM public.instruments WHERE id = 'fb000000-0000-4000-8000-000000000103') <> 'Sold' THEN
    RAISE EXCEPTION 'test3: instrument status changed despite blocked update';
  END IF;
  RAISE NOTICE 'test 3 PASSED (forged legacy GUC has no effect in either direction)';
END $$;

-- ============================================================
-- Test 4: authenticated admin cannot create a transition authorization
-- record -- no GRANT exists on sale_auth for `authenticated` at all.
-- ============================================================
SET ROLE authenticated;
SELECT pg_temp.set_jwt(:'org_a'::uuid, 'admin', :'user_admin_a'::uuid);

DO $$
DECLARE
  v_caught TEXT;
  v_sqlstate TEXT;
BEGIN
  BEGIN
    INSERT INTO sale_auth.sold_transition_authorization (instrument_id, org_id, from_status, to_status)
    VALUES ('fb000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000101', 'Available', 'Sold');
    RAISE EXCEPTION 'test4: expected authenticated admin INSERT into sale_auth to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT, v_sqlstate = RETURNED_SQLSTATE;
    IF v_caught LIKE 'test4:%' THEN RAISE; END IF;
    -- 42501 = insufficient_privilege (no USAGE on schema sale_auth, no
    -- INSERT on the table); 3F000 = invalid_schema_name if USAGE denial
    -- makes the schema itself unresolvable first. Either proves the
    -- schema/table is unreachable.
    IF v_sqlstate NOT IN ('42501', '3F000') THEN
      RAISE EXCEPTION 'test4: unexpected error (sqlstate %): %', v_sqlstate, v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  RAISE NOTICE 'test 4 PASSED (authenticated admin cannot create an authorization record)';
END $$;

-- ============================================================
-- Test 5: service_role (BYPASSRLS) cannot manufacture authorization
-- through an ordinary query either -- BYPASSRLS bypasses row-level
-- security policies, not table/schema GRANTs, and none exist here.
-- ============================================================
SET ROLE service_role;

DO $$
DECLARE
  v_caught TEXT;
  v_sqlstate TEXT;
BEGIN
  BEGIN
    INSERT INTO sale_auth.sold_transition_authorization (instrument_id, org_id, from_status, to_status)
    VALUES ('fb000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000101', 'Available', 'Sold');
    RAISE EXCEPTION 'test5: expected service_role INSERT into sale_auth to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT, v_sqlstate = RETURNED_SQLSTATE;
    IF v_caught LIKE 'test5:%' THEN RAISE; END IF;
    IF v_sqlstate NOT IN ('42501', '3F000') THEN
      RAISE EXCEPTION 'test5: unexpected error (sqlstate %): %', v_sqlstate, v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
DO $$
BEGIN
  RAISE NOTICE 'test 5 PASSED (service_role cannot create an authorization record)';
END $$;

-- ============================================================
-- Test 8: an authorization record scoped to instrument A cannot
-- authorize a status change on a different instrument B, even in the
-- same org, same transaction, same from/to statuses.
--
-- The INSERT below is done directly as the connecting (owner) role,
-- simulating "assume a legitimate record already exists for A" -- real
-- callers can never reach sale_auth at all (tests 4-5), so this isolates
-- the trigger's instrument_id match specifically.
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('fb000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000101', 'Violin', 'PRIV-008-A', 'Available', 1000),
    ('fb000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000101', 'Violin', 'PRIV-008-B', 'Available', 1000);
END $$;

BEGIN;
INSERT INTO sale_auth.sold_transition_authorization (instrument_id, org_id, from_status, to_status)
VALUES ('fb000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000101', 'Available', 'Sold');

SET ROLE authenticated;
SELECT pg_temp.set_jwt('e0000000-0000-4000-8000-000000000101'::uuid, 'admin', '11111111-1111-4111-8111-200000000001'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    -- Attempt to spend instrument A's authorization on instrument B.
    UPDATE public.instruments SET status = 'Sold' WHERE id = 'fb000000-0000-4000-8000-000000000009';
    RAISE EXCEPTION 'test8: expected instrument-A authorization to not cover instrument B';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test8:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test8: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
ROLLBACK;

DO $$
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'fb000000-0000-4000-8000-000000000009') <> 'Available' THEN
    RAISE EXCEPTION 'test8: instrument B status changed despite mismatched authorization';
  END IF;
  RAISE NOTICE 'test 8 PASSED (authorization for instrument A cannot update instrument B)';
END $$;

-- ============================================================
-- Test 9: an authorization record whose org_id does not match the
-- instrument's actual org is rejected -- proves org_id is actively
-- checked by the trigger, not merely redundant with instrument_id.
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('fb000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000101', 'Violin', 'PRIV-009', 'Available', 1000);
END $$;

BEGIN;
-- Anomalous record: correct instrument_id, but org_id is org B while the
-- instrument actually belongs to org A.
INSERT INTO sale_auth.sold_transition_authorization (instrument_id, org_id, from_status, to_status)
VALUES ('fb000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000102', 'Available', 'Sold');

SET ROLE authenticated;
SELECT pg_temp.set_jwt('e0000000-0000-4000-8000-000000000101'::uuid, 'admin', '11111111-1111-4111-8111-200000000001'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    UPDATE public.instruments SET status = 'Sold' WHERE id = 'fb000000-0000-4000-8000-000000000010';
    RAISE EXCEPTION 'test9: expected org-mismatched authorization to be rejected';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test9:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test9: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
ROLLBACK;

DO $$
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'fb000000-0000-4000-8000-000000000010') <> 'Available' THEN
    RAISE EXCEPTION 'test9: instrument status changed despite org-mismatched authorization';
  END IF;
  RAISE NOTICE 'test 9 PASSED (authorization for org B cannot update an org A instrument)';
END $$;

-- ============================================================
-- Test 10: an authorization record for Available -> Sold cannot be
-- reused for a Sold -> Available transition on the same instrument.
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('fb000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000101', 'Violin', 'PRIV-010', 'Sold', 1000);
END $$;

BEGIN;
INSERT INTO sale_auth.sold_transition_authorization (instrument_id, org_id, from_status, to_status)
VALUES ('fb000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000101', 'Available', 'Sold');

SET ROLE authenticated;
SELECT pg_temp.set_jwt('e0000000-0000-4000-8000-000000000101'::uuid, 'admin', '11111111-1111-4111-8111-200000000001'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    UPDATE public.instruments SET status = 'Available' WHERE id = 'fb000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'test10: expected Available->Sold authorization to not cover Sold->Available';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test10:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test10: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
ROLLBACK;

DO $$
BEGIN
  IF (SELECT status FROM public.instruments WHERE id = 'fb000000-0000-4000-8000-000000000011') <> 'Sold' THEN
    RAISE EXCEPTION 'test10: instrument status changed despite wrong-direction authorization';
  END IF;
  RAISE NOTICE 'test 10 PASSED (Available->Sold authorization cannot be reused for Sold->Available)';
END $$;

-- ============================================================
-- Test 11: an authorization record cannot be consumed twice. The first
-- matching UPDATE consumes (deletes) it; an identical second attempt for
-- the same transition, in the same transaction, with no new record
-- inserted, must fail.
--
-- ALTER TABLE ... DISABLE/ENABLE TRIGGER is used here purely as a test
-- fixture technique to reset instrument state between the two attempts
-- without going through (and therefore without exercising) the
-- authorization mechanism itself. It requires table ownership, which
-- neither `authenticated` nor `service_role` has (see tests 4-5) -- it
-- is not a capability available to any real caller.
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('fb000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000101', 'Violin', 'PRIV-011', 'Available', 1000);
END $$;

BEGIN;
INSERT INTO sale_auth.sold_transition_authorization (instrument_id, org_id, from_status, to_status)
VALUES ('fb000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000101', 'Available', 'Sold');

SET ROLE authenticated;
SELECT pg_temp.set_jwt('e0000000-0000-4000-8000-000000000101'::uuid, 'admin', '11111111-1111-4111-8111-200000000001'::uuid);

-- First use: succeeds, consumes the record.
UPDATE public.instruments SET status = 'Sold' WHERE id = 'fb000000-0000-4000-8000-000000000012';

RESET ROLE;

-- Fixture-only reset back to 'Available', bypassing the trigger entirely
-- (so this reset itself neither requires nor consumes any authorization
-- record).
ALTER TABLE public.instruments DISABLE TRIGGER tr_enforce_instrument_status_transition;
UPDATE public.instruments SET status = 'Available' WHERE id = 'fb000000-0000-4000-8000-000000000012';
ALTER TABLE public.instruments ENABLE TRIGGER tr_enforce_instrument_status_transition;

SET ROLE authenticated;
SELECT pg_temp.set_jwt('e0000000-0000-4000-8000-000000000101'::uuid, 'admin', '11111111-1111-4111-8111-200000000001'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    -- Second attempt at the identical transition: no new record exists.
    UPDATE public.instruments SET status = 'Sold' WHERE id = 'fb000000-0000-4000-8000-000000000012';
    RAISE EXCEPTION 'test11: expected the already-consumed authorization to not cover a second update';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test11:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test11: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
ROLLBACK;

DO $$
BEGIN
  RAISE NOTICE 'test 11 PASSED (a consumed authorization record cannot be reused)';
END $$;

-- ============================================================
-- Test 12: authorization does not survive commit or rollback.
--
-- 12a (commit, unconsumed): insert a record and COMMIT it without the
-- matching UPDATE ever running (simulating a hypothetical future bug
-- where the crossing UPDATE never fires). Because matching is scoped to
-- txid_current(), this "leaked" row can never satisfy a match in any
-- later transaction -- transaction ids are assigned once and never
-- reused going forward, so the row is permanently inert the moment this
-- transaction commits, even though it physically still exists.
--
-- 12b (rollback): insert a record and ROLLBACK; confirm it is gone.
-- ============================================================
DO $$
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('fb000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000101', 'Violin', 'PRIV-012a', 'Available', 1000),
    ('fb000000-0000-4000-8000-000000000014', 'e0000000-0000-4000-8000-000000000101', 'Violin', 'PRIV-012b', 'Available', 1000);
END $$;

-- 12a
BEGIN;
INSERT INTO sale_auth.sold_transition_authorization (instrument_id, org_id, from_status, to_status)
VALUES ('fb000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000101', 'Available', 'Sold');
COMMIT;

DO $$
DECLARE
  v_leaked_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_leaked_count FROM sale_auth.sold_transition_authorization
  WHERE instrument_id = 'fb000000-0000-4000-8000-000000000013';
  IF v_leaked_count <> 1 THEN
    RAISE EXCEPTION 'test12a: setup invariant broken, expected exactly 1 leaked row, got %', v_leaked_count;
  END IF;
END $$;

-- A fresh transaction/txid must not be able to consume the leaked row.
SET ROLE authenticated;
SELECT pg_temp.set_jwt('e0000000-0000-4000-8000-000000000101'::uuid, 'admin', '11111111-1111-4111-8111-200000000001'::uuid);

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    UPDATE public.instruments SET status = 'Sold' WHERE id = 'fb000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'test12a: expected a committed-but-unconsumed record from a prior transaction to not authorize this one';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test12a:%' THEN RAISE; END IF;
    IF v_caught NOT LIKE '%Invalid instrument status transition%' THEN
      RAISE EXCEPTION 'test12a: unexpected error: %', v_caught;
    END IF;
  END;
END $$;

RESET ROLE;
-- Cleanup the deliberately leaked row (a real deployment would want a
-- periodic janitor for this hypothetical-bug scenario; out of scope here).
DELETE FROM sale_auth.sold_transition_authorization
WHERE instrument_id = 'fb000000-0000-4000-8000-000000000013';

DO $$
BEGIN
  RAISE NOTICE 'test 12a PASSED (committed-but-unconsumed authorization never matches a later transaction)';
END $$;

-- 12b
BEGIN;
INSERT INTO sale_auth.sold_transition_authorization (instrument_id, org_id, from_status, to_status)
VALUES ('fb000000-0000-4000-8000-000000000014', 'e0000000-0000-4000-8000-000000000101', 'Available', 'Sold');
ROLLBACK;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM sale_auth.sold_transition_authorization
  WHERE instrument_id = 'fb000000-0000-4000-8000-000000000014';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'test12b: expected rolled-back authorization record to not persist, found %', v_count;
  END IF;
  RAISE NOTICE 'test 12b PASSED (rolled-back authorization does not persist)';
END $$;

-- ============================================================
-- Test 13: a failure after authorization but before the status update
-- completes leaves no reusable permission. Exercised through the real
-- RPC: update_instrument_sale_transition_atomic's refund branch inserts
-- the authorization record, then its own combined UPDATE fails on an
-- unrelated column (a non-numeric `year`) before the crossing commits.
-- The whole call is one autocommit statement, so Postgres aborts and
-- rolls back everything -- the authorization insert, the refund
-- sales_history row from create_sale_adjustment_atomic, and the status
-- change attempt -- leaving nothing behind to reuse.
-- ============================================================
DO $$
DECLARE
  v_result public.instruments;
BEGIN
  INSERT INTO public.instruments (id, org_id, type, serial_number, status, price) VALUES
    ('fb000000-0000-4000-8000-000000000015', 'e0000000-0000-4000-8000-000000000101', 'Violin', 'PRIV-013', 'Available', 1000);
END $$;

SET ROLE authenticated;
SELECT pg_temp.set_jwt(:'org_a'::uuid, 'admin', :'user_admin_a'::uuid);

DO $$
DECLARE
  v_result public.instruments;
BEGIN
  SELECT * INTO v_result FROM public.update_instrument_sale_transition_atomic(
    'fb000000-0000-4000-8000-000000000015',
    jsonb_build_object('status', 'Sold'),
    750, CURRENT_DATE, 'e1000000-0000-4000-8000-000000000101'::uuid, 'test13 sale',
    (SELECT updated_at FROM public.instruments WHERE id = 'fb000000-0000-4000-8000-000000000015')
  );
END $$;

DO $$
DECLARE
  v_caught TEXT;
BEGIN
  BEGIN
    PERFORM public.update_instrument_sale_transition_atomic(
      'fb000000-0000-4000-8000-000000000015',
      jsonb_build_object('status', 'Available', 'year', 'not-a-number'),
      NULL, NULL, NULL, 'test13 refund with malformed year',
      (SELECT updated_at FROM public.instruments WHERE id = 'fb000000-0000-4000-8000-000000000015')
    );
    RAISE EXCEPTION 'test13: expected malformed-year refund call to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught LIKE 'test13:%' THEN RAISE; END IF;
    -- Any error is fine here except our own sentinel; the point is the
    -- whole statement/transaction aborts.
  END;
END $$;

RESET ROLE;
DO $$
DECLARE
  v_status TEXT;
  v_refund_count INTEGER;
  v_leftover_auth INTEGER;
BEGIN
  SELECT status INTO v_status FROM public.instruments WHERE id = 'fb000000-0000-4000-8000-000000000015';
  IF v_status <> 'Sold' THEN
    RAISE EXCEPTION 'test13: instrument left non-Sold after a failed refund UPDATE, got %', v_status;
  END IF;

  SELECT COUNT(*) INTO v_refund_count FROM public.sales_history
  WHERE instrument_id = 'fb000000-0000-4000-8000-000000000015' AND entry_kind = 'refund';
  IF v_refund_count <> 0 THEN
    RAISE EXCEPTION 'test13: unexpected refund row survived a failed refund UPDATE, count %', v_refund_count;
  END IF;

  SELECT COUNT(*) INTO v_leftover_auth FROM sale_auth.sold_transition_authorization
  WHERE instrument_id = 'fb000000-0000-4000-8000-000000000015';
  IF v_leftover_auth <> 0 THEN
    RAISE EXCEPTION 'test13: authorization record survived a failed status update, count %', v_leftover_auth;
  END IF;

  RAISE NOTICE 'test 13 PASSED (failure after authorization, before status update, leaves no reusable permission)';
END $$;

-- ============================================================
-- Final sanity: sale_auth is left empty (no leaked rows) at the end of
-- this whole script.
-- ============================================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM sale_auth.sold_transition_authorization;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'final sanity: expected sale_auth to be empty at end of script, found % row(s)', v_count;
  END IF;
  RAISE NOTICE 'final sanity PASSED (sale_auth.sold_transition_authorization is empty)';
END $$;

SELECT 'sold_boundary_private_authorization tests 3-5, 8-13 PASSED (14 runs separately)' AS result;
