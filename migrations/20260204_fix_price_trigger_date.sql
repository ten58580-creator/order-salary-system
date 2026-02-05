-- Update the trigger function to use CURRENT_DATE instead of 2000-01-01
CREATE OR REPLACE FUNCTION public.handle_new_product_price()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.product_prices (product_id, unit_price, start_date)
  VALUES (NEW.id, NEW.unit_price, CURRENT_DATE);
  RETURN NEW;
END;
$$;
