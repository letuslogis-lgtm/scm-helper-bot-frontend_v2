-- WMS 재고보유현황 일별 스냅샷 테이블
-- RPA(wms_stock_report.py)가 매일 창고×화주 단위로 집계 후 upsert
CREATE TABLE IF NOT EXISTS public.wms_stock_snapshots (
    id              bigserial primary key,
    snapshot_date   date        not null,
    warehouse_id    text        not null,   -- WMS 창고 코드 (YA, Y2, Y3, AN, SE)
    warehouse_name  text        not null,   -- 창고명 (양지1물류센터 등)
    company_id      text        not null,   -- 화주 코드 (ownerId)
    company_name    text        not null,   -- 화주명 (ownerNm)
    item_count      int         not null default 0,   -- SKU 수
    stock_qty       bigint      not null default 0,   -- 재고수량 합계
    stock_amount    bigint      not null default 0,   -- 재고금액 합계 (공장도가 × 수량)
    anomaly_count   int         not null default 0,   -- 이상값 건수 (수량 > 10,000)
    unpriced_count  int         not null default 0,   -- 단가 미등록 SKU 수
    created_at      timestamptz not null default now(),
    UNIQUE (snapshot_date, warehouse_id, company_id)
);

-- 최신 날짜 조회 최적화용 인덱스
CREATE INDEX IF NOT EXISTS idx_wms_stock_snapshots_date
    ON public.wms_stock_snapshots (snapshot_date DESC);

-- RLS: 로그인한 사용자는 읽기 가능, 쓰기는 service_role 만
ALTER TABLE public.wms_stock_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read wms_stock_snapshots"
    ON public.wms_stock_snapshots FOR SELECT
    TO authenticated USING (true);
