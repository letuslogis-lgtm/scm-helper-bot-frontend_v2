-- vendor_aliases 테이블에 확인부서(dept) 컬럼 추가
ALTER TABLE public.vendor_aliases
ADD COLUMN IF NOT EXISTS dept text;
