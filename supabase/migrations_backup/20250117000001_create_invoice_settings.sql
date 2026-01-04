-- Migration: Create invoice_settings table for invoice PDF configuration
-- Created: 2025-01-17

-- Create invoice_settings table (if not exists)
CREATE TABLE IF NOT EXISTS invoice_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns if they don't exist (idempotent - PostgreSQL requires individual statements)
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS business_name TEXT DEFAULT '';
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS bank_account_holder TEXT DEFAULT '';
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS bank_swift_code TEXT DEFAULT '';
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS bank_account_number TEXT DEFAULT '';
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS default_conditions TEXT DEFAULT '';
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS default_exchange_rate TEXT DEFAULT '';
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS default_currency TEXT DEFAULT 'USD';

-- Create index for org_id if needed for multi-tenant support
CREATE INDEX IF NOT EXISTS idx_invoice_settings_org_id ON invoice_settings(org_id);

-- Create or replace the update_updated_at_column function (if not exists from other migrations)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_invoice_settings_updated_at'
      AND tgrelid = 'invoice_settings'::regclass
  ) THEN
    CREATE TRIGGER update_invoice_settings_updated_at
      BEFORE UPDATE ON invoice_settings
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE invoice_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE policyname = 'Allow all operations for authenticated users'
      AND tablename = 'invoice_settings'
  ) THEN
    CREATE POLICY "Allow all operations for authenticated users" ON invoice_settings
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE invoice_settings IS 'Invoice settings table - stores company/bank information and default conditions for PDF generation';
COMMENT ON COLUMN invoice_settings.org_id IS 'Organization ID for multi-tenant support (optional)';
COMMENT ON COLUMN invoice_settings.business_name IS 'Business/company name';
COMMENT ON COLUMN invoice_settings.address IS 'Business address';
COMMENT ON COLUMN invoice_settings.phone IS 'Business phone number';
COMMENT ON COLUMN invoice_settings.email IS 'Business email address';
COMMENT ON COLUMN invoice_settings.bank_account_holder IS 'Bank account holder name';
COMMENT ON COLUMN invoice_settings.bank_name IS 'Bank name';
COMMENT ON COLUMN invoice_settings.bank_swift_code IS 'Bank SWIFT code';
COMMENT ON COLUMN invoice_settings.bank_account_number IS 'Bank account number';
COMMENT ON COLUMN invoice_settings.default_conditions IS 'Default terms and conditions text';
COMMENT ON COLUMN invoice_settings.default_exchange_rate IS 'Default exchange rate text';
COMMENT ON COLUMN invoice_settings.default_currency IS 'Default currency code (USD, KRW, etc.)';

