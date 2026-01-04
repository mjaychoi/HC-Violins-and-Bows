-- Migration: Add follow_up_completed_at field to contact_logs table
-- Created: 2025-01-15

-- Add follow_up_completed_at column
ALTER TABLE contact_logs
ADD COLUMN IF NOT EXISTS follow_up_completed_at TIMESTAMP WITH TIME ZONE;

-- Create index for filtering incomplete follow-ups
CREATE INDEX IF NOT EXISTS idx_contact_logs_follow_up_completed_at 
ON contact_logs(follow_up_completed_at) 
WHERE follow_up_completed_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN contact_logs.follow_up_completed_at IS 'Follow-up 완료 처리 시각 (null이면 미완료)';
