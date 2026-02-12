-- Enable pgcrypto for hashing
create extension if not exists "pgcrypto";

-- Create system_settings table
create table if not exists system_settings (
    key text primary key,
    value text not null,
    description text,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_by uuid references auth.users(id)
);

-- Insert default admin PIN (1234)
-- We store the hash of the PIN
insert into system_settings (key, value, description)
values (
    'admin_pin_hash',
    crypt('1234', gen_salt('bf')),
    '管理者用PINコード（bcryptハッシュ）'
)
on conflict (key) do nothing;

-- RPC to verify admin PIN
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

-- RPC to update admin PIN (Protected, requires admin role check in application or policy)
-- Actually, we can check if the user is authenticated as an extra layer
create or replace function update_admin_pin(new_pin text)
returns boolean
language plpgsql
security definer
as $$
begin
    -- Minimal security check: Ensure caller is authenticated
    if auth.role() = 'anon' then
        raise exception 'Not authenticated';
    end if;

    -- Validate PIN requirements (e.g. 4-8 digits)
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
        -- Insert if somehow missing (should not happen due to migration)
        insert into system_settings (key, value, description, updated_by)
        values ('admin_pin_hash', crypt(new_pin, gen_salt('bf')), '管理者用PINコード（bcryptハッシュ）', auth.uid());
    end if;

    return true;
end;
$$;
