-- Migration: Add trigger to automatically set org_id on invoices table
-- Created: 2025-01-18
-- Purpose: Ensure org_id is always set consistently for invoice creation,
--          preventing issues where GET requests filter by org_id but POST
--          doesn't set it correctly
--
-- NOTE: This trigger is a BACKUP mechanism. Application code should always
--       set org_id explicitly. This trigger only sets org_id if it's NULL.

-- First, check if invoices table has org_id column, add it if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'org_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN org_id UUID;
    CREATE INDEX IF NOT EXISTS idx_invoices_org_id ON invoices(org_id);
  END IF;
END $$;

-- Create function to set org_id from JWT token (backup mechanism)
-- Note: Application code should always set org_id. This is a safety net.
CREATE OR REPLACE FUNCTION public.set_invoice_org_id()
RETURNS TRIGGER AS $$
DECLARE
  jwt_org_id TEXT;
  jwt_claims JSONB;
BEGIN
  -- Only set org_id if it's not already set (application code takes precedence)
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Try to extract org_id from JWT token
  -- Use current_setting for Supabase compatibility
  BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
    
    jwt_org_id := 
      COALESCE(
        jwt_claims->>'org_id',
        jwt_claims->>'organization_id',
        jwt_claims->>'orgId',
        jwt_claims->>'organizationId',
        jwt_claims->'user_metadata'->>'org_id',
        jwt_claims->'user_metadata'->>'organization_id',
        jwt_claims->'app_metadata'->>'org_id',
        jwt_claims->'app_metadata'->>'organization_id'
      );

    -- Set org_id if we found a value in JWT
    IF jwt_org_id IS NOT NULL AND jwt_org_id != '' THEN
      NEW.org_id := jwt_org_id::UUID;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- If anything goes wrong (e.g., current_setting fails or invalid UUID), just continue
      -- Application code should handle org_id setting
      -- Do nothing and let the function continue to RETURN NEW
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically set org_id on insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_invoice_org_id_trigger'
      AND tgrelid = 'invoices'::regclass
  ) THEN
    CREATE TRIGGER set_invoice_org_id_trigger
      BEFORE INSERT ON invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.set_invoice_org_id();
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON FUNCTION public.set_invoice_org_id() IS 'Backup mechanism: Automatically sets org_id on invoice insert from JWT token claims if org_id is not already set. Application code should always set org_id explicitly.';
