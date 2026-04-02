-- Migration: final security hardening
-- Created: 2026-04-01

-- 1) instrument_images: enforce tenant isolation through parent instrument ownership
ALTER TABLE public.instrument_images ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'instrument_images'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.instrument_images',
      r.policyname
    );
  END LOOP;
END $$;

CREATE POLICY instrument_images_select
  ON public.instrument_images
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = auth.org_id()
    )
  );

CREATE POLICY instrument_images_insert
  ON public.instrument_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = auth.org_id()
    )
  );

CREATE POLICY instrument_images_update
  ON public.instrument_images
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = auth.org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = auth.org_id()
    )
  );

CREATE POLICY instrument_images_delete
  ON public.instrument_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = auth.org_id()
    )
  );

-- 2) If Supabase Storage bucket `instrument-images` is used, align storage access with org-prefixed keys.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'Allow authenticated users to upload images',
        'Allow authenticated users to view images',
        'Allow authenticated users to delete images',
        'hc_v_instrument_images_insert',
        'hc_v_instrument_images_select',
        'hc_v_instrument_images_delete'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY hc_v_instrument_images_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'instrument-images'
    AND (storage.foldername(name))[1] = auth.org_id()::text
  );

CREATE POLICY hc_v_instrument_images_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'instrument-images'
    AND (storage.foldername(name))[1] = auth.org_id()::text
  );

CREATE POLICY hc_v_instrument_images_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'instrument-images'
    AND (storage.foldername(name))[1] = auth.org_id()::text
  );
