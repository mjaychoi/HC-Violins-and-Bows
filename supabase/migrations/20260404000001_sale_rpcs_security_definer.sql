BEGIN;

-- Migration: standardize all sale mutation RPCs to SECURITY DEFINER
--
-- Background:
--   update_sale_notes_atomic already uses SECURITY DEFINER because
--   sales_history has no UPDATE RLS policy (by design — all mutations
--   are forced through RPCs). For consistency, the other sale mutation
--   RPCs are converted to SECURITY DEFINER as well.
--
--   SECURITY INVOKER functions relied on RLS INSERT policy for org/admin
--   enforcement. SECURITY DEFINER functions bypass RLS, so each function
--   must explicitly validate org_id and admin role before any DML.

-- 1) create_sale_atomic
CREATE OR REPLACE FUNCTION public.create_sale_atomic(
  p_sale_price NUMERIC,
  p_sale_date DATE,
  p_client_id UUID,
  p_instrument_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_sale_id UUID;
  v_instrument_status TEXT;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF NOT auth.is_admin() THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF p_sale_price IS NULL OR p_sale_price = 0 THEN
    RAISE EXCEPTION 'Sale price cannot be zero';
  END IF;

  IF p_instrument_id IS NOT NULL THEN
    SELECT status
      INTO v_instrument_status
    FROM public.instruments
    WHERE id = p_instrument_id
      AND org_id = v_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Instrument not found';
    END IF;

    IF v_instrument_status = 'Sold' THEN
      RAISE EXCEPTION 'Instrument is already sold';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sales_history
      WHERE instrument_id = p_instrument_id
        AND org_id = v_org_id
        AND sale_price > 0
    ) THEN
      RAISE EXCEPTION 'Instrument already has a completed sale record';
    END IF;
  END IF;

  INSERT INTO public.sales_history (
    sale_price,
    sale_date,
    client_id,
    instrument_id,
    notes,
    org_id
  )
  VALUES (
    p_sale_price,
    p_sale_date,
    p_client_id,
    p_instrument_id,
    p_notes,
    v_org_id
  )
  RETURNING id INTO v_sale_id;

  IF p_instrument_id IS NOT NULL THEN
    UPDATE public.instruments
    SET status = 'Sold',
        reserved_reason = NULL,
        reserved_by_user_id = NULL,
        reserved_connection_id = NULL
    WHERE id = p_instrument_id
      AND org_id = v_org_id;
  END IF;

  IF p_client_id IS NOT NULL AND p_instrument_id IS NOT NULL THEN
    UPDATE public.client_instruments
    SET relationship_type = 'Sold'
    WHERE client_id = p_client_id
      AND instrument_id = p_instrument_id
      AND org_id = v_org_id;

    IF NOT FOUND THEN
      INSERT INTO public.client_instruments (
        client_id,
        instrument_id,
        relationship_type,
        org_id
      )
      VALUES (
        p_client_id,
        p_instrument_id,
        'Sold',
        v_org_id
      );
    END IF;
  END IF;

  RETURN v_sale_id;
END;
$$;

-- 2) create_sale_adjustment_atomic
--    Previously SECURITY INVOKER — relied on sales_history INSERT RLS policy for
--    admin check. Now explicitly verifies admin role before any DML.
CREATE OR REPLACE FUNCTION public.create_sale_adjustment_atomic(
  p_source_sale_id UUID,
  p_adjustment_kind TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_source RECORD;
  v_adjustment_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF NOT auth.is_admin() THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF p_adjustment_kind NOT IN ('refund', 'undo_refund') THEN
    RAISE EXCEPTION 'Unsupported sale adjustment kind';
  END IF;

  SELECT *
    INTO v_source
  FROM public.sales_history
  WHERE id = p_source_sale_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF p_adjustment_kind = 'refund' THEN
    IF v_source.sale_price <= 0 OR v_source.entry_kind <> 'sale' THEN
      RAISE EXCEPTION 'Only completed sale entries can be refunded';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sales_history
      WHERE adjustment_of_sale_id = p_source_sale_id
        AND org_id = v_org_id
        AND entry_kind = 'refund'
    ) THEN
      RAISE EXCEPTION 'Sale has already been refunded';
    END IF;

    INSERT INTO public.sales_history (
      instrument_id,
      client_id,
      sale_price,
      sale_date,
      notes,
      org_id,
      adjustment_of_sale_id,
      entry_kind
    )
    VALUES (
      v_source.instrument_id,
      v_source.client_id,
      -ABS(v_source.sale_price),
      v_source.sale_date,
      COALESCE(p_notes, v_source.notes),
      v_org_id,
      p_source_sale_id,
      'refund'
    )
    RETURNING id INTO v_adjustment_id;

    RETURN v_adjustment_id;
  END IF;

  IF v_source.sale_price >= 0 OR v_source.entry_kind <> 'refund' THEN
    RAISE EXCEPTION 'Only refund entries can be reversed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sales_history
    WHERE adjustment_of_sale_id = p_source_sale_id
      AND org_id = v_org_id
      AND entry_kind = 'undo_refund'
  ) THEN
    RAISE EXCEPTION 'Refund has already been undone';
  END IF;

  INSERT INTO public.sales_history (
    instrument_id,
    client_id,
    sale_price,
    sale_date,
    notes,
    org_id,
    adjustment_of_sale_id,
    entry_kind
  )
  VALUES (
    v_source.instrument_id,
    v_source.client_id,
    ABS(v_source.sale_price),
    v_source.sale_date,
    COALESCE(p_notes, v_source.notes),
    v_org_id,
    p_source_sale_id,
    'undo_refund'
  )
  RETURNING id INTO v_adjustment_id;

  RETURN v_adjustment_id;
