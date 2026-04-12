CREATE OR REPLACE FUNCTION public.update_sale_notes_atomic(
  p_sale_id UUID,
  p_notes   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id  UUID := public.org_id();
  v_sale_id UUID;
BEGIN
  IF v_org_id IS NULL      THEN RAISE EXCEPTION 'Organization context missing'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin role required'; END IF;

  UPDATE public.sales_history
  SET notes = p_notes
  WHERE id = p_sale_id AND org_id = v_org_id
  RETURNING id INTO v_sale_id;

  IF v_sale_id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  RETURN v_sale_id;
END;
$$;
