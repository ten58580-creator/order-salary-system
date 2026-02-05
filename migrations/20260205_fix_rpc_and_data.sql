-- 1. Recreate Production Summary Function with Correct Parameters
DROP FUNCTION IF EXISTS get_daily_production_summary(date);

CREATE OR REPLACE FUNCTION get_daily_production_summary(target_date date)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    unit text,
    total_quantity bigint,
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

-- 2. Ensure Update Function Exists
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

-- 3. FORCE INSERT TEST DATA FOR 2026-02-05 (Today)
DO $$
DECLARE
    v_test_corp_id uuid;
    v_sample_food_id uuid;
    v_fish_seasoned uuid;
    v_clams_frozen uuid;
    v_fish_grilled uuid;
    v_fish_seasoned_sample uuid;
    v_target_date date := '2026-02-05';
BEGIN
    -- Get or Create Companies
    INSERT INTO public.companies (name, address, contact_info) VALUES ('テスト商事', 'Testing', '000') ON CONFLICT DO NOTHING;
    INSERT INTO public.companies (name, address, contact_info) VALUES ('サンプル食品', 'Sampling', '000') ON CONFLICT DO NOTHING;
    
    SELECT id INTO v_test_corp_id FROM public.companies WHERE name = 'テスト商事' LIMIT 1;
    SELECT id INTO v_sample_food_id FROM public.companies WHERE name = 'サンプル食品' LIMIT 1;

    -- Get or Create Products
    -- Test Corp
    INSERT INTO public.products (company_id, name, unit_price, unit, is_archived) 
    VALUES (v_test_corp_id, '味付け魚', 50, 'kg', false) 
    ON CONFLICT DO NOTHING; -- No unique constraint usually, but let's assume valid inserts mostly
    
    -- Assuming we just grab the latest one matching name if multiples
    SELECT id INTO v_fish_seasoned FROM public.products WHERE company_id = v_test_corp_id AND name = '味付け魚' LIMIT 1;
    IF v_fish_seasoned IS NULL THEN
        INSERT INTO public.products (company_id, name, unit_price, unit, is_archived) 
        VALUES (v_test_corp_id, '味付け魚', 50, 'kg', false) RETURNING id INTO v_fish_seasoned;
    END IF;

    SELECT id INTO v_clams_frozen FROM public.products WHERE company_id = v_test_corp_id AND name = '冷凍あさり' LIMIT 1;
    IF v_clams_frozen IS NULL THEN
         INSERT INTO public.products (company_id, name, unit_price, unit, is_archived)
         VALUES (v_test_corp_id, '冷凍あさり', 25, 'kg', false) RETURNING id INTO v_clams_frozen;
    END IF;

    -- Sample Food
    SELECT id INTO v_fish_grilled FROM public.products WHERE company_id = v_sample_food_id AND name = '焼き魚' LIMIT 1;
    IF v_fish_grilled IS NULL THEN
        INSERT INTO public.products (company_id, name, unit_price, unit, is_archived)
        VALUES (v_sample_food_id, '焼き魚', 100, '尾', false) RETURNING id INTO v_fish_grilled;
    END IF;

    -- Clear existing orders for this date to ensure clean state
    DELETE FROM public.orders WHERE order_date = v_target_date AND company_id IN (v_test_corp_id, v_sample_food_id);

    -- Insert new orders
    INSERT INTO public.orders (company_id, product_id, quantity, order_date, status)
    VALUES 
        (v_test_corp_id, v_fish_seasoned, 150, v_target_date, 'pending'),
        (v_test_corp_id, v_clams_frozen, 30, v_target_date, 'pending'),
        (v_sample_food_id, v_fish_grilled, 100, v_target_date, 'pending');

    -- Note: reusing '味付け魚' for Sample Food if they have one? Or different product? 
    -- Request said: "各社ごとに設定" -> "Order for both companies". 
    -- Let's add '味付け魚' for Sample Food as well to show aggregation across companies if names match?
    -- Actually user said "Product Name: Total". If logic aggregates by product_id, they are separate rows.
    -- If logic aggregates by NAME, they combine. Current SQL aggregates by product_id.
    -- So they will be separate lines unless they share ID.
    -- Usually products are company specific. So '味付け魚' (Test Corp) and '味付け魚' (Sample Food) are different IDs.
    -- The requested "Product Name: Total" might imply aggregation by NAME across companies, OR just typical distinct products.
    -- Given "Subject to Company Selection" in product admin, products are owned by companies.
    -- The Production Screen aggregates by `od.product_id`. So they will be separate lines.
    -- User example: "味付け魚 150p". Breakdowns: "A Corp (10), B Corp (10)".
    -- This implies Single Product ID shared? Or Aggregated by Name?
    -- If products are unique to companies, they can't be shared.
    -- IF the system is a distributor where multiple clients order the SAME item, the Item should belong to the Distributor (Admin), not Client.
    -- BUT verification schema has `products.company_id`. This implies products belong to clients (Client brings own product specs?).
    -- OR `company_id` on product is the "Manufacturer"?
    -- Let's stick to current Schema: Products belong to `company_id`.
    -- So "Test Corp's Seasoned Fish" is distinct from "Sample Food's Seasoned Fish".
    -- If the user wants them combined, I'd need to group by `name`.
    -- My SQL groups by `product_id`. I will keep this for now as it's safer for distinct pricing/specs.
    
    -- Let's just insure the data exists.
END $$;
