-- F5: prevent physical deletion of non-draft invoices.
--
-- DELETE /api/invoices/[id] issued an unconditional
-- `.delete().eq('id', id).eq('org_id', orgId)` and the invoices RLS DELETE
-- policy is org-scoped only, so any org admin could permanently erase a sent,
-- paid or overdue invoice together with its line items (ON DELETE CASCADE) and
-- leave no record of an issued document. The API now rejects that with 409
-- INVOICE_IMMUTABLE, and this trigger enforces the same contract for callers
-- that bypass the Next.js route (PostgREST, psql, scripts).
--
-- Policy: only 'draft' invoices may be hard deleted. 'cancelled' is NOT
-- treated as disposable - there is no documented policy in this repository
-- that says a cancelled invoice is a discardable draft, and cancellation is
-- reachable from 'sent'/'overdue' (see 00000000000058), so a cancelled invoice
-- may well be an issued document. Non-draft invoices are retired through the
-- existing status workflow instead. No new "void" state is introduced here.
--
-- Exemption: organization teardown. public.invoices.org_id is
-- REFERENCES public.organizations(id) ON DELETE CASCADE; when that cascade
-- runs, the parent organization row is already gone by the time this row-level
-- trigger fires, so the lookup below lets the cascade through. Every other
-- caller - including service_role and superuser sessions - is held to the
-- draft-only rule.
--
-- Draft deletion is unchanged and still cascades to public.invoice_items via
-- the existing invoice_items.invoice_id FK. A rejected deletion aborts the
-- statement, so the invoice row and all of its item rows are preserved. RLS on
-- public.invoices is untouched and no manual GRANT is required: trigger
-- functions do not need an EXECUTE grant to fire.

CREATE OR REPLACE FUNCTION public.enforce_invoice_delete_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Organization cascade teardown: parent row already deleted.
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id = OLD.org_id
  ) THEN
    RETURN OLD;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM 'draft' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'INVOICE_IMMUTABLE: Invoice % has status % and cannot be permanently deleted. Use the cancellation/status workflow instead.', OLD.id, OLD.status
    USING ERRCODE = '23514',
          DETAIL  = '{"error_code":"INVOICE_IMMUTABLE"}',
          HINT    = 'INVOICE_IMMUTABLE';
END;
$$;

COMMENT ON FUNCTION public.enforce_invoice_delete_immutability() IS
  'F5: only draft invoices may be physically deleted. Non-draft (sent/paid/overdue/cancelled) deletions raise INVOICE_IMMUTABLE. Organization ON DELETE CASCADE teardown is exempt.';

DROP TRIGGER IF EXISTS tr_enforce_invoice_delete_immutability ON public.invoices;
CREATE TRIGGER tr_enforce_invoice_delete_immutability
BEFORE DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_delete_immutability();
