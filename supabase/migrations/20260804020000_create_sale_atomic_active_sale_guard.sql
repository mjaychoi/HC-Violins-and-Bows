-- ============================================================
-- Allow resale after a fully refunded sale lifecycle.
--
-- Old create_sale_atomic guard:
--   EXISTS (sales_history WHERE instrument_id = ? AND sale_price > 0)
-- blocked any historical positive row, including fully refunded sales
-- and undo_refund rows.
--
-- New guard: an instrument may have at most one active (net-positive)
-- sale lifecycle. Fully refunded cycles (net <= 0) do not block resale.
--
-- Also aligns update_instrument_sale_transition_atomic's refundable-sale
-- selection with the same net-amount definition, and permits Sold ->
-- non-Sold instrument status transitions required by the refund path.
-- (Today, before this migration, public.enforce_instrument_status_transition
-- -- see 00000000000058_enforce_status_transitions.sql -- unconditionally
-- RAISEs on any OLD.status = 'Sold' transition, so the refund branch's own
-- final UPDATE at the bottom of update_instrument_sale_transition_atomic
-- always fails. This migration only removes that unconditional block; it
-- does not yet add authorization to replace it, which is why the very next
-- migration in this chain (20260804030000) exists and both migrations ship
-- in the same PR/deploy.)
--
-- Baseline for create_sale_atomic and update_instrument_sale_transition_atomic
-- below is 20260804010000_enforce_sale_price_precision_and_maximum.sql, the
-- latest origin/main definition (itself unchanged from
-- 20260801160100_reconcile_relationships_on_sale.sql /
-- 20260728153000_sale_transition_certificate_name.sql other than the added
-- precision/maximum checks) -- NOT the older pre-reconciliation,
-- pre-certificate_name body. Only the guard predicate and the
-- refundable-sale lookup predicate change here; price validation,
-- purchaser-relationship normalization/dedup, stale Owned/Booked cleanup,
-- and certificate_name patch handling are preserved unchanged.
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

-- Permit Sold → non-Sold so update_instrument_sale_transition_atomic can
-- restore availability after refunding. This intermediate step is
-- deliberately unauthorized/unconditional (any direct UPDATE can now cross
-- the boundary in either direction) -- fail-closed authorization is added
-- by 20260804030000_restore_instrument_sold_boundary_fail_closed.sql, the
-- very next migration in this chain. The two ship together in the same PR
-- specifically because this intermediate state is not safe on its own.
CREATE OR REPLACE FUNCTION public.enforce_instrument_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NULL OR OLD.status IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
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
    -- Active (net-positive) sale lifecycle only, same definition as the
    -- resale guard above — replaces the old NOT EXISTS(refund row) check,
    -- which never matched undo_refund reversal of a refund.
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
