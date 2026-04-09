BEGIN;

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN lower(trim(COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'app_role',
      auth.jwt() ->> 'role',
      auth.jwt() ->> 'app_role',
      'member'
    ))) = 'admin' THEN 'admin'
    ELSE 'member'
  END
$$;

CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT auth.user_role() = 'admin'
$$;

DROP POLICY IF EXISTS clients_update ON public.clients;
CREATE POLICY clients_update
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin())
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS clients_delete ON public.clients;
CREATE POLICY clients_delete
  ON public.clients
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS instruments_update ON public.instruments;
CREATE POLICY instruments_update
  ON public.instruments
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin())
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS instruments_delete ON public.instruments;
CREATE POLICY instruments_delete
  ON public.instruments
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS client_instruments_insert ON public.client_instruments;
CREATE POLICY client_instruments_insert
  ON public.client_instruments
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS client_instruments_update ON public.client_instruments;
CREATE POLICY client_instruments_update
  ON public.client_instruments
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin())
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS client_instruments_delete ON public.client_instruments;
CREATE POLICY client_instruments_delete
  ON public.client_instruments
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS maintenance_tasks_update ON public.maintenance_tasks;
CREATE POLICY maintenance_tasks_update
  ON public.maintenance_tasks
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin())
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS maintenance_tasks_delete ON public.maintenance_tasks;
CREATE POLICY maintenance_tasks_delete
  ON public.maintenance_tasks
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS contact_logs_update ON public.contact_logs;
CREATE POLICY contact_logs_update
  ON public.contact_logs
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin())
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS contact_logs_delete ON public.contact_logs;
CREATE POLICY contact_logs_delete
  ON public.contact_logs
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS sales_history_update ON public.sales_history;
DROP POLICY IF EXISTS sales_history_delete ON public.sales_history;

DROP POLICY IF EXISTS invoices_update ON public.invoices;
CREATE POLICY invoices_update
  ON public.invoices
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin())
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS invoices_delete ON public.invoices;
CREATE POLICY invoices_delete
  ON public.invoices
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS invoice_settings_update ON public.invoice_settings;
CREATE POLICY invoice_settings_update
  ON public.invoice_settings
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin())
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS invoice_settings_delete ON public.invoice_settings;
CREATE POLICY invoice_settings_delete
  ON public.invoice_settings
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id() AND auth.is_admin());

ALTER TABLE public.instrument_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instrument_images_insert ON public.instrument_images;
CREATE POLICY instrument_images_insert
  ON public.instrument_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = auth.org_id()
    )
  );

DROP POLICY IF EXISTS instrument_images_update ON public.instrument_images;
CREATE POLICY instrument_images_update
  ON public.instrument_images
  FOR UPDATE
  TO authenticated
  USING (
    auth.is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = auth.org_id()
    )
  )
  WITH CHECK (
    auth.is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = auth.org_id()
    )
  );

DROP POLICY IF EXISTS instrument_images_delete ON public.instrument_images;
CREATE POLICY instrument_images_delete
  ON public.instrument_images
  FOR DELETE
  TO authenticated
  USING (
    auth.is_admin()
    AND EXISTS (
      SELECT 1
      FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = auth.org_id()
    )
  );

DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'instrument_certificates'
  ) THEN
    EXECUTE 'ALTER TABLE public.instrument_certificates ENABLE ROW LEVEL SECURITY';

    FOR r IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'instrument_certificates'
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.instrument_certificates',
        r.policyname
      );
    END LOOP;

    EXECUTE $policy$
      CREATE POLICY instrument_certificates_select
        ON public.instrument_certificates
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.instruments AS i
            WHERE i.id = instrument_certificates.instrument_id
              AND i.org_id = auth.org_id()
          )
        )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY instrument_certificates_insert
        ON public.instrument_certificates
        FOR INSERT
        TO authenticated
        WITH CHECK (
          auth.is_admin()
          AND EXISTS (
            SELECT 1
            FROM public.instruments AS i
            WHERE i.id = instrument_certificates.instrument_id
              AND i.org_id = auth.org_id()
          )
        )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY instrument_certificates_update
        ON public.instrument_certificates
        FOR UPDATE
        TO authenticated
        USING (
          auth.is_admin()
          AND EXISTS (
            SELECT 1
            FROM public.instruments AS i
            WHERE i.id = instrument_certificates.instrument_id
              AND i.org_id = auth.org_id()
          )
        )
        WITH CHECK (
          auth.is_admin()
          AND EXISTS (
            SELECT 1
            FROM public.instruments AS i
            WHERE i.id = instrument_certificates.instrument_id
              AND i.org_id = auth.org_id()
          )
        )
    $policy$;
    EXECUTE $policy$
      CREATE POLICY instrument_certificates_delete
        ON public.instrument_certificates
        FOR DELETE
        TO authenticated
        USING (
          auth.is_admin()
          AND EXISTS (
            SELECT 1
            FROM public.instruments AS i
            WHERE i.id = instrument_certificates.instrument_id
              AND i.org_id = auth.org_id()
          )
        )
    $policy$;
  END IF;
END $$;

DROP POLICY IF EXISTS hc_v_instrument_certificates_insert ON storage.objects;
CREATE POLICY hc_v_instrument_certificates_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'instrument-certificates'
    AND (storage.foldername(name))[1] = auth.org_id()::text
    AND auth.is_admin()
  );

DROP POLICY IF EXISTS hc_v_instrument_certificates_delete ON storage.objects;
CREATE POLICY hc_v_instrument_certificates_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'instrument-certificates'
    AND (storage.foldername(name))[1] = auth.org_id()::text
    AND auth.is_admin()
  );

DROP POLICY IF EXISTS hc_v_instrument_images_insert ON storage.objects;
CREATE POLICY hc_v_instrument_images_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'instrument-images'
    AND (storage.foldername(name))[1] = auth.org_id()::text
    AND auth.is_admin()
  );

DROP POLICY IF EXISTS hc_v_instrument_images_delete ON storage.objects;
CREATE POLICY hc_v_instrument_images_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'instrument-images'
    AND (storage.foldername(name))[1] = auth.org_id()::text
    AND auth.is_admin()
  );

DROP POLICY IF EXISTS hc_v_invoice_images_insert ON storage.objects;
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
    AND auth.is_admin()
  );

DROP POLICY IF EXISTS hc_v_invoice_images_update ON storage.objects;
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
    AND auth.is_admin()
  )
  WITH CHECK (
    bucket_id = 'invoices'
    AND (
      (storage.foldername(name))[1] = auth.org_id()::text
      OR (storage.foldername(name))[2] = auth.org_id()::text
    )
    AND auth.is_admin()
  );

DROP POLICY IF EXISTS hc_v_invoice_images_delete ON storage.objects;
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
    AND auth.is_admin()
  );

CREATE OR REPLACE FUNCTION public.update_sale_notes_atomic(
  p_sale_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_sale_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context missing';
  END IF;

  IF NOT auth.is_admin() THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  UPDATE public.sales_history
  SET notes = p_notes
  WHERE id = p_sale_id
    AND org_id = v_org_id
  RETURNING id INTO v_sale_id;

  IF v_sale_id IS NULL THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  RETURN v_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_sale_notes_atomic(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_sale_notes_atomic(UUID, TEXT) TO authenticated;

COMMIT;
