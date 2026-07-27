-- Canonical calendar placement date for maintenance_tasks.
-- Must stay aligned with getCalendarPlacementDate() in src/utils/calendar.ts:
--   due_date → personal_due_date → scheduled_date → received_date

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS calendar_date DATE
  GENERATED ALWAYS AS (
    COALESCE(due_date, personal_due_date, scheduled_date, received_date)
  ) STORED;

COMMENT ON COLUMN public.maintenance_tasks.calendar_date IS
  'Canonical calendar placement date: COALESCE(due_date, personal_due_date, scheduled_date, received_date).';

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_org_id_calendar_date
  ON public.maintenance_tasks (org_id, calendar_date);
