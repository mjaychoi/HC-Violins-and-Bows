-- Migration: final production hardening
-- Created: 2026-04-01

-- 1) Backfill org_id from parents where it is still derivable.
UPDATE public.invoice_settings AS s
SET org_id = o.id
FROM public.organizations AS o
WHERE s.org_id IS NULL
  AND s.id = o.id;

UPDATE public.invoice_items AS ii
SET org_id = i.org_id
FROM public.invoices AS i
WHERE ii.invoice_id = i.id
  AND ii.org_id IS NULL
  AND i.org_id IS NOT NULL;

UPDATE public.client_instruments AS ci
SET org_id = COALESCE(ci.org_id, c.org_id, i.org_id)
FROM public.clients AS c
JOIN public.instruments AS i
  ON i.id = ci.instrument_id
WHERE ci.client_id = c.id
  AND (ci.org_id IS NULL OR ci.org_id <> c.org_id OR ci.org_id <> i.org_id)
  AND c.org_id IS NOT NULL
  AND i.org_id IS NOT NULL
  AND c.org_id = i.org_id;

UPDATE public.contact_logs AS cl
SET org_id = c.org_id
FROM public.clients AS c
WHERE cl.client_id = c.id
  AND cl.org_id IS NULL
  AND c.org_id IS NOT NULL;

UPDATE public.maintenance_tasks AS mt
SET org_id = COALESCE(mt.org_id, i.org_id, c.org_id)
FROM public.instruments AS i
LEFT JOIN public.clients AS c
  ON c.id = mt.client_id
WHERE mt.instrument_id = i.id
  AND (mt.org_id IS NULL OR (c.org_id IS NOT NULL AND mt.org_id <> c.org_id))
  AND i.org_id IS NOT NULL
  AND (c.org_id IS NULL OR c.org_id = i.org_id);

UPDATE public.sales_history AS sh
SET org_id = COALESCE(sh.org_id, i.org_id, c.org_id)
FROM public.instruments AS i
LEFT JOIN public.clients AS c
  ON c.id = sh.client_id
WHERE sh.instrument_id = i.id
  AND (sh.org_id IS NULL OR (c.org_id IS NOT NULL AND sh.org_id <> c.org_id))
  AND i.org_id IS NOT NULL
  AND (c.org_id IS NULL OR c.org_id = i.org_id);

-- 2) Abort if null org_id rows remain on tenant-owned tables.
DO $$
DECLARE
  v_missing_count BIGINT;
BEGIN
  SELECT COUNT(*)
    INTO v_missing_count
  FROM (
    SELECT org_id FROM public.clients
    UNION ALL
    SELECT org_id FROM public.instruments
    UNION ALL
    SELECT org_id FROM public.client_instruments
    UNION ALL
    SELECT org_id FROM public.maintenance_tasks
    UNION ALL
    SELECT org_id FROM public.contact_logs
    UNION ALL
    SELECT org_id FROM public.sales_history
    UNION ALL
    SELECT org_id FROM public.invoices
    UNION ALL
    SELECT org_id FROM public.invoice_items
    UNION ALL
    SELECT org_id FROM public.invoice_settings
  ) AS tenant_rows
  WHERE org_id IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'Cannot finalize hardening: % tenant rows still have NULL org_id', v_missing_count;
  END IF;
END $$;

ALTER TABLE public.clients
  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.instruments
  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.client_instruments
  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.maintenance_tasks
  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.contact_logs
  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.sales_history
  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.invoices
  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.invoice_items
  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.invoice_settings
  ALTER COLUMN org_id SET NOT NULL;

-- 3) DB invariants and ownership guarantees.
ALTER TABLE public.sales_history
  DROP CONSTRAINT IF EXISTS sales_history_non_zero_sale_price;
ALTER TABLE public.sales_history
  ADD CONSTRAINT sales_history_non_zero_sale_price
  CHECK (sale_price <> 0);

CREATE UNIQUE INDEX IF NOT EXISTS client_instruments_single_owner_per_instrument
  ON public.client_instruments(instrument_id)
  WHERE relationship_type = 'Owned';

CREATE UNIQUE INDEX IF NOT EXISTS invoice_settings_one_row_per_org
  ON public.invoice_settings(org_id);

-- 4) Parent-child org consistency triggers.
CREATE OR REPLACE FUNCTION public.enforce_client_instruments_org_consistency()
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
    RAISE EXCEPTION 'Client not found or missing org_id';
  END IF;

  SELECT org_id INTO v_instrument_org
  FROM public.instruments
  WHERE id = NEW.instrument_id;

  IF v_instrument_org IS NULL THEN
    RAISE EXCEPTION 'Instrument not found or missing org_id';
  END IF;

  IF v_client_org <> v_instrument_org THEN
    RAISE EXCEPTION 'Client and instrument must belong to the same organization';
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_client_org;
  END IF;

  IF NEW.org_id <> v_client_org THEN
    RAISE EXCEPTION 'client_instruments.org_id must match parent org_id';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_invoice_items_org_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_org UUID;
  v_instrument_org UUID;
