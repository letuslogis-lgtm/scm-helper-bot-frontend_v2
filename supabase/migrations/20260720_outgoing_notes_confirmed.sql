-- outgoing_notes 테이블에 확정 상태 컬럼 추가
ALTER TABLE public.outgoing_notes
  ADD COLUMN IF NOT EXISTS is_confirmed  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at  TIMESTAMPTZ;
