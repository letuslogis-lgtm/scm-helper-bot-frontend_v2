-- ============================================================
-- 입고 실적 마감: 4개 테이블 생성
-- ============================================================

-- 1. 업로드 배치 관리
CREATE TABLE public.inbound_upload_batches (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_type     TEXT        NOT NULL,
  business_date DATE        NOT NULL,
  warehouse_name TEXT,
  row_count     INT         NOT NULL DEFAULT 0,
  uploaded_by   UUID        REFERENCES public.profiles(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inbound_batches_file_type_check
    CHECK (file_type IN ('입고실적', '반입집계', '반출집계', 'WMS부족컷', 'WMS직송컷'))
);

-- 2. 입고실적등록
CREATE TABLE public.inbound_performance (
  id            UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID   NOT NULL REFERENCES public.inbound_upload_batches(id) ON DELETE CASCADE,
  business_date DATE   NOT NULL,
  warehouse_name TEXT,
  전표번호      TEXT,
  item_code     TEXT,
  item_color    TEXT,
  brand_category TEXT,
  단품명칭      TEXT,
  수량          INT,
  입고금액      BIGINT,
  입고유형      TEXT,
  공급처        TEXT
);

-- 3. 반출입 집계 (반입/반출 통합)
CREATE TABLE public.inbound_transfer (
  id            UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID   NOT NULL REFERENCES public.inbound_upload_batches(id) ON DELETE CASCADE,
  business_date DATE   NOT NULL,
  transfer_type TEXT   NOT NULL,
  other_warehouse TEXT,
  전표번호      TEXT,
  item_code     TEXT,
  item_color    TEXT,
  brand_category TEXT,
  단품명        TEXT,
  수량          INT,
  금액          BIGINT,
  CONSTRAINT inbound_transfer_type_check CHECK (transfer_type IN ('반입', '반출'))
);

-- 4. WMS CUT 리스트
CREATE TABLE public.inbound_cut_list (
  id            UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID   NOT NULL REFERENCES public.inbound_upload_batches(id) ON DELETE CASCADE,
  business_date DATE   NOT NULL,
  cut_type      TEXT   NOT NULL,
  item_code     TEXT,
  item_color    TEXT,
  brand_category TEXT,
  wave명        TEXT,
  오더번호      TEXT,
  오더건명      TEXT,
  cut수량       INT,
  구분          TEXT,
  공급업체명    TEXT,
  owner         TEXT,
  유통채널      TEXT,
  제품구분      TEXT,
  CONSTRAINT inbound_cut_type_check CHECK (cut_type IN ('부족컷', '직송컷'))
);

-- 인덱스
CREATE INDEX idx_inbound_batches_date     ON public.inbound_upload_batches(business_date);
CREATE INDEX idx_inbound_perf_batch       ON public.inbound_performance(batch_id);
CREATE INDEX idx_inbound_perf_date        ON public.inbound_performance(business_date);
CREATE INDEX idx_inbound_transfer_batch   ON public.inbound_transfer(batch_id);
CREATE INDEX idx_inbound_transfer_date    ON public.inbound_transfer(business_date);
CREATE INDEX idx_inbound_cut_batch        ON public.inbound_cut_list(batch_id);
CREATE INDEX idx_inbound_cut_date         ON public.inbound_cut_list(business_date);

-- RLS 활성화
ALTER TABLE public.inbound_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_performance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_transfer       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_cut_list       ENABLE ROW LEVEL SECURITY;

-- 정책: 인증 사용자 전체 허용
CREATE POLICY "inbound_batches_all"     ON public.inbound_upload_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inbound_performance_all" ON public.inbound_performance    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inbound_transfer_all"    ON public.inbound_transfer       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inbound_cut_list_all"    ON public.inbound_cut_list       FOR ALL TO authenticated USING (true) WITH CHECK (true);
