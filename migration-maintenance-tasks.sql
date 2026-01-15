-- Full maintenance_tasks migration bundle
-- This file is referenced by scripts/migrate.ts for Supabase deployment.

-- Part 1: maintenance_tasks table (based on supabase/migrations/20251109150920_maintenance_tasks.sql)
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument_id UUID REFERENCES instruments(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'repair',
    'rehair',
    'maintenance',
    'inspection',
    'setup',
    'adjustment',
    'restoration'
  )),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
  )),
  received_date DATE NOT NULL,
  due_date DATE,
  personal_due_date DATE,
  scheduled_date DATE,
  completed_date DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  estimated_hours DECIMAL(4,2),
  actual_hours DECIMAL(4,2),
  cost DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_instrument_id ON maintenance_tasks(instrument_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_status ON maintenance_tasks(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_due_date ON maintenance_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_scheduled_date ON maintenance_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_personal_due_date ON maintenance_tasks(personal_due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_received_date ON maintenance_tasks(received_date);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_maintenance_tasks_updated_at
  BEFORE UPDATE ON maintenance_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users" ON maintenance_tasks
  FOR ALL USING (auth.role() = 'authenticated');

COMMENT ON TABLE maintenance_tasks IS '악기 및 활의 수리, 정비, 관리 작업을 추적하는 테이블';
COMMENT ON COLUMN maintenance_tasks.received_date IS '작업 접수일';
COMMENT ON COLUMN maintenance_tasks.due_date IS '고객이 요청한 납기일';
COMMENT ON COLUMN maintenance_tasks.personal_due_date IS '개인적으로 목표로 하는 완료일';
COMMENT ON COLUMN maintenance_tasks.scheduled_date IS '실제 작업을 예약한 날짜';
COMMENT ON COLUMN maintenance_tasks.completed_date IS '작업이 실제로 완료된 날짜';

-- Part 2: Add client_id column (based on supabase/migrations/20250101000000_add_client_id_to_maintenance_tasks.sql)
ALTER TABLE maintenance_tasks
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_client_id ON maintenance_tasks(client_id) WHERE client_id IS NOT NULL;

COMMENT ON COLUMN maintenance_tasks.client_id IS '작업을 의뢰한 클라이언트 ID (선택사항)';
