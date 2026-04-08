-- Migration: enforce tenant isolation with org-scoped RLS
-- Created: 2026-04-01

-- 1) JWT helper
CREATE OR REPLACE FUNCTION auth.org_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'org_id'),
    (auth.jwt() -> 'app_metadata' ->> 'organization_id'),
    (auth.jwt() ->> 'org_id')
  )::uuid
$$;

-- 2) Add org_id where missing
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_org_id ON public.clients(org_id);

ALTER TABLE public.instruments
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_instruments_org_id ON public.instruments(org_id);

ALTER TABLE public.client_instruments
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_client_instruments_org_id ON public.client_instruments(org_id);

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_org_id ON public.maintenance_tasks(org_id);

ALTER TABLE public.contact_logs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contact_logs_org_id ON public.contact_logs(org_id);

ALTER TABLE public.sales_history
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_history_org_id ON public.sales_history(org_id);

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_org_id ON public.invoice_items(org_id);

-- 3) Safe automatic backfill for rows whose org is derivable from a parent
UPDATE public.invoice_items AS ii
SET org_id = i.org_id
FROM public.invoices AS i
WHERE ii.invoice_id = i.id
  AND ii.org_id IS NULL
  AND i.org_id IS NOT NULL;

UPDATE public.client_instruments AS ci
SET org_id = c.org_id
FROM public.clients AS c
WHERE ci.client_id = c.id
  AND ci.org_id IS NULL
  AND c.org_id IS NOT NULL;

UPDATE public.contact_logs AS cl
SET org_id = c.org_id
FROM public.clients AS c
WHERE cl.client_id = c.id
  AND cl.org_id IS NULL
  AND c.org_id IS NOT NULL;

UPDATE public.maintenance_tasks AS mt
SET org_id = i.org_id
FROM public.instruments AS i
WHERE mt.instrument_id = i.id
  AND mt.org_id IS NULL
  AND i.org_id IS NOT NULL;

-- sales_history may be derivable from the linked instrument
UPDATE public.sales_history AS sh
SET org_id = i.org_id
FROM public.instruments AS i
WHERE sh.instrument_id = i.id
  AND sh.org_id IS NULL
  AND i.org_id IS NOT NULL;

-- 4) Enable RLS on every tenant-owned table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 5) Replace existing policies with org-scoped policies

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'clients',
        'instruments',
        'client_instruments',
        'maintenance_tasks',
        'contact_logs',
        'sales_history',
        'invoices',
        'invoice_items',
        'invoice_settings',
        'organizations'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  END LOOP;
END $$;

CREATE POLICY clients_select
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY clients_insert
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY clients_update
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY clients_delete
  ON public.clients
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY instruments_select
  ON public.instruments
  FOR SELECT
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY instruments_insert
  ON public.instruments
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY instruments_update
  ON public.instruments
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY instruments_delete
  ON public.instruments
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY client_instruments_select
  ON public.client_instruments
  FOR SELECT
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY client_instruments_insert
  ON public.client_instruments
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY client_instruments_update
  ON public.client_instruments
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY client_instruments_delete
  ON public.client_instruments
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY maintenance_tasks_select
  ON public.maintenance_tasks
  FOR SELECT
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY maintenance_tasks_insert
  ON public.maintenance_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY maintenance_tasks_update
  ON public.maintenance_tasks
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY maintenance_tasks_delete
  ON public.maintenance_tasks
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY contact_logs_select
  ON public.contact_logs
  FOR SELECT
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY contact_logs_insert
  ON public.contact_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY contact_logs_update
  ON public.contact_logs
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY contact_logs_delete
  ON public.contact_logs
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY sales_history_select
  ON public.sales_history
  FOR SELECT
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY sales_history_insert
  ON public.sales_history
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY sales_history_update
  ON public.sales_history
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY sales_history_delete
  ON public.sales_history
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY invoices_select
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY invoices_insert
  ON public.invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY invoices_update
  ON public.invoices
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY invoices_delete
  ON public.invoices
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY invoice_items_select
  ON public.invoice_items
  FOR SELECT
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY invoice_items_insert
  ON public.invoice_items
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY invoice_items_update
  ON public.invoice_items
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY invoice_items_delete
  ON public.invoice_items
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY invoice_settings_select
  ON public.invoice_settings
  FOR SELECT
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY invoice_settings_insert
  ON public.invoice_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY invoice_settings_update
  ON public.invoice_settings
  FOR UPDATE
  TO authenticated
  USING (org_id = auth.org_id())
  WITH CHECK (org_id = auth.org_id());

CREATE POLICY invoice_settings_delete
  ON public.invoice_settings
  FOR DELETE
  TO authenticated
  USING (org_id = auth.org_id());

CREATE POLICY organizations_select
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (id = auth.org_id());

-- 6) Optional storage hardening for Supabase Storage-backed certificate files
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
        'Allow authenticated users to upload certificate files',
        'Allow authenticated users to view certificate files',
        'Allow authenticated users to delete certificate files',
        'hc_v_instrument_certificates_insert',
        'hc_v_instrument_certificates_select',
        'hc_v_instrument_certificates_delete'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY hc_v_instrument_certificates_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'instrument-certificates'
    AND (storage.foldername(name))[1] = auth.org_id()::text
  );

CREATE POLICY hc_v_instrument_certificates_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'instrument-certificates'
    AND (storage.foldername(name))[1] = auth.org_id()::text
  );

CREATE POLICY hc_v_instrument_certificates_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'instrument-certificates'
    AND (storage.foldername(name))[1] = auth.org_id()::text
  );
