-- ============================================================
-- V7-003 — enforce same-org member/admin financial confidentiality at the
-- database authorization boundary (not just application UI/API behavior).
--
-- Prior state: instruments/sales_history/invoices/invoice_items SELECT RLS
-- policies (00000000000002_rls_policies.sql) are org-scoped only
-- (`org_id = public.org_id()`), with no admin/member distinction. Table
-- privileges on `instruments` (20260728173358) and the platform default
-- privileges on `sales_history`/`invoices`/`invoice_items` grant `authenticated`
-- blanket column access. The application layer (see
-- src/app/api/instruments/route.ts, src/app/api/sales/route.ts) already
-- redacts cost_price/consignment_price/sale_price for non-admin callers in
-- JS *after* the Postgres query already read them — a same-org member who
-- queries PostgREST directly (bypassing the app route) can read those
-- columns today. `invoices`/`invoice_items` are admin-only by shipped
-- product behavior (every app route requires admin) but the DB SELECT
-- policy does not enforce that — a same-org member can read invoice
-- financial rows directly via PostgREST.
--
-- Fix, two mechanisms because RLS is row-scoped and cannot mask columns:
--   1. ROW boundary (invoices/invoice_items): SELECT policy now also
--      requires public.is_admin() — these tables are admin-only end to end,
--      matching shipped product behavior (no member-reachable route exists
--      for them; see PR description).
--   2. COLUMN boundary (instruments.cost_price/consignment_price,
--      sales_history.sale_price): admins and members share the single
--      `authenticated` Postgres role, so column-level GRANT/REVOKE cannot by
--      itself distinguish them. We REVOKE the sensitive columns from
--      `authenticated` entirely (blocking direct base-table reads for
--      everyone, admin included) and expose them only through new
--      SECURITY DEFINER functions that check public.is_admin() and
--      public.org_id() internally before returning any row. Admin-facing
--      app routes are updated to call these functions instead of reading
--      the columns off the base table directly.
--
-- Also closes a related direct-RPC bypass: public.sale_lifecycle_net_amount
-- is SECURITY INVOKER and returns a raw sale_price sum with no is_admin()
-- check; any authenticated member can call it directly today and recover
-- the real sale amount. Its only legitimate caller
-- (public.instrument_has_active_sale, called only from the
-- SECURITY DEFINER trigger public.enforce_instrument_status_transition)
-- already runs under that trigger's owner-elevated identity, so revoking
-- direct `authenticated` EXECUTE on sale_lifecycle_net_amount does not
-- affect it.
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. INSTRUMENTS — column-level financial confidentiality
-- ──────────────────────────────────────────────

-- Remove the blanket all-columns SELECT granted in
-- 20260728173358_client_rpc_authenticated_runtime_compatibility.sql.
REVOKE SELECT ON TABLE public.instruments FROM authenticated;

-- Re-grant SELECT on every column except cost_price/consignment_price.
GRANT SELECT (
  id, org_id, type, maker, subtype, year, certificate,
  size, weight, price, ownership, note, serial_number, status,
  reserved_reason, reserved_by_user_id, reserved_connection_id,
  created_at, updated_at
) ON public.instruments TO authenticated;

