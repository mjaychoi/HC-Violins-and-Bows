-- ============================================================
-- RLS Policies — all tables, org-scoped, admin-gated writes.
--
-- Read  → any authenticated member of the org
-- Write → admin only (except notification_settings which are per-user)
--
-- All policies use public.org_id() / public.is_admin() — NOT auth schema.
-- ============================================================

-- ──────────────────────────────────────────────
-- Enable RLS on every tenant-owned table
-- ──────────────────────────────────────────────
ALTER TABLE public.organizations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instruments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_instruments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_history             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_images         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_certificates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_idempotency_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_idempotency_keys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_image_uploads     ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────
-- ORGANIZATIONS  (read own org; no direct write via API)
-- ──────────────────────────────────────────────
CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.org_id());

-- ──────────────────────────────────────────────
-- INSTRUMENTS
-- ──────────────────────────────────────────────
CREATE POLICY instruments_select ON public.instruments
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY instruments_insert ON public.instruments
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY instruments_update ON public.instruments
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY instruments_delete ON public.instruments
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

-- ──────────────────────────────────────────────
-- CLIENTS
-- ──────────────────────────────────────────────
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY clients_insert ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY clients_update ON public.clients
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY clients_delete ON public.clients
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

-- ──────────────────────────────────────────────
-- CLIENT_INSTRUMENTS
-- ──────────────────────────────────────────────
CREATE POLICY client_instruments_select ON public.client_instruments
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY client_instruments_insert ON public.client_instruments
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY client_instruments_update ON public.client_instruments
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY client_instruments_delete ON public.client_instruments
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

-- ──────────────────────────────────────────────
-- SALES_HISTORY  (insert via RPC only; no direct UPDATE/DELETE)
-- ──────────────────────────────────────────────
CREATE POLICY sales_history_select ON public.sales_history
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY sales_history_insert ON public.sales_history
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

-- UPDATE and DELETE intentionally omitted: use atomic RPCs only.

-- ──────────────────────────────────────────────
-- INVOICES
-- ──────────────────────────────────────────────
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY invoices_insert ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoices_delete ON public.invoices
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

-- ──────────────────────────────────────────────
-- INVOICE_ITEMS
-- ──────────────────────────────────────────────
CREATE POLICY invoice_items_select ON public.invoice_items
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY invoice_items_insert ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoice_items_update ON public.invoice_items
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoice_items_delete ON public.invoice_items
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

-- ──────────────────────────────────────────────
-- INVOICE_SETTINGS
-- ──────────────────────────────────────────────
CREATE POLICY invoice_settings_select ON public.invoice_settings
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY invoice_settings_insert ON public.invoice_settings
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoice_settings_update ON public.invoice_settings
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoice_settings_delete ON public.invoice_settings
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

-- ──────────────────────────────────────────────
-- INSTRUMENT_IMAGES  (tenant isolation via parent instrument)
-- ──────────────────────────────────────────────
CREATE POLICY instrument_images_select ON public.instrument_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = public.org_id()
    )
  );

CREATE POLICY instrument_images_insert ON public.instrument_images
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = public.org_id()
    )
  );

CREATE POLICY instrument_images_update ON public.instrument_images
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = public.org_id()
    )
  )
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = public.org_id()
    )
  );

CREATE POLICY instrument_images_delete ON public.instrument_images
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.instruments AS i
      WHERE i.id = instrument_images.instrument_id
        AND i.org_id = public.org_id()
    )
  );

-- ──────────────────────────────────────────────
-- INSTRUMENT_CERTIFICATES
-- ──────────────────────────────────────────────
CREATE POLICY instrument_certificates_select ON public.instrument_certificates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.instruments AS i
      WHERE i.id = instrument_certificates.instrument_id
        AND i.org_id = public.org_id()
    )
  );

CREATE POLICY instrument_certificates_insert ON public.instrument_certificates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.instruments AS i
      WHERE i.id = instrument_certificates.instrument_id
        AND i.org_id = public.org_id()
    )
  );

CREATE POLICY instrument_certificates_update ON public.instrument_certificates
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.instruments AS i
      WHERE i.id = instrument_certificates.instrument_id
        AND i.org_id = public.org_id()
    )
  )
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.instruments AS i
      WHERE i.id = instrument_certificates.instrument_id
        AND i.org_id = public.org_id()
    )
  );

CREATE POLICY instrument_certificates_delete ON public.instrument_certificates
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.instruments AS i
      WHERE i.id = instrument_certificates.instrument_id
        AND i.org_id = public.org_id()
    )
  );

-- ──────────────────────────────────────────────
-- MAINTENANCE_TASKS
-- ──────────────────────────────────────────────
CREATE POLICY maintenance_tasks_select ON public.maintenance_tasks
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY maintenance_tasks_insert ON public.maintenance_tasks
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id());

CREATE POLICY maintenance_tasks_update ON public.maintenance_tasks
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY maintenance_tasks_delete ON public.maintenance_tasks
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

-- ──────────────────────────────────────────────
-- CONTACT_LOGS
-- ──────────────────────────────────────────────
CREATE POLICY contact_logs_select ON public.contact_logs
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY contact_logs_insert ON public.contact_logs
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id());

CREATE POLICY contact_logs_update ON public.contact_logs
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY contact_logs_delete ON public.contact_logs
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