BEGIN
  SELECT org_id INTO v_invoice_org
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  IF v_invoice_org IS NULL THEN
    RAISE EXCEPTION 'Invoice not found or missing org_id';
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_invoice_org;
  END IF;

  IF NEW.org_id <> v_invoice_org THEN
    RAISE EXCEPTION 'invoice_items.org_id must match invoice.org_id';
  END IF;

  IF NEW.instrument_id IS NOT NULL THEN
    SELECT org_id INTO v_instrument_org
    FROM public.instruments
    WHERE id = NEW.instrument_id;

    IF v_instrument_org IS NULL THEN
      RAISE EXCEPTION 'Referenced instrument not found';
    END IF;

    IF v_instrument_org <> v_invoice_org THEN
      RAISE EXCEPTION 'Invoice item instrument must belong to the same organization as the invoice';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_sales_history_org_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_instrument_org UUID;
  v_client_org UUID;
BEGIN
  IF NEW.instrument_id IS NOT NULL THEN
    SELECT org_id INTO v_instrument_org
    FROM public.instruments
    WHERE id = NEW.instrument_id;

    IF v_instrument_org IS NULL THEN
      RAISE EXCEPTION 'Referenced instrument not found';
    END IF;
  END IF;

  IF NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO v_client_org
    FROM public.clients
    WHERE id = NEW.client_id;

    IF v_client_org IS NULL THEN
      RAISE EXCEPTION 'Referenced client not found';
    END IF;
  END IF;

  IF v_instrument_org IS NOT NULL AND v_client_org IS NOT NULL AND v_instrument_org <> v_client_org THEN
    RAISE EXCEPTION 'Sale instrument and client must belong to the same organization';
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := COALESCE(v_instrument_org, v_client_org);
  END IF;

  IF NEW.org_id IS DISTINCT FROM COALESCE(v_instrument_org, v_client_org, NEW.org_id) THEN
    RAISE EXCEPTION 'sales_history.org_id must match parent org_id';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_contact_logs_org_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_org UUID;
BEGIN
  SELECT org_id INTO v_client_org
  FROM public.clients
  WHERE id = NEW.client_id;

  IF v_client_org IS NULL THEN
    RAISE EXCEPTION 'Referenced client not found';
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_client_org;
  END IF;

  IF NEW.org_id <> v_client_org THEN
    RAISE EXCEPTION 'contact_logs.org_id must match client.org_id';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_maintenance_tasks_org_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_instrument_org UUID;
  v_client_org UUID;
BEGIN
  SELECT org_id INTO v_instrument_org
  FROM public.instruments
  WHERE id = NEW.instrument_id;

  IF v_instrument_org IS NULL THEN
    RAISE EXCEPTION 'Referenced instrument not found';
  END IF;

  IF NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO v_client_org
    FROM public.clients
    WHERE id = NEW.client_id;

    IF v_client_org IS NULL THEN
      RAISE EXCEPTION 'Referenced client not found';
    END IF;

    IF v_client_org <> v_instrument_org THEN
      RAISE EXCEPTION 'Maintenance task client and instrument must belong to the same organization';
    END IF;
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_instrument_org;
  END IF;

  IF NEW.org_id <> v_instrument_org THEN
    RAISE EXCEPTION 'maintenance_tasks.org_id must match instrument.org_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_client_instruments_org_consistency_trigger ON public.client_instruments;
CREATE TRIGGER enforce_client_instruments_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.client_instruments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_client_instruments_org_consistency();

DROP TRIGGER IF EXISTS enforce_invoice_items_org_consistency_trigger ON public.invoice_items;
CREATE TRIGGER enforce_invoice_items_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invoice_items_org_consistency();

DROP TRIGGER IF EXISTS enforce_sales_history_org_consistency_trigger ON public.sales_history;
CREATE TRIGGER enforce_sales_history_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.sales_history
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sales_history_org_consistency();

DROP TRIGGER IF EXISTS enforce_contact_logs_org_consistency_trigger ON public.contact_logs;
CREATE TRIGGER enforce_contact_logs_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.contact_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_contact_logs_org_consistency();

DROP TRIGGER IF EXISTS enforce_maintenance_tasks_org_consistency_trigger ON public.maintenance_tasks;
CREATE TRIGGER enforce_maintenance_tasks_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.maintenance_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_maintenance_tasks_org_consistency();
