-- F3: reject invalid initial invoice statuses at INSERT time.
--
-- public.invoices.status defaults to 'draft' but nothing stopped an INSERT (or
-- a create_invoice_atomic payload) from starting an invoice directly at 'paid',
-- 'overdue' or 'cancelled'. The UPDATE transition trigger installed by
-- 00000000000058 only guards OLD -> NEW transitions, so creating straight at a
-- terminal state bypassed the state machine entirely: a 'paid' invoice could
-- exist without ever having been 'sent'.
--
-- Supported initial contract for this batch:
--   * 'draft' - always allowed, and used when status is NULL/empty.
--   * 'sent'  - allowed, because the shipped create UI is an intentional
--               create-and-send flow: src/app/invoices/components/InvoiceForm.tsx
--               renders a Status select on create and POST /api/invoices accepts
--               a status field, so create-as-sent is existing shipped behaviour.
--   * everything else (including 'paid', 'overdue', 'cancelled') is rejected.
--
-- This says nothing about payment evidence. It only prevents bypassing the
-- initial-state transition contract; there is no payment table and none is
-- added here. Post-creation transitions are untouched - this trigger is
-- BEFORE INSERT only and does not modify or replace
-- tr_enforce_invoice_status_transition (BEFORE UPDATE OF status).

CREATE OR REPLACE FUNCTION public.enforce_invoice_initial_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NULL OR BTRIM(NEW.status) = '' THEN
    NEW.status := 'draft';
    RETURN NEW;
  END IF;

  IF NEW.status IN ('draft', 'sent') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'INVALID_INITIAL_INVOICE_STATUS: An invoice cannot be created with status %. Create it as draft or sent and use the status workflow.', NEW.status
    USING ERRCODE = '23514',
          DETAIL  = '{"error_code":"INVALID_INITIAL_INVOICE_STATUS"}',
          HINT    = 'INVALID_INITIAL_INVOICE_STATUS';
END;
$$;

COMMENT ON FUNCTION public.enforce_invoice_initial_status() IS
  'F3: restricts the initial value of public.invoices.status to draft or sent. Does not affect post-creation transitions (see enforce_invoice_status_transition).';

DROP TRIGGER IF EXISTS tr_enforce_invoice_initial_status ON public.invoices;
CREATE TRIGGER tr_enforce_invoice_initial_status
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_initial_status();
