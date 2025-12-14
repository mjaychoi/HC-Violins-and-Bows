-- Step 1: Check if contact_logs table exists
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_name = 'contact_logs';

-- Step 2: If table doesn't exist, create it
-- Run this ONLY if the above query returns no rows

CREATE TABLE IF NOT EXISTS contact_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID,
  instrument_id UUID,
  contact_type TEXT NOT NULL CHECK (contact_type IN (
    'email',        -- 이메일
    'phone',        -- 전화
    'meeting',      -- 미팅
    'note',         -- 메모
    'follow_up'     -- Follow-up 설정
  )),
  subject TEXT,                    -- 이메일 제목 또는 통화 주제
  content TEXT NOT NULL,           -- 연락 내용
  contact_date DATE NOT NULL,      -- 연락한 날짜
  next_follow_up_date DATE,        -- 다음 연락 예정일
  follow_up_completed_at TIMESTAMP WITH TIME ZONE,  -- Follow-up 완료 시각
  purpose TEXT,                    -- 연락 목적 (예: 'quote', 'follow_up', 'maintenance', 'sale')
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT contact_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT contact_logs_instrument_id_fkey FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL
);

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_contact_logs_client_id ON contact_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_instrument_id ON contact_logs(instrument_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_date ON contact_logs(contact_date);
CREATE INDEX IF NOT EXISTS idx_contact_logs_next_follow_up_date ON contact_logs(next_follow_up_date);
CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_type ON contact_logs(contact_type);
CREATE INDEX IF NOT EXISTS idx_contact_logs_follow_up_completed_at 
  ON contact_logs(follow_up_completed_at) 
  WHERE follow_up_completed_at IS NULL;

-- Step 4: Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contact_logs_updated_at
  BEFORE UPDATE ON contact_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 5: Enable Row Level Security
ALTER TABLE contact_logs ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON contact_logs;
CREATE POLICY "Allow all operations for authenticated users" ON contact_logs
  FOR ALL USING (auth.role() = 'authenticated');

-- Step 7: Add comments
COMMENT ON TABLE contact_logs IS '고객과의 연락 기록 및 Follow-up 일정을 추적하는 테이블';
COMMENT ON COLUMN contact_logs.contact_type IS '연락 유형 (email, phone, meeting, note, follow_up)';
COMMENT ON COLUMN contact_logs.contact_date IS '연락한 날짜';
COMMENT ON COLUMN contact_logs.next_follow_up_date IS '다음 연락 예정일 (Follow-up)';
COMMENT ON COLUMN contact_logs.purpose IS '연락 목적 (quote, follow_up, maintenance, sale 등)';
COMMENT ON COLUMN contact_logs.follow_up_completed_at IS 'Follow-up 완료 처리 시각 (null이면 미완료)';
