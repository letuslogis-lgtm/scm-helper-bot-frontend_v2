-- ─────────────────────────────────────────────────
-- outgoing_notes (출고 특이사항) 테이블 생성
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outgoing_notes (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_date     DATE        NOT NULL,
  brand              TEXT        NOT NULL,
  brand_custom       TEXT,
  item_code          TEXT        NOT NULL,
  quantity           INTEGER     NOT NULL CHECK (quantity > 0),
  destination        TEXT        NOT NULL,
  destination_custom TEXT,
  loading_time       TIME,
  registered_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  registered_by_name TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.outgoing_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: 로그인된 모든 사용자 (PWA 작업자 포함)
CREATE POLICY "outgoing_notes_select"
  ON public.outgoing_notes FOR SELECT TO authenticated USING (true);

-- INSERT: 관리자 이상
CREATE POLICY "outgoing_notes_insert"
  ON public.outgoing_notes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('관리자', '최고관리자')
    )
  );

-- DELETE: 관리자 이상
CREATE POLICY "outgoing_notes_delete"
  ON public.outgoing_notes FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('관리자', '최고관리자')
    )
  );

-- 출고일자 기준 조회 성능용 인덱스
CREATE INDEX outgoing_notes_scheduled_date_idx
  ON public.outgoing_notes (scheduled_date);
