-- Force Fix RLS for timecard_logs
-- 認証済みユーザーであれば誰でも見れるように全開放します（緊急対応）

BEGIN;

-- 1. Ensure RLS is enabled
ALTER TABLE public.timecard_logs ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all" ON public.timecard_logs;
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.timecard_logs;
DROP POLICY IF EXISTS "Enable update for auth" ON public.timecard_logs;
DROP POLICY IF EXISTS "Enable delete for auth" ON public.timecard_logs;
DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.timecard_logs;

-- 3. Create a permissive policy for authenticated users
CREATE POLICY "Allow full access to authenticated users" ON public.timecard_logs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Grant permissions
GRANT ALL ON TABLE public.timecard_logs TO authenticated;
GRANT ALL ON TABLE public.timecard_logs TO service_role;
GRANT ALL ON TABLE public.timecard_logs TO anon;

COMMIT;
