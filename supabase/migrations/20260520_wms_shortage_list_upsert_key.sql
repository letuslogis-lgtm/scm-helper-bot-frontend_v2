-- RPA upsert를 위한 자연키 유니크 제약
-- (같은 센터+날짜+오더+품목+웨이브는 1건만 존재)
ALTER TABLE public.wms_shortage_list
ADD CONSTRAINT uq_wms_shortage_natural_key
UNIQUE (source_center, upload_date, order_no, item_code, wave_name);
