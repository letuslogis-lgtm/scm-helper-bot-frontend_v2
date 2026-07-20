-- centers 테이블에 사용 목적 컬럼 추가
ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS purposes TEXT[] DEFAULT '{}';
