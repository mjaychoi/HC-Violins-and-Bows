-- Additive schema-drift hardening for API routes that select/write columns
-- introduced through CREATE TABLE IF NOT EXISTS migration paths.
-- Safe on already-correct databases and populated databases.

ALTER TABLE public.instrument_images
  ADD COLUMN IF NOT EXISTS storage_key TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.client_instruments
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_id_client_number
  ON public.clients (org_id, client_number)
  WHERE client_number IS NOT NULL;
