-- ============================================================
-- 입고 실적 마감 RPA 설정 테이블
-- ============================================================
CREATE TABLE public.erp_closing_config (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company        TEXT        NOT NULL,
  warehouse_name TEXT        NOT NULL,
  data_type      TEXT        NOT NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT erp_closing_config_data_type_check
    CHECK (data_type IN ('입고실적', '반입집계', '반출집계'))
);

CREATE INDEX idx_erp_closing_config_active ON public.erp_closing_config(is_active);

ALTER TABLE public.erp_closing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_closing_config_select" ON public.erp_closing_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "erp_closing_config_all" ON public.erp_closing_config
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
