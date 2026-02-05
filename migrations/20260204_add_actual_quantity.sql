-- Add actual_quantity to orders table for production results
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS actual_quantity integer;

-- Ensure status column is behaving as expected (it was text, just documenting valid values)
-- valid statuses: 'pending', 'in_progress', 'break', 'completed'

-- Add comment
COMMENT ON COLUMN public.orders.actual_quantity IS 'Production actual quantity (if NULL, use quantity)';
