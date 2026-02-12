-- Security Hardening Migration
-- Combined into a single DO block to avoid parser issues with multiple statement checks
-- 1. Enable RLS on all public tables
-- 2. Create permissive policies for authenticated users
-- 3. Set search_path = public for all functions

DO $$ 
DECLARE 
    t text; 
BEGIN 
    -- ==============================================================================
    -- 1. Enable RLS & 2. Create Policies
    -- ==============================================================================
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    LOOP 
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        -- Drop existing policy if exists to avoid error
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.%I', t);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
        
        -- Create new policy for Authenticated Users
        EXECUTE format('CREATE POLICY "Allow full access to authenticated users" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END LOOP; 

    -- ==============================================================================
    -- 3. Secure Functions (Set search_path = public)
    -- ==============================================================================

    -- Admin PIN Functions
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'change_admin_pin') THEN
        ALTER FUNCTION public.change_admin_pin(text, text) SET search_path = public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'verify_admin_pin') THEN
         ALTER FUNCTION public.verify_admin_pin(text) SET search_path = public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_admin_pin') THEN
         ALTER FUNCTION public.update_admin_pin(text) SET search_path = public;
    END IF;

    -- Production Functions
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_daily_production_v2') THEN
        ALTER FUNCTION public.get_daily_production_v2(date) SET search_path = public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_daily_production_summary') THEN
        ALTER FUNCTION public.get_daily_production_summary(date) SET search_path = public;
    END IF;

    -- Update Functions (Update Production Status - Handling Overloads)
    -- update_production_status(uuid, date, text) -> 3 arguments
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_production_status' AND pronargs = 3) THEN
        ALTER FUNCTION public.update_production_status(uuid, date, text) SET search_path = public;
    END IF;
    
    -- update_production_status(uuid, date, text, integer, integer) -> 5 arguments
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_production_status' AND pronargs = 5) THEN
         ALTER FUNCTION public.update_production_status(uuid, date, text, integer, integer) SET search_path = public;
    END IF;

    -- Attendance Functions
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'manage_daily_attendance_logs') THEN
        ALTER FUNCTION public.manage_daily_attendance_logs(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz, boolean) SET search_path = public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_timecard_log') THEN
        ALTER FUNCTION public.update_timecard_log(uuid, timestamptz) SET search_path = public;
    END IF;

    -- Product & Price Functions
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_products_with_prices') THEN
        ALTER FUNCTION public.get_products_with_prices(uuid, date) SET search_path = public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_order_unit_price') THEN
        ALTER FUNCTION public.set_order_unit_price() SET search_path = public;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_worker_count') THEN
        ALTER FUNCTION public.update_worker_count(uuid, date, integer) SET search_path = public;
    END IF;

END $$;
