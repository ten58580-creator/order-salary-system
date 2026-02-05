-- Add unit column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text DEFAULT 'pk' NOT NULL;

-- Update existing rows if necessary (default is already 'pk', but good to be explicit)
UPDATE public.products SET unit = 'pk' WHERE unit IS NULL;
