-- Seed Products for Marukin Kaisan
-- Inserts 17 products for '株式会社マルキン海産'
-- Column mapping: name, unit_price, unit='pk'

DO $$
DECLARE
    v_company_id uuid;
BEGIN
    -- 1. Find Company ID
    SELECT id INTO v_company_id 
    FROM public.companies 
    WHERE name = '株式会社マルキン海産' 
    LIMIT 1;

    -- If not found, try fuzzy match or raise warning
    IF v_company_id IS NULL THEN
        -- Try matching without '株式会社' just in case
        SELECT id INTO v_company_id 
        FROM public.companies 
        WHERE name LIKE '%マルキン海産%' 
        LIMIT 1;
    END IF;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Company "株式会社マルキン海産" not found. Please register the company first.';
    END IF;

    -- 2. Insert Products
    -- Using Upsert (ON CONFLICT) if possible, but since we don't know unique constraints for sure (likely name+company_id), 
    -- we will use simple INSERT. If it fails due to duplicates, it's better to know.
    -- However, to be idempotent, we can check existence.
    -- Better yet, let's assume we want to add them.

    INSERT INTO public.products (company_id, name, unit_price, unit)
    VALUES
        (v_company_id, 'サンエー あさり', 20, 'pk'),
        (v_company_id, 'AEON あさり', 20, 'pk'),
        (v_company_id, 'ユニオン あさり', 20, 'pk'),
        (v_company_id, 'サンエー 鍋セット 中', 72, 'pk'),
        (v_company_id, 'サンエー 鍋セット 大', 82, 'pk'),
        (v_company_id, 'AEON 鍋セット 中', 65, 'pk'),
        (v_company_id, 'AEON 鍋セット 大', 70, 'pk'),
        (v_company_id, 'ユニオン 鍋セット 中', 67, 'pk'),
        (v_company_id, 'ユニオン 鍋セット 大', 75, 'pk'),
        (v_company_id, '大粒つみれ', 35, 'pk'),
        (v_company_id, '赤魚 香草野菜', 65, 'pk'),
        (v_company_id, '赤魚 バジル', 65, 'pk'),
        (v_company_id, 'たら バジル', 52, 'pk'),
        (v_company_id, 'お魚とほたてのホワイトソース', 48, 'pk'),
        (v_company_id, 'サバの西京', 54, 'pk'),
        (v_company_id, 'サーモンハラス ネギ塩', 53, 'pk'),
        (v_company_id, 'ブイヤベース', 74, 'pk');

    RAISE NOTICE 'Inserted 17 products for Marukin Kaisan (ID: %)', v_company_id;

END $$;
