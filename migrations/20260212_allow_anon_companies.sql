-- Allow Anon Access for Companies (PIN Auth Support)
-- Since the application uses a PIN-based authentication (Client-side Guard), 
-- the database requests come from the 'anon' role.
-- We must allow 'anon' to INSERT/UPDATE/DELETE/SELECT on the companies table.

BEGIN;

-- 1. Ensure RLS is enabled
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Drop explicit authenticated-only policies to avoid confusion
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.companies;
DROP POLICY IF EXISTS "Enable select for authenticated users only" ON public.companies;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.companies;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.companies;

-- Also drop any other legacy policies
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.companies;
DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.companies;
DROP POLICY IF EXISTS "Allow everything for authenticated" ON public.companies;


-- 3. Create Permissive Policies for 'anon' (and 'authenticated')
-- We use separate policies for clarity, but they all allow access.

-- INSERT
CREATE POLICY "Enable insert for everyone" ON public.companies
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- SELECT
CREATE POLICY "Enable select for everyone" ON public.companies
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- UPDATE
CREATE POLICY "Enable update for everyone" ON public.companies
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- DELETE
CREATE POLICY "Enable delete for everyone" ON public.companies
    FOR DELETE
    TO anon, authenticated
    USING (true);

-- 4. Grant Permissions to anon
GRANT ALL ON TABLE public.companies TO anon;
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;
