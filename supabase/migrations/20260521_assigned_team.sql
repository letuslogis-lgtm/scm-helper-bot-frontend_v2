-- logistics_issues 테이블에 이관 대상 팀 컬럼 추가
-- 관리자가 '이관' 버튼을 클릭할 때 어느 팀으로 넘어가는지 기록
-- 사용자 역할은 자신의 팀(profiles.team)에 assigned_team이 일치하는 건만 조회

ALTER TABLE public.logistics_issues
ADD COLUMN IF NOT EXISTS assigned_team TEXT;

COMMENT ON COLUMN public.logistics_issues.assigned_team IS '이관 대상 팀명 (profiles.team 값과 일치). NULL이면 이관 미처리 또는 직접 조치 건.';
