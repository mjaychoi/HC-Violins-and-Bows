-- ============================================================
-- Fix: refund path silently broken for real (RLS-bound) callers.
--
-- public.sales_history intentionally has no UPDATE RLS policy (see
-- "UPDATE and DELETE intentionally omitted: use atomic RPCs only" in
-- 00000000000002_rls_policies.sql) — only SECURITY DEFINER RPCs are
-- meant to write it. But update_instrument_sale_transition_atomic is
-- SECURITY INVOKER, and its refund branch does
-- `SELECT sh.id ... FROM public.sales_history ... FOR UPDATE`
-- directly. Under RLS, SELECT ... FOR UPDATE requires BOTH the SELECT
-- policy and the UPDATE policy's USING clause to pass for a row to be
-- locked/returned; with no UPDATE policy at all, that lookup always
-- returns zero rows for the `authenticated` role — regardless of org,
-- admin status, or whether a refundable sale actually exists. Every
-- real refund/unsell request through the HTTP API (which uses the
-- user-scoped, RLS-bound Supabase client) fails with
-- 'No refundable sale entry found for instrument', even when a valid
-- one exists. This predates the resale migration — it has been present
-- since update_instrument_sale_transition_atomic was first introduced
-- (00000000000037) — and was masked because the existing SQL test
-- harness (scripts/supabase/create_sale_atomic_resale.test.sql) runs as
-- the connecting superuser, which bypasses RLS entirely.
--
-- Fix: move the refund-source lookup+lock into a SECURITY DEFINER
-- helper, matching the existing pattern used by create_sale_atomic and
-- create_sale_adjustment_atomic — it bypasses RLS via ownership but
-- still explicitly scopes every row by the org_id the SECURITY INVOKER
-- caller already resolved via public.org_id(), so it grants no broader
-- access than the caller already has. This intentionally does NOT add
-- an UPDATE policy to sales_history, which would let ordinary admin
-- callers write sales_history rows directly outside the RPCs.
--
-- update_instrument_sale_transition_atomic below otherwise keeps every
-- behavior from 20260804030000 unchanged: sale-price precision/maximum
-- checks, the net-amount refundable-sale definition, the GUC-gated
-- Sold-boundary crossing, and certificate_name patch handling.
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
    v_refund_source := public.find_refundable_sale_for_update(p_instrument_id, v_org_id);

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
