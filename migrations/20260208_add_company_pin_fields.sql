-- Add PIN authentication and contact fields to companies table

ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS pin_code text;

ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS person_in_charge text;

ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS phone text;

-- Add comment for clarity
COMMENT ON COLUMN public.companies.pin_code IS 'PINコード（4〜6桁の数字）- 依頼側ログイン用';
COMMENT ON COLUMN public.companies.person_in_charge IS '担当者名';
COMMENT ON COLUMN public.companies.phone IS '電話番号';
