-- Emergency Fix for Companies RLS
-- Explicitly creating separate policies for each operation as requested.

BEGIN;

-- 1. Ensure RLS is enabled
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing policies to ensure no conflicts
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.companies;
DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.companies;
DROP POLICY IF EXISTS "Allow everything for authenticated" ON public.companies;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.companies;
DROP POLICY IF EXISTS "Enable select for authenticated users only" ON public.companies;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.companies;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.companies;

-- 3. Create Explicit Policies for Authenticated Users

-- INSERT
CREATE POLICY "Enable insert for authenticated users only" ON public.companies
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- SELECT
CREATE POLICY "Enable select for authenticated users only" ON public.companies
    FOR SELECT
    TO authenticated
    USING (true);

-- UPDATE
CREATE POLICY "Enable update for authenticated users only" ON public.companies
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- DELETE
CREATE POLICY "Enable delete for authenticated users only" ON public.companies
    FOR DELETE
    TO authenticated
    USING (true);

-- 4. Grant Permissions (Explicitly again)
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;
GRANT ALL ON TABLE public.companies TO anon; 

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

COMMIT;
