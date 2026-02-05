-- 1. Add actual_quantity column
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS actual_quantity integer;

-- 2. Initialize actual_quantity with scheduled quantity if null
UPDATE public.orders SET actual_quantity = quantity WHERE actual_quantity IS NULL;

-- 3. Update Get Summary Function
DROP FUNCTION IF EXISTS get_daily_production_summary(date);

CREATE OR REPLACE FUNCTION get_daily_production_summary(target_date date)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    unit text,
    total_quantity bigint,
    total_actual_quantity bigint,
    status_counts jsonb, 
    company_breakdown jsonb
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
            o.status
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
        ) AS company_breakdown
    FROM order_data od
    GROUP BY od.product_id, od.product_name, od.unit;
END;
$$ LANGUAGE plpgsql;

-- 4. Update Status & Actual Quantity Function
DROP FUNCTION IF EXISTS update_production_status(uuid, date, text);

CREATE OR REPLACE FUNCTION update_production_status(
    p_product_id uuid,
    p_target_date date,
    p_new_status text,
    p_actual_total integer DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_order_ids uuid[];
BEGIN
    -- Update Status for ALL orders of this product/date
    UPDATE public.orders
    SET status = p_new_status
    WHERE product_id = p_product_id
      AND order_date = p_target_date
    RETURNING id INTO v_order_ids;

    -- If actual total is provided, we need to distribute it or set it.
    -- SIMPLE SEARCH STRATEGY: Set the ENTIRE actual total on the FIRST order, set others to 0.
    -- This ensures the SUM matches.
    IF p_actual_total IS NOT NULL AND array_length(v_order_ids, 1) > 0 THEN
        -- Set first one
        UPDATE public.orders
        SET actual_quantity = p_actual_total
        WHERE id = v_order_ids[1];

        -- Set others to 0 (if any)
        IF array_length(v_order_ids, 1) > 1 THEN
             UPDATE public.orders
             SET actual_quantity = 0
             WHERE id = ANY(v_order_ids[2:]); 
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;
