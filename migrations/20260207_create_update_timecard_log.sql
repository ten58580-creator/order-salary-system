-- timecard_logs の timestamp を更新し、管理者修正フラグを立てる関数

CREATE OR REPLACE FUNCTION update_timecard_log(
    p_log_id uuid,
    p_new_timestamp timestamptz
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.timecard_logs
    SET 
        timestamp = p_new_timestamp,
        is_modified_by_admin = true,
        updated_at = now() -- IF updated_at exists, generic triggers might handle it, but explicit here if needed. Table might not have updated_at, let's check.
    WHERE id = p_log_id;
END;
$$;

-- Note: user might not have added updated_at column to timecard_logs. 
-- Checking schema: id, staff_id, company_id, event_type, timestamp, created_at, is_modified_by_admin (from prev migration).
-- I should strictly only update timestamp and is_modified_by_admin.

CREATE OR REPLACE FUNCTION update_timecard_log(
    p_log_id uuid,
    p_new_timestamp timestamptz
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.timecard_logs
    SET 
        timestamp = p_new_timestamp,
        is_modified_by_admin = true
    WHERE id = p_log_id;
END;
$$;
