-- Authenticated-role regression coverage for the client creation RPC overloads.
-- Run after a full migration replay:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/supabase/client_rpc_authenticated_runtime_compatibility.test.sql
-- All fixtures and test-only DDL are rolled back.

\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.fail_test_booked_reconciliation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RAISE EXCEPTION 'test booked reconciliation failure';
END;
$$;

DO $$
DECLARE
  v_org_a UUID := 'a1000000-0000-4000-8000-000000000001';
  v_org_b UUID := 'b2000000-0000-4000-8000-000000000002';
  v_admin UUID := 'a1000000-0000-4000-8000-000000000010';
  v_member UUID := 'a1000000-0000-4000-8000-000000000020';
  v_missing_org UUID := 'a1000000-0000-4000-8000-000000000030';
  v_interested_instrument UUID := 'a1000000-0000-4000-8000-000000000101';
  v_booked_instrument UUID := 'a1000000-0000-4000-8000-000000000102';
  v_atomic_instrument UUID := 'a1000000-0000-4000-8000-000000000103';
  v_foreign_instrument UUID := 'b2000000-0000-4000-8000-000000000201';
  v_result JSONB;
  v_client_id UUID;
  v_caught TEXT;
  v_count BIGINT;
  v_signature TEXT;
  v_arg_count INT;
  v_table TEXT;
  v_privilege TEXT;
  v_function_definition TEXT;
