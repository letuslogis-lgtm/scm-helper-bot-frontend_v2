-- logistics_issues 테이블에 HQ(고화질) 이미지 URL 컬럼 추가
-- PWA 업로드 시 AI용(1024px/0.6) + 라이트박스용(1920px/0.85) 두 버전 저장

ALTER TABLE logistics_issues
  ADD COLUMN IF NOT EXISTS image_url_hq TEXT;

COMMENT ON COLUMN logistics_issues.image_url_hq IS
  'HQ 이미지 URL 목록 (쉼표 구분). 라이트박스 뷰어에서 사용. 1920px / quality 0.85로 압축.';
