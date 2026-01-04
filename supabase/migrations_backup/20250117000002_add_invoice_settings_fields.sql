-- Migration: Add invoice settings fields to invoices table
-- Created: 2025-01-17
-- Allows users to customize business info per invoice

-- Add business info fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS business_phone TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS business_email TEXT;

-- Add banking info fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_swift_code TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_account_number TEXT;

-- Add additional fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS default_conditions TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS default_exchange_rate TEXT;

-- Add comments for documentation
COMMENT ON COLUMN invoices.business_name IS 'Business/company name for this invoice (overrides default settings)';
COMMENT ON COLUMN invoices.business_address IS 'Business address for this invoice';
COMMENT ON COLUMN invoices.business_phone IS 'Business phone number for this invoice';
COMMENT ON COLUMN invoices.business_email IS 'Business email address for this invoice';
COMMENT ON COLUMN invoices.bank_account_holder IS 'Bank account holder name for this invoice';
COMMENT ON COLUMN invoices.bank_name IS 'Bank name for this invoice';
COMMENT ON COLUMN invoices.bank_swift_code IS 'Bank SWIFT code for this invoice';
COMMENT ON COLUMN invoices.bank_account_number IS 'Bank account number for this invoice';
COMMENT ON COLUMN invoices.default_conditions IS 'Terms and conditions text for this invoice';
COMMENT ON COLUMN invoices.default_exchange_rate IS 'Exchange rate text for this invoice';

