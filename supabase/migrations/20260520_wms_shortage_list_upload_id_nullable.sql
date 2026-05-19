-- RPA 자동 업로드 지원: upload_id NOT NULL 제약 해제
-- (수동 업로드는 upload_id 있음, RPA 업로드는 NULL 허용)
ALTER TABLE public.wms_shortage_list
ALTER COLUMN upload_id DROP NOT NULL;
