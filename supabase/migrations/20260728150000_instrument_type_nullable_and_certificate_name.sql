-- Allow instruments with maker-only or type-only identity.
-- Add certificate_name for optional display label when certificate = true.

ALTER TABLE public.instruments
  ADD COLUMN IF NOT EXISTS certificate_name TEXT;

ALTER TABLE public.instruments
  ALTER COLUMN type DROP NOT NULL;

COMMENT ON COLUMN public.instruments.certificate_name IS
  'Optional display name for certificate badge when certificate is true';

ALTER TABLE public.instruments
  DROP CONSTRAINT IF EXISTS instruments_identity_check;

ALTER TABLE public.instruments
  ADD CONSTRAINT instruments_identity_check
  CHECK (
    NULLIF(BTRIM(maker), '') IS NOT NULL
    OR NULLIF(BTRIM(type), '') IS NOT NULL
  );

ALTER TABLE public.instruments
  DROP CONSTRAINT IF EXISTS instruments_certificate_name_check;

ALTER TABLE public.instruments
  ADD CONSTRAINT instruments_certificate_name_check
  CHECK (
    certificate = true
    OR NULLIF(BTRIM(certificate_name), '') IS NULL
  );
