-- ─────────────────────────────────────────────────
-- report_subscriptions 테이블 생성
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_subscriptions (
  id          SERIAL PRIMARY KEY,
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT report_subscriptions_unique UNIQUE (profile_id, report_type)
);

ALTER TABLE public.report_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_report_subscriptions"
  ON public.report_subscriptions FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_report_subscriptions"
  ON public.report_subscriptions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('관리자', '최고관리자'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('관리자', '최고관리자'))
  );
