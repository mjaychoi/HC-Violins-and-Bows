-- Migration: Add updated_at trigger for instruments table
-- Created: 2024-11-12
-- Description: Automatically updates updated_at column when instruments table is updated

-- Create or replace the update_updated_at_column function (if not exists from maintenance_tasks)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_instruments_updated_at ON public.instruments;

CREATE TRIGGER update_instruments_updated_at
  BEFORE UPDATE ON public.instruments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TRIGGER update_instruments_updated_at ON public.instruments IS 
'Automatically updates updated_at column when row is updated';

