-- Extend runtime_contract_checks for Item/Client/Certificate PR #52 contracts.
-- Forward-only: do not edit historical migrations.

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
),
client_rpc_signatures AS (
  SELECT *
  FROM (
    VALUES
      ('client_rpc_5_arg_exists', 'text, text, text, text, jsonb'),
      ('client_rpc_6_arg_exists', 'text, text, text, text, jsonb, text[]'),
      (
        'client_rpc_10_arg_exists',
        'text, text, text, text, jsonb, text[], text, text, text, text'
      )
  ) AS required(contract_key, identity_args)
),
client_rpc_functions AS (
  SELECT
    required.contract_key,
    p.oid,
    p.prosecdef
  FROM client_rpc_signatures required
  LEFT JOIN pg_proc p
    ON p.pronamespace = 'public'::regnamespace
   AND p.proname = 'create_client_with_connections_atomic'
   AND oidvectortypes(p.proargtypes) = required.identity_args
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
  ) AS create_connection_atomic_hardened,
  NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'instruments'
      AND a.attname = 'type'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attnotnull
  ) AS instrument_type_nullable,
  EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'instruments'
      AND con.conname = 'instruments_identity_check'
      AND con.contype = 'c'
  ) AS instrument_identity_check_exists,
  EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'instruments'
      AND con.conname = 'instruments_certificate_name_check'
      AND con.contype = 'c'
  ) AS instrument_certificate_name_check_exists,
  NOT EXISTS (
    SELECT 1
    FROM (VALUES ('first_name'), ('last_name')) AS required(column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns columns
      WHERE columns.table_schema = 'public'
        AND columns.table_name = 'clients'
        AND columns.column_name = required.column_name
    )
  ) AS client_identity_columns_exist,
  EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'clients'
      AND con.conname = 'clients_name_identity_check'
      AND con.contype = 'c'
  ) AS client_identity_check_exists,
  COALESCE(
    (
      SELECT oid IS NOT NULL
      FROM client_rpc_functions
      WHERE contract_key = 'client_rpc_5_arg_exists'
      LIMIT 1
    ),
    false
  ) AS client_rpc_5_arg_exists,
  COALESCE(
    (
      SELECT oid IS NOT NULL
      FROM client_rpc_functions
      WHERE contract_key = 'client_rpc_6_arg_exists'
      LIMIT 1
    ),
    false
  ) AS client_rpc_6_arg_exists,
  COALESCE(
    (
      SELECT oid IS NOT NULL
      FROM client_rpc_functions
      WHERE contract_key = 'client_rpc_10_arg_exists'
      LIMIT 1
    ),
    false
  ) AS client_rpc_10_arg_exists,
  COALESCE(
    (
      SELECT bool_and(prosecdef = false)
      FROM client_rpc_functions
      WHERE oid IS NOT NULL
      HAVING count(*) = 3
    ),
    false
  ) AS client_rpc_all_security_invoker,
  COALESCE(
    (
      SELECT bool_and(has_function_privilege('authenticated', oid, 'EXECUTE'))
      FROM client_rpc_functions
      WHERE oid IS NOT NULL
      HAVING count(*) = 3
    ),
    false
  ) AS client_rpc_authenticated_execute,
  COALESCE(
    (
      SELECT bool_and(NOT has_function_privilege('anon', oid, 'EXECUTE'))
      FROM client_rpc_functions
      WHERE oid IS NOT NULL
      HAVING count(*) = 3
    ),
    false
  ) AS client_rpc_anon_execute_revoked;
