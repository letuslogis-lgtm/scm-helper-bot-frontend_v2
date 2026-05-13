-- ai_analysis_logs 테이블 생성
-- AI 분석 이력 저장 및 관리자 보정 데이터 수집 (Fine-tuning 학습용)

CREATE TABLE IF NOT EXISTS ai_analysis_logs (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_menu          TEXT        NOT NULL,   -- 'AccidentManagement' | 'MobileBarcode'
    target_id            TEXT,                   -- 원본 레코드 ID (사고분석: logistics_accidents.id)
    original_text        TEXT,                   -- AI 판단에 사용된 원본 텍스트
    ai_analyzed_cause    TEXT,                   -- AI 판별 대분류 원인
    ai_cause_detail      TEXT,                   -- AI 판별 소분류 코드 (예: W-01)
    ai_cause_summary     TEXT,                   -- AI 분석 요약 설명
    ai_confidence        TEXT CHECK (ai_confidence IN ('high', 'medium', 'low', 'human')),
    low_confidence_reason TEXT,                  -- 신뢰도 낮음 사유
    is_reviewed          BOOLEAN     NOT NULL DEFAULT FALSE,
    reviewed_at          TIMESTAMPTZ,
    corrected_cause      TEXT,                   -- 관리자 보정 대분류
    corrected_detail     TEXT,                   -- 관리자 보정 소분류
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 자주 쓰는 필터/정렬 컬럼 인덱스
CREATE INDEX IF NOT EXISTS idx_ai_logs_source_menu ON ai_analysis_logs(source_menu);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at  ON ai_analysis_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_is_reviewed  ON ai_analysis_logs(is_reviewed);

-- RLS 활성화
ALTER TABLE ai_analysis_logs ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자: 조회 허용
CREATE POLICY "ai_logs_select" ON ai_analysis_logs
    FOR SELECT TO authenticated USING (true);

-- 인증된 사용자: 삽입 허용 (모바일 바코드 로깅)
CREATE POLICY "ai_logs_insert" ON ai_analysis_logs
    FOR INSERT TO authenticated WITH CHECK (true);

-- 인증된 사용자: 수정 허용 (관리자 보정)
CREATE POLICY "ai_logs_update" ON ai_analysis_logs
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
