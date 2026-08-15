-- Database-enforced uniqueness for Interested/Booked client_instruments rows.
--
-- create_connection_atomic already rejects sequential duplicate Interested/
-- Booked creates with an EXISTS check (20260807130000). That check is not a
-- uniqueness invariant: two concurrent writers can both observe no matching
-- row and both insert. PATCH/update_connection_atomic can also change
-- relationship_type onto a tuple that already exists, and the EXISTS guard
-- does not run on UPDATE.
--
-- This partial unique index is the correctness boundary for every writer
-- (RPC, client-with-connections, trusted direct inserts, seed helpers).
-- Interested and Booked may coexist for the same pair. Owned and Sold are
-- intentionally out of scope: Owned already has
-- client_instruments_single_owner_per_instrument, and Sold belongs to the
-- sale lifecycle.
--
-- Pre-existing duplicate Interested/Booked tuples fail the migration closed.
-- This file performs no cleanup DML.

DO $$
DECLARE
  v_index_oid oid;
  v_is_unique boolean;
  v_table_name text;
  v_schema_name text;
  v_columns text;
  v_predicate text;
  v_expected_columns text := 'org_id,client_id,instrument_id,relationship_type';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.client_instruments
    WHERE relationship_type IN ('Interested', 'Booked')
    GROUP BY org_id, client_id, instrument_id, relationship_type
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'CONNECTION_DUPLICATES_BLOCK_UNIQUE_INDEX: Duplicate Interested/Booked client_instruments rows must be resolved before creating client_instruments_unique_interested_booked_per_pair.';
  END IF;

  SELECT
    idx.oid,
    i.indisunique,
    n.nspname,
    t.relname,
    (
      SELECT string_agg(a.attname, ',' ORDER BY x.ordinality)
      FROM unnest(i.indkey) WITH ORDINALITY AS x(attnum, ordinality)
      JOIN pg_attribute a
        ON a.attrelid = i.indrelid
       AND a.attnum = x.attnum
    ),
    pg_get_expr(i.indpred, i.indrelid)
  INTO
    v_index_oid,
    v_is_unique,
    v_schema_name,
    v_table_name,
    v_columns,
    v_predicate
  FROM pg_class idx
  JOIN pg_index i ON i.indexrelid = idx.oid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE idx.relname = 'client_instruments_unique_interested_booked_per_pair';

  IF v_index_oid IS NOT NULL THEN
    IF v_schema_name IS DISTINCT FROM 'public'
       OR v_table_name IS DISTINCT FROM 'client_instruments'
       OR NOT v_is_unique
       OR v_columns IS DISTINCT FROM v_expected_columns
       OR v_predicate IS NULL
       OR v_predicate NOT ILIKE '%Interested%'
       OR v_predicate NOT ILIKE '%Booked%'
       OR v_predicate ILIKE '%Owned%'
       OR v_predicate ILIKE '%Sold%' THEN
      RAISE EXCEPTION
        'client_instruments_unique_interested_booked_per_pair already exists with an incompatible definition (schema=%, table=%, unique=%, columns=%, predicate=%).',
        v_schema_name,
        v_table_name,
        v_is_unique,
        v_columns,
        v_predicate;
    END IF;

    RETURN;
  END IF;

  EXECUTE $idx$
    CREATE UNIQUE INDEX client_instruments_unique_interested_booked_per_pair
    ON public.client_instruments (
      org_id,
      client_id,
      instrument_id,
      relationship_type
    )
    WHERE relationship_type IN ('Interested', 'Booked')
  $idx$;

  SELECT
    i.indisunique,
    n.nspname,
    t.relname,
    (
      SELECT string_agg(a.attname, ',' ORDER BY x.ordinality)
      FROM unnest(i.indkey) WITH ORDINALITY AS x(attnum, ordinality)
      JOIN pg_attribute a
        ON a.attrelid = i.indrelid
       AND a.attnum = x.attnum
    ),
    pg_get_expr(i.indpred, i.indrelid)
  INTO
    v_is_unique,
    v_schema_name,
    v_table_name,
    v_columns,
    v_predicate
  FROM pg_class idx
  JOIN pg_index i ON i.indexrelid = idx.oid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE idx.relname = 'client_instruments_unique_interested_booked_per_pair';

  IF v_schema_name IS DISTINCT FROM 'public'
     OR v_table_name IS DISTINCT FROM 'client_instruments'
     OR NOT v_is_unique
     OR v_columns IS DISTINCT FROM v_expected_columns
     OR v_predicate IS NULL
     OR v_predicate NOT ILIKE '%Interested%'
     OR v_predicate NOT ILIKE '%Booked%'
     OR v_predicate ILIKE '%Owned%'
     OR v_predicate ILIKE '%Sold%' THEN
    RAISE EXCEPTION
      'client_instruments_unique_interested_booked_per_pair was created with an unexpected definition (schema=%, table=%, unique=%, columns=%, predicate=%).',
      v_schema_name,
      v_table_name,
      v_is_unique,
      v_columns,
      v_predicate;
  END IF;
END;
$$;
