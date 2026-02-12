-- FINAL FIX Admin PIN - Explicit Permissions
-- Fixes 404 error caused by missing USAGE permission on public schema

-- 1. Grant USAGE on Schema public (Essential for anon/authenticated to access functions)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. Drop existing functions to ensure clean slate
DROP FUNCTION IF EXISTS public.verify_admin_pin_v2(text);

-- 3. Recreate verification function (verify_admin_pin_v2)
CREATE OR REPLACE FUNCTION public.verify_admin_pin_v2(pin_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    stored_hash text;
BEGIN
    SELECT value INTO stored_hash
    FROM public.system_settings
    WHERE key = 'admin_pin_hash';

    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN (stored_hash = crypt(pin_code, stored_hash));
END;
$$;

-- 4. Grant Execute Permission explicitly
GRANT EXECUTE ON FUNCTION public.verify_admin_pin_v2(text) TO anon, authenticated, service_role;

-- 5. Ensure system_settings table exists and has RLS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 6. Grant Select on system_settings to authenticated (Just in case RLS is needed even with Security Definer)
GRANT SELECT ON public.system_settings TO authenticated;
GRANT SELECT ON public.system_settings TO anon; -- Only needed if Security Definer fails, but safe with RLS policies

-- 7. Insert Default PIN (1234) if missing
INSERT INTO public.system_settings (key, value, description)
VALUES (
    'admin_pin_hash',
    crypt('1234', gen_salt('bf')),
    '管理者用PINコード（bcryptハッシュ）'
)
ON CONFLICT (key) DO NOTHING;

-- 8. Force Schema Cache Reload
NOTIFY pgrst, 'reload config';
