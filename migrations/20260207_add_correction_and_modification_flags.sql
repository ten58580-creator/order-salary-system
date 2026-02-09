-- Add correction flag to orders (Production Instructions)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS is_correction BOOLEAN DEFAULT FALSE;

-- Add admin modification flag to timecard_logs
ALTER TABLE timecard_logs 
ADD COLUMN IF NOT EXISTS is_modified_by_admin BOOLEAN DEFAULT FALSE;

-- Comment on columns
COMMENT ON COLUMN orders.is_correction IS 'True if this order is a correction entry';
COMMENT ON COLUMN timecard_logs.is_modified_by_admin IS 'True if this log was modified by an admin';
