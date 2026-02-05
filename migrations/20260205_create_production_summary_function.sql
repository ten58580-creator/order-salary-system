-- Function to get grouped production summary for a specific date
CREATE OR REPLACE FUNCTION get_daily_production_summary(target_date date)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    unit text,
    total_quantity bigint,
    status_counts jsonb, -- e.g., {"pending": 5, "processing": 2, "completed": 10}
    company_breakdown jsonb -- List of { company_name, quantity, status }
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
            o.status
        FROM public.orders o
        JOIN public.products p ON o.product_id = p.id
        JOIN public.companies c ON o.company_id = c.id
        WHERE o.order_date = target_date
    )
    SELECT
        od.product_id,
        od.product_name,
        COALESCE(od.unit, '-'), -- Handle potential nulls if schema allowed
        SUM(od.quantity)::bigint AS total_quantity,
        jsonb_object_agg(od.status, count(*)) FILTER (WHERE od.status IS NOT NULL) AS status_counts, -- Simple count aggregation constraint (needs adjusting for robust counting)
        -- better status count:
        (
            SELECT jsonb_object_agg(s, c)
            FROM (
                SELECT status as s, COUNT(*) as c
                FROM order_data sub
                WHERE sub.product_id = od.product_id
                GROUP BY status
            ) status_sub
        ) AS status_counts,
        jsonb_agg(
            jsonb_build_object(
                'company_name', od.company_name,
                'quantity', od.quantity,
                'status', od.status
            ) ORDER BY od.company_name
        ) AS company_breakdown
    FROM order_data od
    GROUP BY od.product_id, od.product_name, od.unit;
END;
$$ LANGUAGE plpgsql;

-- Function to batch update production status for a product on a specific date
CREATE OR REPLACE FUNCTION update_production_status(
    p_product_id uuid,
    p_target_date date,
    p_new_status text
)
RETURNS void AS $$
BEGIN
    UPDATE public.orders
    SET status = p_new_status
    WHERE product_id = p_product_id
      AND order_date = p_target_date;
END;
$$ LANGUAGE plpgsql;
