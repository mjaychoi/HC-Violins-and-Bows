-- Release validation audit helpers

-- 1) Critical migrations applied
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260401000000',
  '20260401000001',
  '20260401000002',
  '20260401000003',
  '20260401000004',
  '20260401000005',
  '20260401000006',
  '20260401000007',
  '20260401000008'
)
ORDER BY version;

-- 2) Public tables with org_id column
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'org_id'
ORDER BY table_name;

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

-- 4) RLS policies that are too permissive
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
  AND (
    COALESCE(qual, '') ILIKE '%true%'
    OR COALESCE(with_check, '') ILIKE '%true%'
  )
ORDER BY schemaname, tablename, policyname;

-- 5) Public tables with RLS disabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
JOIN pg_class ON pg_class.relname = pg_tables.tablename
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE schemaname = 'public'
  AND pg_namespace.nspname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

-- 6) Trigger presence for org consistency enforcement
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'enforce_client_instruments_org_consistency_trigger',
    'enforce_invoice_items_org_consistency_trigger',
    'enforce_sales_history_org_consistency_trigger',
    'enforce_contact_logs_org_consistency_trigger',
    'enforce_maintenance_tasks_org_consistency_trigger'
  )
ORDER BY event_object_table;

-- 7) Single-owner invariant violations
SELECT instrument_id, COUNT(*) AS owner_count
FROM public.client_instruments
WHERE relationship_type = 'Owned'
GROUP BY instrument_id
HAVING COUNT(*) > 1
ORDER BY owner_count DESC, instrument_id;
