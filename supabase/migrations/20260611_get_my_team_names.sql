-- ============================================================
-- 팀원 이름 목록 반환 함수
-- SECURITY DEFINER 로 RLS 우회 → 작업자도 같은 팀 프로필 조회 가능
-- 용도: MobileMyIssues.jsx 에서 팀 단위 이슈 필터링
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_team_names()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.name
  FROM public.profiles p
  WHERE p.team IS NOT NULL
    AND p.team = (
      SELECT team FROM public.profiles WHERE id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_team_names() TO authenticated;
