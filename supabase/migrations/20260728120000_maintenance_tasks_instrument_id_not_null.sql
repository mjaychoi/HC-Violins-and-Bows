-- Align the DB constraint with the API, which has always required instrument_id
-- (createMaintenanceTaskSchema uses a non-nullable uuidSchema, and the PATCH
-- schema's instrument_id is optional but never nullable). Every maintenance
-- task is scoped to an instrument in practice; this closes the gap where the
-- column itself still allowed NULL. The BEFORE INSERT/UPDATE trigger
-- enforce_maintenance_tasks_org_consistency() already rejects a NULL
-- instrument_id at write time (00000000000003_triggers.sql), so this mostly
-- codifies existing write-path behavior into the schema itself.
--
-- Fail closed: abort with a clear error instead of ever silently converting
-- or dropping legacy NULL rows. SET NOT NULL only runs once no such rows
-- exist, and is itself idempotent/replayable on a clean database.
DO $$
DECLARE
  null_count bigint;
BEGIN
  SELECT count(*)
    INTO null_count
  FROM public.maintenance_tasks
  WHERE instrument_id IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Cannot set maintenance_tasks.instrument_id NOT NULL: % null row(s) exist. Backfill or remove them before re-running this migration.',
      null_count;
  END IF;
END
$$;

ALTER TABLE public.maintenance_tasks
  ALTER COLUMN instrument_id SET NOT NULL;
