-- ============================================================
-- products 테이블 (item_code, item_color) UNIQUE 제약 추가
-- ------------------------------------------------------------
-- 목적:
--   sync_products.mjs 가 SELECT → 비교 → INSERT/UPDATE 의 3단계 대신
--   PostgreSQL ON CONFLICT(UPSERT) 한 번으로 처리할 수 있도록 함.
--   73만 row 동기화 시 API 호출 수가 1/3 이하로 줄어듦.
--
-- 주의:
--   기존 데이터에 (item_code, item_color) 중복이 있으면 제약 생성 실패.
--   그 경우 먼저 중복을 정리해야 함.
-- ============================================================

-- 1) 혹시 모를 동일 키 중복을 사전에 점검 (수동 실행용)
-- SELECT item_code, item_color, COUNT(*)
-- FROM public.products
-- GROUP BY item_code, item_color
-- HAVING COUNT(*) > 1;

-- 2) UNIQUE 제약 추가 (item_color 가 NULL 인 경우도 같이 다루기 위해
--    NULL 을 빈 문자열로 통일하거나, UNIQUE NULLS NOT DISTINCT 사용)
ALTER TABLE public.products
  ADD CONSTRAINT products_item_code_color_unique
  UNIQUE NULLS NOT DISTINCT (item_code, item_color);

-- 3) 적용 확인 (수동 실행용)
-- SELECT conname, contype, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.products'::regclass;
