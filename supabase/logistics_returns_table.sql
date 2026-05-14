-- logistics_returns 테이블 생성
-- 오출고·과출고 품목 회수 추적 관리

CREATE TABLE public.logistics_returns (
    id               BIGSERIAL PRIMARY KEY,

    -- 섹션 1: 센터 현장 관리자 작성
    incident_date    DATE,
    incident_center  TEXT,           -- 발생센터 (workers.workplace)
    writer           TEXT,           -- 작성자
    brand            TEXT,           -- 브랜드
    item_code        TEXT,           -- 품목코드
    color            TEXT,           -- 색상
    quantity         INTEGER,        -- 수량

    -- 섹션 2: 센터 시공 관리자 작성
    incident_reason      TEXT,       -- 발생 사유 (시공팀 상차 누락 / 센터 과/오출 / 연기건 입시차)
    construction_handler TEXT,       -- 확인 담당자
    construction_action  TEXT,       -- 조치 여부 (조치 완료 / 센터 판납)

    -- 섹션 3: 센터 현장 관리자 작성 (반납)
    return_center    TEXT,           -- 반납 센터 (workers.workplace)
    return_date      DATE,           -- 반납 일자
    return_handler   TEXT,           -- 반납 담당자

    -- 섹션 4: 수신센터 담당자 작성
    receive_center   TEXT,           -- 수신센터 (workers.workplace)
    receiver         TEXT,           -- 수신자
    receive_action   TEXT,           -- 조치 여부 (수령 완료)
    is_completed     BOOLEAN DEFAULT FALSE,  -- 완결 여부 (수령 완료 시 자동 true)

    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE public.logistics_returns ENABLE ROW LEVEL SECURITY;

-- 로그인한 사용자 전체 접근 허용
CREATE POLICY "authenticated_all" ON public.logistics_returns
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
