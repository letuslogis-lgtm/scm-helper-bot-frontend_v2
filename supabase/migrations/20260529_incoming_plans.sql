-- incoming_plans: MS-SQL 입고계획 캐시 테이블 (3분 주기 sync)
CREATE TABLE IF NOT EXISTS incoming_plans (
    id               BIGSERIAL PRIMARY KEY,
    company          TEXT NOT NULL,            -- 'fursys' | 'sidiz'
    plan_date        DATE,                      -- 입고예정일
    plan_seq         TEXT NOT NULL DEFAULT '',  -- 입고차수
    item_code        TEXT NOT NULL,             -- 단품코드
    item_color       TEXT NOT NULL DEFAULT '',  -- 단품색상
    item_name        TEXT,                      -- 단품명칭
    inbound_type     TEXT,                      -- 입고구분
    vendor           TEXT,                      -- 공급업체
    inbound_category TEXT,                      -- 입고유형
    planned_qty      NUMERIC,                   -- 입고예정량
    is_completed     BOOLEAN DEFAULT FALSE,     -- 완료여부
    synced_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company, item_code, item_color, plan_date, plan_seq)
);

CREATE INDEX IF NOT EXISTS idx_incoming_plans_item_code ON incoming_plans (item_code);
CREATE INDEX IF NOT EXISTS idx_incoming_plans_plan_date  ON incoming_plans (plan_date);
