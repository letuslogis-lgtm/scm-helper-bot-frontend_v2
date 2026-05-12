-- ============================================================
-- Step 2: profiles 테이블 RLS 정책
-- ------------------------------------------------------------
-- 목적: 클라이언트에서 service_role 키 없이도 profiles 테이블을
--      안전하게 SELECT/UPDATE/INSERT/DELETE 할 수 있도록 정책 부여
--
-- 정책 요약:
--   - 본인은 자기 행만 SELECT/UPDATE 가능
--   - 관리자(role='관리자')는 모든 행에 대해 모든 작업 가능
--   - 그 외에는 차단
-- ============================================================

-- ------------------------------------------------------------
-- 1) is_admin() helper function
--    SECURITY DEFINER 로 만들어서 RLS 재귀(profiles 정책 안에서
--    profiles를 다시 셀렉트하면 무한루프) 를 회피한다.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = '관리자'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ------------------------------------------------------------
-- 2) profiles 테이블 RLS 활성화
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 기존 정책이 있을 수 있으니 동일 이름은 삭제 후 재생성
DROP POLICY IF EXISTS "profiles_self_select"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all"     ON public.profiles;

-- ------------------------------------------------------------
-- 3) 본인 자기 행 SELECT (로그인 직후 useAuth 가 자기 프로필 읽기)
-- ------------------------------------------------------------
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- ------------------------------------------------------------
-- 4) 본인 자기 행 UPDATE (Header의 내 정보 수정 = SharedUI:166)
-- ------------------------------------------------------------
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------
-- 5) 관리자: 모든 행에 대해 모든 작업 가능
--    UserManagement 의 신규 등록/일괄 수정/삭제/엑셀 업로드 전부 커버
-- ------------------------------------------------------------
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 적용 확인 쿼리 (수동 실행용)
-- ============================================================
-- SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'profiles';
