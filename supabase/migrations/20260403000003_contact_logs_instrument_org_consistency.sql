-- Migration: enforce tenant-safe instrument references on contact logs
-- Created: 2026-04-03

CREATE OR REPLACE FUNCTION public.enforce_contact_logs_org_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_org UUID;
  v_instrument_org UUID;
BEGIN
  SELECT org_id INTO v_client_org
  FROM public.clients
  WHERE id = NEW.client_id;

  IF v_client_org IS NULL THEN
    RAISE EXCEPTION 'Referenced client not found';
  END IF;

  IF NEW.instrument_id IS NOT NULL THEN
    SELECT org_id INTO v_instrument_org
    FROM public.instruments
    WHERE id = NEW.instrument_id;

    IF v_instrument_org IS NULL THEN
      RAISE EXCEPTION 'Referenced instrument not found';
    END IF;

    IF v_instrument_org <> v_client_org THEN
      RAISE EXCEPTION 'contact_logs instrument and client must belong to the same organization';
    END IF;
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_client_org;
  END IF;

  IF NEW.org_id <> v_client_org THEN
    RAISE EXCEPTION 'contact_logs.org_id must match client.org_id';
  END IF;

  IF NEW.instrument_id IS NOT NULL AND NEW.org_id <> v_instrument_org THEN
    RAISE EXCEPTION 'contact_logs.org_id must match instrument.org_id';
  END IF;

  RETURN NEW;
END;
$$;
