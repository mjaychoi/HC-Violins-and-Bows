-- Aggregate-only preflight audit for Batch B reference-integrity migration.
-- Returns counts only — no row-level identifiers or PII.
-- Gate: every mismatch_count must be 0 before applying
-- 20260728140000_preserve_maintenance_history_and_enforce_reserved_references.sql
--
-- Usage (read-only):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/reference_integrity_preflight_audit.sql

SELECT 'maintenance_tasks_missing_instrument' AS check_name, COUNT(*) AS mismatch_count
FROM public.maintenance_tasks mt
LEFT JOIN public.instruments i ON i.id = mt.instrument_id
WHERE mt.instrument_id IS NULL
   OR i.id IS NULL

UNION ALL

SELECT 'reserved_by_user_missing_user', COUNT(*)
FROM public.instruments i
LEFT JOIN auth.users u ON u.id = i.reserved_by_user_id
WHERE i.reserved_by_user_id IS NOT NULL
  AND u.id IS NULL

UNION ALL

SELECT 'reserved_connection_missing', COUNT(*)
FROM public.instruments i
LEFT JOIN public.client_instruments ci
  ON ci.id = i.reserved_connection_id
WHERE i.reserved_connection_id IS NOT NULL
  AND ci.id IS NULL

UNION ALL

SELECT 'reserved_connection_org_mismatch', COUNT(*)
FROM public.instruments i
JOIN public.client_instruments ci
  ON ci.id = i.reserved_connection_id
WHERE i.reserved_connection_id IS NOT NULL
  AND i.org_id IS DISTINCT FROM ci.org_id

UNION ALL

SELECT 'reserved_connection_instrument_mismatch', COUNT(*)
FROM public.instruments i
JOIN public.client_instruments ci
  ON ci.id = i.reserved_connection_id
WHERE i.reserved_connection_id IS NOT NULL
  AND i.id IS DISTINCT FROM ci.instrument_id;

SELECT
  COUNT(*) FILTER (WHERE reserved_by_user_id IS NOT NULL)
    AS reserved_by_user_non_null_count,
  COUNT(*) FILTER (WHERE reserved_connection_id IS NOT NULL)
    AS reserved_connection_non_null_count
FROM public.instruments;
