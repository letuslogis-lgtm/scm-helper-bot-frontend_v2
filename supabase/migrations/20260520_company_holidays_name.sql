-- company_holidays 테이블에 name 컬럼 추가
-- 공휴일 명칭 (예: 설날, 추석, 현충일, 임시공휴일 등)
ALTER TABLE company_holidays
    ADD COLUMN IF NOT EXISTS name text;
