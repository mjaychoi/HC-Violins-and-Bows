-- Migration: Add maintenance_tasks table for calendar and task management
-- Notes:
--  - Idempotent: safe to run multiple times
--  - Includes updated_at trigger and basic RLS for authenticated users
--  - Uses DO blocks to avoid duplicate trigger/policy creation errors

-- 1) Table
CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE CASCADE,

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

  received_date DATE NOT NULL,            -- 접수일
  due_date DATE,                          -- 납기일 (고객 요청)
  personal_due_date DATE,                 -- 개인 목표 완료일
  scheduled_date DATE,                    -- 예약된 작업일
  completed_date DATE,                    -- 실제 완료일

  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  estimated_hours NUMERIC(6,2),           -- 예상 소요 시간
  actual_hours NUMERIC(6,2),              -- 실제 소요 시간
  cost NUMERIC(12,2),                     -- 비용

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_instrument_id
  ON public.maintenance_tasks (instrument_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_status
  ON public.maintenance_tasks (status);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_due_date
  ON public.maintenance_tasks (due_date);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_scheduled_date
  ON public.maintenance_tasks (scheduled_date);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_personal_due_date
  ON public.maintenance_tasks (personal_due_date);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_received_date
  ON public.maintenance_tasks (received_date);

-- 3) updated_at trigger function (schema-qualified, safe replace)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 4) Trigger (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'update_maintenance_tasks_updated_at'
      AND n.nspname = 'public'
      AND c.relname = 'maintenance_tasks'
  ) THEN
    CREATE TRIGGER update_maintenance_tasks_updated_at
      BEFORE UPDATE ON public.maintenance_tasks
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 5) RLS
ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;

-- 6) Policy (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'maintenance_tasks'
      AND policyname = 'Allow all operations for authenticated users'
  ) THEN
    CREATE POLICY "Allow all operations for authenticated users"
      ON public.maintenance_tasks
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 7) Comments
COMMENT ON TABLE public.maintenance_tasks IS '악기 및 활의 수리, 정비, 관리 작업을 추적하는 테이블';
COMMENT ON COLUMN public.maintenance_tasks.received_date IS '작업 접수일';
COMMENT ON COLUMN public.maintenance_tasks.due_date IS '고객이 요청한 납기일';
COMMENT ON COLUMN public.maintenance_tasks.personal_due_date IS '개인적으로 목표로 하는 완료일';
COMMENT ON COLUMN public.maintenance_tasks.scheduled_date IS '실제 작업을 예약한 날짜';
COMMENT ON COLUMN public.maintenance_tasks.completed_date IS '작업이 실제로 완료된 날짜';
