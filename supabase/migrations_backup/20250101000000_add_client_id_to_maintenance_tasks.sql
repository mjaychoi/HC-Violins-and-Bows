-- Migration: Add client_id to maintenance_tasks table
-- Created: 2025-01-01

-- Add client_id column to maintenance_tasks table
ALTER TABLE maintenance_tasks
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_client_id ON maintenance_tasks(client_id) WHERE client_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN maintenance_tasks.client_id IS '작업을 의뢰한 클라이언트 ID (선택사항)';

