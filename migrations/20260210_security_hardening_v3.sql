-- Security Hardening Migration V3 (The "Hammer" Approach)
-- Automatically finds ALL functions and procedures in the public schema
-- and enforces search_path = public. This prevents "Function Search Path Mutable" warnings
-- regardless of the specific function signature or overload.

DO $$ 
DECLARE 
    r record;
BEGIN 
    -- Loop through all functions ('f') and procedures ('p') in the public schema
    FOR r IN 
        SELECT p.oid::regprocedure::text as func_signature, p.prokind
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.prokind IN ('f', 'p')
    LOOP 
        BEGIN
            IF r.prokind = 'p' THEN
                EXECUTE format('ALTER PROCEDURE %s SET search_path = public', r.func_signature);
            ELSE
                EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.func_signature);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Ignore errors (e.g., if we try to alter a system function or something weird)
            RAISE NOTICE 'Skipping %: %', r.func_signature, SQLERRM;
        END;
    END LOOP; 
END $$;
