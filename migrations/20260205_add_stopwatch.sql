-- 1. Add Timer Columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS production_time_seconds integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS last_started_at timestamptz;

-- 2. Update Get Summary Function to include Timer Data
DROP FUNCTION IF EXISTS get_daily_production_summary(date);

CREATE OR REPLACE FUNCTION get_daily_production_summary(target_date date)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    unit text,
    total_quantity bigint,
    total_actual_quantity bigint,
    status_counts jsonb, 
    company_breakdown jsonb,
    current_status text,
    accumulated_time integer,
    last_started_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    WITH order_data AS (
        SELECT
            o.product_id,
            p.name AS product_name,
            p.unit,
            c.name AS company_name,
            o.quantity,
            o.actual_quantity,
            o.status,
            o.production_time_seconds,
            o.last_started_at
        FROM public.orders o
        JOIN public.products p ON o.product_id = p.id
        JOIN public.companies c ON o.company_id = c.id
        WHERE o.order_date = target_date
    )
    SELECT
        od.product_id,
        od.product_name,
        COALESCE(od.unit, '-'),
        SUM(od.quantity)::bigint AS total_quantity,
        SUM(COALESCE(od.actual_quantity, od.quantity))::bigint AS total_actual_quantity,
        (
            SELECT jsonb_object_agg(status, count)
            FROM (
                SELECT status, COUNT(*) as count
                FROM public.orders sub
                WHERE sub.product_id = od.product_id AND sub.order_date = target_date
                GROUP BY status
            ) sub_counts
        ) AS status_counts,
        jsonb_agg(
            jsonb_build_object(
                'company_name', od.company_name,
                'quantity', od.quantity,
                'status', od.status
            ) ORDER BY od.company_name
        ) AS company_breakdown,
        -- Derive aggregate status (Logic: If any processing, then processing. Else if all completed, completed. Else pending.)
        (
             SELECT 
                CASE 
                    WHEN COUNT(*) FILTER (WHERE status = 'processing') > 0 THEN 'processing'
                    WHEN COUNT(*) FILTER (WHERE status = 'completed') = COUNT(*) THEN 'completed'
                    ELSE 'pending'
                END
             FROM public.orders sub
             WHERE sub.product_id = od.product_id AND sub.order_date = target_date
        ) as current_status,
        MAX(od.production_time_seconds)::integer as accumulated_time,
        MAX(od.last_started_at) as last_started_at
    FROM order_data od
    GROUP BY od.product_id, od.product_name, od.unit;
END;
$$ LANGUAGE plpgsql;

-- 3. Update Status Function to Handle Timer Logic
DROP FUNCTION IF EXISTS update_production_status(uuid, date, text, integer);

CREATE OR REPLACE FUNCTION update_production_status(
    p_product_id uuid,
    p_target_date date,
    p_new_status text,
    p_actual_total integer DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_order_ids uuid[];
    v_now timestamptz := now();
    v_current_status text;
    v_last_started_at timestamptz;
BEGIN
    -- Get current state (from one representative row)
    SELECT status, last_started_at INTO v_current_status, v_last_started_at
    FROM public.orders
    WHERE product_id = p_product_id AND order_date = p_target_date
    LIMIT 1;

    -- TIME CALCULATION LOGIC
    -- If currently processing, and we are changing status (Stopping/Pausing/Completing), accumulate time.
    IF v_current_status = 'processing' OR v_current_status = 'manufacturing' THEN -- supporting legacy 'manufacturing' just in case
        IF v_last_started_at IS NOT NULL THEN
             UPDATE public.orders
             SET production_time_seconds = COALESCE(production_time_seconds, 0) + EXTRACT(EPOCH FROM (v_now - v_last_started_at))::integer,
                 last_started_at = NULL
             WHERE product_id = p_product_id AND order_date = p_target_date;
        END IF;
    END IF;

    -- If NEW status is processing, Set Start Time
    IF p_new_status = 'processing' THEN
        UPDATE public.orders
        SET last_started_at = v_now
        WHERE product_id = p_product_id AND order_date = p_target_date;
    END IF;

    -- Update Status ALWAYS
    UPDATE public.orders
    SET status = p_new_status
    WHERE product_id = p_product_id AND order_date = p_target_date
    RETURNING id INTO v_order_ids;

    -- Handle Actual Quantity (Same as before)
    IF p_actual_total IS NOT NULL AND array_length(v_order_ids, 1) > 0 THEN
        UPDATE public.orders
        SET actual_quantity = p_actual_total
        WHERE id = v_order_ids[1];

        IF array_length(v_order_ids, 1) > 1 THEN
             UPDATE public.orders
             SET actual_quantity = 0
             WHERE id = ANY(v_order_ids[2:]); 
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;
