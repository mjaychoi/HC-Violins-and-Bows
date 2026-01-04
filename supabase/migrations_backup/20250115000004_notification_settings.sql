-- Migration: Add notification_settings table for email notification preferences
-- Created: 2025-01-15

-- Create notification_settings table
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT true,
  notification_time TIME DEFAULT '09:00',
  days_before_due INTEGER[] DEFAULT ARRAY[3, 1], -- D-3, D-1
  enabled BOOLEAN DEFAULT true,
  last_notification_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_notification_settings_enabled ON notification_settings(enabled) WHERE enabled = true;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only view/update their own notification settings
CREATE POLICY "Users can view their own notification settings" ON notification_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification settings" ON notification_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification settings" ON notification_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE notification_settings IS '사용자별 이메일 알림 설정';
COMMENT ON COLUMN notification_settings.email_notifications IS '이메일 알림 활성화 여부';
COMMENT ON COLUMN notification_settings.notification_time IS '알림 발송 시간 (HH:MM)';
COMMENT ON COLUMN notification_settings.days_before_due IS '마감일 전 알림 발송일 배열 (예: [3, 1] = D-3, D-1)';
COMMENT ON COLUMN notification_settings.enabled IS '알림 설정 전체 활성화 여부';
COMMENT ON COLUMN notification_settings.last_notification_sent_at IS '마지막 알림 발송 시간';
