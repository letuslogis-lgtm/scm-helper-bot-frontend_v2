-- ============================================================
-- is_admin() 함수 수정: '관리자'가 포함된 모든 권한 그룹 인정
-- 기존: role = '관리자' (정확히 일치)
-- 변경: role LIKE '%관리자%' ('관리자', '최고관리자' 등 모두 포함)
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
    WHERE id = auth.uid() AND role LIKE '%관리자%'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
