-- Force synchronization of production data for demo/test
-- This SQL directly updates the production_logs and orders tables

DO $$
DECLARE
    v_today date := CURRENT_DATE;
    v_product_a_id uuid;
    v_product_b_id uuid;
    v_product_c_id uuid;
BEGIN
    -- Find product IDs
    SELECT id INTO v_product_a_id FROM products WHERE name = '商品A（ハンバーグ弁当）' LIMIT 1;
    SELECT id INTO v_product_b_id FROM products WHERE name = '商品B（ポテトサラダ）' LIMIT 1;
    SELECT id INTO v_product_c_id FROM products WHERE name = '商品C（チキン南蛮弁当）' LIMIT 1;

    RAISE NOTICE 'Product A ID: %', v_product_a_id;
    RAISE NOTICE 'Product B ID: %', v_product_b_id;
    RAISE NOTICE 'Product C ID: %', v_product_c_id;

    -- Delete existing production logs for today
    DELETE FROM production_logs
    WHERE order_date = v_today
      AND product_id IN (v_product_a_id, v_product_b_id, v_product_c_id);

    RAISE NOTICE 'Deleted existing production logs';

    -- Insert new production logs with correct timestamps and worker count
    -- All products: 2 workers, 09:00-12:30
    INSERT INTO production_logs (product_id, order_date, status, start_time, end_time, worker_count)
    VALUES
        (v_product_a_id, v_today, 'processing', v_today || ' 09:00:00', v_today || ' 12:30:00', 2),
        (v_product_b_id, v_today, 'processing', v_today || ' 09:00:00', v_today || ' 12:30:00', 2),
        (v_product_c_id, v_today, 'processing', v_today || ' 09:00:00', v_today || ' 12:30:00', 2);

    RAISE NOTICE 'Inserted 3 production logs';

    -- Update orders to completed status
    UPDATE orders
    SET status = 'completed'
    WHERE order_date = v_today
      AND product_id IN (v_product_a_id, v_product_b_id, v_product_c_id);

    RAISE NOTICE 'Updated orders to completed';

    -- Verify the results
    RAISE NOTICE 'Verification:';
    RAISE NOTICE 'Production logs count: %', (SELECT COUNT(*) FROM production_logs WHERE order_date = v_today AND product_id IN (v_product_a_id, v_product_b_id, v_product_c_id));
    RAISE NOTICE 'Orders with completed status: %', (SELECT COUNT(*) FROM orders WHERE order_date = v_today AND product_id IN (v_product_a_id, v_product_b_id, v_product_c_id) AND status = 'completed');

END $$;
