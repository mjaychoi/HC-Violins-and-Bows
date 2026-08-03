-- ============================================================
-- Replace the forgeable custom-GUC Sold-boundary bypass with a private,
-- transaction-scoped authorization record that ordinary SQL callers
-- cannot manufacture.
--
-- Problem with 20260804030000_restore_instrument_sold_boundary_fail_closed:
-- it gates the Sold boundary on a *custom GUC*
-- (app.instrument_sold_transition_authorized = 'on'). Any role that can
-- run SQL in its own transaction -- including the `authenticated` role
-- used by executeInstrumentPatch.ts's user-scoped client, and the
-- `service_role` used by internal jobs -- can call
-- `SELECT set_config('app.instrument_sold_transition_authorized', 'on', true)`
-- directly and then perform an ordinary `UPDATE public.instruments`
-- across the Sold boundary in the *same* transaction. The trigger has no
-- way to distinguish that caller-set value from one set internally by
-- create_sale_atomic()/update_instrument_sale_transition_atomic(). This
-- was verified: both `authenticated` (admin, own org) and `service_role`
-- reproduce the bypass in both directions (Available->Sold, Sold->
-- Available) via a bare `set_config` + `UPDATE`, with no RPC involved.
--
-- Fix (Option B from the security review -- see deliverable report):
-- a private schema/table that only this migration's owning role (and
-- the SECURITY DEFINER functions it owns) can reach at all -- no role
-- reachable via PostgREST or a direct database session (authenticated,
-- service_role, anon, PUBLIC) is ever granted USAGE on the schema or any
-- privilege on the table, so no caller can INSERT/UPDATE/DELETE a row in
-- it no matter what SQL they run. Column privilege separation (Option A)
-- was evaluated and rejected: update_instrument_sale_transition_atomic's
-- own combined UPDATE always lists `status` in its SET clause (even when
-- unchanged) so the RPC could no longer write it either, and
-- executeInstrumentPatch.ts also does *legitimate* direct
-- `.from('instruments').update({status: ...})` calls for ordinary
-- non-Sold transitions (Available<->Booked<->Reserved<->Maintenance) --
-- revoking column UPDATE privilege on `status` from `authenticated`
-- would break that existing, intentional direct-write path, not just
-- the Sold boundary.
--
-- A record in sale_auth.sold_transition_authorization authorizes exactly
-- one instrument, in one org, crossing from one specific status to one
-- specific status, in the current transaction only (keyed by
-- txid_current()). The trigger deletes-and-validates the matching row in
-- a single statement, so a record can be consumed at most once; anything
-- left unconsumed when the transaction ends is removed by COMMIT or
-- ROLLBACK, whichever ends the transaction that inserted it (the table
-- is never read outside the transaction that wrote to it, so this is a
-- correctness property, not just a cleanup convenience).
--
-- The trigger and the two RPCs that create authorization records must
-- run with elevated (SECURITY DEFINER) privilege to reach the private
-- schema regardless of which role fired the triggering UPDATE or called
-- the RPC; create_sale_atomic already was SECURITY DEFINER,
-- update_instrument_sale_transition_atomic is converted to SECURITY
-- DEFINER here (it already performed every one of its own authorization
-- and org-scoping checks in code, same as create_sale_atomic, so RLS was
-- never its sole safeguard -- see 00000000000037/20260423140004 and
-- 20260804040000 for that history). Both remain granted EXECUTE only to
-- `authenticated`, unchanged from their existing grants (not reissued
-- here since CREATE OR REPLACE preserves grants for an unchanged
-- signature). SECURITY DEFINER does not widen who may call these RPCs;
-- it only lets their *internal* bodies reach the private schema.
--
-- create_sale_atomic and update_instrument_sale_transition_atomic below
-- otherwise keep every behavior from 20260804040000 unchanged: sale-price
-- precision/maximum checks, the active-sale-lifecycle resale guard,
-- purchaser-relationship normalization/dedup, stale Owned/Booked cleanup,
-- the RLS-safe find_refundable_sale_for_update helper, and
-- certificate_name patch handling.
-- ============================================================

