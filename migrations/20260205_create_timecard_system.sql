-- ■ タイムカードシステムと人員動態管理の構築

-- 1. タイムカード履歴テーブル (timecard_logs) の作成
CREATE TABLE IF NOT EXISTS public.timecard_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    staff_id uuid NOT NULL REFERENCES public.staff(id),
    company_id uuid REFERENCES public.companies(id), -- 念のため会社IDも保持
    event_type text NOT NULL CHECK (event_type IN ('clock_in', 'break_start', 'break_end', 'clock_out')),
    timestamp timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_timecard_logs_staff_date ON public.timecard_logs(staff_id, timestamp);

-- 2. 人数変更時のログ分割ロジック (update_worker_count) の改修
-- これにより、作業途中で人数が変わった場合、正しくログが分割され、正確なコスト計算が可能になる。

CREATE OR REPLACE FUNCTION update_worker_count(
    p_product_id uuid,
    p_target_date date,
    p_count integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_active_log_id uuid;
    v_current_worker_count integer;
    v_status text;
    v_start_time timestamptz;
BEGIN
    -- 1. ordersテーブルの現在値を更新
    UPDATE public.orders
    SET worker_count = p_count, updated_at = now()
    WHERE product_id = p_product_id AND order_date = p_target_date;

    -- 2. 現在進行中のログ（end_time IS NULL）を取得
    SELECT id, worker_count, status, start_time 
    INTO v_active_log_id, v_current_worker_count, v_status, v_start_time
    FROM public.production_logs
    WHERE product_id = p_product_id 
      AND order_date = p_target_date
      AND end_time IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    -- 3. アクティブなログがあり、かつ人数が変わっている場合のみ分割処理を行う
    IF v_active_log_id IS NOT NULL AND v_current_worker_count != p_count THEN
        -- A. 現在のログを「今」締め切る
        UPDATE public.production_logs
        SET end_time = now()
        WHERE id = v_active_log_id;

        -- B. 新しい人数で「今」から新しいログを開始する
        INSERT INTO public.production_logs (
            product_id, 
            order_date, 
            status, 
            start_time, 
            end_time, -- 新しいログはまだ終わっていないのでNULL
            worker_count, 
            created_at
        ) VALUES (
            p_product_id,
            p_target_date,
            v_status, -- ステータスは維持 (processingなど)
            now(),    -- 開始時刻は「今」
            NULL,
            p_count,  -- 新しい人数
            now()
        );
    END IF;
END;
$$;
