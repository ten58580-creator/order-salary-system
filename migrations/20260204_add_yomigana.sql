-- Add yomigana column to products table for better search
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS yomigana text DEFAULT '' NOT NULL;

-- Optional: Update existing yomigana based on name (auto-guess is hard in SQL, better to leave empty or copy name as fallback)
-- For now, we leave it empty or user manually updates it.
