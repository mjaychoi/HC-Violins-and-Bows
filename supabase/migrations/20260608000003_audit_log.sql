-- Append-only audit log for sensitive mutations and deletes.
-- Application-level; not a trigger-based table.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id      uuid        NOT NULL,   -- auth.uid() at request time
  actor_role    text        NOT NULL CHECK (actor_role IN ('admin', 'member', 'service')),
  action        text        NOT NULL,   -- e.g. 'instrument.delete', 'sale.create', 'invoice.update'
  resource_type text        NOT NULL,   -- e.g. 'instrument', 'sale', 'invoice', 'client'
  resource_id   text        NOT NULL,   -- primary key of the affected row (text to accommodate all types)
  metadata      jsonb,                  -- arbitrary context: changed fields, before/after snapshots, etc.
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS: admins in the same org can read; nobody can UPDATE or DELETE (append-only)
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_admin"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    org_id = public.org_id() AND public.is_admin()
  );

-- Only the application backend (service_role) may insert audit rows
CREATE POLICY "audit_log_insert_service_role"
  ON public.audit_log
  FOR INSERT
  TO service_role
  -- migration-guard: allow-true-policy (service_role only; app backend must be able to insert any audit row)
  WITH CHECK (true);

-- Index for per-org chronological lookups
CREATE INDEX audit_log_org_created_idx ON public.audit_log (org_id, created_at DESC);
-- Index for per-resource history
CREATE INDEX audit_log_resource_idx ON public.audit_log (org_id, resource_type, resource_id);
