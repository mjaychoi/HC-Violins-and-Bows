-- Migration: tighten invoice storage bucket tenant isolation
-- Created: 2026-04-03

BEGIN;

DROP POLICY IF EXISTS hc_v_invoice_images_insert ON storage.objects;
CREATE POLICY hc_v_invoice_images_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.org_id()::text
    AND array_length(storage.foldername(name), 1) = 2
    AND auth.is_admin()
  );

DROP POLICY IF EXISTS hc_v_invoice_images_select ON storage.objects;
CREATE POLICY hc_v_invoice_images_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.org_id()::text
    AND array_length(storage.foldername(name), 1) = 2
  );

DROP POLICY IF EXISTS hc_v_invoice_images_update ON storage.objects;
CREATE POLICY hc_v_invoice_images_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.org_id()::text
    AND array_length(storage.foldername(name), 1) = 2
    AND auth.is_admin()
  )
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.org_id()::text
    AND array_length(storage.foldername(name), 1) = 2
    AND auth.is_admin()
  );

DROP POLICY IF EXISTS hc_v_invoice_images_delete ON storage.objects;
CREATE POLICY hc_v_invoice_images_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = auth.org_id()::text
    AND array_length(storage.foldername(name), 1) = 2
    AND auth.is_admin()
  );

COMMIT;
