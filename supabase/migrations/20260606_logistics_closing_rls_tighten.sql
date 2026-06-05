-- ============================================================
-- logistics_closing 테이블 RLS 강화
-- ============================================================
-- 기존 (20260515_logistics_closing.sql):
--   authenticated_all 정책이 auth.role() = 'authenticated' 만 검사 →
--   로그인한 모든 사용자가 INSERT/UPDATE/DELETE 가능 (실효 없음)
--
-- 변경:
--   - SELECT: 인증 사용자 전체 (조회는 누구나)
--   - INSERT/UPDATE/DELETE: public.is_admin() 만 허용
--
-- ※ 회사별(fursys/sidiz) 분리는 추후 별도 마이그레이션에서 처리
-- ============================================================

-- ------------------------------------------------------------
-- closing_uploads
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all" ON public.closing_uploads;

CREATE POLICY "closing_uploads_select" ON public.closing_uploads
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "closing_uploads_admin_write" ON public.closing_uploads
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- closing_raw_data
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all" ON public.closing_raw_data;

CREATE POLICY "closing_raw_data_select" ON public.closing_raw_data
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "closing_raw_data_admin_write" ON public.closing_raw_data
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- closing_summary
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all" ON public.closing_summary;

CREATE POLICY "closing_summary_select" ON public.closing_summary
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "closing_summary_admin_write" ON public.closing_summary
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- closing_config
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_all" ON public.closing_config;

CREATE POLICY "closing_config_select" ON public.closing_config
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "closing_config_admin_write" ON public.closing_config
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
