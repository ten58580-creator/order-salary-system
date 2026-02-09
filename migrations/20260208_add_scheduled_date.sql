-- Add scheduled_date to orders table for production scheduling flexibility

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS scheduled_date date;

-- Initialize with order_date for existing records
UPDATE public.orders 
SET scheduled_date = order_date 
WHERE scheduled_date IS NULL;

-- Make it NOT NULL after initialization
ALTER TABLE public.orders 
ALTER COLUMN scheduled_date SET NOT NULL;

-- Set default for future inserts
ALTER TABLE public.orders 
ALTER COLUMN scheduled_date SET DEFAULT CURRENT_DATE;

-- Create index for production queries (use scheduled_date instead of order_date)
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date ON public.orders(scheduled_date, display_order);

COMMENT ON COLUMN public.orders.scheduled_date IS '製造予定日（保留機能で変更可能、order_dateは注文受付日として保持）';
