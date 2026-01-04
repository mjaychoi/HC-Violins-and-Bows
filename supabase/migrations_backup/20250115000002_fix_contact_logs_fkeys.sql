-- Migration: Fix foreign key constraints for contact_logs table
-- Created: 2025-01-15
-- Purpose: Ensure foreign key constraints are properly named for PostgREST
-- 
-- IMPORTANT: Run this in Supabase Dashboard SQL Editor if local Supabase is not running

-- Check if table exists and has columns
DO $$
BEGIN
  -- Only proceed if contact_logs table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contact_logs') THEN
    
    -- Drop existing foreign key constraints if they exist (in case they were created without names)
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'contact_logs_client_id_fkey'
      AND conrelid = 'contact_logs'::regclass
    ) THEN
      ALTER TABLE contact_logs DROP CONSTRAINT contact_logs_client_id_fkey;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'contact_logs_instrument_id_fkey'
      AND conrelid = 'contact_logs'::regclass
    ) THEN
      ALTER TABLE contact_logs DROP CONSTRAINT contact_logs_instrument_id_fkey;
    END IF;

    -- Drop any unnamed foreign key constraints by finding them
    -- This is a bit tricky, so we'll use a more direct approach
    DO $drop$
    DECLARE
      r RECORD;
    BEGIN
      -- Find and drop foreign key constraints on client_id
      FOR r IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'contact_logs'::regclass
        AND contype = 'f'
        AND conkey::text LIKE '%client_id%'
      LOOP
        EXECUTE 'ALTER TABLE contact_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
      END LOOP;

      -- Find and drop foreign key constraints on instrument_id
      FOR r IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'contact_logs'::regclass
        AND contype = 'f'
        AND conkey::text LIKE '%instrument_id%'
      LOOP
        EXECUTE 'ALTER TABLE contact_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
      END LOOP;
    END $drop$;

    -- Add foreign key constraints with explicit names
    -- Only add if they don't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'contact_logs_client_id_fkey'
    ) THEN
      ALTER TABLE contact_logs
        ADD CONSTRAINT contact_logs_client_id_fkey 
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'contact_logs_instrument_id_fkey'
    ) THEN
      ALTER TABLE contact_logs
        ADD CONSTRAINT contact_logs_instrument_id_fkey 
        FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL;
    END IF;

    RAISE NOTICE 'Foreign key constraints updated successfully';
  ELSE
    RAISE NOTICE 'contact_logs table does not exist, skipping migration';
  END IF;
END $$;
