-- ============================================================
-- wms_shortage_list: UPDATE 정책 명시화 (재현성 보강)
-- ============================================================
-- 배경:
--   20260518_wms_shortage_list.sql 은 SELECT/INSERT/DELETE 정책만 정의하고
--   UPDATE 정책을 누락했다. RLS가 켜진 상태에서 UPDATE 정책이 없으면
--   PostgREST(anon/authenticated)로는 UPDATE가 전면 차단된다.
--
--   그러나 프런트엔드(WmsShortageList.jsx)는 인증 사용자가 결품 '조치사항'을
--   직접 UPDATE 하고, 업로드 시 upsert(=INSERT+UPDATE)도 수행한다.
--   운영 DB에서는 정상 동작하므로 Supabase UI로 UPDATE 정책이
--   수동 추가되어 있을 가능성이 높다. 이 마이그레이션은 그 정책을
--   코드로 명시화하여, 마이그레이션만으로 환경을 재구축해도 조치 입력이
--   깨지지 않도록 한다.
--
--   ⚠️ 의도적으로 is_admin() 제한을 두지 않는다.
--      조치사항 입력은 일반 작업자/담당자의 핵심 업무이므로
--      관리자 전용으로 막으면 기능이 깨진다.
-- ============================================================

ALTER TABLE public.wms_shortage_list ENABLE ROW LEVEL SECURITY;

-- 인증 사용자 UPDATE (조치사항 입력 + 업로드 upsert)
DROP POLICY IF EXISTS "wms_shortage_update" ON public.wms_shortage_list;
CREATE POLICY "wms_shortage_update"
    ON public.wms_shortage_list FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
