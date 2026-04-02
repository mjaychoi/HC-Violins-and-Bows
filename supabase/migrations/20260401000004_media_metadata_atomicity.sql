-- Migration: serialize image/certificate metadata allocation
-- Created: 2026-04-01

CREATE OR REPLACE FUNCTION public.create_instrument_image_metadata(
  p_instrument_id UUID,
  p_image_url TEXT,
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
    file_name,
    file_size,
    mime_type,
    display_order
  )
  VALUES (
    p_instrument_id,
    p_image_url,
    p_file_name,
    p_file_size,
    p_mime_type,
    v_display_order
  )
  RETURNING id INTO v_image_id;

  RETURN v_image_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_instrument_certificate_metadata(
  p_instrument_id UUID,
  p_storage_path TEXT,
  p_original_name TEXT,
  p_mime_type TEXT,
  p_size BIGINT,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_certificate_id UUID;
  v_version INTEGER;
  v_has_primary BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_instrument_id::text, 202));

  SELECT COALESCE(MAX(version), 0) + 1,
         COALESCE(BOOL_OR(is_primary), FALSE)
    INTO v_version, v_has_primary
  FROM public.instrument_certificates
  WHERE instrument_id = p_instrument_id;

  INSERT INTO public.instrument_certificates (
    instrument_id,
    storage_path,
    original_name,
    mime_type,
    size,
    created_by,
    is_primary,
    version
  )
  VALUES (
    p_instrument_id,
    p_storage_path,
    p_original_name,
    p_mime_type,
    p_size,
    p_created_by,
    NOT v_has_primary,
    v_version
  )
  RETURNING id INTO v_certificate_id;

  RETURN v_certificate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_instrument_image_metadata(UUID, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_instrument_certificate_metadata(UUID, TEXT, TEXT, TEXT, BIGINT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_instrument_image_metadata(UUID, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_instrument_certificate_metadata(UUID, TEXT, TEXT, TEXT, BIGINT, UUID) TO authenticated;
