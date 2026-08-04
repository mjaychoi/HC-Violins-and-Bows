-- ============================================================
-- Harden the sale/refund lifecycle: allow resale after a fully refunded
-- sale, restore fail-closed enforcement of the instrument `Sold`
-- boundary, and fix a real-caller RLS gap in the refund-source lookup.
--
-- This migration ships PR #78's baseline (20260804010000) directly to
-- the final secure state in one atomic step. It replaces what was
-- originally drafted as a four-migration chain
-- (...020000/...030000/...040000/...050000) whose intermediate steps
-- were each individually unsafe on their own:
--   - after step 1 alone, any direct UPDATE could cross the Sold
--     boundary with no authorization check at all;
--   - after steps 2-3 alone, the Sold boundary was gated by a custom
--     GUC (app.instrument_sold_transition_authorized) that any
--     `authenticated` or `service_role` caller could forge directly via
--     `set_config(...)` before an ordinary UPDATE.
-- Because Supabase applies pending migrations in timestamp order and
-- commits each one to schema_migrations independently, a deploy that
-- stopped partway through that chain (e.g. a later migration failing)
-- could leave one of those unsafe intermediate states permanently
-- applied. Folding all four steps into one migration/rollback pair
-- removes that window entirely: this migration either fully applies or
-- fully fails, and the matching rollback restores the exact pre-chain
-- (PR #78) state in one step. The sections below are kept separate only
-- for readability; they are not independently revertable.
--
-- Baseline for create_sale_atomic and update_instrument_sale_transition_atomic
-- is 20260804010000_enforce_sale_price_precision_and_maximum.sql, the
-- latest origin/main definition (itself unchanged from
-- 20260801160100_reconcile_relationships_on_sale.sql /
-- 20260728153000_sale_transition_certificate_name.sql other than the added
-- precision/maximum checks). Price validation, purchaser-relationship
-- normalization/dedup, stale Owned/Booked cleanup, and certificate_name
-- patch handling are preserved unchanged throughout.
-- ============================================================

-- ============================================================
-- Section 1: active/net-amount sale lifecycle definition.
--
-- Old create_sale_atomic guard:
--   EXISTS (sales_history WHERE instrument_id = ? AND sale_price > 0)
-- blocked any historical positive row, including fully refunded sales
-- and undo_refund rows. New guard: an instrument may have at most one
-- active (net-positive) sale lifecycle. Fully refunded cycles
-- (net <= 0) do not block resale.
-- ============================================================

-- Net remaining amount for one sale lifecycle:
-- sale row + direct children (refund/adjustment) + children of those
-- children (undo_refund linked to a refund).
CREATE OR REPLACE FUNCTION public.sale_lifecycle_net_amount(
  p_sale_id UUID,
  p_org_id UUID
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT sh.sale_price
        + COALESCE(
          (
            SELECT SUM(adj.sale_price)
            FROM public.sales_history AS adj
            WHERE adj.org_id = p_org_id
              AND (
                adj.adjustment_of_sale_id = sh.id
                OR adj.adjustment_of_sale_id IN (
                  SELECT mid.id
                  FROM public.sales_history AS mid
                  WHERE mid.adjustment_of_sale_id = sh.id
                    AND mid.org_id = p_org_id
                )
              )
          ),
          0
        )
      FROM public.sales_history AS sh
      WHERE sh.id = p_sale_id
        AND sh.org_id = p_org_id
        AND sh.entry_kind = 'sale'
    ),
    0
  );
$$;

COMMENT ON FUNCTION public.sale_lifecycle_net_amount(UUID, UUID) IS
  'Net amount of a sale lifecycle (sale + linked refund/adjustment/undo_refund rows). > 0 means active/unrefunded.';

