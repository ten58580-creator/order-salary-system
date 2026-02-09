-- 1. Add worker_count to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS worker_count integer DEFAULT 1;

-- 2. Create production_logs table for Gantt Chart
CREATE TABLE IF NOT EXISTS public.production_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES public.products(id),
    order_date date NOT NULL,
    status text NOT NULL, -- 'processing', 'break', 'completed' etc.
    start_time timestamptz NOT NULL DEFAULT now(),
    end_time timestamptz, -- NULL if currently active
    worker_count integer DEFAULT 1, -- Snapshot of worker count at this time
    created_at timestamptz DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_production_logs_date_product ON public.production_logs(order_date, product_id);

-- 3. Update Status Function to use Logs
CREATE OR REPLACE FUNCTION update_production_status(
    p_product_id uuid,
    p_target_date date,
    p_new_status text,
    p_actual_total integer DEFAULT NULL,
    p_worker_count integer DEFAULT 1
)
RETURNS void AS $$
DECLARE
    v_last_log_id uuid;
BEGIN
    -- A. Update orders table status (for compatibility and current state)
    -- Also update worker_count
    UPDATE public.orders
    SET 
        status = p_new_status,
        worker_count = p_worker_count,
        updated_at = now()
    WHERE product_id = p_product_id AND order_date = p_target_date;

    -- B. Handle Logs
    -- 1. Find any active log (end_time is null) for this product/date and CLOSE it
    UPDATE public.production_logs
    SET end_time = now()
    WHERE product_id = p_product_id 
      AND order_date = p_target_date 
      AND end_time IS NULL;

    -- 2. If new status is 'processing', OPEN a new log
    IF p_new_status = 'processing' THEN
        INSERT INTO public.production_logs (product_id, order_date, status, start_time, worker_count)
        VALUES (p_product_id, p_target_date, 'processing', now(), p_worker_count);
    END IF;

    -- C. Handle Actual Quantity Update
    IF p_actual_total IS NOT NULL THEN
        -- Logic to update actual quantity (distribute to first order or specific logic)
        -- Simpler logic: Update all orders for this product/date to sum up to actual? 
        -- Or just update one. Existing logic updated one.
        WITH target_orders AS (
            SELECT id FROM public.orders 
            WHERE product_id = p_product_id AND order_date = p_target_date
            ORDER BY id
            LIMIT 1
        )
        UPDATE public.orders
        SET actual_quantity = p_actual_total
        WHERE id IN (SELECT id FROM target_orders);
        
        -- Reset others to 0 to avoid double counting if multiple orders exist
        UPDATE public.orders
        SET actual_quantity = 0
        WHERE product_id = p_product_id AND order_date = p_target_date
          AND id NOT IN (SELECT id FROM public.orders WHERE product_id = p_product_id AND order_date = p_target_date ORDER BY id LIMIT 1);
    END IF;
END;
$$ LANGUAGE plpgsql;


-- 4. Update Summary Function to return Logs and Worker Count
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
    worker_count integer,         -- Combined/Max worker count
    logs jsonb,                  -- Production logs for Gantt
    first_started_at timestamptz, -- Calculation for Summary
    last_ended_at timestamptz    -- Calculation for Summary
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
            o.worker_count
        FROM public.orders o
        JOIN public.products p ON o.product_id = p.id
        JOIN public.companies c ON o.company_id = c.id
        WHERE o.order_date = target_date
    ),
    log_data AS (
        SELECT 
            pl.product_id,
            jsonb_agg(
                jsonb_build_object(
                    'status', pl.status,
                    'start_time', pl.start_time,
                    'end_time', pl.end_time,
                    'worker_count', pl.worker_count
                ) ORDER BY pl.start_time
            ) as logs,
            MIN(pl.start_time) as first_start,
            MAX(COALESCE(pl.end_time, pl.start_time)) as last_end
        FROM public.production_logs pl
        WHERE pl.order_date = target_date
        GROUP BY pl.product_id
    ),
    summary AS (
        SELECT
            od.product_id,
            od.product_name,
            COALESCE(od.unit, '-') AS unit,
            SUM(od.quantity)::bigint AS total_quantity,
            SUM(COALESCE(od.actual_quantity, od.quantity))::bigint AS total_actual_quantity,
            MAX(od.worker_count) as worker_count,
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
        COALESCE(s.worker_count, 1) as worker_count,
        COALESCE(ld.logs, '[]'::jsonb) as logs,
        ld.first_start,
        ld.last_end
    FROM summary s
    LEFT JOIN log_data ld ON s.product_id = ld.product_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Helper RPC to update worker count directly
CREATE OR REPLACE FUNCTION update_worker_count(
    p_product_id uuid,
    p_target_date date,
    p_count integer
)
RETURNS void AS $$
BEGIN
    UPDATE public.orders
    SET worker_count = p_count, updated_at = now()
    WHERE product_id = p_product_id AND order_date = p_target_date;

    -- Also update any active log to reflect this change if needed, 
    -- or just let the next status change pick it up.
    -- For strict accuracy, maybe split the log? For now, we update active log.
    UPDATE public.production_logs
    SET worker_count = p_count
    WHERE product_id = p_product_id 
      AND order_date = p_target_date
      AND end_time IS NULL; -- Only current active log
END;
$$ LANGUAGE plpgsql;
