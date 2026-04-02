-- Migration: release performance indexes
-- Created: 2026-04-01

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id_org_id
  ON public.invoice_items(invoice_id, org_id);

CREATE INDEX IF NOT EXISTS idx_client_instruments_instrument_relationship_org
  ON public.client_instruments(instrument_id, relationship_type, org_id);

CREATE INDEX IF NOT EXISTS idx_sales_history_instrument_org_sale_date
  ON public.sales_history(instrument_id, org_id, sale_date);

CREATE INDEX IF NOT EXISTS idx_instrument_images_instrument_display_order
  ON public.instrument_images(instrument_id, display_order);

CREATE INDEX IF NOT EXISTS idx_instrument_certificates_instrument_created_at_desc
  ON public.instrument_certificates(instrument_id, created_at DESC);