-- ──────────────────────────────────────────────
-- Private schema + transaction-scoped authorization table.
-- No GRANT of any kind is issued here to authenticated, service_role,
-- anon, or PUBLIC -- on the schema OR the table. That is the whole
-- point: no ordinary caller, however they connect, can reach this
-- table directly. RLS is also enabled with zero policies as a second,
-- independent layer -- if a future migration mistakenly grants table
-- privileges here, RLS with no policies still returns/permits nothing
-- for any non-owner, non-superuser role. Our own SECURITY DEFINER
-- functions are unaffected: table owners bypass RLS by default (RLS is
-- intentionally not FORCEd), and those functions run as the owner.
-- ──────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS sale_auth;
REVOKE ALL ON SCHEMA sale_auth FROM PUBLIC;

COMMENT ON SCHEMA sale_auth IS
  'Private schema for transaction-scoped sale-transition authorization records. Not reachable by authenticated, service_role, anon, or PUBLIC -- only SECURITY DEFINER functions owned by the schema owner may read/write it.';

CREATE TABLE IF NOT EXISTS sale_auth.sold_transition_authorization (
  txid          BIGINT      NOT NULL DEFAULT txid_current(),
  instrument_id UUID        NOT NULL,
  org_id        UUID        NOT NULL,
  from_status   TEXT        NOT NULL,
  to_status     TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (txid, instrument_id)
);

REVOKE ALL ON TABLE sale_auth.sold_transition_authorization FROM PUBLIC;
ALTER TABLE sale_auth.sold_transition_authorization ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE sale_auth.sold_transition_authorization IS
  'One row = one instrument in one org authorized to cross from_status -> to_status in the current transaction (txid_current()) only. Created only by create_sale_atomic()/update_instrument_sale_transition_atomic() immediately before the specific UPDATE that performs the crossing; consumed (deleted) by the enforce_instrument_status_transition() trigger in the same statement that validates it, so each row authorizes exactly one UPDATE. Never read outside the transaction that inserted it: rows are gone by the time any other session could see them (uncommitted), and any row still present when this transaction ends is removed by COMMIT or ROLLBACK. No RLS policies are defined intentionally -- enabled-with-zero-policies denies all access to every role except the table owner (which is also the only role with any GRANT here), giving defense in depth if a table privilege is ever mistakenly granted later.';

-- ──────────────────────────────────────────────
-- Trigger: validate-and-consume the private authorization record instead
-- of trusting a caller-settable GUC. SECURITY DEFINER so it can reach
-- sale_auth regardless of which role's UPDATE fired it (authenticated,
-- service_role, or any future direct-DB caller) -- it still enforces the
-- exact instrument/org/from-status/to-status match before allowing
-- anything, so this grants no broader authority than before, only the
-- privilege to check.
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_instrument_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sale_auth, pg_temp
AS $$
DECLARE
  v_consumed_instrument_id UUID;
BEGIN
  IF NEW.status IS NULL OR OLD.status IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Fail closed on the Sold boundary unless a private, single-use
  -- authorization record for this exact instrument/org/transition exists
  -- in the current transaction. DELETE ... RETURNING both validates and
  -- consumes the record atomically, so it can never authorize a second
  -- UPDATE.
  IF (OLD.status = 'Sold' OR NEW.status = 'Sold') THEN
    DELETE FROM sale_auth.sold_transition_authorization
    WHERE txid          = txid_current()
      AND instrument_id = NEW.id
      AND org_id        = NEW.org_id
      AND from_status   = OLD.status
      AND to_status     = NEW.status
    RETURNING instrument_id INTO v_consumed_instrument_id;

    IF v_consumed_instrument_id IS NULL THEN
      RAISE EXCEPTION 'Invalid instrument status transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.status = 'Available' AND NEW.status IN ('Booked', 'Reserved', 'Maintenance', 'Sold') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Booked' AND NEW.status IN ('Available', 'Reserved', 'Sold') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Reserved' AND NEW.status IN ('Available', 'Booked', 'Sold') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Maintenance' AND NEW.status IN ('Available', 'Sold') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Sold' AND NEW.status IN ('Available', 'Booked', 'Reserved', 'Maintenance') THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Invalid instrument status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_instrument_status_transition() FROM PUBLIC;

