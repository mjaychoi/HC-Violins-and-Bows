-- Instrument creates use the shared API create-idempotency table.
-- This migration keeps the instrument idempotency contract aligned with the
-- route/probe instead of introducing a second, unused table.

CREATE TABLE IF NOT EXISTS public.api_create_idempotency (
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  route_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed')),
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id, route_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS api_create_idempotency_instrument_create_lookup_idx
  ON public.api_create_idempotency (org_id, user_id, idempotency_key)
  WHERE route_key = 'POST:/api/instruments';

ALTER TABLE public.api_create_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_create_idempotency_select
  ON public.api_create_idempotency;
CREATE POLICY api_create_idempotency_select
  ON public.api_create_idempotency
  FOR SELECT
  TO authenticated
  USING (org_id = public.org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS api_create_idempotency_insert
  ON public.api_create_idempotency;
CREATE POLICY api_create_idempotency_insert
  ON public.api_create_idempotency
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS api_create_idempotency_update
  ON public.api_create_idempotency;
CREATE POLICY api_create_idempotency_update
  ON public.api_create_idempotency
  FOR UPDATE
  TO authenticated
  USING (org_id = public.org_id() AND user_id = auth.uid())
  WITH CHECK (org_id = public.org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS api_create_idempotency_delete
  ON public.api_create_idempotency;
CREATE POLICY api_create_idempotency_delete
  ON public.api_create_idempotency
  FOR DELETE
  TO authenticated
  USING (org_id = public.org_id() AND user_id = auth.uid());

REVOKE ALL ON TABLE public.api_create_idempotency FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.api_create_idempotency
  TO authenticated;
