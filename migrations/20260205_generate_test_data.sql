-- 1. Insert Test Companies
INSERT INTO public.companies (name, address, contact_info)
VALUES 
    ('テスト商事', '東京都テスト区1-1-1', '03-1111-2222'),
    ('サンプル食品', '大阪府サンプル市2-2-2', '06-3333-4444')
ON CONFLICT DO NOTHING; -- Assuming no unique constraint on name, but good practice if names were unique

-- 2. Insert Test Products
-- Only insert if they don't exist (using name/company lookup is tricky in pure SQL without ids, so we'll just insert)
-- We'll use a DO block to look up company IDs.

DO $$
DECLARE
    v_test_corp_id uuid;
    v_sample_food_id uuid;
    v_fish_seasoned uuid;
    v_clams_frozen uuid;
    v_fish_grilled uuid;
    v_fish_seasoned_sample uuid;
BEGIN
    SELECT id INTO v_test_corp_id FROM public.companies WHERE name = 'テスト商事' LIMIT 1;
    SELECT id INTO v_sample_food_id FROM public.companies WHERE name = 'サンプル食品' LIMIT 1;

    -- Test Corp Products
    INSERT INTO public.products (company_id, name, unit_price, unit, is_archived)
    VALUES (v_test_corp_id, '味付け魚', 50, 'kg', false)
    RETURNING id INTO v_fish_seasoned;

    INSERT INTO public.products (company_id, name, unit_price, unit, is_archived)
    VALUES (v_test_corp_id, '冷凍あさり', 25, 'kg', false)
    RETURNING id INTO v_clams_frozen;

    -- Sample Food Products
    INSERT INTO public.products (company_id, name, unit_price, unit, is_archived)
    VALUES (v_sample_food_id, '焼き魚', 100, '尾', false)
    RETURNING id INTO v_fish_grilled;

    INSERT INTO public.products (company_id, name, unit_price, unit, is_archived)
    VALUES (v_sample_food_id, '味付け魚', 50, 'p', false)
    RETURNING id INTO v_fish_seasoned_sample;

    -- 3. Insert Test Orders (for TODAY)
    -- Test Corp
    INSERT INTO public.orders (company_id, product_id, quantity, order_date, status)
    VALUES 
        (v_test_corp_id, v_fish_seasoned, 50, CURRENT_DATE, 'pending'),
        (v_test_corp_id, v_clams_frozen, 30, CURRENT_DATE, 'pending'),
        -- Random breakdown
        (v_test_corp_id, v_fish_seasoned, 20, CURRENT_DATE, 'pending');

    -- Sample Food
    INSERT INTO public.orders (company_id, product_id, quantity, order_date, status)
    VALUES 
        (v_sample_food_id, v_fish_grilled, 100, CURRENT_DATE, 'pending'),
        (v_sample_food_id, v_fish_seasoned_sample, 80, CURRENT_DATE, 'processed');

END $$;
