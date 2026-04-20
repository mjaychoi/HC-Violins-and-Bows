CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := 'INV_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    IF NOT EXISTS (
      SELECT 1
      FROM public.invoices
      WHERE invoice_number = candidate
    ) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;

ALTER TABLE public.invoices
  ALTER COLUMN invoice_number SET DEFAULT public.generate_invoice_number();

UPDATE public.invoices
SET invoice_number = public.generate_invoice_number()
WHERE invoice_number IS NULL
   OR length(trim(invoice_number)) = 0;

ALTER TABLE public.invoices
  ALTER COLUMN invoice_number SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number
  ON public.invoices(invoice_number);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_invoice_number_unique'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number);
  END IF;
END;
$$;
