-- Phase 1 of Notes server-persistence remediation.
--
-- Notes are private to an individual user within an organization (same
-- ownership model as public.notification_settings), not shared across the
-- org like public.maintenance_tasks. Unlike notification_settings this is a
-- one-to-many table (a user has many notes), so ownership is enforced via
-- (org_id, user_id) columns + RLS rather than a composite primary key.
--
-- This migration only creates server-side storage. The Notes frontend keeps
-- reading/writing localStorage in this phase (see src/app/notes/notesStorage.ts).

CREATE TABLE IF NOT EXISTS public.notes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT '',
  content    TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_org_user_updated_at
  ON public.notes (org_id, user_id, updated_at DESC);

DROP TRIGGER IF EXISTS update_notes_updated_at ON public.notes;
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ──────────────────────────────────────────────
-- NOTES  (per-user, per-org — same boundary as notification_settings,
-- plus DELETE since notes are individually removable rows)
-- ──────────────────────────────────────────────
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notes_select ON public.notes;
CREATE POLICY notes_select ON public.notes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND org_id = public.org_id());

DROP POLICY IF EXISTS notes_insert ON public.notes;
CREATE POLICY notes_insert ON public.notes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND org_id = public.org_id());

DROP POLICY IF EXISTS notes_update ON public.notes;
CREATE POLICY notes_update ON public.notes
  FOR UPDATE TO authenticated
  USING    (user_id = auth.uid() AND org_id = public.org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = public.org_id());

DROP POLICY IF EXISTS notes_delete ON public.notes;
CREATE POLICY notes_delete ON public.notes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND org_id = public.org_id());

REVOKE ALL ON TABLE public.notes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notes TO authenticated;
