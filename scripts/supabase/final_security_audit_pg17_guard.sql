-- PostgreSQL 17 regression guard for final_security_audit.sql catalog expressions.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/supabase/final_security_audit_pg17_guard.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_pg_version INTEGER;
  v_relrowsecurity_exists BOOLEAN;
  v_relforcerowsecurity_exists BOOLEAN;
  v_sample_count INTEGER;
BEGIN
  SELECT current_setting('server_version_num')::INTEGER INTO v_pg_version;

  IF v_pg_version < 170000 THEN
    RAISE EXCEPTION 'expected PostgreSQL 17+, got server_version_num=%', v_pg_version;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pg_catalog'
      AND c.relname = 'pg_class'
      AND a.attname = 'relrowsecurity'
      AND NOT a.attisdropped
  ) INTO v_relrowsecurity_exists;

  SELECT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pg_catalog'
      AND c.relname = 'pg_class'
      AND a.attname = 'relforcerowsecurity'
      AND NOT a.attisdropped
  ) INTO v_relforcerowsecurity_exists;

  IF NOT v_relrowsecurity_exists OR NOT v_relforcerowsecurity_exists THEN
    RAISE EXCEPTION
      'pg_class RLS catalog columns missing (relrowsecurity=%, relforcerowsecurity=%)',
      v_relrowsecurity_exists,
      v_relforcerowsecurity_exists;
  END IF;

  SELECT COUNT(*) INTO v_sample_count
  FROM pg_tables AS t
  JOIN pg_class AS c ON c.relname = t.tablename
  JOIN pg_namespace AS n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
  WHERE t.schemaname = 'public'
    AND t.tablename NOT LIKE 'pg_%';

  IF v_sample_count = 0 THEN
    RAISE EXCEPTION 'expected public tables for RLS catalog probe, got 0';
  END IF;

  RAISE NOTICE 'final_security_audit PG17 guard passed (server_version_num=%, public_tables=%)',
    v_pg_version, v_sample_count;
END
$$;
