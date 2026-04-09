-- Canonicalize instrument image storage identity.
-- The storage layer returned key is the only safe physical object key.
-- This migration is incremental and must not recreate or reset schema.

BEGIN;

-- 1) Add canonical storage key column.
ALTER TABLE public.instrument_images
ADD COLUMN IF NOT EXISTS storage_key TEXT NULL;

COMMENT ON COLUMN public.instrument_images.storage_key IS
  'Canonical physical storage object key returned by the storage layer.';

-- 2) Best-effort backfill for legacy rows.
-- Keep this conservative: only fill rows that are currently NULL.
UPDATE public.instrument_images
SET storage_key = CASE
  -- Supabase public storage URL
  WHEN image_url LIKE '%/storage/v1/object/public/instrument-images/%'
    THEN substring(
      image_url FROM '.*/storage/v1/object/public/instrument-images/(.+)$'
    )

  -- Common AWS S3 virtual-hosted-style URL
  WHEN image_url LIKE 'https://%.s3%.amazonaws.com/%'
    THEN substring(image_url FROM 'https?://[^/]+/(.+)$')

  -- Local/test storage adapters
  WHEN image_url LIKE 'file://%'
    THEN regexp_replace(image_url, '^file://', '')
  WHEN image_url LIKE 'memory://%'
    THEN regexp_replace(image_url, '^memory://', '')

  ELSE NULL
END
WHERE storage_key IS NULL
  AND image_url IS NOT NULL;

-- 3) Replace legacy metadata writer function with storage_key-aware version.
-- Drop known previous signatures explicitly so the app does not accidentally
-- call an outdated overload.
DROP FUNCTION IF EXISTS public.create_instrument_image_metadata(UUID, TEXT, TEXT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.create_instrument_image_metadata(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public.create_instrument_image_metadata(
  p_instrument_id UUID,
  p_image_url TEXT,
  p_storage_key TEXT,
  p_file_name TEXT,
  p_file_size BIGINT,
  p_mime_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_image_id UUID;
  v_display_order INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_instrument_id::text, 101));

  SELECT COALESCE(MAX(display_order), -1) + 1
    INTO v_display_order
  FROM public.instrument_images
  WHERE instrument_id = p_instrument_id;

  INSERT INTO public.instrument_images (
    instrument_id,
    image_url,
    storage_key,
    file_name,
    file_size,
    mime_type,
    display_order
  )
  VALUES (
    p_instrument_id,
    p_image_url,
    p_storage_key,
    p_file_name,
    p_file_size,
    p_mime_type,
    v_display_order
  )
  RETURNING id INTO v_image_id;

  RETURN v_image_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_instrument_image_metadata(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_instrument_image_metadata(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;

COMMIT;

-- Post-migration verification:
-- 1) Count unresolved legacy rows.
-- SELECT COUNT(*)
-- FROM public.instrument_images
-- WHERE storage_key IS NULL;

-- 2) Inspect unresolved rows for manual reconciliation.
-- SELECT id, instrument_id, image_url, file_name, created_at
-- FROM public.instrument_images
-- WHERE storage_key IS NULL
-- ORDER BY created_at DESC
-- LIMIT 50;

-- 3) Sanity-check newly backfilled keys.
-- SELECT id, image_url, storage_key
-- FROM public.instrument_images
-- WHERE storage_key IS NOT NULL
-- ORDER BY created_at DESC
-- LIMIT 50;