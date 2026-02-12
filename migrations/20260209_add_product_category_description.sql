-- Add category and description columns to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.products.category IS '商品カテゴリー';
COMMENT ON COLUMN public.products.description IS '備考（規格・詳細など）';
