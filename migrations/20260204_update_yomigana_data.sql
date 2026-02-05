-- Update existing products with yomigana
-- Note: Matching by name pattern since IDs are unknown

UPDATE public.products
SET yomigana = 'れいとうあさりぱっく'
WHERE name LIKE '%冷凍あさり%';

UPDATE public.products
SET yomigana = 'のうこうちーずけーき'
WHERE name LIKE '%濃厚チーズケーキ%';

UPDATE public.products
SET yomigana = 'ぷれみあむぷりん'
WHERE name LIKE '%プレミアムプリン%';