-- ──────────────────────────────────────────────
-- NOTIFICATION_SETTINGS  (per-user, per-org)
-- ──────────────────────────────────────────────
CREATE POLICY notification_settings_select ON public.notification_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND org_id = public.org_id());

CREATE POLICY notification_settings_insert ON public.notification_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND org_id = public.org_id());

CREATE POLICY notification_settings_update ON public.notification_settings
  FOR UPDATE TO authenticated
  USING    (user_id = auth.uid() AND org_id = public.org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = public.org_id());

-- ──────────────────────────────────────────────
-- INVOICE_IDEMPOTENCY_KEYS
-- ──────────────────────────────────────────────
CREATE POLICY invoice_idempotency_keys_select ON public.invoice_idempotency_keys
  FOR SELECT TO authenticated
  USING (org_id = public.org_id() AND user_id = auth.uid());

CREATE POLICY invoice_idempotency_keys_insert ON public.invoice_idempotency_keys
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND user_id = auth.uid());

CREATE POLICY invoice_idempotency_keys_update ON public.invoice_idempotency_keys
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND user_id = auth.uid())
  WITH CHECK (org_id = public.org_id() AND user_id = auth.uid());

CREATE POLICY invoice_idempotency_keys_delete ON public.invoice_idempotency_keys
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND user_id = auth.uid());

-- ──────────────────────────────────────────────
-- SALES_IDEMPOTENCY_KEYS
-- ──────────────────────────────────────────────
CREATE POLICY sales_idempotency_keys_select ON public.sales_idempotency_keys
  FOR SELECT TO authenticated
  USING (org_id = public.org_id() AND user_id = auth.uid());

CREATE POLICY sales_idempotency_keys_insert ON public.sales_idempotency_keys
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND user_id = auth.uid());

CREATE POLICY sales_idempotency_keys_update ON public.sales_idempotency_keys
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND user_id = auth.uid())
  WITH CHECK (org_id = public.org_id() AND user_id = auth.uid());

CREATE POLICY sales_idempotency_keys_delete ON public.sales_idempotency_keys
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND user_id = auth.uid());

-- ──────────────────────────────────────────────
-- INVOICE_IMAGE_UPLOADS
-- ──────────────────────────────────────────────
CREATE POLICY invoice_image_uploads_select ON public.invoice_image_uploads
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY invoice_image_uploads_insert ON public.invoice_image_uploads
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoice_image_uploads_update ON public.invoice_image_uploads
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

-- ──────────────────────────────────────────────
-- STORAGE POLICIES
-- ──────────────────────────────────────────────

-- instrument-images bucket
DROP POLICY IF EXISTS hc_v_instrument_images_insert ON storage.objects;
DROP POLICY IF EXISTS hc_v_instrument_images_select ON storage.objects;
DROP POLICY IF EXISTS hc_v_instrument_images_delete ON storage.objects;

CREATE POLICY hc_v_instrument_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'instrument-images'
    AND (storage.foldername(name))[1] = public.org_id()::text
    AND public.is_admin()
  );

CREATE POLICY hc_v_instrument_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'instrument-images'
    AND (storage.foldername(name))[1] = public.org_id()::text
  );

CREATE POLICY hc_v_instrument_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'instrument-images'
    AND (storage.foldername(name))[1] = public.org_id()::text
    AND public.is_admin()
  );

-- instrument-certificates bucket
DROP POLICY IF EXISTS hc_v_instrument_certificates_insert ON storage.objects;
DROP POLICY IF EXISTS hc_v_instrument_certificates_select ON storage.objects;
DROP POLICY IF EXISTS hc_v_instrument_certificates_delete ON storage.objects;

CREATE POLICY hc_v_instrument_certificates_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'instrument-certificates'
    AND (storage.foldername(name))[1] = public.org_id()::text
    AND public.is_admin()
  );

CREATE POLICY hc_v_instrument_certificates_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'instrument-certificates'
    AND (storage.foldername(name))[1] = public.org_id()::text
  );

CREATE POLICY hc_v_instrument_certificates_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'instrument-certificates'
    AND (storage.foldername(name))[1] = public.org_id()::text
    AND public.is_admin()
  );

-- invoices bucket
DROP POLICY IF EXISTS hc_v_invoice_images_insert ON storage.objects;
DROP POLICY IF EXISTS hc_v_invoice_images_select ON storage.objects;
DROP POLICY IF EXISTS hc_v_invoice_images_update ON storage.objects;
DROP POLICY IF EXISTS hc_v_invoice_images_delete ON storage.objects;

CREATE POLICY hc_v_invoice_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = public.org_id()::text
    AND array_length(storage.foldername(name), 1) = 2
    AND public.is_admin()
  );

CREATE POLICY hc_v_invoice_images_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = public.org_id()::text
    AND array_length(storage.foldername(name), 1) = 2
  );

CREATE POLICY hc_v_invoice_images_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = public.org_id()::text
    AND array_length(storage.foldername(name), 1) = 2
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = public.org_id()::text
    AND array_length(storage.foldername(name), 1) = 2
    AND public.is_admin()
  );

CREATE POLICY hc_v_invoice_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = public.org_id()::text
    AND array_length(storage.foldername(name), 1) = 2
    AND public.is_admin()
  );
