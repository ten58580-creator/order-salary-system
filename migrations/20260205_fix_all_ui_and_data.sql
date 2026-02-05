-- 1. FIX: Recreate update_production_status with correct signature and logic
DROP FUNCTION IF EXISTS update_production_status(uuid, date, text, integer);
DROP FUNCTION IF EXISTS update_production_status(uuid, date, text); -- Just in case old signature exists

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
    IF p_actual_total IS NOT NULL AND array_length(v_order_ids, 1) > 0 THEN
        -- Set first one
        UPDATE public.orders
        SET actual_quantity = p_actual_total
        WHERE id = v_order_ids[1];

        -- Set others to 0 (if any), assuming single aggregated view
        IF array_length(v_order_ids, 1) > 1 THEN
             UPDATE public.orders
             SET actual_quantity = 0
             WHERE id = ANY(v_order_ids[2:]); 
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Clean up "Mystery Test Personnel"
-- Deleting staff that match typical test names or have no role if appropriate.
-- Based on user feedback "A社担当者" etc.
DELETE FROM public.staff WHERE name IN ('A社担当者', 'B社担当者', 'C社担当者', 'Client User', 'Test User');

-- 3. Ensure actual_quantity column exists (Redundant check)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS actual_quantity integer;
