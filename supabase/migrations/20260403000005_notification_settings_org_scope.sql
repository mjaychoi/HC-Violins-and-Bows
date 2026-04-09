-- Scope notification settings by organization as well as user.
-- This removes the single-row-per-user assumption and aligns the table with
-- multi-tenant request routing that now requires org context.

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.notification_settings AS ns
SET org_id = COALESCE(
  NULLIF(u.raw_app_meta_data ->> 'org_id', '')::uuid,
  NULLIF(u.raw_app_meta_data ->> 'organization_id', '')::uuid
)
FROM auth.users AS u
WHERE u.id = ns.user_id
  AND ns.org_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notification_settings
    WHERE org_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'notification_settings.org_id backfill failed for one or more rows';
  END IF;
END
$$;

ALTER TABLE public.notification_settings
  ALTER COLUMN org_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_settings_pkey'
      AND conrelid = 'public.notification_settings'::regclass
  ) THEN
    ALTER TABLE public.notification_settings
      DROP CONSTRAINT notification_settings_pkey;
  END IF;
END
$$;

ALTER TABLE public.notification_settings
  ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (org_id, user_id);

CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id
  ON public.notification_settings(user_id);

DROP POLICY IF EXISTS "Users can view their own notification settings"
  ON public.notification_settings;
DROP POLICY IF EXISTS "Users can insert their own notification settings"
  ON public.notification_settings;
DROP POLICY IF EXISTS "Users can update their own notification settings"
  ON public.notification_settings;

DROP POLICY IF EXISTS notification_settings_select
  ON public.notification_settings;
DROP POLICY IF EXISTS notification_settings_insert
  ON public.notification_settings;
DROP POLICY IF EXISTS notification_settings_update
  ON public.notification_settings;

CREATE POLICY notification_settings_select
  ON public.notification_settings
  FOR SELECT
  USING (user_id = auth.uid() AND org_id = auth.org_id());

CREATE POLICY notification_settings_insert
  ON public.notification_settings
  FOR INSERT
  WITH CHECK (user_id = auth.uid() AND org_id = auth.org_id());

CREATE POLICY notification_settings_update
  ON public.notification_settings
  FOR UPDATE
  USING (user_id = auth.uid() AND org_id = auth.org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = auth.org_id());
