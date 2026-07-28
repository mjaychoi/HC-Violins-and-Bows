-- Role-context regression tests for reserved_connection_id invariants.
-- Run after: npx supabase db reset --local --no-seed
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/reference_integrity_role_context.test.sql
-- All mutations run inside the outer transaction and ROLLBACK at the end.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_org_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_user_a UUID := '99999999-9999-4999-8999-999999999999';
  v_user_b UUID := '88888888-8888-4888-8888-888888888888';
  v_client_a UUID := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  v_client_b UUID := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
  v_instrument_a UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5';
  v_instrument_b UUID := 'ffffffff-ffff-4fff-8fff-fffffffffff6';
  v_instrument_clean UUID := '10101010-1010-4101-8101-010101010101';
  v_connection_a UUID := '12121212-1212-4121-8121-121212121212';
  v_connection_b UUID := '13131313-1313-4131-8131-131313131313';
  v_connection_other_inst UUID := '14141414-1414-4141-8141-141414141414';
  v_caught TEXT;
  v_mismatch_count BIGINT;
  v_row_count BIGINT;
BEGIN
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000',
      v_user_a,
      'authenticated',
      'authenticated',
      'batch-b-role-a@example.com',
      crypt('password', gen_salt('bf')),
      NOW(),
      '{}',
      '{}',
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_user_b,
      'authenticated',
      'authenticated',
      'batch-b-role-b@example.com',
      crypt('password', gen_salt('bf')),
      NOW(),
      '{}',
      '{}',
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    );

  INSERT INTO public.organizations (id, name) VALUES
    (v_org_a, 'Role Context Org A'),
    (v_org_b, 'Role Context Org B');

  INSERT INTO public.clients (id, org_id, name) VALUES
    (v_client_a, v_org_a, 'Client A'),
    (v_client_b, v_org_b, 'Client B');

  INSERT INTO public.instruments (id, org_id, type, serial_number, status) VALUES
    (v_instrument_a, v_org_a, 'Violin', 'RC-A-001', 'Available'),
    (v_instrument_b, v_org_b, 'Violin', 'RC-B-001', 'Available'),
    (v_instrument_clean, v_org_a, 'Violin', 'RC-A-CLEAN', 'Available');

  INSERT INTO public.client_instruments (
    id, org_id, client_id, instrument_id, relationship_type
  ) VALUES
    (v_connection_a, v_org_a, v_client_a, v_instrument_a, 'Interested'),
    (v_connection_b, v_org_b, v_client_b, v_instrument_b, 'Interested'),
    (v_connection_other_inst, v_org_a, v_client_a, v_instrument_clean, 'Interested');

  -- Mirror hosted PostgREST privileges for role-scoped trigger/RLS checks.
  GRANT SELECT, UPDATE ON public.instruments TO authenticated, service_role;
  GRANT SELECT, UPDATE ON public.client_instruments TO authenticated, service_role;

  -- ── DB owner direct DML (current superuser / migration role) ────────────

  UPDATE public.instruments
  SET reserved_connection_id = v_connection_a
  WHERE id = v_instrument_a;

  IF (
    SELECT reserved_connection_id
    FROM public.instruments
    WHERE id = v_instrument_a
  ) IS DISTINCT FROM v_connection_a THEN
    RAISE EXCEPTION 'owner direct DML failed to set valid reserved_connection_id';
  END IF;

  BEGIN
    UPDATE public.instruments
    SET reserved_connection_id = v_connection_b
    WHERE id = v_instrument_a;
    RAISE EXCEPTION 'owner direct DML expected cross-org pointer to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%same organization%' THEN
      RAISE;
    END IF;
  END;

  UPDATE public.instruments
  SET reserved_connection_id = NULL
  WHERE id = v_instrument_a;

  -- ── authenticated same-org admin ──────────────────────────────────────

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
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  UPDATE public.instruments
  SET reserved_connection_id = v_connection_a
  WHERE id = v_instrument_a;

  IF (
    SELECT reserved_connection_id
    FROM public.instruments
    WHERE id = v_instrument_a
  ) IS DISTINCT FROM v_connection_a THEN
    RAISE EXCEPTION 'same-org admin failed to set valid reserved_connection_id';
  END IF;

  BEGIN
    UPDATE public.instruments
    SET reserved_connection_id = v_connection_other_inst
    WHERE id = v_instrument_a;
    RAISE EXCEPTION 'same-org admin expected different-instrument pointer to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%same instrument%' THEN
      RAISE;
    END IF;
  END;

  UPDATE public.instruments
  SET reserved_connection_id = NULL
  WHERE id = v_instrument_a;

  RESET ROLE;

  -- ── cross-org authenticated context ─────────────────────────────────────

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_user_b::text,
      'role', 'authenticated',
      'app_metadata', json_build_object(
        'org_id', v_org_b::text,
        'role', 'admin'
      )
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  UPDATE public.instruments
  SET reserved_connection_id = v_connection_a
  WHERE id = v_instrument_a;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count > 0 THEN
    RAISE EXCEPTION 'cross-org admin must not update foreign instrument pointer';
  END IF;

  RESET ROLE;

  IF (
    SELECT reserved_connection_id
    FROM public.instruments
    WHERE id = v_instrument_a
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'cross-org attempt must not mutate foreign instrument pointer';
  END IF;

  -- ── service_role / privileged context when available ──────────────────

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    BEGIN
      PERFORM set_config('request.jwt.claims', '', true);
      SET LOCAL ROLE service_role;
      SET LOCAL row_security = on;

      UPDATE public.instruments
      SET reserved_connection_id = v_connection_a
      WHERE id = v_instrument_a;

      BEGIN
        UPDATE public.instruments
        SET reserved_connection_id = v_connection_b
        WHERE id = v_instrument_a;
        RESET ROLE;
        RAISE EXCEPTION 'service_role expected cross-org pointer trigger rejection';
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
        RESET ROLE;
        IF v_caught NOT LIKE '%same organization%' THEN
          RAISE;
        END IF;
      END;

      UPDATE public.instruments
      SET reserved_connection_id = NULL
      WHERE id = v_instrument_a;

      RAISE NOTICE 'service-role context test: EXECUTED';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RESET ROLE;
        RAISE NOTICE 'service-role context test: NOT EXECUTED (insufficient privilege)';
    END;
  ELSE
    RAISE NOTICE 'service-role context test: NOT EXECUTED (service_role role missing)';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT COUNT(*) INTO v_mismatch_count
  FROM public.instruments i
  JOIN public.client_instruments ci
    ON ci.id = i.reserved_connection_id
  WHERE i.reserved_connection_id IS NOT NULL
    AND (
      i.org_id IS DISTINCT FROM ci.org_id
      OR i.id IS DISTINCT FROM ci.instrument_id
    );

  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'role-context tests left aggregate mismatch_count=%', v_mismatch_count;
  END IF;

  RAISE NOTICE 'reference integrity role-context SQL tests passed';
END
$$;

ROLLBACK;
