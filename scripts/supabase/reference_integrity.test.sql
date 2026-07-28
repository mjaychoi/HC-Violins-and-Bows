-- Reference integrity regression tests (Batch B).
-- Run after: npx supabase db reset --local --no-seed
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/reference_integrity.test.sql
-- All mutations run inside the outer transaction and ROLLBACK at the end.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_org_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_user_a UUID := '99999999-9999-4999-8999-999999999999';
  v_user_missing UUID := '88888888-8888-4888-8888-888888888888';
  v_client_a UUID := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  v_client_b UUID := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
  v_instrument_a UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5';
  v_instrument_b UUID := 'ffffffff-ffff-4fff-8fff-fffffffffff6';
  v_instrument_clean UUID := '10101010-1010-4101-8101-010101010101';
  v_connection_a UUID := '12121212-1212-4121-8121-121212121212';
  v_connection_b UUID := '13131313-1313-4131-8131-131313131313';
  v_connection_other_inst UUID := '14141414-1414-4141-8141-141414141414';
  v_maintenance_id UUID;
  v_task_count INTEGER;
  v_caught TEXT;
  v_reserved_user UUID;
  v_reserved_conn UUID;
  v_reserved_reason TEXT;
  v_fk_count INTEGER;
  v_mismatch_count BIGINT;
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
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_a,
    'authenticated',
    'authenticated',
    'batch-b-ref-test@example.com',
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
    (v_org_a, 'Reference Integrity Org A'),
    (v_org_b, 'Reference Integrity Org B');

  INSERT INTO public.clients (id, org_id, name) VALUES
    (v_client_a, v_org_a, 'Client A'),
    (v_client_b, v_org_b, 'Client B');

  INSERT INTO public.instruments (id, org_id, type, serial_number, status) VALUES
    (v_instrument_a, v_org_a, 'Violin', 'RI-A-001', 'Available'),
    (v_instrument_b, v_org_b, 'Violin', 'RI-B-001', 'Available'),
    (v_instrument_clean, v_org_a, 'Violin', 'RI-A-CLEAN', 'Available');

  INSERT INTO public.client_instruments (
    id, org_id, client_id, instrument_id, relationship_type
  ) VALUES
    (v_connection_a, v_org_a, v_client_a, v_instrument_a, 'Interested'),
    (v_connection_b, v_org_b, v_client_b, v_instrument_b, 'Interested'),
    (v_connection_other_inst, v_org_a, v_client_a, v_instrument_clean, 'Interested');

  -- ── Maintenance history: RESTRICT delete protection ─────────────────────

  INSERT INTO public.maintenance_tasks (
    org_id, instrument_id, task_type, title, received_date, status, priority
  ) VALUES (
    v_org_a, v_instrument_a, 'repair', 'Bridge repair', CURRENT_DATE, 'pending', 'medium'
  )
  RETURNING id INTO v_maintenance_id;

  BEGIN
    DELETE FROM public.instruments WHERE id = v_instrument_a;
    RAISE EXCEPTION 'expected instrument delete with maintenance history to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%violates foreign key constraint%'
       AND v_caught NOT LIKE '%restrict%'
       AND v_caught NOT LIKE '%still referenced%' THEN
      RAISE;
    END IF;
  END;

  SELECT COUNT(*) INTO v_task_count
  FROM public.maintenance_tasks
  WHERE id = v_maintenance_id;

  IF v_task_count <> 1 THEN
    RAISE EXCEPTION 'maintenance task row missing after rejected instrument delete';
  END IF;

  BEGIN
    INSERT INTO public.maintenance_tasks (
      org_id, instrument_id, task_type, title, received_date, status, priority
    ) VALUES (
      v_org_a, NULL, 'repair', 'Null instrument', CURRENT_DATE, 'pending', 'medium'
    );
    RAISE EXCEPTION 'expected NULL instrument_id insert to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%null value%'
       AND v_caught NOT LIKE '%violates not-null constraint%'
       AND v_caught NOT LIKE '%Referenced instrument not found%' THEN
      RAISE;
    END IF;
  END;

  -- ── Reserved user FK ────────────────────────────────────────────────────

  BEGIN
    UPDATE public.instruments
    SET reserved_by_user_id = v_user_missing
    WHERE id = v_instrument_a;
    RAISE EXCEPTION 'expected nonexistent reserved_by_user_id to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%violates foreign key constraint%' THEN
      RAISE;
    END IF;
  END;

  UPDATE public.instruments
  SET
    reserved_by_user_id = v_user_a,
    reserved_reason = 'Hold for client',
    status = 'Reserved'
  WHERE id = v_instrument_a;

  DELETE FROM auth.users WHERE id = v_user_a;

  SELECT reserved_by_user_id, reserved_connection_id, reserved_reason
    INTO v_reserved_user, v_reserved_conn, v_reserved_reason
  FROM public.instruments
  WHERE id = v_instrument_a;

  IF v_reserved_user IS NOT NULL THEN
    RAISE EXCEPTION 'deleting auth user should set reserved_by_user_id to NULL';
  END IF;

  IF v_reserved_conn IS NOT NULL THEN
    RAISE EXCEPTION 'deleting auth user must not clear reserved_connection_id';
  END IF;

  IF v_reserved_reason IS DISTINCT FROM 'Hold for client' THEN
    RAISE EXCEPTION 'deleting auth user must not clear reserved_reason';
  END IF;

  -- Re-create auth user for connection tests
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
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_a,
    'authenticated',
    'authenticated',
    'batch-b-ref-test-2@example.com',
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

  -- ── Reserved connection FK + invariants ─────────────────────────────────

  BEGIN
    UPDATE public.instruments
    SET reserved_connection_id = '22222222-2222-4222-8222-222222222222'::uuid
    WHERE id = v_instrument_a;
    RAISE EXCEPTION 'expected missing reserved_connection_id to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%violates foreign key constraint%'
       AND v_caught NOT LIKE '%Referenced client_instruments connection not found%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    UPDATE public.instruments
    SET reserved_connection_id = v_connection_b
    WHERE id = v_instrument_a;
    RAISE EXCEPTION 'expected cross-org reserved_connection_id to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%same organization%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    UPDATE public.instruments
    SET reserved_connection_id = v_connection_other_inst
    WHERE id = v_instrument_a;
    RAISE EXCEPTION 'expected same-org different-instrument connection to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%same instrument%' THEN
      RAISE;
    END IF;
  END;

  UPDATE public.instruments
  SET reserved_connection_id = v_connection_a
  WHERE id = v_instrument_a;

  DELETE FROM public.client_instruments WHERE id = v_connection_a;

  SELECT reserved_connection_id INTO v_reserved_conn
  FROM public.instruments
  WHERE id = v_instrument_a;

  IF v_reserved_conn IS NOT NULL THEN
    RAISE EXCEPTION 'deleting referenced connection should set reserved_connection_id to NULL';
  END IF;

  INSERT INTO public.client_instruments (
    id, org_id, client_id, instrument_id, relationship_type
  ) VALUES (
    v_connection_a, v_org_a, v_client_a, v_instrument_a, 'Interested'
  );

  UPDATE public.instruments
  SET reserved_connection_id = v_connection_a
  WHERE id = v_instrument_a;

  BEGIN
    UPDATE public.client_instruments
    SET instrument_id = v_instrument_clean
    WHERE id = v_connection_a;
    RAISE EXCEPTION 'expected retarget instrument while referenced to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%Cannot retarget client_instruments row referenced%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    UPDATE public.client_instruments
    SET org_id = v_org_b
    WHERE id = v_connection_a;
    RAISE EXCEPTION 'expected retarget org while referenced to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%Cannot retarget client_instruments row referenced%' THEN
      RAISE;
    END IF;
  END;

  UPDATE public.instruments
  SET reserved_connection_id = NULL
  WHERE id = v_instrument_a;

  UPDATE public.client_instruments
  SET instrument_id = v_instrument_clean
  WHERE id = v_connection_a;

  IF (
    SELECT instrument_id FROM public.client_instruments WHERE id = v_connection_a
  ) IS DISTINCT FROM v_instrument_clean THEN
    RAISE EXCEPTION 'connection retarget should succeed after pointer cleared';
  END IF;

  DELETE FROM public.instruments WHERE id = v_instrument_b;

  IF EXISTS (SELECT 1 FROM public.instruments WHERE id = v_instrument_b) THEN
    RAISE EXCEPTION 'instrument without maintenance history should delete successfully';
  END IF;

  -- ── Replay/idempotency: constraints and triggers exist once ─────────────

  SELECT COUNT(*)
    INTO v_fk_count
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
   AND NOT a.attisdropped
  WHERE c.conrelid = 'public.maintenance_tasks'::regclass
    AND c.contype = 'f'
    AND a.attname = 'instrument_id';

  IF v_fk_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one maintenance_tasks.instrument_id FK (count=%)', v_fk_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute src
      ON src.attrelid = c.conrelid
     AND src.attnum = c.conkey[1]
     AND NOT src.attisdropped
    JOIN pg_attribute ref
      ON ref.attrelid = c.confrelid
     AND ref.attnum = c.confkey[1]
     AND NOT ref.attisdropped
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.maintenance_tasks'::regclass
      AND c.conname = 'maintenance_tasks_instrument_id_fkey'
      AND c.confrelid = 'public.instruments'::regclass
      AND src.attname = 'instrument_id'
      AND ref.attname = 'id'
      AND c.confdeltype = 'r'
  ) THEN
    RAISE EXCEPTION
      'maintenance_tasks.instrument_id FK catalog mismatch (expected maintenance_tasks(instrument_id) -> instruments(id) ON DELETE RESTRICT)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute src
      ON src.attrelid = c.conrelid
     AND src.attnum = c.conkey[1]
     AND NOT src.attisdropped
    JOIN pg_attribute ref
      ON ref.attrelid = c.confrelid
     AND ref.attnum = c.confkey[1]
     AND NOT ref.attisdropped
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.instruments'::regclass
      AND c.conname = 'instruments_reserved_by_user_id_fkey'
      AND c.confrelid = 'auth.users'::regclass
      AND src.attname = 'reserved_by_user_id'
      AND ref.attname = 'id'
      AND c.confdeltype = 'n'
  ) THEN
    RAISE EXCEPTION
      'instruments.reserved_by_user_id FK catalog mismatch (expected instruments(reserved_by_user_id) -> auth.users(id) ON DELETE SET NULL)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute src
      ON src.attrelid = c.conrelid
     AND src.attnum = c.conkey[1]
     AND NOT src.attisdropped
    JOIN pg_attribute ref
      ON ref.attrelid = c.confrelid
     AND ref.attnum = c.confkey[1]
     AND NOT ref.attisdropped
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.instruments'::regclass
      AND c.conname = 'instruments_reserved_connection_id_fkey'
      AND c.confrelid = 'public.client_instruments'::regclass
      AND src.attname = 'reserved_connection_id'
      AND ref.attname = 'id'
      AND c.confdeltype = 'n'
  ) THEN
    RAISE EXCEPTION
      'instruments.reserved_connection_id FK catalog mismatch (expected instruments(reserved_connection_id) -> client_instruments(id) ON DELETE SET NULL)';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_trigger
    WHERE tgrelid = 'public.instruments'::regclass
      AND tgname = 'instruments_reserved_reference_consistency_trigger'
      AND NOT tgisinternal
  ) <> 1 THEN
    RAISE EXCEPTION 'instruments_reserved_reference_consistency_trigger missing or duplicated';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_trigger
    WHERE tgrelid = 'public.client_instruments'::regclass
      AND tgname = 'client_instruments_reserved_reference_guard_trigger'
      AND NOT tgisinternal
  ) <> 1 THEN
    RAISE EXCEPTION 'client_instruments_reserved_reference_guard_trigger missing or duplicated';
  END IF;

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
    RAISE EXCEPTION 'aggregate reserved_connection invariant mismatch_count=%', v_mismatch_count;
  END IF;

  RAISE NOTICE 'reference integrity SQL tests passed';
END
$$;

ROLLBACK;
