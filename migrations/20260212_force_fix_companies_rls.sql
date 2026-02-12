-- Force Fix RLS for companies table
-- This script takes a more aggressive approach to ensure RLS doesn't block INSERTs for authenticated users.

BEGIN;

-- 1. Ensure RLS is enabled
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Drop potential existing policies to avoid conflicts
-- We drop everything to be safe
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.companies;
DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.companies;
DROP POLICY IF EXISTS "Enable read for authenticated" ON public.companies;
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.companies;
DROP POLICY IF EXISTS "Enable update for authenticated" ON public.companies;
DROP POLICY IF EXISTS "Enable delete for authenticated" ON public.companies;

-- 3. Create a single, simple, permissive policy for authenticated users
-- USING (true) means they can see all rows.
-- WITH CHECK (true) means they can insert/update any row.
-- RESTRICTION: TO authenticated (must be logged in)
CREATE POLICY "Allow everything for authenticated" ON public.companies
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Grant explicit permissions
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;
GRANT ALL ON TABLE public.companies TO anon; -- Granting to anon just in case, though policy restricts to authenticated

-- 5. Sequence permissions (if id is SERIAL, though likely UUID)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

COMMIT;
