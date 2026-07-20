-- outgoing_notes UPDATE RLS 정책 추가 (관리자 이상)
CREATE POLICY "outgoing_notes_update"
  ON public.outgoing_notes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('관리자', '최고관리자')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('관리자', '최고관리자')
    )
  );
