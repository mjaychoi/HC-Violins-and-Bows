-- Select-only tenant isolation audit.
-- Persistent parent-org backfill statements from tenant_isolation_audit.sql
-- are omitted. This file does not change database rows.

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
SELECT id, client_id FROM public.invoices WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;
SELECT id, invoice_id, instrument_id FROM public.invoice_items WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;
SELECT id FROM public.invoice_settings WHERE org_id IS NULL ORDER BY created_at DESC NULLS LAST;

-- 3) Repeat the null org_id summary. No backfill runs in this file.
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
