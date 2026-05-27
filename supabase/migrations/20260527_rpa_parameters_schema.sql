-- rpa_jobs 에 파라미터 스키마 컬럼 추가
-- 수동 실행 시 유저가 입력할 파라미터 정의 (JSON 배열)
-- 예: [{"key":"start","label":"시작일","type":"date"},{"key":"end","label":"종료일","type":"date"}]
ALTER TABLE rpa_jobs
    ADD COLUMN IF NOT EXISTS parameters_schema JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN rpa_jobs.parameters_schema IS
    '수동 실행 시 입력 파라미터 정의. 예: [{"key":"start","label":"시작일","type":"date"}]';
