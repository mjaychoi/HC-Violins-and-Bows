-- Migration: Add subtype column to instruments table
-- Created: 2024-11-12
-- Description: Adds subtype column to instruments table for better categorization

-- Add subtype column to existing instruments table
ALTER TABLE public.instruments 
ADD COLUMN IF NOT EXISTS subtype TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.instruments.subtype IS '악기 서브타입 (예: 4/4, 3/4, 1/2 등)';

-- Create index for better query performance (optional)
CREATE INDEX IF NOT EXISTS idx_instruments_subtype ON public.instruments(subtype) WHERE subtype IS NOT NULL;

