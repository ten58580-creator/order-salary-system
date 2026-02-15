-- Enable RLS just in case it's not enabled
ALTER TABLE timecard_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow all users to select logs" ON timecard_logs;
DROP POLICY IF EXISTS "Allow public read access on timecard_logs" ON timecard_logs;

-- Create policy to allow everyone (anon + authenticated) to read logs
CREATE POLICY "Allow all users to select logs"
ON timecard_logs
FOR SELECT
TO public
USING (true);

-- Grant privileges just to be sure
GRANT SELECT ON timecard_logs TO anon;
GRANT SELECT ON timecard_logs TO authenticated;
GRANT SELECT ON timecard_logs TO service_role;
