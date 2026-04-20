-- Tighten INSERT policy for maintenance_tasks to require admin,
-- matching UPDATE/DELETE on the same table.
-- contact_logs INSERT intentionally allows any org member (staff can log contacts).

DROP POLICY IF EXISTS maintenance_tasks_insert ON public.maintenance_tasks;

CREATE POLICY maintenance_tasks_insert ON public.maintenance_tasks
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());
