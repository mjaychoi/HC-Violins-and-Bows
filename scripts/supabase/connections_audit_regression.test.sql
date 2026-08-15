-- Connections audit regression tests (fix/connections-audit-findings-20260801).
-- Covers F3 (Sold deletion immutability), F4 (sale reconciliation invariants),
-- F12 (Owned uniqueness -> 23505), and F13 (update_connection_atomic
-- explicitly raises CONNECTION_REASSIGNMENT_UNSUPPORTED - not a silent
-- no-op - whenever p_updates contains client_id and/or instrument_id,
-- regardless of caller, and never partially applies the rest of the
-- request).
--
-- Run after: npx supabase db reset --local --no-seed
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/connections_audit_regression.test.sql
-- All mutations run inside the outer transaction and ROLLBACK at the end.
--
-- Verified against a fresh migration-only local Supabase database on
-- 2026-08-01. See PR verification notes for the exact command and
-- environment limitations.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_org_a UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_org_b UUID := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_user_a UUID := '99999999-9999-4999-8999-999999999999';
  v_client_a1 UUID := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  v_client_a2 UUID := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  v_client_a3 UUID := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  v_instrument_sold UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  v_instrument_owned UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
  v_instrument_booked UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3';
  v_instrument_interested UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4';
  v_instrument_dup_owner UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5';
  v_instrument_reassign_notes UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6';
  v_instrument_reassign_type UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee7';
  v_instrument_notes_only UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee8';
  v_instrument_type_only UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9';
  v_conn_sold UUID := '11111111-1111-4111-8111-111111111101';
  v_conn_interested UUID := '11111111-1111-4111-8111-111111111102';
  v_conn_booked UUID := '11111111-1111-4111-8111-111111111103';
  v_conn_owned UUID := '11111111-1111-4111-8111-111111111104';
  v_conn_prior_owner UUID := '11111111-1111-4111-8111-111111111105';
  v_conn_purchaser_interested UUID := '11111111-1111-4111-8111-111111111106';
  v_conn_stale_booked UUID := '11111111-1111-4111-8111-111111111107';
  v_conn_first_owner UUID := '11111111-1111-4111-8111-111111111108';
  v_conn_reassign_notes UUID := '11111111-1111-4111-8111-111111111109';
  v_conn_reassign_type UUID := '11111111-1111-4111-8111-111111111110';
  v_conn_notes_only UUID := '11111111-1111-4111-8111-111111111111';
  v_conn_type_only UUID := '11111111-1111-4111-8111-111111111112';
  v_org_b_client UUID := 'cccccccc-cccc-4ccc-8ccc-ccccccccccb1';
  v_org_b_instrument UUID := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeb1';
  v_caught TEXT;
  v_row_count BIGINT;
  v_relationship TEXT;
  v_status TEXT;
  v_count BIGINT;
  v_sale_id UUID;
  v_notes TEXT;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_a, 'authenticated', 'authenticated',
    'connections-audit-admin@example.com', crypt('password', gen_salt('bf')), NOW(),
    '{}', '{}', NOW(), NOW(), '', '', '', ''
  );

  INSERT INTO public.organizations (id, name) VALUES
    (v_org_a, 'Connections Audit Org A'),
    (v_org_b, 'Connections Audit Org B');

  INSERT INTO public.clients (id, org_id, name, first_name, last_name) VALUES
    (v_client_a1, v_org_a, 'Client One', 'Client', 'One'),
    (v_client_a2, v_org_a, 'Client Two', 'Client', 'Two'),
    (v_client_a3, v_org_a, 'Client Three', 'Client', 'Three');

  INSERT INTO public.instruments (id, org_id, type, serial_number, status) VALUES
    (v_instrument_sold, v_org_a, 'Violin', 'CA-SOLD-001', 'Sold'),
    (v_instrument_owned, v_org_a, 'Violin', 'CA-OWNED-001', 'Available'),
    (v_instrument_booked, v_org_a, 'Violin', 'CA-BOOKED-001', 'Available'),
    (v_instrument_interested, v_org_a, 'Violin', 'CA-INT-001', 'Available'),
    (v_instrument_dup_owner, v_org_a, 'Violin', 'CA-DUP-001', 'Available'),
    (v_instrument_reassign_notes, v_org_a, 'Violin', 'CA-F13-NOTES-001', 'Available'),
    (v_instrument_reassign_type, v_org_a, 'Violin', 'CA-F13-TYPE-001', 'Available'),
    (v_instrument_notes_only, v_org_a, 'Violin', 'CA-F13-NOTESONLY-001', 'Available'),
    (v_instrument_type_only, v_org_a, 'Violin', 'CA-F13-TYPEONLY-001', 'Available');

  -- Org B fixtures, used only to prove that update_connection_atomic
  -- rejects client_id/instrument_id in p_updates unconditionally - even
  -- when the value is a valid ID scoped to a *different* organization -
  -- rather than accepting/validating it as a same-org reassignment.
  INSERT INTO public.clients (id, org_id, name, first_name, last_name) VALUES
    (v_org_b_client, v_org_b, 'Org B Client', 'Org B', 'Client');
  INSERT INTO public.instruments (id, org_id, type, serial_number, status) VALUES
    (v_org_b_instrument, v_org_b, 'Viola', 'CB-INT-001', 'Available');

  INSERT INTO public.client_instruments (id, org_id, client_id, instrument_id, relationship_type) VALUES
    (v_conn_sold, v_org_a, v_client_a1, v_instrument_sold, 'Sold'),
    (v_conn_interested, v_org_a, v_client_a1, v_instrument_interested, 'Interested'),
    (v_conn_booked, v_org_a, v_client_a1, v_instrument_booked, 'Booked'),
    (v_conn_first_owner, v_org_a, v_client_a1, v_instrument_dup_owner, 'Owned'),
    (v_conn_reassign_notes, v_org_a, v_client_a1, v_instrument_reassign_notes, 'Interested'),
    (v_conn_reassign_type, v_org_a, v_client_a1, v_instrument_reassign_type, 'Interested'),
    (v_conn_notes_only, v_org_a, v_client_a1, v_instrument_notes_only, 'Interested'),
    (v_conn_type_only, v_org_a, v_client_a1, v_instrument_type_only, 'Interested');

  INSERT INTO public.sales_history (id, org_id, instrument_id, client_id, sale_price, sale_date)
  VALUES (gen_random_uuid(), v_org_a, v_instrument_sold, v_client_a1, 1000, CURRENT_DATE);

  -- ── Authenticated admin (org A) context ─────────────────────────────────
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_user_a::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('org_id', v_org_a::text, 'role', 'admin')
    )::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;

  -- ═══ F3: Sold connection cannot be deleted ═══════════════════════════
  BEGIN
    PERFORM public.delete_connection_atomic(v_conn_sold);
    RAISE EXCEPTION 'expected delete_connection_atomic to reject a Sold connection';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'SOLD_CONNECTION_IMMUTABLE%' THEN
      RAISE;
    END IF;
  END;

  SELECT relationship_type INTO v_relationship
  FROM public.client_instruments WHERE id = v_conn_sold;
  IF v_relationship IS DISTINCT FROM 'Sold' THEN
    RAISE EXCEPTION 'Sold connection row must remain in the database unchanged';
  END IF;

  SELECT status INTO v_status FROM public.instruments WHERE id = v_instrument_sold;
  IF v_status IS DISTINCT FROM 'Sold' THEN
    RAISE EXCEPTION 'instrument must remain Sold after a rejected delete attempt';
  END IF;

  -- sales_history has no direct SELECT grant for `authenticated` in tracked
  -- migrations (only an RLS policy, which does not apply without a table
  -- privilege) - this is a pre-existing gap unrelated to this connections
  -- audit branch (see final report). Read as the owning role purely for
  -- test assertion purposes; the RPC calls under test still run as
  -- `authenticated` throughout.
  RESET ROLE;
  SELECT COUNT(*) INTO v_count
  FROM public.sales_history WHERE instrument_id = v_instrument_sold;
  SET LOCAL ROLE authenticated;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'sales history must remain present after a rejected delete attempt';
  END IF;

  -- ═══ F3: ordinary relationship types can still be deleted ════════════
  PERFORM public.delete_connection_atomic(v_conn_interested);
  IF EXISTS (SELECT 1 FROM public.client_instruments WHERE id = v_conn_interested) THEN
    RAISE EXCEPTION 'Interested connection should have been deleted';
  END IF;

  PERFORM public.delete_connection_atomic(v_conn_booked);
  IF EXISTS (SELECT 1 FROM public.client_instruments WHERE id = v_conn_booked) THEN
    RAISE EXCEPTION 'Booked connection should have been deleted';
  END IF;
  SELECT status INTO v_status FROM public.instruments WHERE id = v_instrument_booked;
  IF v_status <> 'Available' THEN
    RAISE EXCEPTION 'deleting the only Booked connection should reconcile instrument status back to Available, got %', v_status;
  END IF;

  -- ═══ F12: Owned uniqueness violation surfaces as 23505 ═══════════════
  BEGIN
    INSERT INTO public.client_instruments (id, org_id, client_id, instrument_id, relationship_type)
    VALUES (gen_random_uuid(), v_org_a, v_client_a2, v_instrument_dup_owner, 'Owned');
    RAISE EXCEPTION 'expected duplicate Owned insert to raise unique_violation';
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
      IF v_caught NOT LIKE '%client_instruments_single_owner_per_instrument%' THEN
        RAISE EXCEPTION 'unexpected unique_violation constraint: %', v_caught;
      END IF;
  END;

  SELECT COUNT(*) INTO v_count
  FROM public.client_instruments
  WHERE instrument_id = v_instrument_dup_owner AND relationship_type = 'Owned';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'exactly one Owned row must exist per instrument, found %', v_count;
  END IF;

  -- ═══ F4: sale reconciliation — prior Owned relationship is superseded ══
  INSERT INTO public.client_instruments (id, org_id, client_id, instrument_id, relationship_type)
  VALUES (v_conn_prior_owner, v_org_a, v_client_a1, v_instrument_owned, 'Owned');

  v_sale_id := public.create_sale_atomic(2500, CURRENT_DATE, v_client_a2, v_instrument_owned, 'audit test sale');

  SELECT status INTO v_status FROM public.instruments WHERE id = v_instrument_owned;
  IF v_status <> 'Sold' THEN
    RAISE EXCEPTION 'instrument must be Sold after create_sale_atomic, got %', v_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.client_instruments
    WHERE instrument_id = v_instrument_owned AND client_id = v_client_a1
  ) THEN
    RAISE EXCEPTION 'prior owner Owned relationship must not survive a completed sale';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.client_instruments
  WHERE instrument_id = v_instrument_owned AND relationship_type = 'Sold';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'exactly one canonical Sold relationship must exist, found %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.client_instruments
    WHERE instrument_id = v_instrument_owned
      AND client_id = v_client_a2
      AND relationship_type = 'Sold'
  ) THEN
    RAISE EXCEPTION 'purchaser must hold the canonical Sold relationship';
  END IF;

  -- Same pre-existing sales_history grant gap as above; read as the owning
  -- role for assertion purposes only.
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.sales_history WHERE id = v_sale_id) THEN
    RAISE EXCEPTION 'sales history row must exist for the completed sale';
  END IF;
  SET LOCAL ROLE authenticated;

  -- ═══ F4: sale reconciliation — stale Booked from another client is cleared,
  --         Interested from another client is preserved (non-contradictory) ══
  INSERT INTO public.client_instruments (id, org_id, client_id, instrument_id, relationship_type)
  VALUES
    (v_conn_stale_booked, v_org_a, v_client_a1, v_instrument_interested, 'Booked'),
    (gen_random_uuid(), v_org_a, v_client_a3, v_instrument_interested, 'Interested');

  PERFORM public.create_sale_atomic(1800, CURRENT_DATE, v_client_a2, v_instrument_interested, NULL);

  IF EXISTS (
    SELECT 1 FROM public.client_instruments
    WHERE id = v_conn_stale_booked
  ) THEN
    RAISE EXCEPTION 'stale Booked relationship from another client must not survive a completed sale';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.client_instruments
  WHERE instrument_id = v_instrument_interested
    AND client_id = v_client_a3
    AND relationship_type = 'Interested';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Interested relationship from a non-purchaser client must be preserved as history';
  END IF;

  -- ═══ F4: purchaser''s own pre-existing Interested row is canonicalized,
  --         not duplicated, into a single Sold row ═══════════════════════
  SELECT COUNT(*) INTO v_count
  FROM public.client_instruments
  WHERE instrument_id = v_instrument_interested AND client_id = v_client_a2;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'purchaser must end up with exactly one relationship row, found %', v_count;
  END IF;

  SELECT relationship_type INTO v_relationship
  FROM public.client_instruments
  WHERE instrument_id = v_instrument_interested AND client_id = v_client_a2;
  IF v_relationship <> 'Sold' THEN
    RAISE EXCEPTION 'purchaser relationship must be Sold, got %', v_relationship;
  END IF;

  -- ═══ F4: repeated sale request on an already-sold instrument fails and
  --         leaves prior state intact ═══════════════════════════════════
  BEGIN
    PERFORM public.create_sale_atomic(999, CURRENT_DATE, v_client_a3, v_instrument_interested, NULL);
    RAISE EXCEPTION 'expected repeated sale on an already-sold instrument to fail';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE '%already sold%' AND v_caught NOT LIKE '%completed sale record%' THEN
      RAISE;
    END IF;
  END;

  SELECT COUNT(*) INTO v_count
  FROM public.client_instruments
  WHERE instrument_id = v_instrument_interested AND relationship_type = 'Sold';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'repeated sale attempt must not create a second Sold relationship';
  END IF;

  -- ═══ F13: update_connection_atomic explicitly rejects client_id and/or
  --         instrument_id in p_updates with a stable controlled exception,
  --         rather than silently ignoring them and applying the rest of
  --         the request (or applying nothing while still returning
  --         success). Every case below must: (a) raise
  --         CONNECTION_REASSIGNMENT_UNSUPPORTED, and (b) leave the row
  --         completely unchanged - including any other field bundled into
  --         the same request (notes / relationship_type) - proving the
  --         rejection is atomic, not a partial apply. ══════════════════════

  -- client_id only.
  BEGIN
    PERFORM public.update_connection_atomic(
      v_conn_first_owner,
      json_build_object('client_id', v_client_a2::text)::jsonb
    );
    RAISE EXCEPTION 'expected update_connection_atomic to reject client_id-only reassignment';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'CONNECTION_REASSIGNMENT_UNSUPPORTED%' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_instruments
    WHERE id = v_conn_first_owner AND client_id = v_client_a1 AND instrument_id = v_instrument_dup_owner
      AND relationship_type = 'Owned' AND notes IS NULL
  ) THEN
    RAISE EXCEPTION 'row must be completely unchanged after a rejected client_id-only update';
  END IF;

  -- instrument_id only.
  BEGIN
    PERFORM public.update_connection_atomic(
      v_conn_first_owner,
      json_build_object('instrument_id', v_instrument_sold::text)::jsonb
    );
    RAISE EXCEPTION 'expected update_connection_atomic to reject instrument_id-only reassignment';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'CONNECTION_REASSIGNMENT_UNSUPPORTED%' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_instruments
    WHERE id = v_conn_first_owner AND client_id = v_client_a1 AND instrument_id = v_instrument_dup_owner
      AND relationship_type = 'Owned' AND notes IS NULL
  ) THEN
    RAISE EXCEPTION 'row must be completely unchanged after a rejected instrument_id-only update';
  END IF;

  -- both client_id and instrument_id.
  BEGIN
    PERFORM public.update_connection_atomic(
      v_conn_first_owner,
      json_build_object(
        'client_id', v_client_a2::text,
        'instrument_id', v_instrument_sold::text
      )::jsonb
    );
    RAISE EXCEPTION 'expected update_connection_atomic to reject client_id+instrument_id reassignment';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'CONNECTION_REASSIGNMENT_UNSUPPORTED%' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_instruments
    WHERE id = v_conn_first_owner AND client_id = v_client_a1 AND instrument_id = v_instrument_dup_owner
      AND relationship_type = 'Owned' AND notes IS NULL
  ) THEN
    RAISE EXCEPTION 'row must be completely unchanged after a rejected client_id+instrument_id update';
  END IF;

  -- reassignment (client_id) bundled with a valid notes update: the whole
  -- request must be rejected, notes must NOT be silently applied.
  BEGIN
    PERFORM public.update_connection_atomic(
      v_conn_reassign_notes,
      json_build_object(
        'client_id', v_client_a2::text,
        'notes', 'attempted reassignment plus notes'
      )::jsonb
    );
    RAISE EXCEPTION 'expected update_connection_atomic to reject reassignment+notes';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'CONNECTION_REASSIGNMENT_UNSUPPORTED%' THEN RAISE; END IF;
  END;
  SELECT notes INTO v_notes FROM public.client_instruments WHERE id = v_conn_reassign_notes;
  IF v_notes IS NOT NULL THEN
    RAISE EXCEPTION 'notes must not be applied when bundled with a rejected reassignment, got %', v_notes;
  END IF;

  -- reassignment (instrument_id) bundled with a valid relationship_type
  -- update: the whole request must be rejected, relationship_type must NOT
  -- be silently applied.
  BEGIN
    PERFORM public.update_connection_atomic(
      v_conn_reassign_type,
      json_build_object(
        'instrument_id', v_instrument_sold::text,
        'relationship_type', 'Booked'
      )::jsonb
    );
    RAISE EXCEPTION 'expected update_connection_atomic to reject reassignment+relationship_type';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'CONNECTION_REASSIGNMENT_UNSUPPORTED%' THEN RAISE; END IF;
  END;
  SELECT relationship_type INTO v_relationship FROM public.client_instruments WHERE id = v_conn_reassign_type;
  IF v_relationship <> 'Interested' THEN
    RAISE EXCEPTION 'relationship_type must not be applied when bundled with a rejected reassignment, got %', v_relationship;
  END IF;

  -- cross-organization IDs: still rejected outright (not validated as a
  -- same-org vs cross-org reassignment) - the RPC must never inspect
  -- whether the referenced client_id/instrument_id belongs to this org
  -- before rejecting the request.
  BEGIN
    PERFORM public.update_connection_atomic(
      v_conn_first_owner,
      json_build_object('client_id', v_org_b_client::text)::jsonb
    );
    RAISE EXCEPTION 'expected update_connection_atomic to reject a cross-org client_id';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'CONNECTION_REASSIGNMENT_UNSUPPORTED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.update_connection_atomic(
      v_conn_first_owner,
      json_build_object('instrument_id', v_org_b_instrument::text)::jsonb
    );
    RAISE EXCEPTION 'expected update_connection_atomic to reject a cross-org instrument_id';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'CONNECTION_REASSIGNMENT_UNSUPPORTED%' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_instruments
    WHERE id = v_conn_first_owner AND client_id = v_client_a1 AND instrument_id = v_instrument_dup_owner
      AND relationship_type = 'Owned' AND notes IS NULL
  ) THEN
    RAISE EXCEPTION 'row must be completely unchanged after rejected cross-org reassignment attempts';
  END IF;

  -- Control case: a notes-only update (no client_id/instrument_id key at
  -- all) must still succeed normally.
  PERFORM public.update_connection_atomic(
    v_conn_notes_only,
    json_build_object('notes', 'valid notes update')::jsonb
  );
  SELECT notes INTO v_notes FROM public.client_instruments WHERE id = v_conn_notes_only;
  IF v_notes IS DISTINCT FROM 'valid notes update' THEN
    RAISE EXCEPTION 'a notes-only update with no reassignment keys must succeed, got %', v_notes;
  END IF;

  -- Control case: an editable relationship_type-only update (no
  -- client_id/instrument_id key at all) must still succeed normally.
  PERFORM public.update_connection_atomic(
    v_conn_type_only,
    json_build_object('relationship_type', 'Booked')::jsonb
  );
  SELECT relationship_type INTO v_relationship FROM public.client_instruments WHERE id = v_conn_type_only;
  IF v_relationship <> 'Booked' THEN
    RAISE EXCEPTION 'an editable relationship_type-only update with no reassignment keys must succeed, got %', v_relationship;
  END IF;

  -- ═══ V4-001: Interested/Booked uniqueness ════════════════════════════
  -- Sequential duplicate Interested is rejected by the RPC EXISTS guard.
  BEGIN
    PERFORM public.create_connection_atomic(
      v_client_a1,
      v_instrument_notes_only,
      'Interested',
      NULL
    );
    RAISE EXCEPTION 'expected sequential duplicate Interested create to be rejected';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_caught = MESSAGE_TEXT;
    IF v_caught NOT LIKE 'DUPLICATE_CONNECTION%' THEN
      RAISE;
    END IF;
  END;

  -- Same pair Interested + Booked is allowed.
  PERFORM public.create_connection_atomic(
    v_client_a1,
    v_instrument_notes_only,
    'Booked',
    NULL
  );

  -- Different clients may share the same instrument + Interested.
  PERFORM public.create_connection_atomic(
    v_client_a2,
    v_instrument_notes_only,
    'Interested',
    NULL
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  RAISE NOTICE 'connections_audit_regression.test.sql: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
