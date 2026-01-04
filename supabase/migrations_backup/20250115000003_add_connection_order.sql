-- Add order column to client_instruments table for drag & drop ordering
-- This allows users to customize the display order of connections

-- Add order column (nullable, will be populated with default values)
ALTER TABLE client_instruments
ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- Create index for efficient ordering queries
CREATE INDEX IF NOT EXISTS idx_client_instruments_display_order 
ON client_instruments(display_order);

-- Set default display_order based on created_at for existing records
-- This ensures all existing connections have an order value
UPDATE client_instruments
SET display_order = subquery.row_number
FROM (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY relationship_type ORDER BY created_at ASC) as row_number
  FROM client_instruments
) AS subquery
WHERE client_instruments.id = subquery.id
AND client_instruments.display_order IS NULL;

-- Set NOT NULL constraint after populating default values
ALTER TABLE client_instruments
ALTER COLUMN display_order SET NOT NULL;

-- Add default value for new records (will be set by application logic)
ALTER TABLE client_instruments
ALTER COLUMN display_order SET DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN client_instruments.display_order IS 'Display order for drag & drop sorting. Lower values appear first.';