CREATE OR REPLACE FUNCTION public.get_instruments_financials(
  p_instrument_ids UUID[]
)
RETURNS TABLE (id UUID, cost_price NUMERIC, consignment_price NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.cost_price, i.consignment_price
  FROM public.instruments AS i
  WHERE i.id = ANY(p_instrument_ids)
    AND i.org_id = public.org_id()
    AND public.is_admin();
$$;

COMMENT ON FUNCTION public.get_instruments_financials(UUID[]) IS
  'Admin-only, org-scoped instrument cost_price/consignment_price lookup. Returns zero rows for non-admin callers or ids outside the caller org.';

REVOKE ALL ON FUNCTION public.get_instruments_financials(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_instruments_financials(UUID[]) TO authenticated;

-- ──────────────────────────────────────────────
-- 2. SALES_HISTORY — column-level financial confidentiality
-- ──────────────────────────────────────────────

-- No tracked migration previously issued a table-level grant for
-- sales_history; its current authenticated/anon access comes from the
-- platform default privilege. Revoke it explicitly and re-grant only what
-- shipped product behavior needs: safe-column SELECT (no sale_price) for
-- everyone, plus INSERT (admin-gated by the existing sales_history_insert
-- RLS policy's WITH CHECK public.is_admin()). No UPDATE/DELETE policy
-- exists on this table (writes go through atomic RPCs only), so no
-- UPDATE/DELETE table privilege is re-granted.
REVOKE ALL ON TABLE public.sales_history FROM authenticated, anon;

GRANT SELECT (
  id, org_id, instrument_id, client_id, sale_date, notes,
  entry_kind, adjustment_of_sale_id, created_at, updated_at
) ON public.sales_history TO authenticated;

GRANT INSERT ON public.sales_history TO authenticated;

CREATE OR REPLACE FUNCTION public.get_sales_financials(
  p_sale_ids UUID[]
)
RETURNS TABLE (id UUID, sale_price NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT sh.id, sh.sale_price
  FROM public.sales_history AS sh
  WHERE sh.id = ANY(p_sale_ids)
    AND sh.org_id = public.org_id()
    AND public.is_admin();
$$;

COMMENT ON FUNCTION public.get_sales_financials(UUID[]) IS
  'Admin-only, org-scoped sales_history sale_price lookup. Returns zero rows for non-admin callers or ids outside the caller org.';

REVOKE ALL ON FUNCTION public.get_sales_financials(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sales_financials(UUID[]) TO authenticated;

-- Replaces the two ad hoc PostgREST aggregate queries in
-- fetchSalesTotals() (src/app/api/sales/route.ts), which read sale_price
-- directly via the caller's own privileges and would fail for every caller
-- (admin included) once sale_price is no longer a directly-selectable
-- column for the shared authenticated role.
CREATE OR REPLACE FUNCTION public.get_sales_totals(
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_has_client BOOLEAN DEFAULT NULL,
  p_instrument_id UUID DEFAULT NULL
)
RETURNS TABLE (revenue NUMERIC, avg_ticket NUMERIC, refund_total NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(
      (SELECT SUM(sh.sale_price)
       FROM public.sales_history AS sh
       WHERE sh.org_id = public.org_id()
         AND public.is_admin()
         AND sh.sale_price > 0
         AND (p_from_date IS NULL OR sh.sale_date >= p_from_date)
         AND (p_to_date IS NULL OR sh.sale_date <= p_to_date)
         AND (p_search IS NULL OR sh.notes ILIKE '%' || p_search || '%')
         AND (
           p_has_client IS NULL
           OR (p_has_client AND sh.client_id IS NOT NULL)
           OR (NOT p_has_client AND sh.client_id IS NULL)
         )
         AND (p_instrument_id IS NULL OR sh.instrument_id = p_instrument_id)
      ), 0
    ) AS revenue,
    COALESCE(
      (SELECT AVG(sh.sale_price)
       FROM public.sales_history AS sh
       WHERE sh.org_id = public.org_id()
         AND public.is_admin()
         AND sh.sale_price > 0
         AND (p_from_date IS NULL OR sh.sale_date >= p_from_date)
         AND (p_to_date IS NULL OR sh.sale_date <= p_to_date)
         AND (p_search IS NULL OR sh.notes ILIKE '%' || p_search || '%')
         AND (
           p_has_client IS NULL
           OR (p_has_client AND sh.client_id IS NOT NULL)
           OR (NOT p_has_client AND sh.client_id IS NULL)
         )
         AND (p_instrument_id IS NULL OR sh.instrument_id = p_instrument_id)
      ), 0
    ) AS avg_ticket,
    COALESCE(
      (SELECT SUM(sh.sale_price)
       FROM public.sales_history AS sh
       WHERE sh.org_id = public.org_id()
         AND public.is_admin()
         AND sh.sale_price < 0
         AND (p_from_date IS NULL OR sh.sale_date >= p_from_date)
         AND (p_to_date IS NULL OR sh.sale_date <= p_to_date)
         AND (p_search IS NULL OR sh.notes ILIKE '%' || p_search || '%')
         AND (
           p_has_client IS NULL
           OR (p_has_client AND sh.client_id IS NOT NULL)
           OR (NOT p_has_client AND sh.client_id IS NULL)
         )
         AND (p_instrument_id IS NULL OR sh.instrument_id = p_instrument_id)
      ), 0
    ) AS refund_total;
$$;

COMMENT ON FUNCTION public.get_sales_totals(DATE, DATE, TEXT, BOOLEAN, UUID) IS
  'Admin-only, org-scoped sales revenue/avg-ticket/refund aggregate. Returns zero totals for non-admin callers.';

REVOKE ALL ON FUNCTION public.get_sales_totals(DATE, DATE, TEXT, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sales_totals(DATE, DATE, TEXT, BOOLEAN, UUID) TO authenticated;

-- Replaces the raw sale_price.sum()/client_id.count()/sale_date.max()
-- PostgREST aggregate in src/app/api/clients/analytics/route.ts, which
-- would otherwise fail for every caller (admin included) once sale_price
-- is no longer directly selectable for the shared authenticated role.
CREATE OR REPLACE FUNCTION public.get_client_purchase_aggregate(
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE (total_spend NUMERIC, purchase_count BIGINT, most_recent DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(SUM(sh.sale_price), 0) AS total_spend,
    COUNT(sh.client_id) AS purchase_count,
    MAX(sh.sale_date) AS most_recent
  FROM public.sales_history AS sh
  WHERE sh.org_id = public.org_id()
    AND public.is_admin()
    AND sh.client_id IS NOT NULL
    AND (p_from_date IS NULL OR sh.sale_date >= p_from_date)
    AND (p_to_date IS NULL OR sh.sale_date <= p_to_date);
$$;

COMMENT ON FUNCTION public.get_client_purchase_aggregate(DATE, DATE) IS
  'Admin-only, org-scoped client purchase aggregate (total spend/count/most recent). Returns zero totals for non-admin callers.';

REVOKE ALL ON FUNCTION public.get_client_purchase_aggregate(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_purchase_aggregate(DATE, DATE) TO authenticated;

-- Replaces the raw sale_price.sum()/client_id.count()/sale_date.max()/
-- sale_date.min() grouped PostgREST aggregate in
-- src/app/api/sales/summary-by-client/route.ts (same reason as above).
CREATE OR REPLACE FUNCTION public.get_sales_summary_by_client(
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE (
  client_id UUID,
  total_spend NUMERIC,
  purchase_count BIGINT,
  last_purchase_date DATE,
  first_purchase_date DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    sh.client_id,
    COALESCE(SUM(sh.sale_price), 0) AS total_spend,
    COUNT(sh.client_id) AS purchase_count,
    MAX(sh.sale_date) AS last_purchase_date,
    MIN(sh.sale_date) AS first_purchase_date
  FROM public.sales_history AS sh
  WHERE sh.org_id = public.org_id()
    AND public.is_admin()
    AND sh.client_id IS NOT NULL
    AND (p_from_date IS NULL OR sh.sale_date >= p_from_date)
    AND (p_to_date IS NULL OR sh.sale_date <= p_to_date)
  GROUP BY sh.client_id;
$$;

COMMENT ON FUNCTION public.get_sales_summary_by_client(DATE, DATE) IS
  'Admin-only, org-scoped per-client sales summary. Returns zero rows for non-admin callers.';

REVOKE ALL ON FUNCTION public.get_sales_summary_by_client(DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sales_summary_by_client(DATE, DATE) TO authenticated;

-- Close the direct-RPC bypass: sale_lifecycle_net_amount is SECURITY
-- INVOKER and has no internal is_admin() check, so any authenticated
-- member could call it directly (supabase.rpc(...)) and recover the raw
-- sale_price sum. Its only legitimate caller,
-- public.instrument_has_active_sale, is only ever invoked from within the
-- SECURITY DEFINER trigger public.enforce_instrument_status_transition,
-- which already runs under an owner-elevated identity — revoking direct
-- `authenticated` EXECUTE here does not affect that path.
REVOKE EXECUTE ON FUNCTION public.sale_lifecycle_net_amount(UUID, UUID) FROM authenticated;

-- ──────────────────────────────────────────────
-- 3. INVOICES / INVOICE_ITEMS — row-level admin-only enforcement
--
-- Every shipped app route touching invoices/invoice_items already requires
-- admin (src/app/api/invoices/**). No member-reachable route exists. Match
-- the DB SELECT boundary to that product contract.
-- ──────────────────────────────────────────────

DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

DROP POLICY IF EXISTS invoice_items_select ON public.invoice_items;
CREATE POLICY invoice_items_select ON public.invoice_items
  FOR SELECT TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());
