-- Allow Anon Access for Products and Orders (Client Portal Support)
-- The Client Portal uses PIN-based authentication (Client-side), so DB requests are 'anon'.
-- We need to allow 'anon' users to access products and orders.

BEGIN;

-- ========================================================
-- PRODUCTS TABLE
-- ========================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Drop existing restricted policies
DROP POLICY IF EXISTS "Enable read for authenticated only" ON public.products;
DROP POLICY IF EXISTS "Enable insert for authenticated only" ON public.products;
DROP POLICY IF EXISTS "Enable update for authenticated only" ON public.products;
DROP POLICY IF EXISTS "Enable delete for authenticated only" ON public.products;
DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.products;

-- Create Permissive Policies for Anon + Authenticated
CREATE POLICY "Enable insert for everyone" ON public.products FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable select for everyone" ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable update for everyone" ON public.products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for everyone" ON public.products FOR DELETE TO anon, authenticated USING (true);

-- Grant Permissions
GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


-- ========================================================
-- ORDERS TABLE
-- ========================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop existing restricted policies
DROP POLICY IF EXISTS "Enable read for authenticated only" ON public.orders;
DROP POLICY IF EXISTS "Enable insert for authenticated only" ON public.orders;
DROP POLICY IF EXISTS "Enable update for authenticated only" ON public.orders;
DROP POLICY IF EXISTS "Enable delete for authenticated only" ON public.orders;
DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.orders;

-- Create Permissive Policies for Anon + Authenticated
CREATE POLICY "Enable insert for everyone" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable select for everyone" ON public.orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable update for everyone" ON public.orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for everyone" ON public.orders FOR DELETE TO anon, authenticated USING (true);

-- Grant Permissions
GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


-- ========================================================
-- EXPLICITLY GRANT SEQUENCE USAGE (Just in case)
-- ========================================================
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;
