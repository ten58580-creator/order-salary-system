-- ==========================================
-- Admin PIN System Repair Script
-- Run this in the Supabase SQL Editor
-- ==========================================

-- 1. Enable pgcrypto (Required for hashing)
create extension if not exists "pgcrypto";

-- 2. Ensure system_settings table exists
create table if not exists system_settings (
    key text primary key,
    value text not null,
    description text,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_by uuid references auth.users(id)
);

-- 3. Reset/Set Default PIN (1234)
-- This ensures the key exists.
insert into system_settings (key, value, description)
values (
    'admin_pin_hash',
    crypt('1234', gen_salt('bf')),
    '管理者用PINコード（bcryptハッシュ）'
)
on conflict (key) do update
set value = crypt('1234', gen_salt('bf'))
where system_settings.value IS NULL; -- Only reset if null/corrupted, mostly a safety check. 
-- Actually, let's force reset if the user is stuck? 
-- No, let's just make sure it exists. The ON CONFLICT DO NOTHING is usually safer, 
-- but if they are broken, maybe we SHOULD reset?
-- Let's stick to "Ensure it exists". The user said "Init 1234 didn't work", likely due to 404, not wrong PIN.

-- 4. Create/Replace Verification Function (Fixes 404)
create or replace function verify_admin_pin(pin_code text)
returns boolean
language plpgsql
security definer
as $$
declare
    stored_hash text;
begin
    select value into stored_hash
    from system_settings
    where key = 'admin_pin_hash';

    if stored_hash is null then
        return false;
    end if;

    return (stored_hash = crypt(pin_code, stored_hash));
end;
$$;

-- 5. Create/Replace Update Function
create or replace function update_admin_pin(new_pin text)
returns boolean
language plpgsql
security definer
as $$
begin
    if auth.role() = 'anon' then
        raise exception 'Not authenticated';
    end if;

    if not (new_pin ~ '^\d{4,8}$') then
        raise exception 'PIN must be 4-8 digits';
    end if;

    update system_settings
    set 
        value = crypt(new_pin, gen_salt('bf')),
        updated_at = now(),
        updated_by = auth.uid()
    where key = 'admin_pin_hash';

    if not found then
        insert into system_settings (key, value, description, updated_by)
        values ('admin_pin_hash', crypt(new_pin, gen_salt('bf')), '管理者用PINコード（bcryptハッシュ）', auth.uid());
    end if;

    return true;
end;
$$;

-- 6. Create/Replace Change Function (For Anonymous Users with Current PIN)
create or replace function change_admin_pin(current_pin text, new_pin text)
returns boolean
language plpgsql
security definer
as $$
declare
    stored_hash text;
    is_authenticated boolean;
begin
    is_authenticated := (auth.role() = 'authenticated');
    
    select value into stored_hash
    from system_settings
    where key = 'admin_pin_hash';

    if stored_hash is null then
        raise exception 'PIN setup not found';
    end if;

    if not is_authenticated then
        if current_pin is null or stored_hash != crypt(current_pin, stored_hash) then
             raise exception 'Invalid current PIN';
        end if;
    else
        if current_pin != 'OVERRIDE' then
             if current_pin is not null and stored_hash != crypt(current_pin, stored_hash) then
                 raise exception 'Invalid current PIN';
             end if;
        end if;
    end if;

    if not (new_pin ~ '^\d{4,8}$') then
        raise exception 'PIN must be 4-8 digits';
    end if;

    update system_settings
    set 
        value = crypt(new_pin, gen_salt('bf')),
        updated_at = now(),
        updated_by = auth.uid()
    where key = 'admin_pin_hash';

    return true;
end;
$$;
