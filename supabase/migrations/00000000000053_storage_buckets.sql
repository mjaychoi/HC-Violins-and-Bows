-- Storage RLS policies reference these bucket ids; buckets are not created by table DDL.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('instrument-images', 'instrument-images', false),
  ('instrument-certificates', 'instrument-certificates', false),
  ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;
