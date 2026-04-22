DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.instruments
    WHERE serial_number IS NOT NULL
    GROUP BY org_id, serial_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create org-scoped serial unique index: duplicate serial numbers already exist within the same organization.';
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_instruments_serial_number;

CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_org_serial
  ON public.instruments(org_id, serial_number)
  WHERE serial_number IS NOT NULL;
