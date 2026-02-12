-- Force Fix Admin PIN - Drop and Recreate
-- This script explicitly drops all potential variants of the function to remove ambiguity
-- and grants explicit permissions to anonymous and authenticated users.

-- 1. Drop existing functions (All variants)
DROP FUNCTION IF EXISTS public.verify_admin_pin(text);
DROP FUNCTION IF EXISTS public.verify_admin_pin(); -- Just in case
DROP FUNCTION IF EXISTS public.change_admin_pin(text, text);
DROP FUNCTION IF EXISTS public.update_admin_pin(text);

-- 2. Ensure system_settings table exists and has RLS
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 3. Insert Default PIN (1234) if missing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
INSERT INTO public.system_settings (key, value, description)
VALUES (
    'admin_pin_hash',
    crypt('1234', gen_salt('bf')),
    '管理者用PINコード（bcryptハッシュ）'
)
ON CONFLICT (key) DO NOTHING;

-- 4. Recreate verify_admin_pin Function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.verify_admin_pin(pin_code text)
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

-- 5. Recreate change_admin_pin Function
CREATE OR REPLACE FUNCTION public.change_admin_pin(current_pin text, new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    stored_hash text;
    is_authenticated boolean;
BEGIN
    is_authenticated := (auth.role() = 'authenticated');
    
    SELECT value INTO stored_hash
    FROM public.system_settings
    WHERE key = 'admin_pin_hash';

    IF stored_hash IS NULL THEN
        RAISE EXCEPTION 'PIN setup not found';
    END IF;

    IF NOT (new_pin ~ '^\d{4,8}$') THEN
        RAISE EXCEPTION 'PIN must be 4-8 digits';
    END IF;

    -- Logic: Allow if authenticated OR if current PIN matches
    IF NOT is_authenticated THEN
        IF current_pin IS NULL OR stored_hash != crypt(current_pin, stored_hash) THEN
             RAISE EXCEPTION 'Invalid current PIN';
        END IF;
    ELSE
         -- Authenticated user check (optional strictness)
         IF current_pin != 'OVERRIDE' AND current_pin IS NOT NULL AND stored_hash != crypt(current_pin, stored_hash) THEN
             RAISE EXCEPTION 'Invalid current PIN';
         END IF;
    END IF;

    UPDATE public.system_settings
    SET 
        value = crypt(new_pin, gen_salt('bf')),
        updated_at = now(),
        updated_by = auth.uid()
    WHERE key = 'admin_pin_hash';

    RETURN TRUE;
END;
$$;

-- 6. GRANT EXECUTE PERMISSIONS (Crucial for 404/Permission Denied)
GRANT EXECUTE ON FUNCTION public.verify_admin_pin(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_admin_pin(text, text) TO anon, authenticated, service_role;

-- 7. NOTIFY pgrst to reload schema cache
NOTIFY pgrst, 'reload config';
