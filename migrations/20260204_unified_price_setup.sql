-- 1. Create product_prices table (if not exists)
CREATE TABLE IF NOT EXISTS public.product_prices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    unit_price numeric NOT NULL,
    start_date date NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_product_prices_lookup ON public.product_prices(product_id, start_date DESC);

-- 3. Initial Data Migration: Copy current product prices to history (if empty)
INSERT INTO public.product_prices (product_id, unit_price, start_date)
SELECT id, unit_price, '2000-01-01'::date
FROM public.products
WHERE NOT EXISTS (SELECT 1 FROM public.product_prices WHERE product_id = products.id);

-- 4. Create or Replace the Function
CREATE OR REPLACE FUNCTION get_products_with_prices(p_company_id uuid, p_target_date date)
RETURNS TABLE (
  id uuid,
  name text,
  yomigana text,
  unit text,
  unit_price numeric
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    p.id,
    p.name,
    p.yomigana,
    p.unit,
    COALESCE(
      (SELECT pp.unit_price FROM product_prices pp 
       WHERE pp.product_id = p.id AND pp.start_date <= p_target_date 
       ORDER BY pp.start_date DESC LIMIT 1),
      p.unit_price
    ) as unit_price
  FROM products p
  WHERE p.company_id = p_company_id
  ORDER BY p.name;
$$;
