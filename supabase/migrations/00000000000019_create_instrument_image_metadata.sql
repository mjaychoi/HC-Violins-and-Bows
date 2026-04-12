CREATE OR REPLACE FUNCTION public.create_instrument_image_metadata(
  p_instrument_id UUID,
  p_image_url     TEXT,
  p_storage_key   TEXT,
  p_file_name     TEXT,
  p_file_size     BIGINT,
  p_mime_type     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_image_id      UUID;
  v_display_order INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_instrument_id::text, 101));

  SELECT COALESCE(MAX(display_order), -1) + 1 INTO v_display_order
  FROM public.instrument_images
  WHERE instrument_id = p_instrument_id;

  INSERT INTO public.instrument_images (
    instrument_id, image_url, storage_key, file_name, file_size, mime_type, display_order
  ) VALUES (
    p_instrument_id, p_image_url, p_storage_key, p_file_name, p_file_size, p_mime_type, v_display_order
  )
  RETURNING id INTO v_image_id;

  RETURN v_image_id;
END;
$$;
