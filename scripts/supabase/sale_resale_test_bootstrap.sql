-- Disposable local Postgres bootstrap for sale-resale RPC tests.
-- Creates a minimal auth stub + core tables/functions needed to exercise
-- create_sale_atomic / adjustments / sale transition / idempotency.
--
-- Usage:
--   dropdb --if-exists hc_sale_resale_verify
--   createdb hc_sale_resale_verify
--   psql hc_sale_resale_verify -v ON_ERROR_STOP=1 -f scripts/supabase/sale_resale_test_bootstrap.sql
--   psql hc_sale_resale_verify -v ON_ERROR_STOP=1 \
--     -f supabase/migrations/00000000000013_create_sale_atomic.sql \
--     -f supabase/migrations/00000000000016_create_sale_adjustment_atomic.sql \
--     -f supabase/migrations/00000000000031_create_sale_atomic_idempotent.sql \
--     -f supabase/migrations/20260423140004_update_instrument_sale_transition_atomic_concurrency.sql \
--     -f supabase/migrations/20260803131709_create_sale_atomic_active_sale_guard.sql \
--     -f supabase/migrations/20260803140000_restore_instrument_sold_boundary_fail_closed.sql \
--     -f supabase/migrations/20260803140001_fix_refund_source_lookup_rls_gap.sql
--   psql hc_sale_resale_verify -v ON_ERROR_STOP=1 -f scripts/supabase/create_sale_atomic_resale.test.sql
--   DATABASE_URL=postgresql:///hc_sale_resale_verify \
--     bash scripts/supabase/create_sale_atomic_resale_concurrency.test.sh

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

-- updated_at bump so CAS tests observe changes
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

-- Pre-fix instrument status transition guard (Sold is terminal).
-- Forward migration 20260803131709 replaces this function body.
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