BEGIN
  -- ── Effective privilege and function security assertions ─────────────

  IF NOT has_table_privilege('authenticated', 'public.clients', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.clients', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated requires clients SELECT and INSERT';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.client_instruments', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.client_instruments', 'INSERT') THEN
    RAISE EXCEPTION
      'authenticated requires client_instruments SELECT and INSERT';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.instruments', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.instruments', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated requires instruments SELECT and UPDATE';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'public.clients',
    'public.client_instruments',
    'public.instruments'
  ]
  LOOP
    IF has_table_privilege('authenticated', v_table, 'DELETE') THEN
      RAISE NOTICE
        'authenticated retains pre-existing DELETE on %; this migration does not grant it',
        v_table;
    END IF;

    FOREACH v_privilege IN ARRAY ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]
    LOOP
      IF has_table_privilege('anon', v_table, v_privilege) THEN
        RAISE EXCEPTION 'anon must not have % on %', v_privilege, v_table;
      END IF;
    END LOOP;
  END LOOP;

  FOR v_signature, v_arg_count IN
    SELECT *
    FROM (
      VALUES
        (
          'public.create_client_with_connections_atomic(text,text,text,text,jsonb)',
          5
        ),
        (
          'public.create_client_with_connections_atomic(text,text,text,text,jsonb,text[])',
          6
        ),
        (
          'public.create_client_with_connections_atomic(text,text,text,text,jsonb,text[],text,text,text,text)',
          10
        )
    ) AS signatures(signature, arg_count)
  LOOP
    IF NOT has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION
        'authenticated requires EXECUTE on % argument overload',
        v_arg_count;
    END IF;

    IF has_function_privilege('anon', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon must not execute % argument overload', v_arg_count;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'create_client_with_connections_atomic'
        AND p.pronargs = v_arg_count
        AND p.prosecdef
    ) THEN
      RAISE EXCEPTION '% argument overload must be SECURITY INVOKER', v_arg_count;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) AS function_acl
      WHERE n.nspname = 'public'
        AND p.proname = 'create_client_with_connections_atomic'
        AND p.pronargs = v_arg_count
        AND function_acl.grantee = 0
        AND function_acl.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PUBLIC must not execute % argument overload', v_arg_count;
    END IF;
  END LOOP;

  -- PostgreSQL positional SQL resolution treats longer overloads with trailing
  -- defaults as candidates for five- and six-argument calls. PostgREST resolves
  -- RPCs by named argument sets. For this SQL-only test, clone the actual wrapper
  -- definitions under transaction-local, unambiguous names. Their production
  -- OIDs retain the ACL/security assertions above; the cloned bodies execute as
  -- authenticated and delegate to the production canonical function.
  SELECT regexp_replace(
    pg_get_functiondef(
      'public.create_client_with_connections_atomic(text,text,text,text,jsonb)'::regprocedure
    ),
    'FUNCTION public\.create_client_with_connections_atomic',
    'FUNCTION pg_temp.call_client_rpc_5'
  )
  INTO v_function_definition;
  EXECUTE v_function_definition;

  SELECT regexp_replace(
    pg_get_functiondef(
      'public.create_client_with_connections_atomic(text,text,text,text,jsonb,text[])'::regprocedure
    ),
    'FUNCTION public\.create_client_with_connections_atomic',
    'FUNCTION pg_temp.call_client_rpc_6'
  )
  INTO v_function_definition;
  EXECUTE v_function_definition;

  GRANT EXECUTE ON FUNCTION pg_temp.call_client_rpc_5(
    TEXT, TEXT, TEXT, TEXT, JSONB
  ) TO authenticated;
  GRANT EXECUTE ON FUNCTION pg_temp.call_client_rpc_6(
    TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]
  ) TO authenticated;

  -- Seed as the migration owner. Runtime mutations below use authenticated.
  INSERT INTO public.organizations (id, name) VALUES
    (v_org_a, 'Client RPC Runtime Org A'),
    (v_org_b, 'Client RPC Runtime Org B');

  INSERT INTO public.instruments (
    id,
    org_id,
    type,
    serial_number,
    status
  ) VALUES
    (
      v_interested_instrument,
      v_org_a,
      'Violin',
      'CLIENT-RPC-INTERESTED',
      'Available'
    ),
    (
      v_booked_instrument,
      v_org_a,
      'Violin',
      'CLIENT-RPC-BOOKED',
      'Available'
    ),
    (
      v_atomic_instrument,
      v_org_a,
      'Violin',
      'CLIENT-RPC-ATOMIC',
      'Available'
    ),
    (
      v_foreign_instrument,
      v_org_b,
      'Violin',
      'CLIENT-RPC-FOREIGN',
      'Available'
    );

  -- ── Same-org admin: 5-, 6-, and 10-argument overloads ────────────────

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_admin::text,
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

  v_result := pg_temp.call_client_rpc_5(
    'LegacySingle'::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    'RPC-LEGACY-SINGLE'::TEXT,
    '[]'::jsonb
  );
  v_client_id := (v_result -> 'client' ->> 'id')::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id = v_client_id
      AND org_id = v_org_a
      AND first_name = 'LegacySingle'
      AND last_name IS NULL
  ) THEN
    RAISE EXCEPTION '5-argument single-name compatibility failed';
  END IF;

  v_result := pg_temp.call_client_rpc_5(
    'Legacy Multi Word'::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    'RPC-LEGACY-MULTI'::TEXT,
    '[]'::jsonb
  );
  v_client_id := (v_result -> 'client' ->> 'id')::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id = v_client_id
      AND org_id = v_org_a
      AND first_name = 'Legacy'
      AND last_name = 'Multi Word'
  ) THEN
    RAISE EXCEPTION '5-argument multi-word compatibility failed';
  END IF;

  v_result := pg_temp.call_client_rpc_6(
    'Six Arg'::TEXT,
    NULL::TEXT,
    NULL::TEXT,
    'RPC-SIX'::TEXT,
    jsonb_build_array(
      jsonb_build_object(
        'instrument_id', v_interested_instrument,
        'relationship_type', 'Interested'
      )
    ),
    ARRAY['priority']::TEXT[]
  );
  v_client_id := (v_result -> 'client' ->> 'id')::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_instruments
    WHERE client_id = v_client_id
      AND instrument_id = v_interested_instrument
      AND relationship_type = 'Interested'
      AND org_id = v_org_a
  ) THEN
    RAISE EXCEPTION '6-argument Interested link failed';
  END IF;

  v_result := public.create_client_with_connections_atomic(
    NULL,
    NULL,
    NULL,
    'RPC-TEN',
    jsonb_build_array(
      jsonb_build_object(
        'instrument_id', v_booked_instrument,
        'relationship_type', 'Booked'
      )
    ),
    ARRAY[]::TEXT[],
    'Violin',
    'Booked runtime regression',
    'Canonical',
    'Ten'
  );
  v_client_id := (v_result -> 'client' ->> 'id')::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id = v_client_id
      AND first_name = 'Canonical'
      AND last_name = 'Ten'
      AND interest = 'Violin'
      AND note = 'Booked runtime regression'
  ) THEN
    RAISE EXCEPTION '10-argument canonical client persistence failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_instruments
    WHERE client_id = v_client_id
      AND instrument_id = v_booked_instrument
      AND relationship_type = 'Booked'
      AND org_id = v_org_a
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.instruments
    WHERE id = v_booked_instrument
      AND org_id = v_org_a
      AND status = 'Booked'
  ) THEN
    RAISE EXCEPTION 'Booked link or instrument reconciliation failed';
  END IF;

  -- Empty legacy names remain invalid.
  BEGIN
    PERFORM pg_temp.call_client_rpc_5(
      '   '::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      'RPC-EMPTY'::TEXT,
      '[]'::jsonb
    );
    RAISE EXCEPTION 'empty legacy name unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught <> 'Client name is required' THEN
      RAISE;
    END IF;
  END;

  -- ── Member: every overload must reject writes through RLS ─────────────

  RESET ROLE;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_member::text,
      'role', 'authenticated',
      'app_metadata', json_build_object(
        'org_id', v_org_a::text,
        'role', 'member'
      )
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  BEGIN
    PERFORM pg_temp.call_client_rpc_5(
      'Member Five'::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      'RPC-MEMBER-FIVE'::TEXT,
      '[]'::jsonb
    );
    RAISE EXCEPTION 'member unexpectedly used 5-argument overload';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM pg_temp.call_client_rpc_6(
      'Member Six'::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      'RPC-MEMBER-SIX'::TEXT,
      '[]'::jsonb,
      ARRAY[]::TEXT[]
    );
    RAISE EXCEPTION 'member unexpectedly used 6-argument overload';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_client_with_connections_atomic(
      NULL,
      NULL,
      NULL,
      'RPC-MEMBER-TEN',
      '[]'::jsonb,
      ARRAY[]::TEXT[],
      NULL,
      NULL,
      'Member',
      'Ten'
    );
    RAISE EXCEPTION 'member unexpectedly used 10-argument overload';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RESET ROLE;
  SELECT COUNT(*) INTO v_count
  FROM public.clients
  WHERE client_number IN (
    'RPC-MEMBER-FIVE',
    'RPC-MEMBER-SIX',
    'RPC-MEMBER-TEN'
  );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'member failures left % client rows', v_count;
  END IF;

  -- ── Wrong org: link rejection rolls back the client insert ────────────

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_admin::text,
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

  BEGIN
    PERFORM pg_temp.call_client_rpc_5(
      'Wrong Org'::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      'RPC-WRONG-ORG'::TEXT,
      jsonb_build_array(
        jsonb_build_object(
          'instrument_id', v_foreign_instrument,
          'relationship_type', 'Interested'
        )
      )
    );
    RAISE EXCEPTION 'wrong-org link unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught <> 'Instrument not found in organization' THEN
      RAISE;
    END IF;
  END;

  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM public.clients WHERE client_number = 'RPC-WRONG-ORG'
  ) OR EXISTS (
    SELECT 1
    FROM public.client_instruments
    WHERE instrument_id = v_foreign_instrument
  ) THEN
    RAISE EXCEPTION 'wrong-org failure was not atomic';
  END IF;

  -- ── Missing org: canonical context guard remains fail-closed ──────────

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_missing_org::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', 'admin')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  BEGIN
    PERFORM pg_temp.call_client_rpc_5(
      'Missing Org'::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      'RPC-MISSING-ORG'::TEXT,
      '[]'::jsonb
    );
    RAISE EXCEPTION 'missing-org call unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught <> 'Organization context required' THEN
      RAISE;
    END IF;
  END;

  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM public.clients WHERE client_number = 'RPC-MISSING-ORG'
  ) THEN
    RAISE EXCEPTION 'missing-org failure left a client row';
  END IF;

  -- ── Reconciliation failure: roll back client, link, and instrument ────

  CREATE TRIGGER fail_test_booked_reconciliation
    BEFORE UPDATE OF status ON public.instruments
    FOR EACH ROW
    WHEN (
      NEW.id = 'a1000000-0000-4000-8000-000000000103'::uuid
      AND NEW.status = 'Booked'
    )
    EXECUTE FUNCTION pg_temp.fail_test_booked_reconciliation();

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_admin::text,
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

  BEGIN
    PERFORM public.create_client_with_connections_atomic(
      NULL,
      NULL,
      NULL,
      'RPC-ATOMIC-BOOKED',
      jsonb_build_array(
        jsonb_build_object(
          'instrument_id', v_atomic_instrument,
          'relationship_type', 'Booked'
        )
      ),
      ARRAY[]::TEXT[],
      NULL,
      NULL,
      'Atomic',
      'Booked'
    );
    RAISE EXCEPTION 'forced reconciliation failure unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught <> 'test booked reconciliation failure' THEN
      RAISE;
    END IF;
  END;

  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM public.clients WHERE client_number = 'RPC-ATOMIC-BOOKED'
  ) OR EXISTS (
    SELECT 1
    FROM public.client_instruments
    WHERE instrument_id = v_atomic_instrument
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.instruments
    WHERE id = v_atomic_instrument
      AND status = 'Available'
  ) THEN
    RAISE EXCEPTION 'reconciliation failure did not roll back all state';
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE
    'client RPC authenticated runtime compatibility SQL tests passed';
END
$$;

ROLLBACK;
