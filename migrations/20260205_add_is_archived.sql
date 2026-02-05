-- Add is_archived column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false NOT NULL;

-- Index for performance (filtering by archived status is common)
CREATE INDEX IF NOT EXISTS idx_products_archived ON public.products(is_archived);
