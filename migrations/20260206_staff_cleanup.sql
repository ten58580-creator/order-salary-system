-- Add is_archived column to staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Delete legacy staff 'A社担当者'
-- '9999' is not a valid UUID, so we delete by name to be safe.
DELETE FROM staff WHERE name = 'A社担当者';
