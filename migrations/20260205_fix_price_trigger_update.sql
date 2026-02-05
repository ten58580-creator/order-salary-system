-- 1. Drop previous trigger (to recreate it with proper event hooks)
DROP TRIGGER IF EXISTS trigger_set_order_price ON public.orders;

-- 2. Update function to handle logic strictly
CREATE OR REPLACE FUNCTION set_order_unit_price()
RETURNS TRIGGER AS $$
DECLARE
    effective_price numeric;
BEGIN
    -- 1. Find the price from history (Effective Date <= Order Date)
    SELECT unit_price INTO effective_price
    FROM public.product_prices
    WHERE product_id = NEW.product_id
      AND start_date <= NEW.order_date
    ORDER BY start_date DESC
    LIMIT 1;

    -- 2. Fallback to product master if no history exists
    IF effective_price IS NULL THEN
        SELECT unit_price INTO effective_price
        FROM public.products
        WHERE id = NEW.product_id;
    END IF;

    -- 3. Set the price
    NEW.unit_price := COALESCE(effective_price, 0);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Re-create Trigger for INSERT and UPDATE (Critical for date changes)
CREATE TRIGGER trigger_set_order_price
BEFORE INSERT OR UPDATE OF order_date, product_id ON public.orders
FOR EACH ROW
EXECUTE FUNCTION set_order_unit_price();

-- 4. [CRITICAL] Backfill existing orders
-- Recalculate unit_price for all orders where it is currently 0
UPDATE public.orders
SET unit_price = COALESCE(
    (
        SELECT unit_price 
        FROM public.product_prices 
        WHERE product_id = orders.product_id 
          AND start_date <= orders.order_date 
        ORDER BY start_date DESC 
        LIMIT 1
    ),
    (
        SELECT unit_price 
        FROM public.products 
        WHERE id = orders.product_id
    ),
    0
)
WHERE unit_price = 0;
