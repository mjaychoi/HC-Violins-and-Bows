-- Tenant isolation audit and safe backfill helpers
-- Run after deploying org-scoped RLS migration.

-- 1) Audit rows that will be hidden by org-scoped RLS because org_id is NULL
SELECT 'clients' AS table_name, COUNT(*) AS null_org_rows
FROM public.clients
WHERE org_id IS NULL
UNION ALL
SELECT 'instruments', COUNT(*)
FROM public.instruments
WHERE org_id IS NULL
UNION ALL
SELECT 'client_instruments', COUNT(*)
FROM public.client_instruments
WHERE org_id IS NULL
UNION ALL
SELECT 'maintenance_tasks', COUNT(*)
FROM public.maintenance_tasks
WHERE org_id IS NULL
UNION ALL
SELECT 'contact_logs', COUNT(*)
FROM public.contact_logs
WHERE org_id IS NULL
UNION ALL
SELECT 'sales_history', COUNT(*)
FROM public.sales_history
WHERE org_id IS NULL
UNION ALL
SELECT 'invoices', COUNT(*)
FROM public.invoices
WHERE org_id IS NULL
UNION ALL
SELECT 'invoice_items', COUNT(*)
FROM public.invoice_items
WHERE org_id IS NULL
UNION ALL
SELECT 'invoice_settings', COUNT(*)
FROM public.invoice_settings
WHERE org_id IS NULL
ORDER BY table_name;

-- 2) Optional detail queries for manual cleanup
SELECT id FROM public.clients WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;
SELECT id FROM public.instruments WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;
SELECT id, client_id, instrument_id FROM public.client_instruments WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;
SELECT id, instrument_id, client_id FROM public.maintenance_tasks WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;
SELECT id, client_id, instrument_id FROM public.contact_logs WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;
SELECT id, instrument_id, client_id FROM public.sales_history WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;
SELECT id, client_id FROM public.invoices WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;
SELECT id, invoice_id, instrument_id FROM public.invoice_items WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;
SELECT id FROM public.invoice_settings WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;

-- 3) Safe one-time backfills where org_id is inferable from parent rows
UPDATE public.client_instruments AS ci
SET org_id = c.org_id
FROM public.clients AS c
WHERE ci.client_id = c.id
  AND ci.org_id IS NULL
  AND c.org_id IS NOT NULL;

UPDATE public.contact_logs AS cl
SET org_id = c.org_id
FROM public.clients AS c
WHERE cl.client_id = c.id
  AND cl.org_id IS NULL
  AND c.org_id IS NOT NULL;

UPDATE public.maintenance_tasks AS mt
SET org_id = i.org_id
FROM public.instruments AS i
WHERE mt.instrument_id = i.id
  AND mt.org_id IS NULL
  AND i.org_id IS NOT NULL;

UPDATE public.sales_history AS sh
SET org_id = i.org_id
FROM public.instruments AS i
WHERE sh.instrument_id = i.id
  AND sh.org_id IS NULL
  AND i.org_id IS NOT NULL;

UPDATE public.invoice_items AS ii
SET org_id = i.org_id
FROM public.invoices AS i
WHERE ii.invoice_id = i.id
  AND ii.org_id IS NULL
  AND i.org_id IS NOT NULL;

-- 4) Re-run the summary audit after the backfill statements above
SELECT 'clients' AS table_name, COUNT(*) AS null_org_rows
FROM public.clients
WHERE org_id IS NULL
UNION ALL
SELECT 'instruments', COUNT(*)
FROM public.instruments
WHERE org_id IS NULL
UNION ALL
SELECT 'client_instruments', COUNT(*)
FROM public.client_instruments
WHERE org_id IS NULL
UNION ALL
SELECT 'maintenance_tasks', COUNT(*)
FROM public.maintenance_tasks
WHERE org_id IS NULL
UNION ALL
SELECT 'contact_logs', COUNT(*)
FROM public.contact_logs
WHERE org_id IS NULL
UNION ALL
SELECT 'sales_history', COUNT(*)
FROM public.sales_history
WHERE org_id IS NULL
UNION ALL
SELECT 'invoices', COUNT(*)
FROM public.invoices
WHERE org_id IS NULL
UNION ALL
SELECT 'invoice_items', COUNT(*)
FROM public.invoice_items
WHERE org_id IS NULL
UNION ALL
SELECT 'invoice_settings', COUNT(*)
FROM public.invoice_settings
WHERE org_id IS NULL
ORDER BY table_name;
