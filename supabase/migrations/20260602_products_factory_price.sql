-- products 테이블에 공장도가 컬럼 추가
-- sync_products.mjs 가 이미 MS-SQL에서 공장도가를 읽어 upsert 시도 중이었으나
-- 테이블에 컬럼이 없어 무시되고 있었음 → 이 마이그레이션으로 활성화됨
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS factory_price numeric;
