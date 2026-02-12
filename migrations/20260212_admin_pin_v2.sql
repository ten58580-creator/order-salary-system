-- Admin PIN Fix V2 - Renaming Function to bypass cache/ambiguity
-- We will use 'verify_admin_pin_v2' to ensure a fresh endpoint is created.

-- 1. Create verify_admin_pin_v2 Function
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

-- 2. Grant Permissions
GRANT EXECUTE ON FUNCTION public.verify_admin_pin_v2(text) TO anon, authenticated, service_role;

-- 3. Ensure system_settings table exists and has default PIN (Idempotent)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.system_settings (key, value, description)
VALUES (
    'admin_pin_hash',
    crypt('1234', gen_salt('bf')),
    '管理者用PINコード（bcryptハッシュ）'
)
ON CONFLICT (key) DO NOTHING;

-- 4. Reload Schema Cache
NOTIFY pgrst, 'reload config';
