-- Read-only pre-deployment audit for the sale-price contract unification
-- (src/utils/salePriceRules.ts, 20260804010000_enforce_sale_price_precision_and_maximum.sql).
-- Do NOT run corrective UPDATEs from this file against production.
-- Run BEFORE applying 20260804010000_enforce_sale_price_precision_and_maximum.sql
-- so a non-empty result can be investigated before the new CHECK constraints
-- would reject it (VALIDATE CONSTRAINT fails closed on the first violation
-- found, without naming every offending row).
--
-- Expected on a healthy tenant: (1), (3), (4), (5), (6), (7), (8), (9) each
-- return 0 rows. (2) is EXPECTED to be non-empty on any tenant that has used
-- the documented standalone-refund-entry feature (SaleForm.tsx "Amount
-- (negative for refund)") — those rows are intentionally sale_price < 0 with
-- entry_kind='sale'; they are listed for visibility, not as defects.

-- 1) Sale rows (entry_kind='sale') with a zero amount. The existing
--    sales_history_non_zero_sale_price CHECK constraint should make this
--    impossible; a hit here means data was written outside that constraint
--    (e.g. a constraint that was later dropped, or a superuser bypass).
SELECT id, org_id, instrument_id, sale_price, sale_date, created_at
FROM public.sales_history
WHERE entry_kind = 'sale' AND sale_price = 0
ORDER BY created_at;

-- 2) Sale rows (entry_kind='sale') with a negative amount — informational,
--    not necessarily a defect. See header comment: POST /api/sales
--    intentionally allows this for standalone refund-style entries. Reviewed
--    manually to confirm each is an intentional refund entry, not a bug in
--    an upstream import or a since-fixed application defect.
SELECT id, org_id, instrument_id, client_id, sale_price, sale_date, notes, created_at
FROM public.sales_history
WHERE entry_kind = 'sale' AND sale_price < 0
ORDER BY created_at;

-- 3) Refund/undo_refund rows with a sign inconsistent with their entry_kind
--    (refund should be < 0, undo_refund should be > 0, and neither should be
--    zero). This is exactly what
--    sales_history_refund_sign_check/sales_history_undo_refund_sign_check
--    will enforce going forward.
SELECT id, org_id, entry_kind, sale_price, adjustment_of_sale_id, created_at
FROM public.sales_history
WHERE (entry_kind = 'refund' AND sale_price >= 0)
   OR (entry_kind = 'undo_refund' AND sale_price <= 0)
ORDER BY created_at;

-- 4) Amounts with more than two decimal places. NUMERIC(12,2) rounds on
--    write rather than rejecting, so this can only be non-empty if a row was
--    inserted before the column had its current scale, or via a path that
--    bypassed normal casting.
SELECT id, org_id, entry_kind, sale_price, created_at
FROM public.sales_history
WHERE sale_price * 100 <> ROUND(sale_price * 100)
ORDER BY created_at;

-- 5) Amounts above the selected shared maximum ($1,000,000,000 — see
--    src/utils/salePriceRules.ts SALE_PRICE_MAX_MAGNITUDE). Symmetric so it
--    also covers the negative carve-out.
SELECT id, org_id, entry_kind, sale_price, created_at
FROM public.sales_history
WHERE ABS(sale_price) > 1000000000
ORDER BY created_at;

-- 6) Refunds whose absolute amount differs from the linked sale (should
--    always be an exact match — create_sale_adjustment_atomic derives the
--    refund amount as -ABS(source.sale_price)).
SELECT
  r.id AS refund_id,
  r.org_id,
  r.adjustment_of_sale_id AS sale_id,
  s.sale_price AS sale_amount,
  r.sale_price AS refund_amount,
  ABS(r.sale_price) - ABS(s.sale_price) AS abs_amount_diff
FROM public.sales_history AS r
JOIN public.sales_history AS s ON s.id = r.adjustment_of_sale_id
WHERE r.entry_kind = 'refund'
  AND ABS(r.sale_price) <> ABS(s.sale_price)
ORDER BY r.created_at;

-- 7) Refunds/undo_refunds with a missing or cross-organization source sale.
SELECT child.id, child.org_id AS child_org, child.entry_kind, child.adjustment_of_sale_id
FROM public.sales_history AS child
WHERE child.entry_kind IN ('refund', 'undo_refund')
  AND (
    child.adjustment_of_sale_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.sales_history AS parent
      WHERE parent.id = child.adjustment_of_sale_id
        AND parent.org_id = child.org_id
    )
  )
ORDER BY child.created_at;

-- 8) Full-refund lifecycles (sale + refund, no undo_refund) whose net amount
--    is not exactly zero.
WITH refunded_pairs AS (
  SELECT
    s.id AS sale_id,
    s.org_id,
    s.sale_price AS sale_amount,
    r.id AS refund_id,
    r.sale_price AS refund_amount,
    s.sale_price + r.sale_price AS net_amount
  FROM public.sales_history AS s
  JOIN public.sales_history AS r
    ON r.adjustment_of_sale_id = s.id AND r.org_id = s.org_id AND r.entry_kind = 'refund'
  WHERE s.entry_kind = 'sale'
    AND NOT EXISTS (
      SELECT 1 FROM public.sales_history AS u
      WHERE u.adjustment_of_sale_id = r.id AND u.org_id = r.org_id AND u.entry_kind = 'undo_refund'
    )
)
SELECT *
FROM refunded_pairs
WHERE net_amount <> 0
ORDER BY sale_id;

-- 9) Amounts that cannot be represented safely by the new server canonical
--    format (amountCents = ROUND(sale_price * 100) must be a JS-safe
--    integer, i.e. |amountCents| <= 2^53 - 1 = 9007199254740991). Given (5)
--    already bounds |sale_price| <= 1e9 (so |amountCents| <= 1e11, always
--    safe), a hit here only happens for pre-existing rows the new maximum
--    constraint would also flag — listed separately because it is the more
--    fundamental of the two limits (representability vs. business policy).
SELECT id, org_id, entry_kind, sale_price, ROUND(sale_price * 100) AS amount_cents, created_at
FROM public.sales_history
WHERE sale_price IS NOT NULL
  AND ABS(ROUND(sale_price * 100)) > 9007199254740991
ORDER BY created_at;
