-- Production hardening audit queries

-- 1) Tables in public schema without RLS enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
JOIN pg_class ON pg_class.relname = pg_tables.tablename
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE schemaname = 'public'
  AND pg_namespace.nspname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

-- 2) Policies that effectively allow everything
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
  AND (
    COALESCE(qual, '') ILIKE '%true%'
    OR COALESCE(with_check, '') ILIKE '%true%'
  )
ORDER BY schemaname, tablename, policyname;

-- 3) Tenant rows with NULL org_id
SELECT 'clients' AS table_name, COUNT(*) AS null_org_rows FROM public.clients WHERE org_id IS NULL
UNION ALL
SELECT 'instruments', COUNT(*) FROM public.instruments WHERE org_id IS NULL
UNION ALL
SELECT 'client_instruments', COUNT(*) FROM public.client_instruments WHERE org_id IS NULL
UNION ALL
SELECT 'maintenance_tasks', COUNT(*) FROM public.maintenance_tasks WHERE org_id IS NULL
UNION ALL
SELECT 'contact_logs', COUNT(*) FROM public.contact_logs WHERE org_id IS NULL
UNION ALL
SELECT 'sales_history', COUNT(*) FROM public.sales_history WHERE org_id IS NULL
UNION ALL
SELECT 'invoices', COUNT(*) FROM public.invoices WHERE org_id IS NULL
UNION ALL
SELECT 'invoice_items', COUNT(*) FROM public.invoice_items WHERE org_id IS NULL
UNION ALL
SELECT 'invoice_settings', COUNT(*) FROM public.invoice_settings WHERE org_id IS NULL;

-- 4) Org mismatches between parent/child rows
SELECT 'client_instruments' AS relation, ci.id, ci.org_id, c.org_id AS client_org_id, i.org_id AS instrument_org_id
FROM public.client_instruments ci
JOIN public.clients c ON c.id = ci.client_id
JOIN public.instruments i ON i.id = ci.instrument_id
WHERE ci.org_id <> c.org_id OR ci.org_id <> i.org_id OR c.org_id <> i.org_id
UNION ALL
SELECT 'invoice_items', ii.id, ii.org_id, inv.org_id, inst.org_id
FROM public.invoice_items ii
JOIN public.invoices inv ON inv.id = ii.invoice_id
LEFT JOIN public.instruments inst ON inst.id = ii.instrument_id
WHERE ii.org_id <> inv.org_id
   OR (inst.id IS NOT NULL AND (ii.org_id <> inst.org_id OR inv.org_id <> inst.org_id))
UNION ALL
SELECT 'sales_history', sh.id, sh.org_id, c.org_id, i.org_id
FROM public.sales_history sh
LEFT JOIN public.clients c ON c.id = sh.client_id
LEFT JOIN public.instruments i ON i.id = sh.instrument_id
WHERE (c.id IS NOT NULL AND sh.org_id <> c.org_id)
   OR (i.id IS NOT NULL AND sh.org_id <> i.org_id)
   OR (c.id IS NOT NULL AND i.id IS NOT NULL AND c.org_id <> i.org_id);

-- 5) Duplicate ownership rows that violate single-owner invariant
SELECT instrument_id, COUNT(*) AS owner_count
FROM public.client_instruments
WHERE relationship_type = 'Owned'
GROUP BY instrument_id
HAVING COUNT(*) > 1
ORDER BY owner_count DESC, instrument_id;
