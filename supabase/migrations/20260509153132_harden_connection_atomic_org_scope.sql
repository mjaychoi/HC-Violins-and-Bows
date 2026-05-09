CREATE OR REPLACE FUNCTION public.create_connection_atomic(
  p_client_id         UUID,
  p_instrument_id     UUID,
  p_relationship_type TEXT,
  p_notes             TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id        UUID := public.org_id();
  v_connection_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE id = p_client_id
      AND org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Client not found in organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.instruments
    WHERE id = p_instrument_id
      AND org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Instrument not found in organization';
  END IF;

  IF p_relationship_type = 'Sold' THEN
    RAISE EXCEPTION 'Sold relationship cannot be created directly. Use the sales API.';
  END IF;

  IF p_relationship_type = 'Booked' THEN
    PERFORM public.assert_bookable_instrument_state(p_instrument_id, v_org_id);
  END IF;

  INSERT INTO public.client_instruments (
    client_id, instrument_id, relationship_type, notes, org_id
  ) VALUES (
    p_client_id, p_instrument_id, p_relationship_type, p_notes, v_org_id
  )
  RETURNING id INTO v_connection_id;

  IF p_relationship_type = 'Booked' THEN
    PERFORM public.reconcile_booked_instrument_state(p_instrument_id, v_org_id);
  END IF;

  RETURN v_connection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_connection_atomic(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_connection_atomic(UUID, UUID, TEXT, TEXT)
  TO authenticated;

CREATE OR REPLACE VIEW public.runtime_contract_checks
WITH (security_invoker = true)
AS
WITH connection_rpc AS (
  SELECT pg_get_functiondef(
    'public.create_connection_atomic(uuid,uuid,text,text)'::regprocedure
  ) AS definition
),
api_create_idempotency_columns AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'api_create_idempotency'
),
api_create_idempotency_unique_indexes AS (
  SELECT 1
  FROM pg_index idx
  JOIN pg_class tbl ON tbl.oid = idx.indrelid
  JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
  WHERE ns.nspname = 'public'
    AND tbl.relname = 'api_create_idempotency'
    AND idx.indisunique
    AND idx.indkey::int2[] @> ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid = tbl.oid AND attname = 'org_id'),
      (SELECT attnum FROM pg_attribute WHERE attrelid = tbl.oid AND attname = 'user_id'),
      (SELECT attnum FROM pg_attribute WHERE attrelid = tbl.oid AND attname = 'route_key'),
      (SELECT attnum FROM pg_attribute WHERE attrelid = tbl.oid AND attname = 'idempotency_key')
    ]::int2[]
)
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'api_create_idempotency'
  ) AS api_create_idempotency_exists,
  NOT EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('org_id'),
        ('user_id'),
        ('route_key'),
        ('idempotency_key'),
        ('request_hash'),
        ('status'),
        ('response_payload'),
        ('created_at'),
        ('updated_at')
    ) AS required(column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM api_create_idempotency_columns columns
      WHERE columns.column_name = required.column_name
    )
  ) AS api_create_idempotency_columns_ok,
  EXISTS (
    SELECT 1
    FROM api_create_idempotency_unique_indexes
  ) AS api_create_idempotency_unique_ok,
  EXISTS (
    SELECT 1
    FROM connection_rpc
    WHERE definition LIKE '%v_org_id%public.org_id()%'
      AND definition LIKE '%FROM public.clients%'
      AND definition LIKE '%org_id = v_org_id%'
      AND definition LIKE '%Client not found in organization%'
      AND definition LIKE '%FROM public.instruments%'
      AND definition LIKE '%Instrument not found in organization%'
      AND definition LIKE '%org_id%v_org_id%'
  ) AS create_connection_atomic_hardened;

REVOKE ALL ON public.runtime_contract_checks FROM PUBLIC;
GRANT SELECT ON public.runtime_contract_checks TO authenticated, service_role;
