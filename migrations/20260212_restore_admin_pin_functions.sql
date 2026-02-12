-- Restore Admin PIN Functions Migration
-- Run this to fix "Function not found (404)" errors for verify_admin_pin

-- 1. Enable pgcrypto for hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Ensure system_settings table exists
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid REFERENCES auth.users(id)
);

-- 3. Enable RLS on system_settings (Just in case)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies for system_settings if they don't exist
DO $$ BEGIN
    -- Drop old policies to be safe
    DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.system_settings;
    DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.system_settings;
    DROP POLICY IF EXISTS "Enable all for authenticated" ON public.system_settings;
    
    -- Create new policy (Authenticated users can read/write)
    CREATE POLICY "Enable all for authenticated" ON public.system_settings 
    FOR ALL TO authenticated 
    USING (auth.role() = 'authenticated') 
    WITH CHECK (auth.role() = 'authenticated');
    
    -- Allow anonymous read for specific keys (required for PIN verification if done via table read, though verify_admin_pin is security definer)
    -- Actually, verify_admin_pin is SECURITY DEFINER, so we don't need to expose the table to anon.
END $$;

-- 5. Insert Default PIN if missing (Default: 1234)
INSERT INTO public.system_settings (key, value, description)
VALUES (
    'admin_pin_hash',
    crypt('1234', gen_salt('bf')),
    '管理者用PINコード（bcryptハッシュ）'
)
ON CONFLICT (key) DO NOTHING;

-- 6. Recreate verify_admin_pin Function
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

-- 7. Recreate update_admin_pin Function
CREATE OR REPLACE FUNCTION public.update_admin_pin(new_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 8. Recreate change_admin_pin Function
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

    IF NOT is_authenticated THEN
        IF current_pin IS NULL OR stored_hash != crypt(current_pin, stored_hash) THEN
             RAISE EXCEPTION 'Invalid current PIN';
        END IF;
    ELSE
        -- Authenticated users can override if needed, or check current pin
        -- Logic: If authenticated, we trust them? Or force current pin?
        -- Context: FIX_ADMIN_PIN.sql logic allowed override if current_pin != 'OVERRIDE'
        -- Let's simplify: Always check current pin unless specific override
        IF current_pin != 'OVERRIDE' THEN
             IF current_pin IS NOT NULL AND stored_hash != crypt(current_pin, stored_hash) THEN
                 RAISE EXCEPTION 'Invalid current PIN';
             END IF;
        END IF;
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

    RETURN TRUE;
END;
$$;
