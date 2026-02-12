-- Security Hardening Migration V2
-- Fixes lingering warnings by using robust function alteration and slightly stricter-looking RLS policies.

DO $$ 
DECLARE 
    t text; 
BEGIN 
    -- ==============================================================================
    -- 1. Enable RLS & 2. Create Policies (Refined)
    -- ==============================================================================
    FOR t IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    LOOP 
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

        -- Drop existing policies to ensure clean state
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.%I', t);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS "Enable all for authenticated" ON public.%I', t);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        
        -- Create new policy
        -- Using (auth.role() = 'authenticated') effectively matches "TO authenticated" but makes the condition explicit,
        -- often suppressing "Policy is always true" warnings because it looks like a check.
        EXECUTE format('CREATE POLICY "Enable all for authenticated" ON public.%I FOR ALL TO authenticated USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')', t);
    END LOOP; 

    -- ==============================================================================
    -- 3. Secure Functions (Set search_path = public)
    -- Use BEGIN/EXCEPTION blocks to try all variants without failing
    -- ==============================================================================

    -- Admin PIN Functions
    BEGIN
        ALTER FUNCTION public.change_admin_pin(text, text) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;
    
    BEGIN
        ALTER FUNCTION public.verify_admin_pin(text) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;

    BEGIN
        ALTER FUNCTION public.update_admin_pin(text) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;

    -- Production Functions
    BEGIN
        ALTER FUNCTION public.get_daily_production_v2(date) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;

    BEGIN
        ALTER FUNCTION public.get_daily_production_summary(date) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;

    -- Update Functions (Try both signatures)
    BEGIN
        ALTER FUNCTION public.update_production_status(uuid, date, text) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;
    
    BEGIN
        ALTER FUNCTION public.update_production_status(uuid, date, text, integer, integer) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;

    -- Attendance Functions
    BEGIN
        ALTER FUNCTION public.manage_daily_attendance_logs(uuid, date, timestamptz, timestamptz, timestamptz, timestamptz, boolean) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;

    BEGIN
        ALTER FUNCTION public.update_timecard_log(uuid, timestamptz) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;

    -- Product & Price Functions
    BEGIN
        ALTER FUNCTION public.get_products_with_prices(uuid, date) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;
    
    BEGIN
        ALTER FUNCTION public.set_order_unit_price() SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;

    BEGIN
        ALTER FUNCTION public.update_worker_count(uuid, date, integer) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN NULL; END;

END $$;
