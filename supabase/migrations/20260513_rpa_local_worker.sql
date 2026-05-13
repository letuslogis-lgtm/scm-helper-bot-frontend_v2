-- ============================================================
-- Phase 1: rpa_jobs / rpa_runs 테이블 보강
-- ------------------------------------------------------------
-- 목적:
--   Windows 로컬 Worker (rpa/worker.mjs) 가 메뉴에서 통합 관리되는
--   봇들을 cron / 수동 trigger 로 실행할 수 있도록
--   필요한 컬럼들을 추가한다.
--
-- 안전 설계:
--   - 모든 ADD COLUMN 은 IF NOT EXISTS — 이미 있는 컬럼은 그대로 둠
--   - default 값을 충분히 둬서 기존 row 에 영향 없음
-- ============================================================

-- ------------------------------------------------------------
-- 1) rpa_jobs 보강
-- ------------------------------------------------------------

-- 자동 실행 ON/OFF (auto trigger_type 일 때만 의미 있음)
ALTER TABLE public.rpa_jobs
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

-- 어디서 실행되는지 구분
--   'local'          → 사내 Windows Worker (rpa/worker.mjs)
--   'github_actions' → 외부 GitHub Actions (기존 main_runner.py)
ALTER TABLE public.rpa_jobs
  ADD COLUMN IF NOT EXISTS runner_type TEXT NOT NULL DEFAULT 'local';

-- Worker 가 실제로 실행할 명령어
-- 예: 'node scripts/sync_products.mjs'
ALTER TABLE public.rpa_jobs
  ADD COLUMN IF NOT EXISTS script_command TEXT;

-- 명령 실행 시 cwd (working directory). 비어있으면 프로젝트 루트
ALTER TABLE public.rpa_jobs
  ADD COLUMN IF NOT EXISTS working_dir TEXT;

-- 사용자에게 보여줄 봇 설명 (UI 에서 표시)
ALTER TABLE public.rpa_jobs
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ------------------------------------------------------------
-- 2) rpa_runs 보강
-- ------------------------------------------------------------

-- 어떤 봇의 실행 이력인지
ALTER TABLE public.rpa_runs
  ADD COLUMN IF NOT EXISTS definition_id UUID REFERENCES public.rpa_jobs(id) ON DELETE CASCADE;

-- 실행을 누가 trigger 했는지
--   'schedule' → cron 자동
--   'manual'   → 사용자가 메뉴에서 "지금 실행" 클릭
ALTER TABLE public.rpa_runs
  ADD COLUMN IF NOT EXISTS triggered_by TEXT;

-- 실행 결과 메시지 / 에러 (이미 있을 가능성 있음, 안전하게 추가)
ALTER TABLE public.rpa_runs
  ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE public.rpa_runs
  ADD COLUMN IF NOT EXISTS exit_code INTEGER;

-- stdout / stderr 로그 (단순 텍스트로 저장. 큰 경우 Storage URL 만 저장하도록 변경 가능)
ALTER TABLE public.rpa_runs
  ADD COLUMN IF NOT EXISTS stdout_log TEXT;

ALTER TABLE public.rpa_runs
  ADD COLUMN IF NOT EXISTS stderr_log TEXT;

-- status 명확화 (이미 컬럼 있을 것이고, 사용 가능한 값은 다음과 같음)
--   'pending'  : 큐에 등록, 아직 실행 안 함
--   'running'  : 실행 중
--   'success'  : 성공 종료
--   'failed'   : 실패 종료
--   'timeout'  : 시간 초과

-- ------------------------------------------------------------
-- 3) 인덱스 (Worker 가 자주 조회하는 패턴 최적화)
-- ------------------------------------------------------------

-- Worker 가 시작 시 활성화된 로컬 봇만 골라 cron 등록
CREATE INDEX IF NOT EXISTS idx_rpa_jobs_local_enabled
  ON public.rpa_jobs (runner_type, enabled)
  WHERE runner_type = 'local';

-- Worker 가 Realtime 으로 수동 trigger 만 감지
CREATE INDEX IF NOT EXISTS idx_rpa_runs_pending
  ON public.rpa_runs (status, created_at)
  WHERE status = 'pending';

-- 최근 실행 이력 조회
CREATE INDEX IF NOT EXISTS idx_rpa_runs_definition
  ON public.rpa_runs (definition_id, started_at DESC);

-- ------------------------------------------------------------
-- 4) 적용 확인 (수동 실행용)
-- ------------------------------------------------------------
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'rpa_jobs'
--   ORDER BY ordinal_position;

-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'rpa_runs'
--   ORDER BY ordinal_position;
