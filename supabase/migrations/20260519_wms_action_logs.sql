-- ============================================================
-- wms_action_logs: 결품 조치사항 변경 이력 테이블
-- ============================================================

CREATE TABLE public.wms_action_logs (
    id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    shortage_id  uuid NOT NULL REFERENCES public.wms_shortage_list(id) ON DELETE CASCADE,
    action_type  text,
    action_detail text,
    updated_by   text,
    updated_at   timestamptz DEFAULT now()
);

-- shortage_id 기준 빠른 조회
CREATE INDEX wms_action_logs_shortage_id_idx ON public.wms_action_logs(shortage_id);

-- RLS
ALTER TABLE public.wms_action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select wms_action_logs"
ON public.wms_action_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert wms_action_logs"
ON public.wms_action_logs FOR INSERT TO authenticated WITH CHECK (true);
