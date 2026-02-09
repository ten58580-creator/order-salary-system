-- ■ get_daily_production_v2 新設SQL
-- クライアント側の呼び出しと完全に同期させるため、関数名とパラメータ名(p_target_date)を明示的に定義します。

DROP FUNCTION IF EXISTS get_daily_production_v2(date);

CREATE OR REPLACE FUNCTION get_daily_production_v2(p_target_date date)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    unit text,
    total_quantity bigint,
    total_actual_quantity bigint,
    status_counts jsonb,
    company_breakdown jsonb,
    current_status text,
    worker_count integer,
    logs jsonb 
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
        WHERE o.order_date = p_target_date
    ),
    summary AS (
        SELECT
            od.product_id,
            od.product_name,
            COALESCE(od.unit, '-') AS unit,
            SUM(od.quantity)::bigint AS total_quantity,
            SUM(COALESCE(od.actual_quantity, 0))::bigint AS total_actual_quantity,
            (
                SELECT 
                    CASE 
                        WHEN COUNT(*) FILTER (WHERE status = 'processing') > 0 THEN 'processing'
                        WHEN COUNT(*) FILTER (WHERE status = 'pending') > 0 THEN 'pending'
                        ELSE 'completed'
                    END
                FROM public.orders sub
                WHERE sub.product_id = od.product_id AND sub.order_date = p_target_date
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
        -- ステータス集計
        COALESCE(
            (
                SELECT jsonb_object_agg(COALESCE(status, 'unknown'), count)
                FROM (
                    SELECT status, COUNT(*) as count
                    FROM public.orders sub
                    WHERE sub.product_id = s.product_id AND sub.order_date = p_target_date
                    GROUP BY status
                ) sub_counts
            ),
            '{}'::jsonb
        ) AS status_counts,
        -- 企業別内訳
        COALESCE(
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
            ),
            '[]'::jsonb
        ) AS company_breakdown,
        s.current_status,
        -- 最新の worker_count
        COALESCE(
            (SELECT pl.worker_count FROM production_logs pl 
             WHERE pl.product_id = s.product_id 
             ORDER BY pl.created_at DESC LIMIT 1),
            1
        ) as worker_count,
        -- logs 配列
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'status', pl.status,
                        'created_at', pl.created_at,
                        'end_time', pl.end_time,
                        'worker_count', pl.worker_count
                    ) ORDER BY pl.created_at ASC
                )
                FROM production_logs pl
                WHERE pl.product_id = s.product_id
                AND pl.created_at::date = p_target_date
            ),
            '[]'::jsonb
        ) as logs
    FROM summary s;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
