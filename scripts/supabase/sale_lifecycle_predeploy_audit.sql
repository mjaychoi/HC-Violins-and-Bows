-- Read-only pre-deployment audit for sale lifecycle integrity.
-- Do NOT run corrective UPDATEs from this file against production.
--
-- Expected: each section returns 0 rows on a healthy tenant.
-- Safe to run before applying 20260803131709_create_sale_atomic_active_sale_guard.sql

-- 1) Instruments with more than one currently active/unrefunded sale lifecycle
--    (net amount > 0). Uses the same net definition as the forward migration.
WITH sale_nets AS (
  SELECT
    sh.id AS sale_id,
    sh.org_id,
    sh.instrument_id,
    sh.sale_price
      + COALESCE(
        (
          SELECT SUM(adj.sale_price)
          FROM public.sales_history AS adj
          WHERE adj.org_id = sh.org_id
            AND (
              adj.adjustment_of_sale_id = sh.id
              OR adj.adjustment_of_sale_id IN (
                SELECT mid.id
                FROM public.sales_history AS mid
                WHERE mid.adjustment_of_sale_id = sh.id
                  AND mid.org_id = sh.org_id
              )
            )
        ),
        0
      ) AS net_amount
  FROM public.sales_history AS sh
  WHERE sh.entry_kind = 'sale'
    AND sh.instrument_id IS NOT NULL
)
SELECT org_id, instrument_id, COUNT(*) AS active_sale_count, ARRAY_AGG(sale_id) AS sale_ids
FROM sale_nets
WHERE net_amount > 0
GROUP BY org_id, instrument_id
HAVING COUNT(*) > 1
ORDER BY active_sale_count DESC, org_id, instrument_id;

-- 2) Malformed refund relationships
-- 2a) refund/undo_refund/adjustment rows missing adjustment_of_sale_id
SELECT id, org_id, entry_kind, instrument_id, sale_price
FROM public.sales_history
WHERE entry_kind IN ('refund', 'undo_refund', 'adjustment')
  AND adjustment_of_sale_id IS NULL
ORDER BY created_at;

-- 2b) adjustment_of_sale_id pointing at a missing parent
SELECT child.id, child.org_id, child.entry_kind, child.adjustment_of_sale_id
FROM public.sales_history AS child
WHERE child.adjustment_of_sale_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sales_history AS parent WHERE parent.id = child.adjustment_of_sale_id
  )
ORDER BY child.created_at;

-- 2c) refund not pointing at a sale entry
SELECT r.id AS refund_id, r.org_id, r.adjustment_of_sale_id, s.entry_kind AS parent_kind
FROM public.sales_history AS r
JOIN public.sales_history AS s ON s.id = r.adjustment_of_sale_id
WHERE r.entry_kind = 'refund'
  AND s.entry_kind <> 'sale'
ORDER BY r.created_at;

-- 2d) undo_refund not pointing at a refund entry
SELECT u.id AS undo_id, u.org_id, u.adjustment_of_sale_id, r.entry_kind AS parent_kind
FROM public.sales_history AS u
JOIN public.sales_history AS r ON r.id = u.adjustment_of_sale_id
WHERE u.entry_kind = 'undo_refund'
  AND r.entry_kind <> 'refund'
ORDER BY u.created_at;

-- 3) Refunds whose absolute amount exceeds the linked sale amount
SELECT
  r.id AS refund_id,
  r.org_id,
  r.adjustment_of_sale_id AS sale_id,
  s.sale_price AS sale_amount,
  r.sale_price AS refund_amount
FROM public.sales_history AS r
JOIN public.sales_history AS s ON s.id = r.adjustment_of_sale_id
WHERE r.entry_kind = 'refund'
  AND ABS(r.sale_price) > ABS(s.sale_price)
ORDER BY r.created_at;

-- 4) Sales/refunds with organization mismatches vs parent or instrument/client
SELECT sh.id, sh.org_id, sh.entry_kind, sh.instrument_id, i.org_id AS instrument_org_id
FROM public.sales_history AS sh
JOIN public.instruments AS i ON i.id = sh.instrument_id
WHERE sh.instrument_id IS NOT NULL
  AND sh.org_id IS DISTINCT FROM i.org_id
ORDER BY sh.created_at;

SELECT sh.id, sh.org_id, sh.entry_kind, sh.client_id, c.org_id AS client_org_id
FROM public.sales_history AS sh
JOIN public.clients AS c ON c.id = sh.client_id
WHERE sh.client_id IS NOT NULL
  AND sh.org_id IS DISTINCT FROM c.org_id
ORDER BY sh.created_at;

SELECT child.id, child.org_id AS child_org, parent.id AS parent_id, parent.org_id AS parent_org
FROM public.sales_history AS child
JOIN public.sales_history AS parent ON parent.id = child.adjustment_of_sale_id
WHERE child.org_id IS DISTINCT FROM parent.org_id
ORDER BY child.created_at;

-- 5) Instruments whose status conflicts with active-sale state
WITH sale_nets AS (
  SELECT
    sh.org_id,
    sh.instrument_id,
    sh.sale_price
      + COALESCE(
        (
          SELECT SUM(adj.sale_price)
          FROM public.sales_history AS adj
          WHERE adj.org_id = sh.org_id
            AND (
              adj.adjustment_of_sale_id = sh.id
              OR adj.adjustment_of_sale_id IN (
                SELECT mid.id
                FROM public.sales_history AS mid
                WHERE mid.adjustment_of_sale_id = sh.id
                  AND mid.org_id = sh.org_id
              )
            )
        ),
        0
      ) AS net_amount
  FROM public.sales_history AS sh
  WHERE sh.entry_kind = 'sale'
    AND sh.instrument_id IS NOT NULL
),
active AS (
  SELECT org_id, instrument_id, COUNT(*) AS active_count
  FROM sale_nets
  WHERE net_amount > 0
  GROUP BY org_id, instrument_id
)
SELECT
  i.id AS instrument_id,
  i.org_id,
  i.status,
  COALESCE(a.active_count, 0) AS active_sale_count,
  CASE
    WHEN i.status = 'Sold' AND COALESCE(a.active_count, 0) = 0 THEN 'Sold_without_active_sale'
    WHEN i.status <> 'Sold' AND COALESCE(a.active_count, 0) > 0 THEN 'non_Sold_with_active_sale'
    ELSE 'ok'
  END AS conflict_kind
FROM public.instruments AS i
LEFT JOIN active AS a
  ON a.instrument_id = i.id AND a.org_id = i.org_id
WHERE (i.status = 'Sold' AND COALESCE(a.active_count, 0) = 0)
   OR (i.status <> 'Sold' AND COALESCE(a.active_count, 0) > 0)
ORDER BY i.org_id, i.id;
