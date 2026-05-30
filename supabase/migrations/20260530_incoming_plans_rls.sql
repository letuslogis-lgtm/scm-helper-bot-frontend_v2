-- ============================================================
-- incoming_plans RLS 정책 추가
-- ------------------------------------------------------------
-- 목적: 회사간 데이터 격리 (fursys / sidiz)
-- 정책:
--   - 인증 사용자는 본인이 속한 회사 데이터만 SELECT 가능
--   - INSERT/UPDATE/DELETE 는 service_role 만 (RPA가 처리)
--   - 관리자(is_admin)는 모든 회사 데이터 접근 가능
-- ============================================================

ALTER TABLE public.incoming_plans ENABLE ROW LEVEL SECURITY;

-- 기존 정책 정리 (재실행 안전)
DROP POLICY IF EXISTS "incoming_plans_self_select" ON public.incoming_plans;
DROP POLICY IF EXISTS "incoming_plans_admin_all"   ON public.incoming_plans;

-- ------------------------------------------------------------
-- 1) 본인 회사 데이터만 SELECT
--    profiles.company 컬럼에 'fursys' / 'sidiz' 가 저장된 가정.
--    company 컬럼이 없거나 NULL 인 사용자는 본인 회사를 인식할 수 없으므로
--    조회 결과 0건이 됨 (의도된 동작).
-- ------------------------------------------------------------
CREATE POLICY "incoming_plans_self_select" ON public.incoming_plans
  FOR SELECT TO authenticated
  USING (
    company IN (
      SELECT p.company
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company IS NOT NULL
    )
  );

-- ------------------------------------------------------------
-- 2) 관리자: 전체 회사 데이터 모든 작업 가능
-- ------------------------------------------------------------
CREATE POLICY "incoming_plans_admin_all" ON public.incoming_plans
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 적용 확인 쿼리
-- ============================================================
-- SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'incoming_plans';
