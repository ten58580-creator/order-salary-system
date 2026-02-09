-- ■ テーブル作成と関数再定義のセットアップSQL
-- エラー "relation production_logs does not exist" を解消します。

-- 1. production_logs テーブルの作成
CREATE TABLE IF NOT EXISTS public.production_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid NOT NULL, -- productsテーブルへの外部キー推奨だが、一旦制約なしで作成
    status text NOT NULL, -- 'processing', 'completed' など
    created_at timestamptz DEFAULT now(),
    end_time timestamptz,
    worker_count integer DEFAULT 1
);

-- インデックス作成（パフォーマンス用）
CREATE INDEX IF NOT EXISTS idx_production_logs_product_id ON public.production_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_production_logs_created_at ON public.production_logs(created_at);

-- ---------------------------------------------------------
-- 2. 更新関数 (update_production_status) の再適用
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION update_production_status(
    p_product_id uuid,
    p_target_date date,
    p_new_status text,
    p_actual_total integer,
    p_worker_count integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_log_id uuid;
    v_order_id uuid;
BEGIN
    -- Order IDの特定
    SELECT id INTO v_order_id FROM public.orders 
    WHERE product_id = p_product_id AND order_date = p_target_date
    LIMIT 1;

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'Order not found for product % on date %', p_product_id, p_target_date;
    END IF;

    -- 1. Ordersテーブル (ステータス・実績・人数) を更新
    UPDATE public.orders
    SET 
        status = p_new_status,
        actual_quantity = CASE 
            WHEN p_actual_total IS NOT NULL THEN p_actual_total 
            ELSE actual_quantity 
        END,
        updated_at = now()
    WHERE id = v_order_id;

    -- 2. ログ管理 (Production Logs)
    IF p_new_status = 'processing' THEN
        -- 開始ログを作成
        INSERT INTO production_logs (product_id, status, created_at, worker_count)
        VALUES (p_product_id, 'processing', now(), p_worker_count);
        
    ELSIF p_new_status = 'pending' THEN
        -- 進行中のログがあれば終了時刻を入れる（一時停止）
        SELECT id INTO v_log_id FROM production_logs 
        WHERE product_id = p_product_id AND status = 'processing' AND end_time IS NULL
        ORDER BY created_at DESC LIMIT 1;
        
        IF v_log_id IS NOT NULL THEN
            UPDATE production_logs SET end_time = now() WHERE id = v_log_id;
        END IF;

    ELSIF p_new_status = 'completed' THEN
        -- 進行中のログがあれば終了時刻を入れる
        SELECT id INTO v_log_id FROM production_logs 
        WHERE product_id = p_product_id AND status = 'processing' AND end_time IS NULL
        ORDER BY created_at DESC LIMIT 1;
        
        IF v_log_id IS NOT NULL THEN
            UPDATE production_logs SET end_time = now() WHERE id = v_log_id;
        END IF;
        
        -- 完了ログを追加
        INSERT INTO production_logs (product_id, status, created_at, end_time, worker_count)
        VALUES (p_product_id, 'completed', now(), now(), p_worker_count);
    END IF;
END;
$$;

-- ---------------------------------------------------------
-- 3. 取得関数 (get_daily_production_summary) の再適用
-- ---------------------------------------------------------
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
        WHERE o.order_date = target_date
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
        -- 最新の worker_count を logs から取得 (なければ1)
        COALESCE(
            (SELECT pl.worker_count FROM production_logs pl 
             WHERE pl.product_id = s.product_id 
             ORDER BY pl.created_at DESC LIMIT 1),
            1
        ) as worker_count,
        -- logs 配列を取得
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
                AND pl.created_at::date = target_date
            ),
            '[]'::jsonb
        ) as logs
    FROM summary s;
END;
$$ LANGUAGE plpgsql;
