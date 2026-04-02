BEGIN;

UPDATE storage.buckets
SET public = false
WHERE id = 'invoices';

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
        'hc_v_invoice_images_insert',
        'hc_v_invoice_images_select',
        'hc_v_invoice_images_delete',
        'hc_v_invoice_images_update'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY hc_v_invoice_images_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (
      (storage.foldername(name))[1] = auth.org_id()::text
      OR (storage.foldername(name))[2] = auth.org_id()::text
    )
  );

CREATE POLICY hc_v_invoice_images_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (
      (storage.foldername(name))[1] = auth.org_id()::text
      OR (storage.foldername(name))[2] = auth.org_id()::text
    )
  );

CREATE POLICY hc_v_invoice_images_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (
      (storage.foldername(name))[1] = auth.org_id()::text
      OR (storage.foldername(name))[2] = auth.org_id()::text
    )
  )
  WITH CHECK (
    bucket_id = 'invoices'
    AND (
      (storage.foldername(name))[1] = auth.org_id()::text
      OR (storage.foldername(name))[2] = auth.org_id()::text
    )
  );

CREATE POLICY hc_v_invoice_images_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (
      (storage.foldername(name))[1] = auth.org_id()::text
      OR (storage.foldername(name))[2] = auth.org_id()::text
    )
  );

COMMIT;
