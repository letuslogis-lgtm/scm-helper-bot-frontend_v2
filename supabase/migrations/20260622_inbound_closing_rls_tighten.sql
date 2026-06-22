-- ============================================================
-- inbound_* (입고 실적 마감) 테이블 RLS 강화
-- ============================================================
-- 기존 (20260617_inbound_closing.sql):
--   *_all 정책이 FOR ALL TO authenticated USING(true) WITH CHECK(true) →
--   로그인한 모든 사용자가 입고실적·반출입·CUT 데이터를 INSERT/UPDATE/DELETE 가능 (실효 없음)
--
-- 변경 (20260606 logistics_closing 강화와 동일 패턴):
--   - SELECT             : 인증 사용자 전체 (조회는 누구나)
--   - INSERT/UPDATE/DELETE: public.is_admin() 만 허용 (관리자/최고관리자)
--
-- ※ 업로드/수정 권한은 관리자 전용으로 확정 (사용자 확인 2026-06-22)
-- ============================================================

-- ------------------------------------------------------------
-- inbound_upload_batches
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "inbound_batches_all" ON public.inbound_upload_batches;

CREATE POLICY "inbound_batches_select" ON public.inbound_upload_batches
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "inbound_batches_admin_write" ON public.inbound_upload_batches
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- inbound_performance
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "inbound_performance_all" ON public.inbound_performance;

CREATE POLICY "inbound_performance_select" ON public.inbound_performance
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "inbound_performance_admin_write" ON public.inbound_performance
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- inbound_transfer
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "inbound_transfer_all" ON public.inbound_transfer;

CREATE POLICY "inbound_transfer_select" ON public.inbound_transfer
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "inbound_transfer_admin_write" ON public.inbound_transfer
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- inbound_cut_list
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "inbound_cut_list_all" ON public.inbound_cut_list;

CREATE POLICY "inbound_cut_list_select" ON public.inbound_cut_list
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "inbound_cut_list_admin_write" ON public.inbound_cut_list
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
