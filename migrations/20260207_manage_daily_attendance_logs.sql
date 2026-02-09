-- Function to manage daily attendance logs (Rewrite logs for a specific day)
-- Deletes existing logs for the staff on that day and inserts new ones.

CREATE OR REPLACE FUNCTION manage_daily_attendance_logs(
    p_staff_id uuid,
    p_target_date date,
    p_clock_in_time timestamptz,
    p_clock_out_time timestamptz,
    p_break_start_time timestamptz,
    p_break_end_time timestamptz,
    p_is_deleted boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_range timestamptz;
    v_end_range timestamptz;
BEGIN
    v_start_range := (p_target_date || ' 00:00:00')::timestamptz;
    v_end_range := (p_target_date || ' 23:59:59')::timestamptz;

    -- 1. DELETE existing logs for this staff on this day
    DELETE FROM public.timecard_logs
    WHERE staff_id = p_staff_id
    AND timestamp >= v_start_range
    AND timestamp <= v_end_range;

    -- If deletion is requested, stop here
    IF p_is_deleted THEN
        RETURN;
    END IF;

    -- 2. INSERT New Logs
    
    -- Clock In
    IF p_clock_in_time IS NOT NULL THEN
        INSERT INTO public.timecard_logs (staff_id, event_type, timestamp, is_modified_by_admin)
        VALUES (p_staff_id, 'clock_in', p_clock_in_time, true);
    END IF;

    -- Clock Out
    IF p_clock_out_time IS NOT NULL THEN
        INSERT INTO public.timecard_logs (staff_id, event_type, timestamp, is_modified_by_admin)
        VALUES (p_staff_id, 'clock_out', p_clock_out_time, true);
    END IF;

    -- Break Start
    IF p_break_start_time IS NOT NULL THEN
        INSERT INTO public.timecard_logs (staff_id, event_type, timestamp, is_modified_by_admin)
        VALUES (p_staff_id, 'break_start', p_break_start_time, true);
    END IF;

    -- Break End
    IF p_break_end_time IS NOT NULL THEN
        INSERT INTO public.timecard_logs (staff_id, event_type, timestamp, is_modified_by_admin)
        VALUES (p_staff_id, 'break_end', p_break_end_time, true);
    END IF;

END;
$$;
