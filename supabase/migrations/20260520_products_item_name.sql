-- products 테이블에 단품명칭 컬럼 추가
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS item_name text;
