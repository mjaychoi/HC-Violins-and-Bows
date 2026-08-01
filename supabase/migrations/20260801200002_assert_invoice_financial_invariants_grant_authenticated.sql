-- create_invoice_atomic / update_invoice_atomic are SECURITY INVOKER, so the
-- helper they PERFORM runs as the calling role and needs its own EXECUTE grant.
GRANT EXECUTE ON FUNCTION public.assert_invoice_financial_invariants(UUID) TO authenticated;