REVOKE ALL ON FUNCTION public.sale_lifecycle_net_amount(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sale_lifecycle_net_amount(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sale_lifecycle_net_amount(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.instrument_has_active_sale(
  p_instrument_id UUID,
  p_org_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales_history AS sh
    WHERE sh.instrument_id = p_instrument_id
      AND sh.org_id = p_org_id
      AND sh.entry_kind = 'sale'
      AND public.sale_lifecycle_net_amount(sh.id, p_org_id) > 0
  );
$$;

COMMENT ON FUNCTION public.instrument_has_active_sale(UUID, UUID) IS
  'True when the instrument has at least one sale lifecycle with net amount > 0.';

REVOKE ALL ON FUNCTION public.instrument_has_active_sale(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.instrument_has_active_sale(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.instrument_has_active_sale(UUID, UUID) TO service_role;

-- ============================================================
-- Section 2: private, transaction-scoped Sold-boundary authorization.
--
-- public.enforce_instrument_status_transition (00000000000058) must be
-- fail-closed on any transition into or out of 'Sold' -- crossing that
-- boundary must only be possible from inside create_sale_atomic()/
-- update_instrument_sale_transition_atomic(), which already enforce
-- org_id()/is_admin() before doing anything else. A custom GUC is not a
-- safe way to express that: any role that can run SQL in its own
-- transaction -- including `authenticated` and `service_role` -- could
-- set a GUC directly and then perform an ordinary UPDATE across the
-- boundary in the same transaction, with the trigger unable to tell that
-- caller-set value apart from one set internally.
--
-- Fix: a private schema/table that no role reachable via PostgREST or a
-- direct database session (authenticated, service_role, anon, PUBLIC) is
-- ever granted any privilege on -- no caller can INSERT/UPDATE/DELETE a
-- row in it no matter what SQL they run. A record in
-- sale_auth.sold_transition_authorization authorizes exactly one
-- instrument, in one org, crossing from one specific status to one
-- specific status, in the current transaction only (keyed by
-- txid_current()). The trigger deletes-and-validates the matching row in
-- a single statement, so a record can be consumed at most once; anything
-- left unconsumed when the transaction ends is removed by COMMIT or
-- ROLLBACK, whichever ends the transaction that inserted it.
--
-- Column privilege separation on `status` was evaluated and rejected:
-- update_instrument_sale_transition_atomic's own combined UPDATE always
-- lists `status` in its SET clause (even when unchanged) so the RPC
-- could no longer write it either, and executeInstrumentPatch.ts also
-- does legitimate direct `.from('instruments').update({status: ...})`
-- calls for ordinary non-Sold transitions (Available<->Booked<->
-- Reserved<->Maintenance) -- revoking column UPDATE privilege on
-- `status` from `authenticated` would break that existing, intentional
-- direct-write path, not just the Sold boundary.
-- ============================================================

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

-- ============================================================
-- Section 3: RLS-safe refund-source lookup.
--
-- public.sales_history intentionally has no UPDATE RLS policy (see
-- "UPDATE and DELETE intentionally omitted: use atomic RPCs only" in
-- 00000000000002_rls_policies.sql) -- only SECURITY DEFINER RPCs are
-- meant to write it. update_instrument_sale_transition_atomic's refund
-- branch needs `SELECT ... FOR UPDATE` on sales_history; under RLS that
-- requires BOTH the SELECT policy and the UPDATE policy's USING clause
-- to pass, so with no UPDATE policy at all it always returns zero rows
-- for the `authenticated` role -- regardless of org, admin status, or
-- whether a refundable sale actually exists. This predates this
-- migration (it has been present since update_instrument_sale_transition_atomic
-- was first introduced, 00000000000037) and was masked because the
-- existing SQL test harness (scripts/supabase/create_sale_atomic_resale.test.sql)
-- runs as the connecting superuser, which bypasses RLS entirely.
--
-- Fix: move the refund-source lookup+lock into a SECURITY DEFINER
-- helper, matching the existing pattern used by create_sale_atomic and
-- create_sale_adjustment_atomic -- it bypasses RLS via ownership but
-- still explicitly scopes every row by the org_id the caller already
-- resolved via public.org_id(), so it grants no broader access than the
-- caller already has. This intentionally does NOT add an UPDATE policy
-- to sales_history, which would let ordinary admin callers write
-- sales_history rows directly outside the RPCs.
-- ============================================================

CREATE OR REPLACE FUNCTION public.find_refundable_sale_for_update(
  p_instrument_id UUID,
  p_org_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale_id UUID;
BEGIN
  SELECT sh.id INTO v_sale_id
  FROM public.sales_history AS sh
  WHERE sh.instrument_id = p_instrument_id
    AND sh.org_id = p_org_id
    AND sh.entry_kind = 'sale'
    AND public.sale_lifecycle_net_amount(sh.id, p_org_id) > 0
  ORDER BY sh.sale_date DESC, sh.created_at DESC
  LIMIT 1
  FOR UPDATE;

  RETURN v_sale_id;
END;
$$;

COMMENT ON FUNCTION public.find_refundable_sale_for_update(UUID, UUID) IS
  'Locks and returns the most recent net-positive sale for an instrument, scoped to the given org. SECURITY DEFINER so it can lock sales_history, which has no RLS UPDATE policy by design.';

REVOKE ALL ON FUNCTION public.find_refundable_sale_for_update(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_refundable_sale_for_update(UUID, UUID) TO authenticated;

-- ============================================================
-- Section 4: create_sale_atomic / update_instrument_sale_transition_atomic,
-- final state -- active-sale resale guard (Section 1), private
-- Sold-boundary authorization (Section 2), and the RLS-safe refund
-- lookup (Section 3) all wired together. Both converted to (or already)
-- SECURITY DEFINER so their bodies can reach the private sale_auth
-- schema regardless of which role's call fired them; both already
-- performed every one of their own org/admin/instrument checks
-- explicitly in code before touching anything, so RLS was never their
-- sole safeguard and this changes execution context, not what is
-- authorized. Both remain granted EXECUTE only to `authenticated`,
-- unchanged from their existing grants (not reissued here since
-- CREATE OR REPLACE preserves grants for an unchanged signature).
-- ============================================================

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

-- Only the refund (Sold -> non-Sold) branch inserts an authorization
-- record here: the sell (non-Sold -> Sold) branch's crossing is fully
-- performed and authorized inside create_sale_atomic() above, called a
-- few lines below -- by the time control returns here the instrument is
-- already Sold, so the combined UPDATE at the bottom sets status back to
-- the same 'Sold' value (OLD.status = NEW.status), and the trigger
-- short-circuits before ever consulting sale_auth.
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
