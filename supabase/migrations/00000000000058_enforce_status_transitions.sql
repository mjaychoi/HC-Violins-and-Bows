-- Enforce application status transition rules at DB level.

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

CREATE OR REPLACE FUNCTION public.enforce_invoice_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NULL OR OLD.status IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status IN ('sent', 'cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'sent' AND NEW.status IN ('paid', 'overdue', 'cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'overdue' AND NEW.status IN ('paid', 'cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status IN ('paid', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid invoice status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  ELSE
    RAISE EXCEPTION 'Invalid invoice status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_invoice_status_transition ON public.invoices;
CREATE TRIGGER tr_enforce_invoice_status_transition
BEFORE UPDATE OF status ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_status_transition();

CREATE OR REPLACE FUNCTION public.enforce_maintenance_task_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NULL OR OLD.status IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status IN ('in_progress', 'cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status = 'in_progress' AND NEW.status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  ELSIF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid maintenance task status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  ELSE
    RAISE EXCEPTION 'Invalid maintenance task status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_maintenance_task_status_transition ON public.maintenance_tasks;
CREATE TRIGGER tr_enforce_maintenance_task_status_transition
BEFORE UPDATE OF status ON public.maintenance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_maintenance_task_status_transition();
