-- ============================================================
-- WMS 재고현황 스냅샷 테이블 재설계 (로우데이터 단일 테이블)
-- 기존: 창고×화주 집계 수준 → 변경: SKU×로케이션 로우 수준
-- wms_stock_summary VIEW로 요약 집계 제공
-- ============================================================

-- 기존 테이블 제거 (CASCADE로 RLS 정책 포함)
DROP TABLE IF EXISTS public.wms_stock_snapshots CASCADE;

-- 로우 데이터 테이블 (WMS 다운로드 원본 + 창고 정보 추가)
CREATE TABLE public.wms_stock_snapshots (
    id               bigserial    PRIMARY KEY,
    snapshot_date    date         NOT NULL,
    warehouse_id     text         NOT NULL,   -- RPA가 주입 (YA, Y2, Y3, AN, SE)
    warehouse_name   text         NOT NULL,   -- RPA가 주입 (양지1물류센터 등)
    owner            text,                    -- OWNER (화주명)
    location_id      text,                    -- LOCATION ID
    item_id          text,                    -- 품목ID
    item_name        text,                    -- 품목명
    stock_qty        int          NOT NULL DEFAULT 0,   -- 현 재고 수량
    stock_type       text,                    -- 재고 구분 (재고/기타)
    use_type         text,                    -- 사용 구분 (사용/불용)
    packing_unit     int,                     -- 적재단위
    factory_price    int          NOT NULL DEFAULT 0,   -- 공장도가
    product_category text,                    -- 제품구분
    stock_amount     bigint       NOT NULL DEFAULT 0,   -- 재고금액
    UNIQUE (snapshot_date, warehouse_id, item_id, location_id)
);

CREATE INDEX idx_wms_stock_snap_date      ON public.wms_stock_snapshots (snapshot_date DESC);
CREATE INDEX idx_wms_stock_snap_wh_date   ON public.wms_stock_snapshots (warehouse_id, snapshot_date);
CREATE INDEX idx_wms_stock_snap_owner     ON public.wms_stock_snapshots (owner, snapshot_date);

-- RLS: 로그인 사용자 읽기, 쓰기는 service_role
ALTER TABLE public.wms_stock_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read wms_stock_snapshots"
    ON public.wms_stock_snapshots FOR SELECT
    TO authenticated USING (true);

-- ============================================================
-- 요약 VIEW: 프론트엔드 summary 탭용 (창고×화주 집계)
-- 컬럼명은 기존 프론트엔드 코드와 호환되도록 alias 처리
-- ============================================================
CREATE OR REPLACE VIEW public.wms_stock_summary AS
SELECT
    snapshot_date,
    warehouse_id,
    warehouse_name,
    owner                                                                   AS brand,
    owner                                                                   AS company_id,
    COUNT(DISTINCT item_id)                                                 AS item_count,
    SUM(stock_qty)                                                          AS stock_qty,
    SUM(stock_amount)                                                       AS stock_amount,
    COUNT(*) FILTER (WHERE stock_qty > 10000)                              AS anomaly_count,
    COUNT(*) FILTER (WHERE factory_price = 0 OR factory_price IS NULL)     AS unpriced_count
FROM public.wms_stock_snapshots
GROUP BY snapshot_date, warehouse_id, warehouse_name, owner;
