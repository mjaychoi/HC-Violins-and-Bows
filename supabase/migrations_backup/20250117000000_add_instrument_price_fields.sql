-- Add cost_price, consignment_price, and certificate_name columns to instruments table

ALTER TABLE instruments
  ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS consignment_price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS certificate_name TEXT;

-- Add comments for documentation
COMMENT ON COLUMN instruments.cost_price IS 'Cost price of the instrument (shown only in detail view)';
COMMENT ON COLUMN instruments.consignment_price IS 'Consignment price of the instrument (shown only in detail view)';
COMMENT ON COLUMN instruments.certificate_name IS 'Name/type of certificate when certificate is true';
