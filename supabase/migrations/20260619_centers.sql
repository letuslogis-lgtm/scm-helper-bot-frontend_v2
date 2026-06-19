-- ─────────────────────────────────────────────────
-- centers 테이블 생성
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.centers (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT,
  sort_order INT  NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  note       TEXT,
  CONSTRAINT centers_name_unique       UNIQUE (name),
  CONSTRAINT centers_sort_order_unique UNIQUE (sort_order)
);

ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_centers"
  ON public.centers FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_centers"
  ON public.centers FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('관리자', '최고관리자'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('관리자', '최고관리자'))
  );

-- ─────────────────────────────────────────────────
-- 초기 데이터 (현재 하드코딩된 17개 센터)
-- ─────────────────────────────────────────────────
INSERT INTO public.centers (name, sort_order) VALUES
  ('양지1',  1), ('양지2',  2), ('양지3',  3),
  ('안성',   4), ('평택',   5), ('음성',   6),
  ('대전',   7), ('대구',   8), ('부산',   9),
  ('광주',  10), ('전북',  11), ('전남',  12),
  ('울산',  13), ('창원',  14), ('기장',  15),
  ('제주',  16), ('이케아', 17)
ON CONFLICT (name) DO NOTHING;
