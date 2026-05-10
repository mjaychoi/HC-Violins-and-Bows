-- Persist client tags (e.g. Owner, Musician) for list/detail display.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
