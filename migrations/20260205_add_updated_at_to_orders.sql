-- ordersテーブルにupdated_atカラムを追加
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- 既存のデータにも現在時刻を入れる（任意）
UPDATE public.orders SET updated_at = now() WHERE updated_at IS NULL;
