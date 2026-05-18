-- ============================================================
-- vendor_aliases 테이블
-- raw_name: products의 vendor 또는 production_line 원본값
-- canonical_name: 정규화된 표시명 (NULL이면 차트에서 제외)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vendor_aliases (
    id              serial PRIMARY KEY,
    raw_name        text NOT NULL UNIQUE,
    canonical_name  text,           -- NULL = 제외
    created_at      timestamptz DEFAULT now()
);

-- 초기 데이터
INSERT INTO public.vendor_aliases (raw_name, canonical_name) VALUES
    -- 정규화 (rename)
    ('안성물류센터',   '퍼시스안성'),
    ('팀스음성',       '시디즈음성'),
    ('퍼시스안성3',    '퍼시스안성'),
    -- 제외 (NULL = 차트 미표시)
    ('수림1',          NULL),
    ('수림충주1',      NULL),
    ('팀스충주1',      NULL),
    ('팀스안성센터',   NULL),
    ('시흥아울렛',     NULL),
    ('성남물류센터',   NULL)
ON CONFLICT (raw_name) DO UPDATE
    SET canonical_name = EXCLUDED.canonical_name;

-- products 테이블에 display_vendor 컬럼 추가
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS display_vendor text;

-- RLS: 인증 사용자 조회 허용
ALTER TABLE public.vendor_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendor_aliases_select" ON public.vendor_aliases;
CREATE POLICY "vendor_aliases_select"
    ON public.vendor_aliases FOR SELECT
    TO authenticated
    USING (true);
