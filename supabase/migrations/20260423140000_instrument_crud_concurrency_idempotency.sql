-- Instrument POST idempotency mapping + optimistic concurrency for sale-transition RPC

CREATE TABLE public.instrument_create_idempotency (
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, idempotency_key)
);

ALTER TABLE public.instrument_create_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY instrument_create_idempotency_select
  ON public.instrument_create_idempotency
  FOR SELECT TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

CREATE POLICY instrument_create_idempotency_insert
  ON public.instrument_create_idempotency
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.org_id() AND public.is_admin());

CREATE POLICY instrument_create_idempotency_delete
  ON public.instrument_create_idempotency
  FOR DELETE TO authenticated
  USING (org_id = public.org_id() AND public.is_admin());

REVOKE ALL ON TABLE public.instrument_create_idempotency FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON TABLE public.instrument_create_idempotency TO authenticated;

-- Replace sale transition RPC: add p_expected_updated_at (7-arg overload replaces 6-arg)
