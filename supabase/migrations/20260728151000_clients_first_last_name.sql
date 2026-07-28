-- Persist first_name and last_name separately so last-only / first-only clients round-trip.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

UPDATE public.clients
SET
  first_name = CASE
    WHEN name IS NULL OR BTRIM(name) = '' THEN NULL
    WHEN POSITION(' ' IN BTRIM(name)) > 0 THEN BTRIM(SPLIT_PART(BTRIM(name), ' ', 1))
    ELSE BTRIM(name)
  END,
  last_name = CASE
    WHEN name IS NULL OR BTRIM(name) = '' THEN NULL
    WHEN POSITION(' ' IN BTRIM(name)) > 0
      THEN NULLIF(BTRIM(SUBSTRING(BTRIM(name) FROM POSITION(' ' IN BTRIM(name)) + 1)), '')
    ELSE NULL
  END
WHERE first_name IS NULL
  AND last_name IS NULL;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_name_identity_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_name_identity_check
  CHECK (
    NULLIF(BTRIM(first_name), '') IS NOT NULL
    OR NULLIF(BTRIM(last_name), '') IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.sync_clients_name_from_parts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := COALESCE(
    NULLIF(
      BTRIM(
        CONCAT_WS(
          ' ',
          NULLIF(BTRIM(COALESCE(NEW.first_name, '')), ''),
          NULLIF(BTRIM(COALESCE(NEW.last_name, '')), '')
        )
      ),
      ''
    ),
    NEW.name
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_sync_name ON public.clients;
CREATE TRIGGER trg_clients_sync_name
  BEFORE INSERT OR UPDATE OF first_name, last_name ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_clients_name_from_parts();
