-- ============================================================
-- is_admin() 함수 보안 강화: 패턴 매칭 → 화이트리스트
-- ============================================================
-- 기존 (20260605): role LIKE '%관리자%'
--   → '관리자 보조' 등 미래에 추가될 수 있는 role이 의도치 않게
--     관리자 권한을 획득할 위험
-- 변경: role IN ('관리자', '최고관리자')
--   → 명시적으로 허용된 role만 관리자 처리
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('관리자', '최고관리자')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
