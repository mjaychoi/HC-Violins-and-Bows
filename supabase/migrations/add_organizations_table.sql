-- ============================================
-- Organizations Table Migration
-- ============================================
-- This table stores organization information for multi-tenancy support.
-- org_id in other tables (invoices, invoice_settings, etc.) references this table.

-- Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_organizations_updated_at'
      AND tgrelid = 'public.organizations'::regclass
  ) THEN
    CREATE TRIGGER update_organizations_updated_at
      BEFORE UPDATE ON public.organizations
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Create index on name for searching
CREATE INDEX IF NOT EXISTS idx_organizations_name 
  ON public.organizations(name);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Note: Adjust these policies based on your access control requirements

-- Policy: Users can view organizations (adjust as needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_select_policy'
  ) THEN
    CREATE POLICY organizations_select_policy
      ON public.organizations
      FOR SELECT
      USING (true); -- Allow all authenticated users to view organizations
                    -- You may want to restrict this based on user's org_id
  END IF;
END $$;

-- Policy: Only service role can insert organizations (adjust as needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_insert_policy'
  ) THEN
    CREATE POLICY organizations_insert_policy
      ON public.organizations
      FOR INSERT
      WITH CHECK (auth.role() = 'service_role'); -- Only service role can create organizations
                                                 -- Adjust this based on your requirements
  END IF;
END $$;

-- Policy: Only service role can update organizations (adjust as needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_update_policy'
  ) THEN
    CREATE POLICY organizations_update_policy
      ON public.organizations
      FOR UPDATE
      USING (auth.role() = 'service_role'); -- Only service role can update organizations
                                            -- Adjust this based on your requirements
  END IF;
END $$;

-- Policy: Only service role can delete organizations (adjust as needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_delete_policy'
  ) THEN
    CREATE POLICY organizations_delete_policy
      ON public.organizations
      FOR DELETE
      USING (auth.role() = 'service_role'); -- Only service role can delete organizations
                                            -- Adjust this based on your requirements
  END IF;
END $$;

-- Optional: Add foreign key constraints to existing tables
-- Note: Only add these if you want strict referential integrity
-- If some org_id values don't have corresponding organizations, this will fail

-- Example for invoices table (commented out - uncomment if needed):
-- ALTER TABLE public.invoices
--   ADD CONSTRAINT fk_invoices_org_id
--   FOREIGN KEY (org_id)
--   REFERENCES public.organizations(id)
--   ON DELETE SET NULL;

-- Example for invoice_settings table (commented out - uncomment if needed):
-- ALTER TABLE public.invoice_settings
--   ADD CONSTRAINT fk_invoice_settings_org_id
--   FOREIGN KEY (org_id)
--   REFERENCES public.organizations(id)
--   ON DELETE SET NULL;

-- Add comment
COMMENT ON TABLE public.organizations IS 'Stores organization information for multi-tenancy support';

