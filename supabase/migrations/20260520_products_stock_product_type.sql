-- products 테이블에 재고구분, 제품구분 컬럼 추가
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS stock_type   text,
    ADD COLUMN IF NOT EXISTS product_type text;
