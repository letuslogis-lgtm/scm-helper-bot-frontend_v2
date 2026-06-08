-- ============================================================
-- erp_inbound_config: ERP 입고예정생성 설정 테이블
-- ------------------------------------------------------------
-- 목적: RPA가 ERP 입고예정을 생성할 때 참조하는 회사/창고 매핑 설정
-- ============================================================

CREATE TABLE IF NOT EXISTS public.erp_inbound_config (
    id               BIGSERIAL PRIMARY KEY,
    company          TEXT NOT NULL,             -- 예) 퍼시스
    input_warehouse  TEXT NOT NULL,             -- 입고예정창고  예) 퍼시스양지
    output_warehouse TEXT NOT NULL,             -- 출고창고      예) 시디즈평택
    sort_order       INTEGER NOT NULL DEFAULT 0,
    note             TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.erp_inbound_config ENABLE ROW LEVEL SECURITY;

-- 기존 정책 정리 (재실행 안전)
DROP POLICY IF EXISTS "erp_inbound_config_select" ON public.erp_inbound_config;
DROP POLICY IF EXISTS "erp_inbound_config_admin_all" ON public.erp_inbound_config;

-- 1) 인증된 사용자 전체 SELECT 허용
CREATE POLICY "erp_inbound_config_select" ON public.erp_inbound_config
  FOR SELECT TO authenticated
  USING (true);

-- 2) 관리자만 INSERT / UPDATE / DELETE 가능
CREATE POLICY "erp_inbound_config_admin_all" ON public.erp_inbound_config
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