END;
$$;

-- 3) create_sale_atomic_idempotent
CREATE OR REPLACE FUNCTION public.create_sale_atomic_idempotent(
  p_route_key TEXT,
  p_idempotency_key TEXT,
  p_request_hash TEXT,
  p_sale_price NUMERIC,
  p_sale_date DATE,
  p_client_id UUID,
  p_instrument_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_org_id UUID := auth.org_id();
  v_user_id UUID := auth.uid();
  v_sale_id UUID;
  v_existing_request_hash TEXT;
  v_existing_sale_id UUID;
  v_reserved BOOLEAN := FALSE;
BEGIN
  IF v_org_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication context missing';
  END IF;

  -- Guard here prevents a non-admin from poisoning an idempotency key slot
  -- before create_sale_atomic can reject them.
  IF NOT auth.is_admin() THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  LOOP
    INSERT INTO public.sales_idempotency_keys (
      org_id,
      user_id,
      route_key,
      idempotency_key,
      request_hash
    )
    VALUES (
      v_org_id,
      v_user_id,
      p_route_key,
      p_idempotency_key,
      p_request_hash
    )
    ON CONFLICT (org_id, user_id, route_key, idempotency_key) DO NOTHING;

    IF FOUND THEN
      v_reserved := TRUE;
      EXIT;
    END IF;

    SELECT request_hash, sale_id
      INTO v_existing_request_hash, v_existing_sale_id
    FROM public.sales_idempotency_keys
    WHERE org_id = v_org_id
      AND user_id = v_user_id
      AND route_key = p_route_key
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_existing_request_hash <> p_request_hash THEN
      RAISE EXCEPTION 'Idempotency key reuse with different payload';
    END IF;

    IF v_existing_sale_id IS NOT NULL THEN
      RETURN v_existing_sale_id;
    END IF;

    RAISE EXCEPTION 'Idempotent request is already in progress';
  END LOOP;

  v_sale_id := public.create_sale_atomic(
    p_sale_price,
    p_sale_date,
    p_client_id,
    p_instrument_id,
    p_notes
  );

  UPDATE public.sales_idempotency_keys
  SET sale_id = v_sale_id
  WHERE org_id = v_org_id
    AND user_id = v_user_id
    AND route_key = p_route_key
    AND idempotency_key = p_idempotency_key;

  RETURN v_sale_id;
EXCEPTION
  WHEN OTHERS THEN
    IF v_reserved THEN
      DELETE FROM public.sales_idempotency_keys
      WHERE org_id = v_org_id
        AND user_id = v_user_id
        AND route_key = p_route_key
        AND idempotency_key = p_idempotency_key
        AND sale_id IS NULL;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_atomic(NUMERIC, DATE, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_atomic(NUMERIC, DATE, UUID, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.create_sale_adjustment_atomic(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_adjustment_atomic(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.create_sale_atomic_idempotent(TEXT, TEXT, TEXT, NUMERIC, DATE, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_atomic_idempotent(TEXT, TEXT, TEXT, NUMERIC, DATE, UUID, UUID, TEXT) TO authenticated;

COMMIT;
