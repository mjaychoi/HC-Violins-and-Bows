CREATE OR REPLACE FUNCTION public.create_invoice_atomic_idempotent(
  p_route_key       TEXT,
  p_idempotency_key TEXT,
  p_request_hash    TEXT,
  p_invoice         JSONB,
  p_items           JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id                UUID := public.org_id();
  v_user_id               UUID := auth.uid();
  v_invoice_id            UUID;
  v_existing_request_hash TEXT;
  v_existing_invoice_id   UUID;
  v_reserved              BOOLEAN := FALSE;
BEGIN
  IF v_org_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication context missing';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN public.create_invoice_atomic(p_invoice, p_items);
  END IF;

  LOOP
    INSERT INTO public.invoice_idempotency_keys (
      org_id, user_id, route_key, idempotency_key, request_hash
    )
    VALUES (v_org_id, v_user_id, p_route_key, p_idempotency_key, p_request_hash)
    ON CONFLICT (org_id, user_id, route_key, idempotency_key) DO NOTHING;

    IF FOUND THEN v_reserved := TRUE; EXIT; END IF;

    SELECT request_hash, invoice_id
      INTO v_existing_request_hash, v_existing_invoice_id
    FROM public.invoice_idempotency_keys
    WHERE org_id = v_org_id AND user_id = v_user_id
      AND route_key = p_route_key AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF NOT FOUND THEN CONTINUE; END IF;
    IF v_existing_request_hash <> p_request_hash THEN
      RAISE EXCEPTION 'Idempotency key reuse with different payload';
    END IF;
    IF v_existing_invoice_id IS NOT NULL THEN RETURN v_existing_invoice_id; END IF;
    RAISE EXCEPTION 'Idempotent request is already in progress';
  END LOOP;

  v_invoice_id := public.create_invoice_atomic(p_invoice, p_items);

  UPDATE public.invoice_idempotency_keys
  SET invoice_id = v_invoice_id
  WHERE org_id = v_org_id AND user_id = v_user_id
    AND route_key = p_route_key AND idempotency_key = p_idempotency_key;

  RETURN v_invoice_id;
EXCEPTION WHEN OTHERS THEN
  IF v_reserved THEN
    DELETE FROM public.invoice_idempotency_keys
    WHERE org_id = v_org_id AND user_id = v_user_id
      AND route_key = p_route_key AND idempotency_key = p_idempotency_key
      AND invoice_id IS NULL;
  END IF;
  RAISE;
END;
$$;
