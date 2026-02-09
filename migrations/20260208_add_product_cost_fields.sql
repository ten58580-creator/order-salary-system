-- Add cost-related fields to products table for profit calculation

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS wholesale_price decimal(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_price decimal(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS container_cost decimal(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS wrap_cost decimal(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS seal_cost decimal(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS box_cost decimal(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_material_cost decimal(10,2) DEFAULT 0;

COMMENT ON COLUMN public.products.wholesale_price IS '卸値（売価）';
COMMENT ON COLUMN public.products.cost_price IS '商品仕入れ原価';
COMMENT ON COLUMN public.products.container_cost IS '容器代';
COMMENT ON COLUMN public.products.wrap_cost IS 'ラップ代';
COMMENT ON COLUMN public.products.seal_cost IS 'シール代';
COMMENT ON COLUMN public.products.box_cost IS '箱代';
COMMENT ON COLUMN public.products.other_material_cost IS 'その他資材費';
