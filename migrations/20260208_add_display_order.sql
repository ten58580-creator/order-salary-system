-- Add display_order to orders table for drag and drop sorting

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_orders_display_order ON public.orders(order_date, display_order);

COMMENT ON COLUMN public.orders.display_order IS '製造指示画面での表示順序（ドラッグ&ドロップ対応）';

-- Initialize display_order based on current order
UPDATE public.orders 
SET display_order = sub.row_num
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY order_date ORDER BY created_at) as row_num
    FROM public.orders
) sub
WHERE orders.id = sub.id;
