-- Disposable local Postgres bootstrap for instrument Sold-boundary
-- enforcement tests. Builds a minimal but *privilege-faithful* copy of the
-- instruments/sales_history subsystem: real RLS policies and real table
-- GRANTs for `authenticated` and `service_role`, not just a superuser
-- connection. This matters because the invariant under test
-- ("a plain database update cannot cross the Sold boundary") only means
-- something if the role attempting it actually has UPDATE privilege on
-- public.instruments and is only stopped by RLS + the trigger — exactly
-- like the real `authenticated` role used by executeInstrumentPatch.ts.
--
-- Usage:
--   dropdb --if-exists hc_sold_boundary_verify
--   createdb hc_sold_boundary_verify
--   psql hc_sold_boundary_verify -v ON_ERROR_STOP=1 \
--     -f scripts/supabase/instrument_sold_boundary_test_bootstrap.sql \
--     -f supabase/migrations/00000000000013_create_sale_atomic.sql \
--     -f supabase/migrations/00000000000014_create_sale_atomic_revoke_public.sql \
--     -f supabase/migrations/00000000000015_create_sale_atomic_grant_authenticated.sql \
--     -f supabase/migrations/00000000000016_create_sale_adjustment_atomic.sql \
--     -f supabase/migrations/00000000000017_create_sale_adjustment_atomic_revoke_public.sql \
--     -f supabase/migrations/00000000000018_create_sale_adjustment_atomic_grant_authenticated.sql \
--     -f supabase/migrations/00000000000031_create_sale_atomic_idempotent.sql \
--     -f supabase/migrations/00000000000032_create_sale_atomic_idempotent_revoke_public.sql \
--     -f supabase/migrations/00000000000033_create_sale_atomic_idempotent_grant_authenticated.sql \
--     -f supabase/migrations/00000000000037_update_instrument_sale_transition_atomic.sql \
--     -f supabase/migrations/00000000000038_update_instrument_sale_transition_atomic_revoke_public.sql \
--     -f supabase/migrations/00000000000039_update_instrument_sale_transition_atomic_grant_authenticated.sql \
--     -f supabase/migrations/20260423140001_update_instrument_sale_transition_revoke_public_old.sql \
--     -f supabase/migrations/20260423140002_update_instrument_sale_transition_revoke_authenticated_old.sql \
--     -f supabase/migrations/20260423140003_update_instrument_sale_transition_drop_old.sql \
--     -f supabase/migrations/20260423140004_update_instrument_sale_transition_atomic_concurrency.sql \
--     -f supabase/migrations/20260423140005_update_instrument_sale_transition_revoke_public.sql \
--     -f supabase/migrations/20260423140006_update_instrument_sale_transition_grant_authenticated.sql \
--     -f supabase/migrations/20260803131709_create_sale_atomic_active_sale_guard.sql \
--     -f supabase/migrations/20260803140000_restore_instrument_sold_boundary_fail_closed.sql
--   psql hc_sold_boundary_verify -v ON_ERROR_STOP=1 \
--     -f scripts/supabase/instrument_sold_boundary_enforcement.test.sql

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- service_role in real Supabase always has BYPASSRLS; make sure a
-- pre-existing local role picks it up too.
ALTER ROLE service_role BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION public.org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
BEGIN
  raw := COALESCE(
    NULLIF(btrim(auth.jwt() -> 'app_metadata' ->> 'org_id'), ''),
    NULLIF(btrim(auth.jwt() -> 'app_metadata' ->> 'organization_id'), ''),
    NULLIF(btrim(auth.jwt() ->> 'org_id'), ''),
    NULLIF(btrim(auth.jwt() ->> 'organization_id'), '')
  );
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN raw::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN lower(trim(COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'app_role',
      auth.jwt() ->> 'role',
      auth.jwt() ->> 'app_role',
      'member'
    ))) = 'admin' THEN 'admin'
    ELSE 'member'
  END
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.user_role() = 'admin'
$$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.instruments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL,
  maker                 TEXT,
  subtype               TEXT,
  year                  INTEGER,
  certificate           BOOLEAN NOT NULL DEFAULT false,
  cost_price            NUMERIC(12,2),
  consignment_price     NUMERIC(12,2),
  size                  TEXT,
  weight                TEXT,
  price                 NUMERIC(12,2),
  ownership             TEXT,
  note                  TEXT,
  serial_number         TEXT,
  status                TEXT NOT NULL DEFAULT 'Available'
    CHECK (status IN ('Available','Booked','Sold','Reserved','Maintenance')),
  reserved_reason       TEXT,
  reserved_by_user_id   UUID,
  reserved_connection_id UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  client_number TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_instruments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id         UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  instrument_id     UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  notes             TEXT,
  display_order     INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_history (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instrument_id        UUID REFERENCES public.instruments(id) ON DELETE SET NULL,
  client_id            UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  sale_price           NUMERIC(12,2) NOT NULL CONSTRAINT sales_history_non_zero_sale_price CHECK (sale_price <> 0),
  sale_date            DATE NOT NULL,
  notes                TEXT,
  entry_kind           TEXT NOT NULL DEFAULT 'sale'
    CHECK (entry_kind IN ('sale','refund','undo_refund','adjustment')),
  adjustment_of_sale_id UUID REFERENCES public.sales_history(id) ON DELETE RESTRICT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_history_one_refund_per_sale_idx
  ON public.sales_history(adjustment_of_sale_id)
  WHERE entry_kind = 'refund';

CREATE UNIQUE INDEX IF NOT EXISTS sales_history_one_undo_refund_per_refund_idx
  ON public.sales_history(adjustment_of_sale_id)
  WHERE entry_kind = 'undo_refund';

CREATE TABLE IF NOT EXISTS public.sales_idempotency_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,
  route_key        TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  request_hash     TEXT NOT NULL,
  sale_id          UUID REFERENCES public.sales_history(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, route_key, idempotency_key)
);

