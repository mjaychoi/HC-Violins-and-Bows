-- ============================================================
-- Close two DB-level gaps in the sale-price contract found while unifying
-- price validation across PATCH /api/instruments and POST/PATCH /api/sales:
--
-- 1. sales_history.sale_price is NUMERIC(12,2). That column type guarantees
--    any STORED row has at most 2 decimal places -- but it enforces this by
--    ROUNDING on assignment, not by rejecting, and the rounding happens at
--    bind time, before any CHECK constraint or trigger ever sees the value.
--    RPC parameters (e.g. create_sale_atomic's p_sale_price NUMERIC) are NOT
--    scale-constrained, so a caller bypassing the API (direct RPC call,
--    future code, a service-role script) could pass 99.999 and have it
--    silently become 100.00 in storage with no error at any layer. The new
--    application-layer shared validator (src/utils/salePriceRules.ts) now
--    rejects such input before it ever reaches these RPCs, but that is only
--    a guarantee for the two HTTP entrypoints that call it -- it is not a
--    database-level guarantee. This migration adds an explicit precision
--    check inside the RPC bodies themselves (where the un-rounded NUMERIC
--    parameter is still available) so any caller of these functions gets the
--    same fail-closed "reject, don't round" behavior, not just the two API
--    routes.
--
-- 2. No maximum was enforced anywhere below the API layer. MAX_SALE_PRICE_ABS
--    (sales/route.ts) and MAX_MONEY_AMOUNT (invoices/financialValidation.ts)
--    both independently use 1_000_000_000 -- the strongest existing
--    intentional limit in the repo. PATCH /api/instruments' sale_transition
--    had no max at all before this change. This migration adds the same
--    $1,000,000,000 magnitude cap as a table CHECK constraint (defense in
--    depth against any insert path, not just the RPCs) and inside the RPCs
--    (so the error is a clean, early RAISE EXCEPTION instead of a raw
--    constraint violation surfacing through PostgREST).
--
-- Explicitly NOT added: a CHECK constraint requiring entry_kind='sale' rows
-- to be sale_price > 0. POST /api/sales intentionally allows a negative
-- amount to record a standalone refund-style entry directly (entry_kind
-- stays 'sale' -- see SaleForm.tsx "Amount (negative for refund)" and the
-- permanent test "should allow negative sale_price for refunds"), a
-- pre-existing, documented product decision this migration does not change
-- or silently override. Adding that constraint would make every such row
-- (existing or future) violate it. What IS added below is the sign
-- constraint for 'refund'/'undo_refund' rows, which are exclusively produced
-- by create_sale_adjustment_atomic's own -ABS()/ABS() logic and have never
-- been violated by any code path.
--
-- Nothing here changes sale/refund/resale lifecycle semantics, Sold-boundary
-- enforcement, or authorization -- only what numeric values are accepted.
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. create_sale_atomic: add precision + maximum checks alongside the
--    existing zero check. Signature and every other behavior unchanged from
--    20260801160100_reconcile_relationships_on_sale.sql, the latest
--    origin/main definition.
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
    IF EXISTS (
      SELECT 1 FROM public.sales_history
      WHERE instrument_id = p_instrument_id AND org_id = v_org_id AND sale_price > 0
    ) THEN
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

-- ──────────────────────────────────────────────
-- 2. update_instrument_sale_transition_atomic: add the same precision +
--    maximum checks to the existing "must be positive when marking Sold"
--    check on the sell branch. Everything else unchanged from
--    20260728153000_sale_transition_certificate_name.sql, the latest
--    origin/main definition.
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
    SELECT sh.id INTO v_refund_source
    FROM public.sales_history AS sh
    WHERE sh.instrument_id = p_instrument_id
      AND sh.org_id = v_org_id
      AND sh.entry_kind = 'sale'
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_history AS r
        WHERE r.adjustment_of_sale_id = sh.id
          AND r.org_id = v_org_id
          AND r.entry_kind = 'refund'
      )
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

-- ──────────────────────────────────────────────
-- 3. Table-level CHECK constraints (defense in depth for any insert path,
--    not just the two RPCs above). Added NOT VALID + validated separately so
--    this does not take a long-held table lock while scanning existing rows
--    -- see "Locks and table-scan implications" in the deliverable report.
-- ──────────────────────────────────────────────

ALTER TABLE public.sales_history
  ADD CONSTRAINT sales_history_sale_price_max_magnitude
  CHECK (ABS(sale_price) <= 1000000000)
  NOT VALID;

ALTER TABLE public.sales_history
  ADD CONSTRAINT sales_history_refund_sign_check
  CHECK (entry_kind <> 'refund' OR sale_price < 0)
  NOT VALID;

ALTER TABLE public.sales_history
  ADD CONSTRAINT sales_history_undo_refund_sign_check
  CHECK (entry_kind <> 'undo_refund' OR sale_price > 0)
  NOT VALID;

ALTER TABLE public.sales_history VALIDATE CONSTRAINT sales_history_sale_price_max_magnitude;
ALTER TABLE public.sales_history VALIDATE CONSTRAINT sales_history_refund_sign_check;
ALTER TABLE public.sales_history VALIDATE CONSTRAINT sales_history_undo_refund_sign_check;

COMMENT ON CONSTRAINT sales_history_sale_price_max_magnitude ON public.sales_history IS
  'Shared sale-price maximum (src/utils/salePriceRules.ts SALE_PRICE_MAX_MAGNITUDE), symmetric so it also bounds the documented negative standalone-refund-entry carve-out on POST /api/sales.';

COMMENT ON CONSTRAINT sales_history_refund_sign_check ON public.sales_history IS
  'refund rows are always created by create_sale_adjustment_atomic as -ABS(source.sale_price); this constraint only makes that existing invariant fail-closed against any other insert path.';

COMMENT ON CONSTRAINT sales_history_undo_refund_sign_check ON public.sales_history IS
  'undo_refund rows are always created by create_sale_adjustment_atomic as ABS(source.sale_price); this constraint only makes that existing invariant fail-closed against any other insert path.';
