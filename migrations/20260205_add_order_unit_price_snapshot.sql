-- 1. Add unit_price column to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS unit_price integer DEFAULT 0 NOT NULL;

-- 2. Create function to fetch effective price
CREATE OR REPLACE FUNCTION set_order_unit_price()
RETURNS TRIGGER AS $$
DECLARE
    effective_price numeric;
BEGIN
    -- Try to find price from product_prices history based on order_date
    SELECT unit_price INTO effective_price
    FROM public.product_prices
    WHERE product_id = NEW.product_id
      AND start_date <= NEW.order_date
    ORDER BY start_date DESC
    LIMIT 1;

    -- If no history found (shouldn't happen if migrated correctly, but safe fallback), use current product master price
    IF effective_price IS NULL THEN
        SELECT unit_price INTO effective_price
        FROM public.products
        WHERE id = NEW.product_id;
    END IF;

    -- Set the snapshot price
    NEW.unit_price := COALESCE(effective_price, 0);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Trigger
DROP TRIGGER IF EXISTS trigger_set_order_price ON public.orders;

CREATE TRIGGER trigger_set_order_price
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION set_order_unit_price();