CREATE OR REPLACE FUNCTION public.touch_instrument_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_touch_instrument_updated_at ON public.instruments;
CREATE TRIGGER tr_touch_instrument_updated_at
BEFORE UPDATE ON public.instruments
FOR EACH ROW
EXECUTE FUNCTION public.touch_instrument_updated_at();

-- Placeholder body (pre-20260803131709 shape, from
-- supabase/migrations/00000000000058_enforce_status_transitions.sql).
-- The migration files applied after this bootstrap CREATE OR REPLACE this
-- function's body in place; the trigger below keeps pointing at the same
-- function (same OID) across those replacements, exactly like the real
-- deployment history.
CREATE OR REPLACE FUNCTION public.enforce_instrument_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NULL OR OLD.status IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'Available' AND NEW.status IN ('Booked', 'Reserved', 'Maintenance', 'Sold') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Booked' AND NEW.status IN ('Available', 'Reserved', 'Sold') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Reserved' AND NEW.status IN ('Available', 'Booked', 'Sold') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Maintenance' AND NEW.status IN ('Available', 'Sold') THEN
    RETURN NEW;
  ELSIF OLD.status = 'Sold' THEN
    RAISE EXCEPTION 'Invalid instrument status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  ELSE
    RAISE EXCEPTION 'Invalid instrument status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_instrument_status_transition ON public.instruments;
CREATE TRIGGER tr_enforce_instrument_status_transition
BEFORE UPDATE OF status ON public.instruments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_instrument_status_transition();

-- ──────────────────────────────────────────────
-- RLS — copied verbatim from
-- supabase/migrations/00000000000002_rls_policies.sql for the tables
-- this subsystem touches, so `authenticated` behaves exactly as it does
-- in production: read/write bounded by org_id() + is_admin(), NOT by
-- table-grant absence.
-- ──────────────────────────────────────────────
ALTER TABLE public.organizations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instruments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_instruments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.org_id());

CREATE POLICY instruments_select ON public.instruments
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY instruments_insert ON public.instruments
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY instruments_update ON public.instruments
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY instruments_delete ON public.instruments
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY clients_insert ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY clients_update ON public.clients
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY clients_delete ON public.clients
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

CREATE POLICY client_instruments_select ON public.client_instruments
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY client_instruments_insert ON public.client_instruments
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY client_instruments_update ON public.client_instruments
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY client_instruments_delete ON public.client_instruments
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

CREATE POLICY sales_history_select ON public.sales_history
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY sales_history_insert ON public.sales_history
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

-- UPDATE and DELETE intentionally omitted: use atomic RPCs only.

CREATE POLICY sales_idempotency_keys_select ON public.sales_idempotency_keys
  FOR SELECT TO authenticated
  USING (org_id = public.org_id() AND user_id = auth.uid());

CREATE POLICY sales_idempotency_keys_insert ON public.sales_idempotency_keys
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND user_id = auth.uid());

CREATE POLICY sales_idempotency_keys_update ON public.sales_idempotency_keys
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND user_id = auth.uid())
  WITH CHECK (org_id = public.org_id() AND user_id = auth.uid());

CREATE POLICY sales_idempotency_keys_delete ON public.sales_idempotency_keys
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND user_id = auth.uid());

-- ──────────────────────────────────────────────
-- GRANTs — real Supabase projects grant broad table privileges to
-- `authenticated`/`service_role` by default and rely on RLS (+ triggers)
-- to restrict them; reproduce that instead of leaving these roles with
-- no table privileges at all (which would make direct-update tests pass
-- for the wrong reason — permission denied, not trigger enforcement).
-- ──────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.organizations,
  public.instruments,
  public.clients,
  public.client_instruments,
  public.sales_history,
  public.sales_idempotency_keys
TO authenticated, service_role;
