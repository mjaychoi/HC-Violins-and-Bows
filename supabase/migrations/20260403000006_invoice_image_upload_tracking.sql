CREATE TABLE IF NOT EXISTS public.invoice_image_uploads (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  uploaded_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_invoice_id UUID NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL DEFAULT (now() + interval '24 hours'),
  PRIMARY KEY (org_id, file_path)
);

ALTER TABLE public.invoice_image_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_image_uploads_select
  ON public.invoice_image_uploads;
DROP POLICY IF EXISTS invoice_image_uploads_insert
  ON public.invoice_image_uploads;
DROP POLICY IF EXISTS invoice_image_uploads_update
  ON public.invoice_image_uploads;

CREATE POLICY invoice_image_uploads_select
  ON public.invoice_image_uploads
  FOR SELECT
  USING (org_id = auth.org_id());

CREATE POLICY invoice_image_uploads_insert
  ON public.invoice_image_uploads
  FOR INSERT
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

CREATE POLICY invoice_image_uploads_update
  ON public.invoice_image_uploads
  FOR UPDATE
  USING (org_id = auth.org_id() AND auth.is_admin())
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

CREATE INDEX IF NOT EXISTS idx_invoice_image_uploads_linked_invoice_id
  ON public.invoice_image_uploads(linked_invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_image_uploads_expired_unclaimed
  ON public.invoice_image_uploads(org_id, expires_at)
  WHERE linked_invoice_id IS NULL;
