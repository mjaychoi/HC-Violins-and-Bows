CREATE OR REPLACE FUNCTION public.create_sale_atomic_idempotent(
  p_route_key       TEXT,
  p_idempotency_key TEXT,
  p_request_hash    TEXT,
  p_sale_price      NUMERIC,
  p_sale_date       DATE,
  p_client_id       UUID,
  p_instrument_id   UUID,
  p_notes           TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id                UUID := public.org_id();
  v_user_id               UUID := auth.uid();
  v_sale_id               UUID;
  v_existing_request_hash TEXT;
  v_existing_sale_id      UUID;
  v_reserved              BOOLEAN := FALSE;
BEGIN
  IF v_org_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication context missing';
  END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin role required'; END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  LOOP
    INSERT INTO public.sales_idempotency_keys (
      org_id, user_id, route_key, idempotency_key, request_hash
    )
    VALUES (v_org_id, v_user_id, p_route_key, p_idempotency_key, p_request_hash)
    ON CONFLICT (org_id, user_id, route_key, idempotency_key) DO NOTHING;

    IF FOUND THEN v_reserved := TRUE; EXIT; END IF;

    SELECT request_hash, sale_id
      INTO v_existing_request_hash, v_existing_sale_id
    FROM public.sales_idempotency_keys
    WHERE org_id = v_org_id AND user_id = v_user_id
      AND route_key = p_route_key AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF NOT FOUND THEN CONTINUE; END IF;
    IF v_existing_request_hash <> p_request_hash THEN
      RAISE EXCEPTION 'Idempotency key reuse with different payload';
    END IF;
    IF v_existing_sale_id IS NOT NULL THEN RETURN v_existing_sale_id; END IF;
    RAISE EXCEPTION 'Idempotent request is already in progress';
  END LOOP;

  v_sale_id := public.create_sale_atomic(
    p_sale_price, p_sale_date, p_client_id, p_instrument_id, p_notes
  );

  UPDATE public.sales_idempotency_keys
  SET sale_id = v_sale_id
  WHERE org_id = v_org_id AND user_id = v_user_id
    AND route_key = p_route_key AND idempotency_key = p_idempotency_key;

  RETURN v_sale_id;
EXCEPTION WHEN OTHERS THEN
  IF v_reserved THEN
    DELETE FROM public.sales_idempotency_keys
    WHERE org_id = v_org_id AND user_id = v_user_id
      AND route_key = p_route_key AND idempotency_key = p_idempotency_key
      AND sale_id IS NULL;
  END IF;
  RAISE;
END;
$$;
