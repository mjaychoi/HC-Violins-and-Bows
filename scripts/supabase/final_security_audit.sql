-- Final security audit queries for RLS and tenant isolation

-- 1) Policies that still allow unrestricted access
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (qual ILIKE '%true%' OR with_check ILIKE '%true%')
ORDER BY schemaname, tablename, policyname;

-- 2) Public tables without RLS enabled
SELECT schemaname, tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'pg_%'
  AND rowsecurity = false
ORDER BY tablename;

-- 3) Public tables that do not reference auth.org_id() in any policy
SELECT t.tablename
FROM pg_tables AS t
WHERE t.schemaname = 'public'
  AND t.tablename NOT LIKE 'pg_%'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename = t.tablename
      AND (
        coalesce(p.qual, '') ILIKE '%auth.org_id()%'
        OR coalesce(p.with_check, '') ILIKE '%auth.org_id()%'
      )
  )
ORDER BY t.tablename;

-- 4) Tenant-owned rows missing org_id
SELECT 'clients' AS table_name, COUNT(*) AS missing_org_id
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

-- 5) Orphan child rows whose parent org cannot be validated
SELECT 'instrument_images' AS table_name, COUNT(*) AS orphan_rows
FROM public.instrument_images AS ii
LEFT JOIN public.instruments AS i ON i.id = ii.instrument_id
WHERE i.id IS NULL
UNION ALL
SELECT 'instrument_certificates', COUNT(*)
FROM public.instrument_certificates AS ic
LEFT JOIN public.instruments AS i ON i.id = ic.instrument_id
WHERE i.id IS NULL
UNION ALL
SELECT 'client_instruments', COUNT(*)
FROM public.client_instruments AS ci
LEFT JOIN public.clients AS c ON c.id = ci.client_id
WHERE c.id IS NULL
UNION ALL
SELECT 'contact_logs', COUNT(*)
FROM public.contact_logs AS cl
LEFT JOIN public.clients AS c ON c.id = cl.client_id
WHERE cl.client_id IS NOT NULL
  AND c.id IS NULL
UNION ALL
SELECT 'maintenance_tasks', COUNT(*)
FROM public.maintenance_tasks AS mt
LEFT JOIN public.instruments AS i ON i.id = mt.instrument_id
WHERE mt.instrument_id IS NOT NULL
  AND i.id IS NULL
UNION ALL
SELECT 'sales_history', COUNT(*)
FROM public.sales_history AS sh
LEFT JOIN public.instruments AS i ON i.id = sh.instrument_id
WHERE sh.instrument_id IS NOT NULL
  AND i.id IS NULL
UNION ALL
SELECT 'invoice_items', COUNT(*)
FROM public.invoice_items AS it
LEFT JOIN public.invoices AS i ON i.id = it.invoice_id
WHERE i.id IS NULL
ORDER BY table_name;

-- 6) Safe backfills for rows whose org can be inferred from a parent
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

UPDATE public.invoice_items AS it
SET org_id = i.org_id
FROM public.invoices AS i
WHERE it.invoice_id = i.id
  AND it.org_id IS NULL
  AND i.org_id IS NOT NULL;
