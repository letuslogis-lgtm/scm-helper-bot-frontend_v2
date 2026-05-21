-- logistics_issues 에 물류담당자 이관 메시지 컬럼 추가
-- 현장 원본(request_content)은 보존, 이관팀에 전달할 내용은 relay_content 에 별도 저장
-- 이관팀(사용자 역할)은 relay_content 만 보고, request_content(날것 텍스트)는 노출 안 함

ALTER TABLE public.logistics_issues
ADD COLUMN IF NOT EXISTS relay_content TEXT;

COMMENT ON COLUMN public.logistics_issues.relay_content IS '물류담당자가 이관팀(구매/생산/SCM)에 전달하는 정제된 요청 메시지. 현장 원본(request_content)은 유지하되, 이관팀에는 이 컬럼만 표시.';
