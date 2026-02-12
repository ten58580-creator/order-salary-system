-- Enable RLS (just in case)
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Allow public read access on staff" ON staff;

-- Create policy to allow everyone (anon + authenticated) to read staff data
CREATE POLICY "Allow public read access on staff"
ON staff FOR SELECT
TO public
USING (true);

-- Verify: Grant usage on sequence if needed (usually not for SELECT but good practice for ensuring access)
GRANT SELECT ON staff TO anon;
GRANT SELECT ON staff TO authenticated;
GRANT SELECT ON staff TO service_role;
