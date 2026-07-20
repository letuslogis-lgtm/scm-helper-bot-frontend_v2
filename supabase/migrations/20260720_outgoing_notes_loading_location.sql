-- outgoing_notes 테이블에 상차지 컬럼 추가
ALTER TABLE public.outgoing_notes
  ADD COLUMN IF NOT EXISTS loading_location        TEXT,
  ADD COLUMN IF NOT EXISTS loading_location_custom TEXT;
