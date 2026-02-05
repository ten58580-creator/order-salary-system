-- 1. Create Companies Table
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  address text,
  contact_info text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Create Products Table
CREATE TABLE IF NOT EXISTS public.products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  name text NOT NULL,
  unit_price integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 3. Modify Staff Table (Reflecting Users)
-- Assumes staff.id is linked to auth.users.id
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
-- Ensure role can handle 'client' (no schema change needed for text, but useful to note)

-- 4. Recreate Orders Table
DROP TABLE IF EXISTS public.orders;

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid REFERENCES public.companies(id) NOT NULL,
    created_by uuid REFERENCES public.staff(id), -- User who ordered
    product_id uuid REFERENCES public.products(id) NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    order_date date DEFAULT CURRENT_DATE NOT NULL, -- Logical date of order
    status text DEFAULT 'pending' NOT NULL, -- pending, confirmed, shipped, completed
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_company ON public.products(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_company ON public.orders(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON public.orders(order_date);
