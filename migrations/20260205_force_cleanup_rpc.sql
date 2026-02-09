-- ■ 完全クリーンアップ＆再作成用SQL
-- エラー "cannot remove parameter defaults" および "ambiguity" を同時に解消します。
-- 既存の関数定義をすべて削除してから、正しい定義のみを作成します。

-- 1. 古いバージョン（4引数）を削除
DROP FUNCTION IF EXISTS update_production_status(uuid, date, text, integer);

-- 2. 新しいバージョン（5引数）も一旦削除（設定変更の競合を防ぐため）
DROP FUNCTION IF EXISTS update_production_status(uuid, date, text, integer, integer);

-- 3. 正しい定義で再作成
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
BEGIN
    -- 1. status, total_actual_quantity, worker_count を更新
    UPDATE production_items
    SET 
        current_status = p_new_status,
        total_actual_quantity = CASE 
            WHEN p_actual_total IS NOT NULL THEN p_actual_total 
            ELSE total_actual_quantity 
        END,
        worker_count = p_worker_count,
        updated_at = now(),
        -- 初回開始時刻 (first_start) の設定
        first_start = CASE 
            WHEN first_start IS NULL AND p_new_status = 'processing' THEN now() 
            ELSE first_start 
        END,
        -- 最終終了時刻 (last_end) の設定
        last_end = CASE 
            WHEN p_new_status = 'completed' THEN now() 
            ELSE last_end 
        END
    WHERE product_id = p_product_id;

    -- 2. ログ管理 (Logs)
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
