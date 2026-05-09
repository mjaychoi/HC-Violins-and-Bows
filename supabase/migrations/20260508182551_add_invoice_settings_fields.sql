-- Add the invoice settings fields used by /api/invoices/invoice_settings.
-- Some deployed databases only had the original one-row-per-org shell table,
-- which made PostgREST reject reads/writes with PGRST204.
ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS business_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_address TEXT,
  ADD COLUMN IF NOT EXISTS business_phone TEXT,
  ADD COLUMN IF NOT EXISTS business_email TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_swift_code TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS default_conditions TEXT,
  ADD COLUMN IF NOT EXISTS default_exchange_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'USD';

-- Backward-compatible aliases for older clients/types that still reference
-- address/phone/email directly on invoice_settings.
ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;
