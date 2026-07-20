-- outgoing_notes 테이블에 하차시간 컬럼 추가
ALTER TABLE public.outgoing_notes
  ADD COLUMN IF NOT EXISTS unloading_time TIME;
