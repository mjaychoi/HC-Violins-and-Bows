-- Migration script to update clients table for tagging system
-- Run this in your Supabase SQL editor

-- Step 1: Add new columns
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS interest TEXT;

-- Step 2: Migrate existing data (optional - only if you have existing clients)
-- This will convert existing type/status to tags
UPDATE clients 
SET tags = CASE 
  WHEN type = 'Musician' THEN ARRAY['Musician']
  WHEN type = 'Dealer' THEN ARRAY['Dealer'] 
  WHEN type = 'Collector' THEN ARRAY['Collector']
  ELSE ARRAY['Other']
END,
interest = CASE 
  WHEN status = 'Active' THEN 'Active'
  WHEN status = 'Inactive' THEN 'Inactive'
  WHEN status IN ('Browsing', 'In Negotiation') THEN 'Passive'
  ELSE NULL
END
WHERE tags = '{}' OR tags IS NULL;

-- Step 3: Drop old columns (after confirming migration worked)
-- ALTER TABLE clients DROP COLUMN type;
-- ALTER TABLE clients DROP COLUMN status;

-- Note: Uncomment the DROP COLUMN statements above after you've verified the migration worked correctly
