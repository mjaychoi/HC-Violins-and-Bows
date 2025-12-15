-- EASIEST FIX - Run these one by one in Supabase SQL Editor

-- 1. First, check what constraints exist
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'contact_logs'::regclass 
AND contype = 'f';

-- 2. Drop ALL foreign key constraints on contact_logs (safe to run multiple times)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'contact_logs'::regclass 
        AND contype = 'f'
    LOOP
        EXECUTE 'ALTER TABLE contact_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 3. Add the properly named constraints
ALTER TABLE contact_logs
  ADD CONSTRAINT contact_logs_client_id_fkey 
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE contact_logs
  ADD CONSTRAINT contact_logs_instrument_id_fkey 
  FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL;
