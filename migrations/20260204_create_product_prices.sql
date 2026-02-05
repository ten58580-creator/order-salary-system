-- Create product_prices table
CREATE TABLE IF NOT EXISTS public.product_prices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    unit_price numeric NOT NULL,
    start_date date NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_product_prices_lookup ON public.product_prices(product_id, start_date DESC);

-- Migrate existing current prices as initial history (effective from very old date)
INSERT INTO public.product_prices (product_id, unit_price, start_date)
SELECT id, unit_price, CURRENT_DATE
FROM public.products
WHERE NOT EXISTS (SELECT 1 FROM public.product_prices WHERE product_id = products.id);
```
