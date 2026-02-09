-- Fix: get_daily_production_summary to use scheduled_date
-- Based on the working version, only changing order_date to scheduled_date

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
    SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.unit,
        COALESCE(SUM(o.quantity), 0)::bigint AS total_quantity,
        COALESCE(SUM(o.actual_quantity), 0)::bigint AS total_actual_quantity,
        
        -- Status counts
        COALESCE(
            (
                SELECT jsonb_object_agg(status, cnt)
                FROM (
                    SELECT o2.status, COUNT(*)::integer AS cnt
                    FROM orders o2
                    WHERE o2.product_id = p.id AND o2.scheduled_date = target_date
                    GROUP BY o2.status
                ) status_agg
            ),
            '{}'::jsonb
        ) AS status_counts,
        
        -- Company breakdown
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'company_name', c.name,
                        'quantity', o3.quantity,
                        'status', o3.status
                    )
                )
                FROM orders o3
                JOIN companies c ON o3.company_id = c.id
                WHERE o3.product_id = p.id AND o3.scheduled_date = target_date
            ),
            '[]'::jsonb
        ) AS company_breakdown,
        
        -- Current status
        COALESCE(
            (
                SELECT
                    CASE
                        WHEN COUNT(*) FILTER (WHERE o4.status = 'processing') > 0 THEN 'processing'
                        WHEN COUNT(*) FILTER (WHERE o4.status = 'pending') > 0 THEN 'pending'
                        ELSE 'completed'
                    END
                FROM orders o4
                WHERE o4.product_id = p.id AND o4.scheduled_date = target_date
            ),
            'pending'
        ) AS current_status,
        
        -- Accumulated time
        COALESCE(
            (
                SELECT SUM(
                    CASE
                        WHEN pl.end_time IS NOT NULL 
                        THEN EXTRACT(EPOCH FROM (pl.end_time - pl.created_at))::integer
                        ELSE 0
                    END
                )::integer
                FROM production_logs pl
                WHERE pl.product_id = p.id 
                AND pl.created_at::date = target_date
            ),
            0
        ) AS accumulated_time,
        
        -- Last started at
        (
            SELECT pl2.created_at
            FROM production_logs pl2
            WHERE pl2.product_id = p.id 
            AND pl2.status = 'processing'
            AND pl2.end_time IS NULL
            AND pl2.created_at::date = target_date
            ORDER BY pl2.created_at DESC
            LIMIT 1
        ) AS last_started_at
        
    FROM products p
    LEFT JOIN orders o ON p.id = o.product_id AND o.scheduled_date = target_date
    WHERE EXISTS (
        SELECT 1 FROM orders o_check 
        WHERE o_check.product_id = p.id 
        AND o_check.scheduled_date = target_date
    )
    GROUP BY p.id, p.name, p.unit
    ORDER BY p.name;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
