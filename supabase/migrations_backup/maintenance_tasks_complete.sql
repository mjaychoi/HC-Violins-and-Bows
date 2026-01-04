-- ============================================================================
-- Complete Migration: maintenance_tasks table
-- ============================================================================
-- 이 파일은 maintenance_tasks 테이블과 관련된 모든 마이그레이션을 포함합니다.
-- Supabase 대시보드의 SQL Editor에서 이 파일 전체를 실행하면 됩니다.
--
-- 포함된 마이그레이션:
-- 1. maintenance_tasks 테이블 생성
-- 2. client_id 컬럼 추가
-- ============================================================================

-- ============================================================================
-- 1. Create maintenance_tasks table
-- ============================================================================
-- Migration: Add maintenance_tasks table for calendar and task management
-- Created: 2024

-- Create maintenance_tasks table
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument_id UUID REFERENCES instruments(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'repair',           -- 수리
    'rehair',           -- 활털 갈기
    'maintenance',      -- 정기 점검
    'inspection',       -- 검사
    'setup',            -- 세팅
    'adjustment',       -- 조정
    'restoration'       -- 복원
  )),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',          -- 대기
    'in_progress',      -- 진행중
    'completed',        -- 완료
    'cancelled'         -- 취소
  )),
  received_date DATE NOT NULL,           -- 접수일
  due_date DATE,                          -- 납기일 (고객 요청)
  personal_due_date DATE,                 -- 개인 목표 완료일
  scheduled_date DATE,                    -- 예약된 작업일
  completed_date DATE,                    -- 실제 완료일
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  estimated_hours DECIMAL(4,2),           -- 예상 소요 시간
  actual_hours DECIMAL(4,2),              -- 실제 소요 시간
  cost DECIMAL(10,2),                     -- 비용
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_instrument_id ON maintenance_tasks(instrument_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_status ON maintenance_tasks(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_due_date ON maintenance_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_scheduled_date ON maintenance_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_personal_due_date ON maintenance_tasks(personal_due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_received_date ON maintenance_tasks(received_date);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
-- Drop trigger if exists to allow re-running this migration safely
DROP TRIGGER IF EXISTS update_maintenance_tasks_updated_at ON maintenance_tasks;

CREATE TRIGGER update_maintenance_tasks_updated_at
  BEFORE UPDATE ON maintenance_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Drop policy if exists to allow re-running this migration safely
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON maintenance_tasks;

CREATE POLICY "Allow all operations for authenticated users" ON maintenance_tasks
  FOR ALL USING (auth.role() = 'authenticated');

-- Add comments for documentation
COMMENT ON TABLE maintenance_tasks IS '악기 및 활의 수리, 정비, 관리 작업을 추적하는 테이블';
COMMENT ON COLUMN maintenance_tasks.received_date IS '작업 접수일';
COMMENT ON COLUMN maintenance_tasks.due_date IS '고객이 요청한 납기일';
COMMENT ON COLUMN maintenance_tasks.personal_due_date IS '개인적으로 목표로 하는 완료일';
COMMENT ON COLUMN maintenance_tasks.scheduled_date IS '실제 작업을 예약한 날짜';
COMMENT ON COLUMN maintenance_tasks.completed_date IS '작업이 실제로 완료된 날짜';

-- ============================================================================
-- 2. Add client_id column to maintenance_tasks table
-- ============================================================================
-- Migration: Add client_id to maintenance_tasks table
-- Created: 2025-01-01

-- Add client_id column to maintenance_tasks table
ALTER TABLE maintenance_tasks
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_client_id ON maintenance_tasks(client_id) WHERE client_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN maintenance_tasks.client_id IS '작업을 의뢰한 클라이언트 ID (선택사항)';

-- ============================================================================
-- 마이그레이션 완료!
-- ============================================================================
