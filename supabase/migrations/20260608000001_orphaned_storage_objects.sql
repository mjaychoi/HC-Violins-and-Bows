-- Tracks storage objects whose DB metadata was deleted but whose physical
-- file could not be removed (e.g. network failure at delete time).
-- A periodic cleanup job should read this table and retry deletion.
CREATE TABLE IF NOT EXISTS public.orphaned_storage_objects (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_key   TEXT        NOT NULL,
  bucket        TEXT        NOT NULL DEFAULT 's3',
  source        TEXT        NOT NULL,  -- which operation produced the orphan
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent the same key being logged twice for the same source.
CREATE UNIQUE INDEX IF NOT EXISTS
  orphaned_storage_objects_key_source_idx
  ON public.orphaned_storage_objects (org_id, storage_key, source);

ALTER TABLE public.orphaned_storage_objects ENABLE ROW LEVEL SECURITY;

-- Only admins of the owning org may read or insert orphan records.
CREATE POLICY orphaned_storage_objects_select ON public.orphaned_storage_objects
  FOR SELECT TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

CREATE POLICY orphaned_storage_objects_insert ON public.orphaned_storage_objects
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

-- Service-role (used by cleanup jobs) may delete resolved records.
CREATE POLICY orphaned_storage_objects_delete ON public.orphaned_storage_objects
  FOR DELETE TO service_role
  -- migration-guard: allow-true-policy (service_role only; cleanup job must delete any resolved orphan)
  USING (true);
