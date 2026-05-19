-- wms_shortage_list에 source_center 컬럼 추가
ALTER TABLE public.wms_shortage_list
ADD COLUMN IF NOT EXISTS source_center text;
