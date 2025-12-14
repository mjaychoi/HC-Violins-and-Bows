-- Quick fix script for contact_logs foreign keys
-- Run this in Supabase Dashboard SQL Editor
-- This will fix the PostgREST relationship detection issue

-- Step 1: Drop existing foreign key constraints (if any)
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop foreign key constraints on client_id
  FOR r IN 
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'contact_logs'::regclass
    AND contype = 'f'
    AND (
      conkey::text LIKE '%1%' AND 
      (SELECT attname FROM pg_attribute WHERE attrelid = 'contact_logs'::regclass AND attnum = (conkey::int[])[1]) = 'client_id'
    )
  LOOP
    EXECUTE 'ALTER TABLE contact_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;

  -- Drop foreign key constraints on instrument_id
  FOR r IN 
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'contact_logs'::regclass
    AND contype = 'f'
    AND (
      conkey::text LIKE '%1%' AND 
      (SELECT attname FROM pg_attribute WHERE attrelid = 'contact_logs'::regclass AND attnum = (conkey::int[])[1]) = 'instrument_id'
    )
  LOOP
    EXECUTE 'ALTER TABLE contact_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- Step 2: Add properly named foreign key constraints
ALTER TABLE contact_logs
  DROP CONSTRAINT IF EXISTS contact_logs_client_id_fkey;

ALTER TABLE contact_logs
  DROP CONSTRAINT IF EXISTS contact_logs_instrument_id_fkey;

ALTER TABLE contact_logs
  ADD CONSTRAINT contact_logs_client_id_fkey 
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE contact_logs
  ADD CONSTRAINT contact_logs_instrument_id_fkey 
  FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL;

-- Step 3: Refresh PostgREST schema cache (if you have access)
-- Note: This might require superuser privileges
-- NOTIFY pgrst, 'reload schema';
