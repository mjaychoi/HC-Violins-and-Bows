-- Allow instruments with maker-only or type-only identity.
-- Add certificate_name for optional display label when certificate = true.

ALTER TABLE public.instruments
  ADD COLUMN IF NOT EXISTS certificate_name TEXT;

ALTER TABLE public.instruments
  ALTER COLUMN type DROP NOT NULL;

COMMENT ON COLUMN public.instruments.certificate_name IS
  'Optional display name for certificate badge when certificate is true';
