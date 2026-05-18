-- ============================================================
-- 물류 마감 자동화 스키마
-- 2026-05-15
-- ============================================================

-- ------------------------------------------------------------
-- 1) products 테이블에 공장도가 추가
-- ------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS factory_price DECIMAL(15, 2);

-- ------------------------------------------------------------
-- 2) closing_uploads — 업로드 이력
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.closing_uploads (
    id              BIGSERIAL PRIMARY KEY,
    upload_type     TEXT NOT NULL,          -- 'inbound' | 'transfer' | 'cut_picking' | 'direct_cut' | 'returns' | 'parcel' | 'outbound_order' | 'wms_picking' | 'wms_wave'
    file_name       TEXT,
    closing_date    DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'processing', -- 'processing' | 'completed' | 'error'
    row_count       INTEGER,
    error_message   TEXT,
    uploaded_by     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 3) closing_raw_data — 업로드된 원시 데이터
--    각 엑셀 행을 JSONB로 저장 → 컬럼 구조 변경에 유연하게 대응
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.closing_raw_data (
    id              BIGSERIAL PRIMARY KEY,
    upload_id       BIGINT NOT NULL REFERENCES public.closing_uploads(id) ON DELETE CASCADE,
    upload_type     TEXT NOT NULL,
    closing_date    DATE NOT NULL,
    row_index       INTEGER,                -- 원본 행 번호 (디버깅용)

    -- 파싱 후 정규화된 핵심 필드 (매핑된 것만)
    company         TEXT,                   -- 회사 (퍼시스 / 일룸 / 시디즈 / 알로소 등)
    warehouse       TEXT,                   -- 창고 (양지1 / 양지2 / 양지3 등)
    item_code       TEXT,
    item_color      TEXT,
    quantity        INTEGER,
    amount          DECIMAL(15, 2),         -- 자동 계산: factory_price × quantity

    -- 브랜드 매핑 결과 (products 테이블 조인)
    brand           TEXT,
    factory_price   DECIMAL(15, 2),

    -- 항목별 추가 필드
    inbound_type    TEXT,                   -- 입고구분 (상품/생산/외주매입)
    wave_name       TEXT,                   -- WAVE명
    wave_type       TEXT,                   -- WAVE타입
    is_eligible     BOOLEAN,                -- 운송 해당여부

    raw_json        JSONB,                  -- 원본 행 전체 (원시 보존)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_closing_raw_upload ON public.closing_raw_data (upload_id);
CREATE INDEX IF NOT EXISTS idx_closing_raw_date   ON public.closing_raw_data (closing_date, upload_type);
CREATE INDEX IF NOT EXISTS idx_closing_raw_brand  ON public.closing_raw_data (brand, closing_date);

-- ------------------------------------------------------------
-- 4) closing_summary — 집계 결과 (일별/월별)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.closing_summary (
    id              BIGSERIAL PRIMARY KEY,
    period_type     TEXT NOT NULL,          -- 'daily' | 'monthly'
    period_date     DATE NOT NULL,          -- 일마감: 해당일 / 월마감: YYYY-MM-01
    summary_type    TEXT NOT NULL,          -- 'inbound' | 'outbound' | 'picking' | 'transport' | 'returns' | 'parcel' | 'cut_picking' | 'direct_cut'
    company         TEXT,
    warehouse       TEXT,
    brand           TEXT,
    inbound_type    TEXT,                   -- 상품/생산/외주매입 (입고 항목만)
    wave_type       TEXT,                   -- WAVE타입 (운송 항목만)
    is_eligible     BOOLEAN,                -- 해당여부 (운송 항목만)
    quantity        INTEGER DEFAULT 0,
    amount          DECIMAL(15, 2) DEFAULT 0,
    extra_data      JSONB,                  -- 항목별 추가 집계값
    upload_id       BIGINT REFERENCES public.closing_uploads(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (period_type, period_date, summary_type, company, warehouse, brand, inbound_type, wave_type)
);

CREATE INDEX IF NOT EXISTS idx_closing_summary_period ON public.closing_summary (period_type, period_date);
CREATE INDEX IF NOT EXISTS idx_closing_summary_type   ON public.closing_summary (summary_type, period_date);

-- ------------------------------------------------------------
-- 5) closing_config — 설정 저장
--    컬럼 매핑, 제외코드 마스터, 브랜드 구분 패턴 등
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.closing_config (
    id              BIGSERIAL PRIMARY KEY,
    config_type     TEXT NOT NULL,          -- 'column_mapping' | 'exclude_codes' | 'wave_rule' | 'brand_pattern'
    upload_type     TEXT,                   -- 어떤 업로드 유형에 적용되는 설정인지
    company         TEXT,
    warehouse       TEXT,
    config_key      TEXT NOT NULL,          -- 설정 키
    config_value    JSONB NOT NULL,         -- 설정 값 (유연하게 JSONB)
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (config_type, upload_type, company, warehouse, config_key)
);

-- ------------------------------------------------------------
-- 6) 기본 설정값 INSERT
-- ------------------------------------------------------------

-- WAVE 타입별 해당여부 규칙
INSERT INTO public.closing_config (config_type, upload_type, config_key, config_value, description)
VALUES (
    'wave_rule', 'wms_wave', 'eligibility',
    '{
        "AS(경인)": false,
        "AS(지방)": true,
        "경인(소액)": false,
        "경인(현장)": true,
        "지방(권역)": true,
        "지방(현장)": true,
        "택배": false,
        "수출": false,
        "전시품오더": true
    }',
    'WAVE타입별 운송출고 해당여부. 전시품오더는 WAVE명 추가 확인 필요'
)
ON CONFLICT (config_type, upload_type, company, warehouse, config_key) DO NOTHING;

-- 일룸 택배 품목 제외 코드 패턴
INSERT INTO public.closing_config (config_type, upload_type, company, warehouse, config_key, config_value, description)
VALUES (
    'exclude_codes', 'inbound', '일룸', '양지3', 'parcel_item_prefixes',
    '["HVCS40", "HCS40"]',
    '일룸 양지3센터: 택배 출고 품목 제외 코드 접두어'
)
ON CONFLICT (config_type, upload_type, company, warehouse, config_key) DO NOTHING;

-- 슬로우베드 브랜드 코드 패턴
INSERT INTO public.closing_config (config_type, upload_type, config_key, config_value, description)
VALUES (
    'brand_pattern', NULL, 'slowbed_prefix',
    '"S"',
    '품목코드가 S로 시작하면 슬로우베드'
)
ON CONFLICT (config_type, upload_type, company, warehouse, config_key) DO NOTHING;

-- 데스커 시공팀 현장 판별 패턴
INSERT INTO public.closing_config (config_type, upload_type, company, config_key, config_value, description)
VALUES (
    'brand_pattern', 'wms_wave', '데스커', 'construction_team_prefix',
    '"H"',
    '데스커: 시공팀명이 H로 시작하면 현장팀'
)
ON CONFLICT (config_type, upload_type, company, warehouse, config_key) DO NOTHING;

-- ------------------------------------------------------------
-- 7) RLS
-- ------------------------------------------------------------
ALTER TABLE public.closing_uploads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_raw_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_summary  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_config   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON public.closing_uploads
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_all" ON public.closing_raw_data
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_all" ON public.closing_summary
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_all" ON public.closing_config
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
