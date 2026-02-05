-- Create or Replace the Function (Updated to filter is_archived = false)
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
    AND p.is_archived = false -- ONLY Active products
  ORDER BY p.name;
$$;
