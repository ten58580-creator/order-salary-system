-- Fix RLS for companies table
-- This script explicitly recreates the RLS policy for the companies table to resolve insert errors.

BEGIN;

-- 1. Ensure RLS is enabled
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Drop potential existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.companies;
DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.companies;

-- 3. Create a permissive policy for authenticated users
-- This allows SELECT, INSERT, UPDATE, DELETE for any logged-in user.
CREATE POLICY "Enable all for authenticated" ON public.companies
    FOR ALL
    TO authenticated
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- 4. Ensure permissions are granted
GRANT ALL ON TABLE public.companies TO anon; -- Sometimes needed for initial handshake depending on setup, but mostly for authenticated
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;

-- 5. Grant usage on sequence if id is serial (it likely is uuid, but good practice if serial)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;
