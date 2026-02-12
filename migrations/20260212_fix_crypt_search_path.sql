-- Fix Admin PIN - Add 'extensions' to search_path
-- The error "function crypt(text, text) does not exist" occurs because pgcrypto functions
-- are likely in the 'extensions' schema, but we restricted search_path to 'public'.

-- 1. Enable pgcrypto (Ensure it exists)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Update verify_admin_pin_v2 with correct search_path
CREATE OR REPLACE FUNCTION public.verify_admin_pin_v2(pin_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

    -- Now 'crypt' should be found in 'extensions' schema (or public if installed there)
    RETURN (stored_hash = crypt(pin_code, stored_hash));
END;
$$;

-- 3. Update change_admin_pin with correct search_path
CREATE OR REPLACE FUNCTION public.change_admin_pin(current_pin text, new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

    IF NOT is_authenticated THEN
        IF current_pin IS NULL OR stored_hash != crypt(current_pin, stored_hash) THEN
             RAISE EXCEPTION 'Invalid current PIN';
        END IF;
    ELSE
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

-- 4. Update update_admin_pin (legacy but good to fix)
CREATE OR REPLACE FUNCTION public.update_admin_pin(new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF auth.role() = 'anon' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT (new_pin ~ '^\d{4,8}$') THEN
        RAISE EXCEPTION 'PIN must be 4-8 digits';
    END IF;

    UPDATE public.system_settings
    SET 
        value = crypt(new_pin, gen_salt('bf')),
        updated_at = now(),
        updated_by = auth.uid()
    WHERE key = 'admin_pin_hash';

    IF NOT FOUND THEN
        INSERT INTO public.system_settings (key, value, description, updated_by)
        VALUES ('admin_pin_hash', crypt(new_pin, gen_salt('bf')), '管理者用PINコード（bcryptハッシュ）', auth.uid());
    END IF;

    RETURN TRUE;
END;
$$;

-- 5. Force Schema Cache Reload
NOTIFY pgrst, 'reload config';