-- ──────────────────────────────────────────────
-- Authorize + perform the non-Sold -> Sold crossing. Replaces the
-- set_config('app.instrument_sold_transition_authorized', 'on', true)
-- call with an INSERT of a record scoped to exactly this instrument,
-- org, and transition; the trigger consumes it in the very next
-- statement (the UPDATE immediately below). No "turn it back off"
-- statement is needed afterward -- there is nothing left to turn off.
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_sale_atomic(
  p_sale_price    NUMERIC,
  p_sale_date     DATE,
  p_client_id     UUID,
  p_instrument_id UUID,
  p_notes         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sale_auth, pg_temp
AS $$
DECLARE
  v_org_id                  UUID := public.org_id();
  v_sale_id                 UUID;
  v_instrument_status       TEXT;
  v_purchaser_connection_id UUID;
BEGIN
  IF v_org_id IS NULL         THEN RAISE EXCEPTION 'Organization context required'; END IF;
  IF NOT public.is_admin()    THEN RAISE EXCEPTION 'Admin role required'; END IF;
  IF p_sale_price IS NULL OR p_sale_price = 0 THEN RAISE EXCEPTION 'Sale price cannot be zero'; END IF;
  IF p_sale_price * 100 <> ROUND(p_sale_price * 100) THEN
    RAISE EXCEPTION 'Sale price cannot have more than two decimal places' USING ERRCODE = '22003';
  END IF;
  IF ABS(p_sale_price) > 1000000000 THEN
    RAISE EXCEPTION 'Sale price exceeds the maximum allowed amount' USING ERRCODE = '22003';
  END IF;

  IF p_instrument_id IS NOT NULL THEN
    SELECT status INTO v_instrument_status
    FROM public.instruments
    WHERE id = p_instrument_id AND org_id = v_org_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;
    IF v_instrument_status = 'Sold' THEN RAISE EXCEPTION 'Instrument is already sold'; END IF;

    -- Active (net-positive) sale lifecycle only — fully refunded history is OK.
    IF public.instrument_has_active_sale(p_instrument_id, v_org_id) THEN
      RAISE EXCEPTION 'Instrument already has a completed sale record';
    END IF;

    -- Lock every existing relationship row for this instrument up front so
    -- concurrent sale/connection writes for the same instrument serialize
    -- against this transaction instead of racing on the reconciliation below.
    PERFORM 1 FROM public.client_instruments
    WHERE instrument_id = p_instrument_id AND org_id = v_org_id
    FOR UPDATE;
  END IF;

  INSERT INTO public.sales_history (sale_price, sale_date, client_id, instrument_id, notes, org_id)
  VALUES (p_sale_price, p_sale_date, p_client_id, p_instrument_id, p_notes, v_org_id)
  RETURNING id INTO v_sale_id;

  IF p_instrument_id IS NOT NULL THEN
    INSERT INTO sale_auth.sold_transition_authorization (instrument_id, org_id, from_status, to_status)
    VALUES (p_instrument_id, v_org_id, v_instrument_status, 'Sold');

    UPDATE public.instruments
    SET status = 'Sold',
        reserved_reason        = NULL,
        reserved_by_user_id    = NULL,
        reserved_connection_id = NULL
    WHERE id = p_instrument_id AND org_id = v_org_id;

    IF p_client_id IS NOT NULL THEN
      SELECT id INTO v_purchaser_connection_id
      FROM public.client_instruments
      WHERE client_id = p_client_id AND instrument_id = p_instrument_id AND org_id = v_org_id
      ORDER BY created_at ASC, id ASC
      LIMIT 1;

      IF v_purchaser_connection_id IS NOT NULL THEN
        UPDATE public.client_instruments
        SET relationship_type = 'Sold'
        WHERE id = v_purchaser_connection_id;

        -- Remove any duplicate purchaser+instrument rows so only one
        -- canonical Sold relationship remains for the purchaser.
        DELETE FROM public.client_instruments
        WHERE client_id = p_client_id
          AND instrument_id = p_instrument_id
          AND org_id = v_org_id
          AND id <> v_purchaser_connection_id;
      ELSE
        INSERT INTO public.client_instruments (client_id, instrument_id, relationship_type, org_id)
        VALUES (p_client_id, p_instrument_id, 'Sold', v_org_id)
        RETURNING id INTO v_purchaser_connection_id;
      END IF;
    END IF;

    -- Reconcile every other client's active relationship for this
    -- instrument: Owned/Booked claims from anyone other than the purchaser
    -- can no longer be true once the instrument is Sold.
    DELETE FROM public.client_instruments
    WHERE instrument_id = p_instrument_id
      AND org_id = v_org_id
      AND relationship_type IN ('Owned', 'Booked')
      AND (v_purchaser_connection_id IS NULL OR id <> v_purchaser_connection_id);
  END IF;

  RETURN v_sale_id;
END;
$$;

-- ──────────────────────────────────────────────
-- Authorize + perform the Sold -> non-Sold crossing. Converted to
-- SECURITY DEFINER (from SECURITY INVOKER) so its body can reach
-- sale_auth regardless of caller; it already performed every one of its
-- own org/admin/instrument checks explicitly in code before touching
-- anything (see header comment), so this changes execution context, not
-- what is authorized.
--
-- Only the refund (Sold -> non-Sold) branch inserts an authorization
-- record here: the sell (non-Sold -> Sold) branch's crossing is fully
-- performed and authorized inside create_sale_atomic() above, called a
-- few lines below -- by the time control returns here the instrument is
-- already Sold, so the combined UPDATE at the bottom sets status back to
-- the same 'Sold' value (OLD.status = NEW.status), and the trigger
-- short-circuits before ever consulting sale_auth. Inserting a second,
-- redundant record for that branch here would never be consumed by any
-- trigger firing and would sit in the table, unconsumed, until this
-- transaction ends -- harmless (still removed by COMMIT/ROLLBACK, and
-- still unreachable by any other role or session) but pointless, so it
-- is deliberately not done.
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_instrument_sale_transition_atomic(
  p_instrument_id UUID,
  p_patch         JSONB   DEFAULT '{}'::jsonb,
  p_sale_price    NUMERIC DEFAULT NULL,
  p_sale_date     DATE    DEFAULT NULL,
  p_client_id     UUID    DEFAULT NULL,
  p_sales_note    TEXT    DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.instruments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sale_auth, pg_temp
AS $$
DECLARE
  v_org_id        UUID := public.org_id();
  v_current       public.instruments%ROWTYPE;
  v_result        public.instruments%ROWTYPE;
  v_next_status   TEXT;
  v_refund_source UUID;
BEGIN
  IF v_org_id IS NULL      THEN RAISE EXCEPTION 'Organization context required'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin role required'; END IF;

  SELECT * INTO v_current FROM public.instruments
  WHERE id = p_instrument_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;

  IF p_expected_updated_at IS NOT NULL THEN
    IF v_current.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'instrument_concurrency_conflict';
    END IF;
  END IF;

  v_next_status := COALESCE(NULLIF(p_patch->>'status', ''), v_current.status);

  IF v_current.status <> 'Sold' AND v_next_status = 'Sold' THEN
    IF p_sale_price IS NULL OR p_sale_price <= 0 THEN
      RAISE EXCEPTION 'Sale price must be a positive number when marking as Sold';
    END IF;
    IF p_sale_price * 100 <> ROUND(p_sale_price * 100) THEN
      RAISE EXCEPTION 'Sale price cannot have more than two decimal places' USING ERRCODE = '22003';
    END IF;
    IF p_sale_price > 1000000000 THEN
      RAISE EXCEPTION 'Sale price exceeds the maximum allowed amount' USING ERRCODE = '22003';
    END IF;
    PERFORM public.create_sale_atomic(
      p_sale_price, COALESCE(p_sale_date, CURRENT_DATE), p_client_id, p_instrument_id, p_sales_note
    );

  ELSIF v_current.status = 'Sold' AND v_next_status <> 'Sold' THEN
    v_refund_source := public.find_refundable_sale_for_update(p_instrument_id, v_org_id);

    IF v_refund_source IS NULL THEN
      RAISE EXCEPTION 'No refundable sale entry found for instrument';
    END IF;

    PERFORM public.create_sale_adjustment_atomic(v_refund_source, 'refund', p_sales_note);

    -- This function's own UPDATE below performs this crossing, so
    -- authorize it here, scoped to exactly this instrument/org/from/to.
    INSERT INTO sale_auth.sold_transition_authorization (instrument_id, org_id, from_status, to_status)
    VALUES (p_instrument_id, v_org_id, v_current.status, v_next_status);
  END IF;

  UPDATE public.instruments SET
    status                 = CASE WHEN p_patch ? 'status'                 THEN NULLIF(p_patch->>'status','')                            ELSE status                 END,
    maker                  = CASE WHEN p_patch ? 'maker'                  THEN p_patch->>'maker'                                         ELSE maker                  END,
    type                   = CASE WHEN p_patch ? 'type'                   THEN p_patch->>'type'                                          ELSE type                   END,
    subtype                = CASE WHEN p_patch ? 'subtype'                THEN p_patch->>'subtype'                                       ELSE subtype                END,
    year                   = CASE WHEN p_patch ? 'year'                   THEN NULLIF(p_patch->>'year','')::integer                      ELSE year                   END,
    certificate            = CASE WHEN p_patch ? 'certificate'            THEN NULLIF(p_patch->>'certificate','')::boolean               ELSE certificate            END,
    certificate_name       = CASE WHEN p_patch ? 'certificate_name'       THEN NULLIF(p_patch->>'certificate_name','')                   ELSE certificate_name       END,
    cost_price             = CASE WHEN p_patch ? 'cost_price'             THEN NULLIF(p_patch->>'cost_price','')::numeric                ELSE cost_price             END,
    consignment_price      = CASE WHEN p_patch ? 'consignment_price'      THEN NULLIF(p_patch->>'consignment_price','')::numeric         ELSE consignment_price      END,
    size                   = CASE WHEN p_patch ? 'size'                   THEN p_patch->>'size'                                          ELSE size                   END,
    weight                 = CASE WHEN p_patch ? 'weight'                 THEN p_patch->>'weight'                                        ELSE weight                 END,
    price                  = CASE WHEN p_patch ? 'price'                  THEN NULLIF(p_patch->>'price','')::numeric                     ELSE price                  END,
    ownership              = CASE WHEN p_patch ? 'ownership'              THEN p_patch->>'ownership'                                      ELSE ownership              END,
    note                   = CASE WHEN p_patch ? 'note'                   THEN p_patch->>'note'                                          ELSE note                   END,
    serial_number          = CASE WHEN p_patch ? 'serial_number'          THEN p_patch->>'serial_number'                                 ELSE serial_number          END,
    reserved_reason        = CASE WHEN p_patch ? 'reserved_reason'        THEN p_patch->>'reserved_reason'                               ELSE reserved_reason        END,
    reserved_by_user_id    = CASE WHEN p_patch ? 'reserved_by_user_id'    THEN NULLIF(p_patch->>'reserved_by_user_id','')::uuid          ELSE reserved_by_user_id    END,
    reserved_connection_id = CASE WHEN p_patch ? 'reserved_connection_id' THEN NULLIF(p_patch->>'reserved_connection_id','')::uuid       ELSE reserved_connection_id END
  WHERE id = p_instrument_id AND org_id = v_org_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
