-- Disposable local Postgres bootstrap for Invoice update CAS/idempotency
-- RPC tests (V5-002 + V5-003). Creates a minimal auth stub + the core
-- tables/functions update_invoice_atomic / update_invoice_atomic_idempotent
-- depend on, mirroring scripts/supabase/sale_resale_test_bootstrap.sql's
-- approach for the instrument sale-transition RPC.
--
-- Usage: see
-- tests/integration/migrations/update_invoice_atomic_idempotency_concurrency.integration.test.ts,
-- which applies this file, then the real historical invoice migrations up
-- to the pre-PR13 baseline, before exercising
-- supabase/migrations/20260814170000_update_invoice_atomic_idempotency_concurrency.sql.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
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

-- updated_at automation, same trigger function name/behavior as
-- supabase/migrations/00000000000001_auth_helpers.sql.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.instruments (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type   TEXT NOT NULL
);

-- Real table definition, copied verbatim from
-- supabase/migrations/00000000000000_initial_schema.sql so the CAS token
-- column (updated_at) has the exact same type/default/nullability the
-- production schema has.
CREATE TABLE IF NOT EXISTS public.invoices (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id             UUID        REFERENCES public.clients(id) ON DELETE SET NULL,
  invoice_date          DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date              DATE,
  subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax                   NUMERIC(12,2),
  total                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency              TEXT        NOT NULL DEFAULT 'USD',
  status                TEXT        NOT NULL DEFAULT 'draft',
  notes                 TEXT,
  business_name         TEXT,
  business_address      TEXT,
  business_phone        TEXT,
  business_email        TEXT,
  bank_account_holder   TEXT,
  bank_name             TEXT,
  bank_swift_code       TEXT,
  bank_account_number   TEXT,
  default_conditions    TEXT,
  default_exchange_rate TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id    UUID        NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  instrument_id UUID        REFERENCES public.instruments(id) ON DELETE SET NULL,
  description   TEXT,
  qty           INTEGER     NOT NULL DEFAULT 0,
  rate          NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url     TEXT,
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Real table definition, copied verbatim from
-- supabase/migrations/00000000000000_initial_schema.sql — this is the
-- dedup table update_invoice_atomic_idempotent reserves/replays against
-- (shared with create_invoice_atomic_idempotent via a distinct route_key).
CREATE TABLE IF NOT EXISTS public.invoice_idempotency_keys (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL,
  route_key        TEXT        NOT NULL,
  idempotency_key  TEXT        NOT NULL,
  request_hash     TEXT        NOT NULL,
  invoice_id       UUID        REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, route_key, idempotency_key)
);
