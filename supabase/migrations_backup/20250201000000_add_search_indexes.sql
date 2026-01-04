-- Add trigram extension for faster ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Instruments search helpers
CREATE INDEX IF NOT EXISTS idx_instruments_maker_trgm
  ON instruments USING gin (maker gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_type_trgm
  ON instruments USING gin (type gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_subtype_trgm
  ON instruments USING gin (subtype gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_serial_number_trgm
  ON instruments USING gin (serial_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_ownership
  ON instruments(ownership) WHERE ownership IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instruments_created_at
  ON instruments(created_at);

-- Clients search helpers
CREATE INDEX IF NOT EXISTS idx_clients_first_name_trgm
  ON clients USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_last_name_trgm
  ON clients USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_email_trgm
  ON clients USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_created_at
  ON clients(created_at);
