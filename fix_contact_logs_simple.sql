-- Simple fix for contact_logs foreign keys
-- Copy and paste this into Supabase Dashboard > SQL Editor > New Query
-- Run each section separately if needed

-- Step 1: Check existing constraints
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'contact_logs'::regclass 
AND contype = 'f';

-- Step 2: Drop existing foreign key constraints (if they exist)
DO $$
DECLARE
    constraint_name text;
BEGIN
    -- Drop client_id foreign key
    FOR constraint_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'contact_logs'::regclass 
        AND contype = 'f'
        AND conkey::int[] = ARRAY(
            SELECT attnum 
            FROM pg_attribute 
            WHERE attrelid = 'contact_logs'::regclass 
            AND attname = 'client_id'
        )
    LOOP
        EXECUTE 'ALTER TABLE contact_logs DROP CONSTRAINT ' || quote_ident(constraint_name);
    END LOOP;

    -- Drop instrument_id foreign key
    FOR constraint_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'contact_logs'::regclass 
        AND contype = 'f'
        AND conkey::int[] = ARRAY(
            SELECT attnum 
            FROM pg_attribute 
            WHERE attrelid = 'contact_logs'::regclass 
            AND attname = 'instrument_id'
        )
    LOOP
        EXECUTE 'ALTER TABLE contact_logs DROP CONSTRAINT ' || quote_ident(constraint_name);
    END LOOP;
END $$;

-- Step 3: Add properly named foreign key constraints
ALTER TABLE contact_logs
  ADD CONSTRAINT contact_logs_client_id_fkey 
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE contact_logs
  ADD CONSTRAINT contact_logs_instrument_id_fkey 
  FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL;
