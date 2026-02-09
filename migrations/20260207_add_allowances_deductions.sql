-- Add allowance and deduction columns to staff table
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS allowance1_name text,
ADD COLUMN IF NOT EXISTS allowance1_amount integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS allowance2_name text,
ADD COLUMN IF NOT EXISTS allowance2_amount integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS allowance3_name text,
ADD COLUMN IF NOT EXISTS allowance3_amount integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS deduction1_name text,
ADD COLUMN IF NOT EXISTS deduction1_amount integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS deduction2_name text,
ADD COLUMN IF NOT EXISTS deduction2_amount integer DEFAULT 0;
