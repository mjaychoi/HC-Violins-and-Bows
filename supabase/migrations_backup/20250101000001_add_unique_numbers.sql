-- Migration: Add unique numbers to instruments and clients
-- Created: 2025-01-01

-- Add serial_number column to instruments table
ALTER TABLE instruments
ADD COLUMN IF NOT EXISTS serial_number TEXT;

-- Create unique index for serial_number (allowing NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_serial_number 
ON instruments(serial_number) 
WHERE serial_number IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN instruments.serial_number IS '악기 고유 번호 (예: VI123, BO456, mj123)';

-- Add client_number column to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS client_number TEXT;

-- Create unique index for client_number (allowing NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_client_number 
ON clients(client_number) 
WHERE client_number IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN clients.client_number IS '클라이언트 고유 번호 (예: CL001, mj123)';

