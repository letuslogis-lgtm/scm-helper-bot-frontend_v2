-- ============================================================
-- D-2 결품 리스트 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wms_shortage_list (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,

    -- WMS 원본 데이터
    wave_name       text,                       -- WAVE명
    wave_type       text,                       -- WAVE 타입
    order_no        text,                       -- 오더번호
    order_name      text,                       -- 오더건명
    brand           text,                       -- OWNER
    channel         text,                       -- 유통채널
    item_code       text,                       -- 품목ID
    item_category   text,                       -- 제품구분
    vendor          text,                       -- 공급업체명
    shortage_qty    integer,                    -- CUT수량
    category        text,                       -- 구분 (재고부족 등)
    is_picked       text,                       -- 피킹여부 (Y/N)
    is_unshipped    text,                       -- 미출여부 (Y/N)
    action_note     text,                       -- 조치사항
    is_sales        text,                       -- 매출여부 (Y/N)
    is_cancel       text,                       -- 취소대상여부 (Y/N)
    wms_registered_by   text,                   -- 최초 등록자
    wms_registered_at   timestamptz,            -- 최초 등록 일시
    wms_updated_by      text,                   -- 최종 변경자
    wms_updated_at      timestamptz,            -- 최종 변경 일시

    -- 업로드 배치 관리
    upload_id       uuid        NOT NULL,       -- 같은 업로드 묶음 식별자
    upload_file     text,                       -- 업로드한 파일명
    upload_date     date        NOT NULL,       -- 업로드 기준일 (D-2 날짜)
    uploaded_by     text,                       -- 업로드한 사용자 이름

    -- 시스템
    created_at      timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_wms_shortage_upload_date  ON public.wms_shortage_list (upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_wms_shortage_item_code    ON public.wms_shortage_list (item_code);
CREATE INDEX IF NOT EXISTS idx_wms_shortage_vendor       ON public.wms_shortage_list (vendor);
CREATE INDEX IF NOT EXISTS idx_wms_shortage_brand        ON public.wms_shortage_list (brand);
CREATE INDEX IF NOT EXISTS idx_wms_shortage_upload_id    ON public.wms_shortage_list (upload_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.wms_shortage_list ENABLE ROW LEVEL SECURITY;

-- 인증 사용자 전체 조회
DROP POLICY IF EXISTS "wms_shortage_select" ON public.wms_shortage_list;
CREATE POLICY "wms_shortage_select"
    ON public.wms_shortage_list FOR SELECT
    TO authenticated
    USING (true);

-- 인증 사용자 INSERT (업로드)
DROP POLICY IF EXISTS "wms_shortage_insert" ON public.wms_shortage_list;
CREATE POLICY "wms_shortage_insert"
    ON public.wms_shortage_list FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 관리자만 DELETE
DROP POLICY IF EXISTS "wms_shortage_delete" ON public.wms_shortage_list;
CREATE POLICY "wms_shortage_delete"
    ON public.wms_shortage_list FOR DELETE
    TO authenticated
    USING (public.is_admin());
