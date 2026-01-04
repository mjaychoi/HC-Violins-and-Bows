-- Migration: Update instruments status constraint to include Reserved and Maintenance
-- Created: 2024-11-12
-- Description: Updates the status CHECK constraint to allow 'Reserved' and 'Maintenance' status values

-- Drop the existing constraint
ALTER TABLE public.instruments 
DROP CONSTRAINT IF EXISTS instruments_status_check;

-- Add new constraint with all status values
ALTER TABLE public.instruments
ADD CONSTRAINT instruments_status_check 
CHECK (status::text = ANY (ARRAY[
  'Available'::text,
  'Booked'::text,
  'Sold'::text,
  'Reserved'::text,
  'Maintenance'::text
]));

-- Add comment for documentation
COMMENT ON CONSTRAINT instruments_status_check ON public.instruments IS 
'Status values: Available, Booked, Sold, Reserved, Maintenance';

