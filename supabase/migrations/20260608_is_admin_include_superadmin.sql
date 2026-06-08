-- ============================================================
-- is_admin() 함수 재적용: 최고관리자 포함 확인
-- ============================================================
-- 이전 마이그레이션(20260606)이 미적용된 경우를 대비해 재실행.
-- CREATE OR REPLACE 이므로 중복 실행 안전.
--
-- 허용 role: '관리자', '최고관리자'
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
