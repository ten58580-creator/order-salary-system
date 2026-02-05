-- Fix Timer Accumulation Logic

-- 1. Ensure get_daily_production_summary returns correct accumulated time
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
    accumulated_time bigint,  -- Sum of production_time_seconds
    last_started_at timestamptz -- Min or Max start time? Usually all orders for a product share status/time roughly. Let's pick MAX.
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
    ),
    summary AS (
        SELECT
            od.product_id,
            od.product_name,
            COALESCE(od.unit, '-') AS unit,
            SUM(od.quantity)::bigint AS total_quantity,
            SUM(COALESCE(od.actual_quantity, od.quantity))::bigint AS total_actual_quantity,
            SUM(COALESCE(od.production_time_seconds, 0))::bigint AS accumulated_time,
            MAX(od.last_started_at) AS last_started_at,
            -- Determine overall status: if any processing -> processing, else if any pending -> pending, else completed
            -- Or strictly following the logic: If all completed -> completed.
            -- Let's stick to the simpler aggregation for now.
            -- If counts of 'processing' > 0 then 'processing'
            -- Else if counts of 'pending' > 0 then 'pending'
            -- Else 'completed'
            (
                SELECT 
                    CASE 
                        WHEN COUNT(*) FILTER (WHERE status = 'processing') > 0 THEN 'processing'
                        WHEN COUNT(*) FILTER (WHERE status = 'pending') > 0 THEN 'pending'
                        ELSE 'completed'
                    END
                FROM public.orders sub
                WHERE sub.product_id = od.product_id AND sub.order_date = target_date
            ) as current_status
        FROM order_data od
        GROUP BY od.product_id, od.product_name, od.unit
    )
    SELECT
        s.product_id,
        s.product_name,
        s.unit,
        s.total_quantity,
        s.total_actual_quantity,
        (
            SELECT jsonb_object_agg(status, count)
            FROM (
                SELECT status, COUNT(*) as count
                FROM public.orders sub
                WHERE sub.product_id = s.product_id AND sub.order_date = target_date
                GROUP BY status
            ) sub_counts
        ) AS status_counts,
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'company_name', od.company_name,
                    'quantity', od.quantity,
                    'status', od.status
                ) ORDER BY od.company_name
            )
            FROM order_data od
            WHERE od.product_id = s.product_id
        ) AS company_breakdown,
        s.current_status,
        s.accumulated_time,
        s.last_started_at
    FROM summary s;
END;
$$ LANGUAGE plpgsql;

-- 2. Update Status Function to correctly ACCUMULATE time
CREATE OR REPLACE FUNCTION update_production_status(
    p_product_id uuid,
    p_target_date date,
    p_new_status text,
    p_actual_total integer DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    r_order RECORD;
    v_diff integer;
BEGIN
    -- Iterate over relevant orders to update time individually if needed, or update in bulk
    -- We need to handle 'processing' -> 'pending/completed' transition by adding time.
    
    FOR r_order IN 
        SELECT id, status, production_time_seconds, last_started_at 
        FROM public.orders 
        WHERE product_id = p_product_id AND order_date = p_target_date
    LOOP
        -- If currently processing, we need to add the elapsed time since last_started_at
        IF r_order.status = 'processing' AND r_order.last_started_at IS NOT NULL THEN
            -- Calculate diff in seconds
            v_diff := Extract(epoch FROM (now() - r_order.last_started_at))::integer;
            -- Prevent negative diffs just in case
            IF v_diff < 0 THEN v_diff := 0; END IF;
            
            -- Update logic: Add to accumulated, Clear start time
            UPDATE public.orders
            SET 
                production_time_seconds = COALESCE(production_time_seconds, 0) + v_diff,
                last_started_at = NULL,
                status = p_new_status,
                updated_at = now()
            WHERE id = r_order.id;
            
        ELSE
            -- Not processing, or no start time. Just update status.
            -- If new status IS processing, we set start time.
            -- If new status is NOT processing, we just set status.
            
            IF p_new_status = 'processing' THEN
                UPDATE public.orders
                SET 
                    status = p_new_status,
                    last_started_at = now(),
                    updated_at = now()
                WHERE id = r_order.id;
            ELSE
                 UPDATE public.orders
                SET 
                    status = p_new_status,
                    last_started_at = NULL, -- Ensure it is null if not processing
                    updated_at = now()
                WHERE id = r_order.id;
            END IF;
        END IF;
    END LOOP;

    -- Handle Actual Quantity Distribution if provided (for Completion)
    IF p_actual_total IS NOT NULL THEN
        -- We just distribute to the first one effectively as before, or smarter?
        -- Keeping simple: first gets total, rest get 0.
        WITH target_orders AS (
            SELECT id FROM public.orders 
            WHERE product_id = p_product_id AND order_date = p_target_date
            ORDER BY id
            LIMIT 1
        )
        UPDATE public.orders
        SET actual_quantity = p_actual_total
        WHERE id IN (SELECT id FROM target_orders);
        
        -- Zero out others
        UPDATE public.orders
        SET actual_quantity = 0
        WHERE product_id = p_product_id AND order_date = p_target_date
          AND id NOT IN (SELECT id FROM public.orders WHERE product_id = p_product_id AND order_date = p_target_date ORDER BY id LIMIT 1);
    END IF;
END;
$$ LANGUAGE plpgsql;
