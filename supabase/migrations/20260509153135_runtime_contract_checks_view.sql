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
