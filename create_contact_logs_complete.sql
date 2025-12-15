-- Complete script to create contact_logs table
-- Run this in Supabase Dashboard > SQL Editor
-- This will create the table with all necessary columns and constraints

-- Step 1: Check if table exists first
SELECT 
    table_schema,
    table_name
FROM information_schema.tables 
WHERE table_name = 'contact_logs'
AND table_schema = 'public';

-- Step 2: Create the table (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.contact_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID,
  instrument_id UUID,
  contact_type TEXT NOT NULL CHECK (contact_type IN (
    'email',
    'phone',
    'meeting',
    'note',
    'follow_up'
  )),
  subject TEXT,
  content TEXT NOT NULL,
  contact_date DATE NOT NULL,
  next_follow_up_date DATE,
  follow_up_completed_at TIMESTAMP WITH TIME ZONE,
  purpose TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT contact_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE,
  CONSTRAINT contact_logs_instrument_id_fkey FOREIGN KEY (instrument_id) REFERENCES public.instruments(id) ON DELETE SET NULL
);

-- Step 3: Add follow_up_completed_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'contact_logs' 
    AND column_name = 'follow_up_completed_at'
  ) THEN
    ALTER TABLE public.contact_logs
    ADD COLUMN follow_up_completed_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_contact_logs_client_id ON public.contact_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_instrument_id ON public.contact_logs(instrument_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_date ON public.contact_logs(contact_date);
CREATE INDEX IF NOT EXISTS idx_contact_logs_next_follow_up_date ON public.contact_logs(next_follow_up_date);
CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_type ON public.contact_logs(contact_type);
CREATE INDEX IF NOT EXISTS idx_contact_logs_follow_up_completed_at 
  ON public.contact_logs(follow_up_completed_at) 
  WHERE follow_up_completed_at IS NULL;

-- Step 5: Create or replace the update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger for updated_at
DROP TRIGGER IF EXISTS update_contact_logs_updated_at ON public.contact_logs;
CREATE TRIGGER update_contact_logs_updated_at
  BEFORE UPDATE ON public.contact_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Step 7: Enable Row Level Security
ALTER TABLE public.contact_logs ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.contact_logs;
CREATE POLICY "Allow all operations for authenticated users" ON public.contact_logs
  FOR ALL USING (auth.role() = 'authenticated');

-- Step 9: Add comments
COMMENT ON TABLE public.contact_logs IS '고객과의 연락 기록 및 Follow-up 일정을 추적하는 테이블';
COMMENT ON COLUMN public.contact_logs.contact_type IS '연락 유형 (email, phone, meeting, note, follow_up)';
COMMENT ON COLUMN public.contact_logs.contact_date IS '연락한 날짜';
COMMENT ON COLUMN public.contact_logs.next_follow_up_date IS '다음 연락 예정일 (Follow-up)';
COMMENT ON COLUMN public.contact_logs.purpose IS '연락 목적 (quote, follow_up, maintenance, sale 등)';
COMMENT ON COLUMN public.contact_logs.follow_up_completed_at IS 'Follow-up 완료 처리 시각 (null이면 미완료)';

-- Step 10: Verify the table was created
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'contact_logs'
ORDER BY ordinal_position;
