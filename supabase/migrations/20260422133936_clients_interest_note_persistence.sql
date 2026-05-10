ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS interest text,
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN public.clients.interest IS
  'Client interest captured from the Clients page.';

COMMENT ON COLUMN public.clients.note IS
  'Free-form client note captured from the Clients page.';
