-- RPC to change admin PIN (Publicly accessible but requires valid current_pin)
-- This allows updating the PIN even if not logged in via Supabase Auth (Field Mode)

create or replace function change_admin_pin(current_pin text, new_pin text)
returns boolean
language plpgsql
security definer
as $$
declare
    stored_hash text;
    is_authenticated boolean;
begin
    -- 1. Check if caller is authenticated via Supabase Auth (e.g. Admin Login)
    is_authenticated := (auth.role() = 'authenticated');
    
    -- 2. Fetch stored PIN hash
    select value into stored_hash
    from system_settings
    where key = 'admin_pin_hash';

    if stored_hash is null then
        raise exception 'PIN setup not found';
    end if;

    -- 3. Verification Logic
    -- If NOT authenticated, MUST provide valid current_pin
    if not is_authenticated then
        if current_pin is null or stored_hash != crypt(current_pin, stored_hash) then
             raise exception 'Invalid current PIN';
        end if;
    else
        -- If authenticated, allow override (Master Reset)
        -- We can optionally check current_pin if provided, but let's allow "OVERRIDE" value or empty?
        -- For safety, let's say if current_pin is 'OVERRIDE', we skip check.
        -- Otherwise we check it (incase admin wants to be sure).
        if current_pin != 'OVERRIDE' then
             if current_pin is not null and stored_hash != crypt(current_pin, stored_hash) then
                 raise exception 'Invalid current PIN';
             end if;
        end if;
    end if;

    -- 4. Validate New PIN
    if not (new_pin ~ '^\d{4,8}$') then
        raise exception 'PIN must be 4-8 digits';
    end if;

    -- 5. Update
    update system_settings
    set 
        value = crypt(new_pin, gen_salt('bf')),
        updated_at = now(),
        updated_by = auth.uid() -- Might be null if anon
    where key = 'admin_pin_hash';

    return true;
end;
$$;
