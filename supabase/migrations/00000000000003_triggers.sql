-- ============================================================
-- Triggers — updated_at automation and org consistency guards.
-- ============================================================

-- ──────────────────────────────────────────────
-- updated_at triggers
-- ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_instruments_updated_at ON public.instruments;
CREATE TRIGGER update_instruments_updated_at
  BEFORE UPDATE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_instruments_updated_at ON public.client_instruments;
CREATE TRIGGER update_client_instruments_updated_at
  BEFORE UPDATE ON public.client_instruments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sales_history_updated_at ON public.sales_history;
CREATE TRIGGER update_sales_history_updated_at
  BEFORE UPDATE ON public.sales_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoice_settings_updated_at ON public.invoice_settings;
CREATE TRIGGER update_invoice_settings_updated_at
  BEFORE UPDATE ON public.invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_maintenance_tasks_updated_at ON public.maintenance_tasks;
CREATE TRIGGER update_maintenance_tasks_updated_at
  BEFORE UPDATE ON public.maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contact_logs_updated_at ON public.contact_logs;
CREATE TRIGGER update_contact_logs_updated_at
  BEFORE UPDATE ON public.contact_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ──────────────────────────────────────────────
-- Org consistency trigger functions
-- Ensures child rows cannot cross org boundaries.
-- Uses public.org_id() — NOT auth.org_id().
-- ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_client_instruments_org_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_org     UUID;
  v_instrument_org UUID;
BEGIN
  SELECT org_id INTO v_client_org     FROM public.clients     WHERE id = NEW.client_id;
  SELECT org_id INTO v_instrument_org FROM public.instruments WHERE id = NEW.instrument_id;

  IF v_client_org IS NULL     THEN RAISE EXCEPTION 'Client not found or missing org_id'; END IF;
  IF v_instrument_org IS NULL THEN RAISE EXCEPTION 'Instrument not found or missing org_id'; END IF;
  IF v_client_org <> v_instrument_org THEN
    RAISE EXCEPTION 'Client and instrument must belong to the same organization';
  END IF;

  IF NEW.org_id IS NULL         THEN NEW.org_id := v_client_org; END IF;
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
  v_invoice_org    UUID;
  v_instrument_org UUID;
BEGIN
  SELECT org_id INTO v_invoice_org FROM public.invoices WHERE id = NEW.invoice_id;
  IF v_invoice_org IS NULL THEN RAISE EXCEPTION 'Invoice not found or missing org_id'; END IF;

  IF NEW.org_id IS NULL          THEN NEW.org_id := v_invoice_org; END IF;
  IF NEW.org_id <> v_invoice_org THEN
    RAISE EXCEPTION 'invoice_items.org_id must match invoice.org_id';
  END IF;

  IF NEW.instrument_id IS NOT NULL THEN
    SELECT org_id INTO v_instrument_org FROM public.instruments WHERE id = NEW.instrument_id;
    IF v_instrument_org IS NULL           THEN RAISE EXCEPTION 'Referenced instrument not found'; END IF;
    IF v_instrument_org <> v_invoice_org  THEN
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
  v_client_org     UUID;
BEGIN
  IF NEW.instrument_id IS NOT NULL THEN
    SELECT org_id INTO v_instrument_org FROM public.instruments WHERE id = NEW.instrument_id;
    IF v_instrument_org IS NULL THEN RAISE EXCEPTION 'Referenced instrument not found'; END IF;
  END IF;

  IF NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO v_client_org FROM public.clients WHERE id = NEW.client_id;
    IF v_client_org IS NULL THEN RAISE EXCEPTION 'Referenced client not found'; END IF;
  END IF;

  IF v_instrument_org IS NOT NULL AND v_client_org IS NOT NULL
     AND v_instrument_org <> v_client_org THEN
    RAISE EXCEPTION 'Sale instrument and client must belong to the same organization';
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := COALESCE(v_instrument_org, v_client_org);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_contact_logs_org_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client_org     UUID;
  v_instrument_org UUID;
BEGIN
  SELECT org_id INTO v_client_org FROM public.clients WHERE id = NEW.client_id;
  IF v_client_org IS NULL THEN RAISE EXCEPTION 'Referenced client not found'; END IF;

  IF NEW.instrument_id IS NOT NULL THEN
    SELECT org_id INTO v_instrument_org FROM public.instruments WHERE id = NEW.instrument_id;
    IF v_instrument_org IS NULL THEN RAISE EXCEPTION 'Referenced instrument not found'; END IF;
    IF v_instrument_org <> v_client_org THEN
      RAISE EXCEPTION 'contact_logs instrument and client must belong to the same organization';
    END IF;
  END IF;

  IF NEW.org_id IS NULL          THEN NEW.org_id := v_client_org; END IF;
  IF NEW.org_id <> v_client_org  THEN
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
  v_client_org     UUID;
BEGIN
  SELECT org_id INTO v_instrument_org FROM public.instruments WHERE id = NEW.instrument_id;
  IF v_instrument_org IS NULL THEN RAISE EXCEPTION 'Referenced instrument not found'; END IF;

  IF NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO v_client_org FROM public.clients WHERE id = NEW.client_id;
    IF v_client_org IS NULL THEN RAISE EXCEPTION 'Referenced client not found'; END IF;
    IF v_client_org <> v_instrument_org THEN
      RAISE EXCEPTION 'Maintenance task client and instrument must belong to the same organization';
    END IF;
  END IF;

  IF NEW.org_id IS NULL              THEN NEW.org_id := v_instrument_org; END IF;
  IF NEW.org_id <> v_instrument_org  THEN
    RAISE EXCEPTION 'maintenance_tasks.org_id must match instrument.org_id';
  END IF;

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────
-- Attach org consistency triggers
-- ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS enforce_client_instruments_org_consistency_trigger  ON public.client_instruments;
CREATE TRIGGER enforce_client_instruments_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.client_instruments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_instruments_org_consistency();

DROP TRIGGER IF EXISTS enforce_invoice_items_org_consistency_trigger ON public.invoice_items;
CREATE TRIGGER enforce_invoice_items_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_items_org_consistency();

DROP TRIGGER IF EXISTS enforce_sales_history_org_consistency_trigger ON public.sales_history;
CREATE TRIGGER enforce_sales_history_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.sales_history
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_history_org_consistency();

DROP TRIGGER IF EXISTS enforce_contact_logs_org_consistency_trigger ON public.contact_logs;
CREATE TRIGGER enforce_contact_logs_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.contact_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_logs_org_consistency();

DROP TRIGGER IF EXISTS enforce_maintenance_tasks_org_consistency_trigger ON public.maintenance_tasks;
CREATE TRIGGER enforce_maintenance_tasks_org_consistency_trigger
  BEFORE INSERT OR UPDATE ON public.maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_maintenance_tasks_org_consistency();
