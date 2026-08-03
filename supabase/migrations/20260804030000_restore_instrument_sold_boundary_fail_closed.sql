-- ============================================================
-- Restore fail-closed enforcement across the instrument `Sold` boundary.
--
-- 20260804020000_create_sale_atomic_active_sale_guard.sql relaxed
-- enforce_instrument_status_transition() so that ANY OLD.status = 'Sold'
-- row could transition to Available/Booked/Reserved/Maintenance via an
-- ordinary UPDATE public.instruments, with no requirement that a refund
-- row be created first. Combined with the pre-existing (and equally
-- unguarded) non-Sold -> 'Sold' transitions, an admin-scoped direct
-- table UPDATE — which RLS policy instruments_update permits for any
-- admin in their own org — could mark an instrument Sold or un-Sold
-- with no corresponding sales_history row at all. Triggers run for every
-- caller (including service_role and RLS-bypassing roles), so this is
-- the correct place to close the gap; the HTTP API's own checks in
-- executeInstrumentPatch.ts are not a substitute, since they don't
-- constrain direct database writes.
--
-- Fix: the trigger is fail-closed by default on any transition into or
-- out of 'Sold'. Crossing that boundary is permitted only when a
-- transaction-local GUC (app.instrument_sold_transition_authorized) is
-- set to 'on'. That GUC is set exclusively inside create_sale_atomic()
-- and update_instrument_sale_transition_atomic() — both of which already
-- enforce org_id()/is_admin() before doing anything else — immediately
-- before the specific UPDATE that performs the crossing, and cleared
-- right after. Properties:
--   * transaction-local:      set_config(..., true) scopes it to the
--                              current transaction; it is not visible to
--                              other sessions or later transactions.
--   * default disabled:       current_setting(..., true) returns NULL
--                              (treated as 'off') when never set.
--   * not client-controlled:  the GUC name is not an RPC parameter, so
--                              no caller can set it through ordinary
--                              function arguments; only the two
--                              functions above ever call set_config for it.
--   * authorized-only:        set only after org_id()/is_admin() checks
--                              pass inside those two functions.
--   * auto-cleared:            is_local=true GUCs reset automatically at
--                              transaction end regardless of commit/rollback,
--                              and both functions also explicitly turn it
--                              back off immediately after the guarded UPDATE.
--   * narrowly scoped:         the trigger only consults this GUC when
--                              OLD.status or NEW.status is 'Sold'; every
--                              other transition is governed exactly as
--                              before, unaffected by the flag.
--
-- KNOWN LIMITATION, closed by the next migration in this chain
-- (20260804050000_replace_sold_boundary_guc_with_private_authorization.sql):
-- a custom GUC is caller-settable by any role that can run SQL in its own
-- transaction (`SELECT set_config('app.instrument_sold_transition_authorized',
-- 'on', true)` followed by an ordinary UPDATE), including `authenticated`
-- and `service_role`. This migration still closes the larger gap (an
-- ordinary UPDATE with no set_config at all previously worked
-- unconditionally); it does not yet defend against a caller who
-- deliberately forges the GUC. Both migrations ship in the same PR.
--
-- create_sale_atomic and update_instrument_sale_transition_atomic below
-- otherwise keep every behavior from 20260804020000 unchanged: sale-price
-- precision/maximum checks, the active-sale-lifecycle resale guard,
-- purchaser-relationship normalization/dedup, stale Owned/Booked cleanup,
-- and certificate_name patch handling.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_instrument_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NULL OR OLD.status IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Fail closed on the Sold boundary unless the atomic sale/refund RPC
  -- has explicitly authorized this transaction to cross it.
  IF (OLD.status = 'Sold' OR NEW.status = 'Sold')
     AND COALESCE(current_setting('app.instrument_sold_transition_authorized', true), 'off') <> 'on'
  THEN
    RAISE EXCEPTION 'Invalid instrument status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
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

-- Authorize + perform the non-Sold -> Sold crossing around the single
-- UPDATE that sets it. (create_sale_atomic is also reached via
-- create_sale_atomic_idempotent, which just calls this function.)
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
SET search_path = public, pg_temp
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
    PERFORM set_config('app.instrument_sold_transition_authorized', 'on', true);

    UPDATE public.instruments
    SET status = 'Sold',
        reserved_reason        = NULL,
        reserved_by_user_id    = NULL,
        reserved_connection_id = NULL
    WHERE id = p_instrument_id AND org_id = v_org_id;

    PERFORM set_config('app.instrument_sold_transition_authorized', 'off', true);

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

-- Authorize + perform the Sold -> non-Sold crossing around the single
-- combined UPDATE at the bottom of this function. (The non-Sold -> Sold
-- crossing already happened, and was already authorized, inside
-- create_sale_atomic above; by the time this function's own UPDATE runs
-- for that case the row is already Sold, so NEW.status = OLD.status and
-- the trigger short-circuits before consulting the flag at all — the
-- flag is set here too only as harmless defense in depth.)
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
SECURITY INVOKER
AS $$
DECLARE
  v_org_id                UUID := public.org_id();
  v_current               public.instruments%ROWTYPE;
  v_result                public.instruments%ROWTYPE;
  v_next_status           TEXT;
  v_refund_source         UUID;
  v_crosses_sold_boundary BOOLEAN;
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
  v_crosses_sold_boundary :=
    (v_current.status <> 'Sold' AND v_next_status = 'Sold')
    OR (v_current.status = 'Sold' AND v_next_status <> 'Sold');

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
    SELECT sh.id INTO v_refund_source
    FROM public.sales_history AS sh
    WHERE sh.instrument_id = p_instrument_id
      AND sh.org_id = v_org_id
      AND sh.entry_kind = 'sale'
      AND public.sale_lifecycle_net_amount(sh.id, v_org_id) > 0
    ORDER BY sh.sale_date DESC, sh.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_refund_source IS NULL THEN
      RAISE EXCEPTION 'No refundable sale entry found for instrument';
    END IF;

    PERFORM public.create_sale_adjustment_atomic(v_refund_source, 'refund', p_sales_note);
  END IF;

  IF v_crosses_sold_boundary THEN
    PERFORM set_config('app.instrument_sold_transition_authorized', 'on', true);
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

  IF v_crosses_sold_boundary THEN
    PERFORM set_config('app.instrument_sold_transition_authorized', 'off', true);
  END IF;

  RETURN v_result;
END;
$$;
