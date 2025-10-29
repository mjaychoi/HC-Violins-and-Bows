-- Migration: Add subtype column to instruments table

-- Add subtype column to existing instruments table
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS subtype TEXT;

