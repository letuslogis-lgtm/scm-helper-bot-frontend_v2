-- ============================================================
-- ai_analysis_logs RLS 정책 강화
-- ------------------------------------------------------------
-- 기존: SELECT/INSERT/UPDATE 모두 USING (true) / WITH CHECK (true) — 너무 관대
-- 변경:
--   - SELECT: 인증 사용자 모두 (기존 유지 — 인사이트 조회용)
--   - INSERT: 인증 사용자 (모바일 바코드 로깅 등 정상 사용 유지)
--   - UPDATE: 관리자(public.is_admin())만 (관리자 보정 작업)
--   - DELETE: 관리자만
-- ============================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "ai_logs_select"  ON public.ai_analysis_logs;
DROP POLICY IF EXISTS "ai_logs_insert"  ON public.ai_analysis_logs;
DROP POLICY IF EXISTS "ai_logs_update"  ON public.ai_analysis_logs;
DROP POLICY IF EXISTS "ai_logs_delete"  ON public.ai_analysis_logs;

-- SELECT: 인증 사용자 모두 (인사이트 조회)
CREATE POLICY "ai_logs_select" ON public.ai_analysis_logs
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: 인증 사용자 (시스템 로깅)
CREATE POLICY "ai_logs_insert" ON public.ai_analysis_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: 관리자만 (보정 작업)
CREATE POLICY "ai_logs_update_admin" ON public.ai_analysis_logs
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE: 관리자만
CREATE POLICY "ai_logs_delete_admin" ON public.ai_analysis_logs
  FOR DELETE TO authenticated
  USING (public.is_admin());
