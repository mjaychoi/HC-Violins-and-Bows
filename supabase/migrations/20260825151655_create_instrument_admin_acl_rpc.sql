-- Restore admin instrument creation without weakening the column-level
-- confidentiality boundary established by 20260814160000.
--
-- Deliberately no org_id parameter: the tenant is always derived from the
-- signed request context.
CREATE OR REPLACE FUNCTION public.create_instrument_admin(
  p_type TEXT DEFAULT NULL,
  p_maker TEXT DEFAULT NULL,
  p_subtype TEXT DEFAULT NULL,
  p_year INTEGER DEFAULT NULL,
  p_certificate BOOLEAN DEFAULT FALSE,
  p_certificate_name TEXT DEFAULT NULL,
  p_cost_price NUMERIC DEFAULT NULL,
  p_consignment_price NUMERIC DEFAULT NULL,
  p_size TEXT DEFAULT NULL,
  p_weight TEXT DEFAULT NULL,
  p_price NUMERIC DEFAULT NULL,
  p_ownership TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_serial_number TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'Available',
  p_reserved_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id UUID := public.org_id();
  v_status TEXT := COALESCE(p_status, 'Available');
  v_created public.instruments%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin role required'
      USING ERRCODE = '42501';
  END IF;

  IF v_org_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.organizations AS o
       WHERE o.id = v_org_id
     ) THEN
    RAISE EXCEPTION 'Valid organization context required'
      USING ERRCODE = '42501';
  END IF;

  IF v_status = 'Sold' THEN
    RAISE EXCEPTION 'Instrument status cannot be set to Sold directly'
      USING ERRCODE = '22023';
  END IF;

  IF v_status = 'Reserved'
     AND NULLIF(BTRIM(p_reserved_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Reserved status requires a reserved_reason'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.instruments (
    org_id,
    type,
    maker,
    subtype,
    year,
    certificate,
    certificate_name,
    cost_price,
    consignment_price,
    size,
    weight,
    price,
    ownership,
    note,
    serial_number,
    status,
    reserved_reason,
    reserved_by_user_id,
    reserved_connection_id
  )
  VALUES (
    v_org_id,
    p_type,
    p_maker,
    p_subtype,
    p_year,
    COALESCE(p_certificate, FALSE),
    CASE
      WHEN COALESCE(p_certificate, FALSE) THEN p_certificate_name
      ELSE NULL
    END,
    p_cost_price,
    p_consignment_price,
    p_size,
    p_weight,
    p_price,
    p_ownership,
    p_note,
    p_serial_number,
    v_status,
    CASE WHEN v_status = 'Reserved' THEN p_reserved_reason ELSE NULL END,
    CASE WHEN v_status = 'Reserved' THEN auth.uid() ELSE NULL END,
    NULL
  )
  RETURNING * INTO v_created;

  RETURN jsonb_build_object(
    'id', v_created.id,
    'org_id', v_created.org_id,
    'type', v_created.type,
    'maker', v_created.maker,
    'subtype', v_created.subtype,
    'year', v_created.year,
    'certificate', v_created.certificate,
    'certificate_name', v_created.certificate_name,
    'cost_price', v_created.cost_price,
    'consignment_price', v_created.consignment_price,
    'size', v_created.size,
    'weight', v_created.weight,
    'price', v_created.price,
    'ownership', v_created.ownership,
    'note', v_created.note,
    'serial_number', v_created.serial_number,
    'status', v_created.status,
    'reserved_reason', v_created.reserved_reason,
    'reserved_by_user_id', v_created.reserved_by_user_id,
    'reserved_connection_id', v_created.reserved_connection_id,
    'created_at', v_created.created_at,
    'updated_at', v_created.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.create_instrument_admin(
  TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, NUMERIC, NUMERIC,
  TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT
) IS
  'Admin-only instrument creation. Derives org_id from the authenticated request and returns only the created row.';

REVOKE ALL ON FUNCTION public.create_instrument_admin(
  TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, NUMERIC, NUMERIC,
  TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_instrument_admin(
  TEXT, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, NUMERIC, NUMERIC,
  TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
