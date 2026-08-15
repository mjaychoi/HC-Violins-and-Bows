-- Disposable local Postgres bootstrap for V7-003 (financial confidentiality
-- DB-boundary) tests. Builds a minimal but *privilege-faithful* copy of the
-- instruments/sales_history/invoices/invoice_items subsystem: real RLS
-- policies and real table GRANTs for `authenticated`/`anon`/`service_role`,
-- not just a superuser connection — exactly like the real roles used by
-- src/app/api/instruments/route.ts and src/app/api/sales/route.ts.
--
-- Modeled on scripts/supabase/instrument_sold_boundary_test_bootstrap.sql
-- (same auth/role/org_id()/is_admin() setup), extended with
-- invoices/invoice_items (needed for V7-003's row-level admin-only fix)
-- and certificate/subtype columns omitted since they are not implicated.
--
-- Usage:
--   dropdb --if-exists hc_financial_confidentiality_verify
--   createdb hc_financial_confidentiality_verify
--   psql hc_financial_confidentiality_verify -v ON_ERROR_STOP=1 \
--     -f scripts/supabase/financial_confidentiality_test_bootstrap.sql \
--     -f supabase/migrations/20260804020000_harden_sale_lifecycle_authorization.sql \
--     -f supabase/migrations/20260814160000_enforce_financial_confidentiality_db_boundary.sql
--   psql hc_financial_confidentiality_verify -v ON_ERROR_STOP=1 \
--     -f scripts/supabase/financial_confidentiality.test.sql

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

CREATE TABLE IF NOT EXISTS public.invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id             UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  invoice_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date              DATE,
  subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax                   NUMERIC(12,2),
  total                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'USD',
  status                TEXT NOT NULL DEFAULT 'draft',
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE SET NULL,
  description   TEXT,
  qty           INTEGER NOT NULL DEFAULT 0,
  rate          NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- RLS — copied verbatim from
-- supabase/migrations/00000000000002_rls_policies.sql for the tables this
-- subsystem touches, so `authenticated` behaves exactly as it does in
-- production: read/write bounded by org_id() + is_admin(), NOT by table-
-- grant absence. This is the PRE-fix state; the migration applied after
-- this bootstrap (20260814160000_...sql) tightens it further.
-- ──────────────────────────────────────────────
ALTER TABLE public.organizations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instruments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items   ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY sales_history_select ON public.sales_history
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY sales_history_insert ON public.sales_history
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

-- UPDATE and DELETE intentionally omitted: use atomic RPCs only.

CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY invoices_insert ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoices_delete ON public.invoices
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoice_items_select ON public.invoice_items
  FOR SELECT TO authenticated
  USING (org_id = public.org_id());

CREATE POLICY invoice_items_insert ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoice_items_update ON public.invoice_items
  FOR UPDATE TO authenticated
  USING    (org_id = public.org_id() AND public.is_admin())
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY invoice_items_delete ON public.invoice_items
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

-- ──────────────────────────────────────────────
-- GRANTs — real Supabase projects grant broad table privileges to
-- `authenticated`/`service_role` by default and rely on RLS to restrict
-- them; reproduce that here (rather than leaving these roles with no table
-- privileges at all) so the migration applied after this bootstrap has a
-- real overbroad grant to REVOKE from, exactly like production.
-- ──────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.organizations,
  public.instruments,
  public.clients,
  public.sales_history,
  public.invoices,
  public.invoice_items
TO authenticated, service_role;
