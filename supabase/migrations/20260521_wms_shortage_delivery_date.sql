-- wms_shortage_list에 납기일자 컬럼 추가
ALTER TABLE public.wms_shortage_list
    ADD COLUMN IF NOT EXISTS delivery_date date;

-- 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS wms_shortage_list_delivery_date_idx
    ON public.wms_shortage_list (delivery_date);
