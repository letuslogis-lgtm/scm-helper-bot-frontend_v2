-- ─────────────────────────────────────────────────
-- menu_permissions 테이블 생성
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.menu_permissions (
  menu_id       TEXT NOT NULL,
  action        TEXT NOT NULL,
  allowed_roles TEXT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (menu_id, action)
);

-- RLS 활성화
ALTER TABLE public.menu_permissions ENABLE ROW LEVEL SECURITY;

-- 로그인된 사용자 전체 읽기 허용
CREATE POLICY "read_menu_permissions"
  ON public.menu_permissions
  FOR SELECT TO authenticated
  USING (true);

-- 최고관리자만 쓰기 허용
CREATE POLICY "write_menu_permissions"
  ON public.menu_permissions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = '최고관리자')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = '최고관리자')
  );

-- ─────────────────────────────────────────────────
-- 초기 데이터
-- ─────────────────────────────────────────────────
INSERT INTO public.menu_permissions (menu_id, action, allowed_roles) VALUES
  -- 지게차 관리대장
  ('forklift', 'create',      ARRAY['최고관리자', '관리자']),
  ('forklift', 'bulk_create', ARRAY['최고관리자']),
  ('forklift', 'edit',        ARRAY['최고관리자', '관리자']),
  ('forklift', 'bulk_edit',   ARRAY['최고관리자']),
  ('forklift', 'delete',      ARRAY['최고관리자']),
  ('forklift', 'retire',      ARRAY['최고관리자', '관리자']),
  ('forklift', 'restore',     ARRAY['최고관리자']),
  ('forklift', 'export',      ARRAY['최고관리자', '관리자']),
  -- 일일점검
  ('forklift_check', 'approve', ARRAY['최고관리자', '관리자']),
  -- 이슈
  ('forklift_issue', 'accept',   ARRAY['최고관리자', '관리자']),
  ('forklift_issue', 'complete', ARRAY['최고관리자', '관리자']),
  ('forklift_issue', 'approve',  ARRAY['최고관리자', '관리자'])
ON CONFLICT (menu_id, action) DO NOTHING;
