BEGIN;

-- Migration: require admin for INSERT on instruments and clients
-- Aligns INSERT policy with PATCH/DELETE (which already require admin).
-- The application-layer postHandlers in instruments/route.ts and clients/route.ts
-- also enforce requireAdmin(), so this migration adds the matching DB-level guard.

DROP POLICY IF EXISTS instruments_insert ON public.instruments;
CREATE POLICY instruments_insert
  ON public.instruments
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

DROP POLICY IF EXISTS clients_insert ON public.clients;
CREATE POLICY clients_insert
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth.org_id() AND auth.is_admin());

COMMIT;
