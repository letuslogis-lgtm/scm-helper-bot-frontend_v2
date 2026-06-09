import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';




// ✖️ 닫기 아이콘
const CloseIcon = () => (
 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
);

// 🗄️ 시스템 데이터 맵 (테이블 추가/변경 시 여기를 업데이트)
// 마지막 업데이트: 2026-06-09
const DB_DICTIONARY = {
 profiles: {
  name: '사용자 계정/권한 프로필 (profiles)',
  description: '앱에 접속하는 모든 사용자의 계정 정보 및 메뉴 접근 권한 관리',
  columns: [
   { name: 'id',               type: 'uuid',        desc: '고유 식별자 (Supabase Auth UID와 동일)' },
   { name: 'login_id',         type: 'text',        desc: '로그인 아이디 (이메일 앞부분)' },
   { name: 'name',             type: 'text',        desc: '사용자 이름' },
   { name: 'role',             type: 'text',        desc: '권한 그룹 (최고관리자 / 관리자 / 사용자)' },
   { name: 'team',             type: 'text',        desc: '소속 팀' },
   { name: 'brands',           type: 'text',        desc: '소속 브랜드' },
   { name: 'managed_vendors',  type: 'text',        desc: '담당 업체 목록 (쉼표 구분)' },
   { name: 'managed_brands',   type: 'text',        desc: '담당 브랜드 목록 (쉼표 구분)' },
   { name: 'accessible_menus', type: 'text',        desc: '접근 가능한 메뉴 ID 목록 (쉼표 구분)' },
   { name: 'workplace',        type: 'text',        desc: '근무 센터명' },
   { name: 'slack_email',      type: 'text',        desc: '슬랙 알림 수신용 이메일' },
   { name: 'company',          type: 'text',        desc: '소속 회사 (fursys / sidiz)' },
   { name: 'status',           type: 'text',        desc: '계정 상태 (정상 / 정지)' },
   { name: 'created_at',       type: 'timestamptz', desc: '계정 생성 일시' },
  ],
  usages: [
   { menu: '👥 사용자 관리',      file: 'UserManagement.jsx', action: 'SELECT / INSERT / UPDATE / DELETE', desc: '사용자 목록 조회, 권한/팀/담당 업체 관리' },
   { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx',         action: 'SELECT',                           desc: '로그인 사용자의 기본 정보 표출' },
   { menu: '전역 설정',           file: 'SharedUI.jsx',       action: 'UPDATE',                           desc: '비밀번호 및 내 정보 변경' },
  ]
 },
 logistics_issues: {
  name: '입고 특이사항 (logistics_issues)',
  description: '입고 시 발생하는 수량부족/오포장/파손 등의 이슈를 추적 및 관리하는 핵심 테이블. 모바일 등록 → 관리자 처리 → 작업자 피드백의 양방향 흐름',
  columns: [
   { name: 'id',                     type: 'uuid',        desc: '고유 식별자' },
   { name: 'reception_no',           type: 'text',        desc: '접수 번호' },
   { name: 'brand',                  type: 'text',        desc: '브랜드명' },
   { name: 'vendor',                 type: 'text',        desc: '협력사/벤더' },
   { name: 'item_code',              type: 'text',        desc: '품목코드 (단품코드-색상, 예: A1234-BK)' },
   { name: 'issue_type',             type: 'text',        desc: '이슈 유형 (파손 / 수량부족 등)' },
   { name: 'status',                 type: 'text',        desc: '처리 상태 (접수 / 조치대기 / 조치완료 등)' },
   { name: 'reporter',               type: 'text',        desc: '최초 등록자 (작업자)' },
   { name: 'final_handler',          type: 'text',        desc: '최종 처리 담당자' },
   { name: 'action_content',         type: 'text',        desc: '관리자 조치 내용' },
   { name: 'assigned_team',          type: 'text',        desc: '이관 대상 팀명 (NULL=미이관)' },
   { name: 'relay_content',          type: 'text',        desc: '이관팀에 전달하는 정제된 요청 메시지' },
   { name: 'worker_response',        type: 'text',        desc: '작업자 조치결과 메모' },
   { name: 'worker_response_photos', type: 'text',        desc: '작업자 조치 사진 URL 목록 (쉼표 구분)' },
   { name: 'image_url',              type: 'text',        desc: '접수 시 첨부 이미지 URL' },
   { name: 'image_url_hq',           type: 'text',        desc: 'HQ 고화질 이미지 URL 목록 (쉼표 구분)' },
   { name: 'is_notified',            type: 'boolean',     desc: '작업자에게 알림 발송 여부' },
   { name: 'feedback_sent_at',       type: 'timestamptz', desc: '피드백 발송 일시' },
   { name: 'resolved_at',            type: 'timestamptz', desc: '처리 완료 일시' },
   { name: 'created_at',             type: 'timestamptz', desc: '등록 일시' },
  ],
  usages: [
   { menu: '📊 특이사항 대시보드', file: 'LogisticsDashboard.jsx',    action: 'SELECT',                           desc: '브랜드별, 업체별 이슈 발생 통계 차트' },
   { menu: '📝 특이사항 LIST',     file: 'IssueList.jsx',             action: 'SELECT / UPDATE / INSERT / DELETE', desc: '이슈 목록 조회, 상태 변경, 신규 등록' },
   { menu: '🔧 지원센터',          file: 'SupportCenter.jsx',         action: 'SELECT / UPDATE',                  desc: '관리자의 이관·조치 처리' },
   { menu: '📱 모바일 이슈 등록',  file: 'MobileIssueRegister.jsx',   action: 'INSERT',                           desc: '바코드 스캔 후 특이사항 등록' },
   { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx',                action: 'SELECT',                           desc: '미처리 건수 통계 표시' },
  ]
 },
 logistics_returns: {
  name: '회수품/선출고 관리 (logistics_returns)',
  description: '오출고·과출고 발생 시 품목 회수 및 선출고 프로세스 추적. 4단계 흐름: 현장접수 → 시공확인 → 반납처리 → 입고확인',
  columns: [
   { name: 'id',                   type: 'bigserial',   desc: '고유 식별자' },
   { name: 'type',                 type: 'text',        desc: '구분 (잔여품 / 선출고)' },
   { name: 'incident_date',        type: 'date',        desc: '발생 일자' },
   { name: 'incident_center',      type: 'text',        desc: '발생 센터' },
   { name: 'writer',               type: 'text',        desc: '작성자' },
   { name: 'brand',                type: 'text',        desc: '브랜드' },
   { name: 'item_code',            type: 'text',        desc: '품목코드' },
   { name: 'color',                type: 'text',        desc: '색상' },
   { name: 'quantity',             type: 'integer',     desc: '수량' },
   { name: 'incident_reason',      type: 'text',        desc: '발생 사유' },
   { name: 'construction_handler', type: 'text',        desc: '시공 확인 담당자' },
   { name: 'construction_action',  type: 'text',        desc: '시공 조치 여부' },
   { name: 'return_center',        type: 'text',        desc: '반납 센터' },
   { name: 'return_date',          type: 'date',        desc: '반납 일자' },
   { name: 'return_handler',       type: 'text',        desc: '반납 담당자' },
   { name: 'receive_center',       type: 'text',        desc: '수신 센터' },
   { name: 'receiver',             type: 'text',        desc: '수신자' },
   { name: 'receive_action',       type: 'text',        desc: '수신 후 조치' },
   { name: 'is_recovered',         type: 'boolean',     desc: '회수 완료 여부' },
   { name: 'is_completed',         type: 'boolean',     desc: '전체 프로세스 완결 여부' },
   { name: 'created_at',           type: 'timestamptz', desc: '등록 일시' },
   { name: 'updated_at',           type: 'timestamptz', desc: '최종 수정 일시' },
  ],
  usages: [
   { menu: '📦 회수품/선출고 관리', file: 'ReturnsManagement.jsx',     action: 'SELECT / INSERT / UPDATE / DELETE', desc: '회수/선출고 목록 조회 및 단계별 처리' },
   { menu: '📱 모바일 회수품 등록', file: 'MobileReturnsRegister.jsx', action: 'INSERT',                           desc: '현장에서 직접 회수품 등록' },
  ]
 },
 logistics_accidents: {
  name: '출고 사고 분석 (logistics_accidents)',
  description: '상하차 작업 및 운송 중 발생하는 파손/분실 사고 관리. RPA가 ERP·WMS 데이터를 자동 적재하고 관리자가 원인·귀책을 분석',
  columns: [
   { name: 'id',                 type: 'uuid',        desc: '고유 식별자' },
   { name: 'order_no',           type: 'text',        desc: '오더번호' },
   { name: 'item_code',          type: 'text',        desc: '품목코드' },
   { name: 'brand',              type: 'text',        desc: '브랜드' },
   { name: 'status',             type: 'text',        desc: '처리 상태 (원인 파악 중 / 처리 완료 등)' },
   { name: 'handler_name',       type: 'text',        desc: '담당자명' },
   { name: 'responsible_dept',   type: 'text',        desc: '귀책 부서' },
   { name: 'cause_type',         type: 'text',        desc: '사고 원인 대분류' },
   { name: 'cause_detail',       type: 'text',        desc: '사고 원인 소분류 코드 (예: W-01)' },
   { name: 'zone',               type: 'text',        desc: '발생 구역' },
   { name: 'shift',              type: 'text',        desc: '발생 교대 (오전/오후)' },
   { name: 'worker',             type: 'text',        desc: '관련 작업자' },
   { name: 'ai_confidence',      type: 'text',        desc: 'AI 분석 신뢰도 (high / medium / low / human)' },
   { name: 'service_date',       type: 'date',        desc: '서비스 일자' },
   { name: 'is_delayed',         type: 'boolean',     desc: '납기 지연 여부' },
   { name: 'updated_at',         type: 'timestamptz', desc: '최종 업데이트 일시' },
   { name: 'created_at',         type: 'timestamptz', desc: '등록 일시' },
  ],
  usages: [
   { menu: '📈 사고분석 대시보드',  file: 'AccidentDashboard.jsx',        action: 'SELECT',                           desc: '사고 트렌드 및 원인별 통계 차트' },
   { menu: '📋 사고분석 LIST',      file: 'AccidentList.jsx',             action: 'SELECT / UPDATE / INSERT / DELETE', desc: '사고 목록 조회, 원인·귀책 처리' },
   { menu: '📄 사고분석 보고서',    file: 'AccidentAnalyticsReport.jsx',  action: 'SELECT',                           desc: '기간별 사고분석 보고서 생성' },
   { menu: '🏠 나의 워크스페이스',  file: 'MyHome.jsx',                   action: 'SELECT',                           desc: '내 담당 사고 미처리 건수 통계' },
  ]
 },
 wms_shortage_list: {
  name: 'D-2 결품 리스트 (wms_shortage_list)',
  description: 'WMS에서 D-2(출고예정 2일 전) 기준 재고부족 품목 목록. RPA(wms_extract.py)가 매일 5개 센터에서 자동 추출하여 UPSERT',
  columns: [
   { name: 'id',           type: 'uuid',        desc: '고유 식별자' },
   { name: 'wave_name',    type: 'text',        desc: 'WAVE명' },
   { name: 'wave_type',    type: 'text',        desc: 'WAVE 타입' },
   { name: 'order_no',     type: 'text',        desc: '오더번호' },
   { name: 'order_name',   type: 'text',        desc: '오더건명' },
   { name: 'brand',        type: 'text',        desc: '화주(브랜드)' },
   { name: 'channel',      type: 'text',        desc: '유통채널' },
   { name: 'item_code',    type: 'text',        desc: '품목코드 (ITEM ID)' },
   { name: 'item_category',type: 'text',        desc: '제품 구분' },
   { name: 'vendor',       type: 'text',        desc: '공급업체명' },
   { name: 'shortage_qty', type: 'integer',     desc: '결품(CUT) 수량' },
   { name: 'source_center',type: 'text',        desc: '발원 센터' },
   { name: 'delivery_date',type: 'date',        desc: '납기 일자' },
   { name: 'category',     type: 'text',        desc: '결품 구분 (재고부족 등)' },
   { name: 'is_picked',    type: 'text',        desc: '피킹 여부 (Y/N)' },
   { name: 'is_unshipped', type: 'text',        desc: '미출 여부 (Y/N)' },
   { name: 'action_note',  type: 'text',        desc: '조치사항 메모' },
   { name: 'upload_id',    type: 'uuid',        desc: '업로드 배치 식별자 (배치 단위 관리용)' },
   { name: 'upload_date',  type: 'date',        desc: '업로드 기준일 (D-2 날짜)' },
   { name: 'uploaded_by',  type: 'text',        desc: '업로드한 사용자' },
   { name: 'created_at',   type: 'timestamptz', desc: '등록 일시' },
  ],
  usages: [
   { menu: '📋 D-2 결품 리스트', file: 'WmsShortageList.jsx', action: 'SELECT / UPDATE',  desc: '결품 목록 조회, 조치사항 입력, 배치 삭제' },
   { menu: '🤖 WMS RPA 자동 추출', file: 'rpa/wms_extract.py', action: 'UPSERT', desc: 'WMS 스크래핑 후 결품 데이터 자동 적재' },
  ]
 },
 wms_action_logs: {
  name: '결품 조치 이력 (wms_action_logs)',
  description: '결품 리스트(wms_shortage_list)의 조치사항 변경 이력을 남기는 감사 로그 테이블',
  columns: [
   { name: 'id',            type: 'uuid',        desc: '고유 식별자' },
   { name: 'shortage_id',   type: 'uuid',        desc: '연결된 결품 레코드 ID (wms_shortage_list.id)' },
   { name: 'action_type',   type: 'text',        desc: '조치 타입' },
   { name: 'action_detail', type: 'text',        desc: '조치 상세 내용' },
   { name: 'updated_by',    type: 'text',        desc: '변경 담당자' },
   { name: 'updated_at',    type: 'timestamptz', desc: '변경 일시' },
  ],
  usages: [
   { menu: '📋 D-2 결품 리스트', file: 'WmsShortageList.jsx', action: 'INSERT / SELECT', desc: '조치사항 변경 시 이력 자동 기록' },
  ]
 },
 wms_stock_snapshots: {
  name: '창고별 재고 스냅샷 (wms_stock_snapshots)',
  description: 'WMS 재고보유현황을 RPA가 매일 창고×화주 단위로 집계하여 저장하는 시계열 스냅샷 테이블',
  columns: [
   { name: 'id',             type: 'bigserial',   desc: '고유 식별자' },
   { name: 'snapshot_date',  type: 'date',        desc: '스냅샷 기준일' },
   { name: 'warehouse_id',   type: 'text',        desc: 'WMS 창고 코드 (YA / Y2 / Y3 / AN / SE)' },
   { name: 'warehouse_name', type: 'text',        desc: '창고명' },
   { name: 'company_id',     type: 'text',        desc: '화주 코드 (ownerId)' },
   { name: 'company_name',   type: 'text',        desc: '화주명 (ownerNm)' },
   { name: 'item_count',     type: 'integer',     desc: 'SKU 수량' },
   { name: 'stock_qty',      type: 'bigint',      desc: '재고수량 합계' },
   { name: 'stock_amount',   type: 'bigint',      desc: '재고금액 합계 (공장도가 × 수량)' },
   { name: 'anomaly_count',  type: 'integer',     desc: '이상값 건수 (수량 > 10,000)' },
   { name: 'unpriced_count', type: 'integer',     desc: '단가 미등록 SKU 수' },
   { name: 'created_at',     type: 'timestamptz', desc: '적재 일시' },
  ],
  usages: [
   { menu: '📦 창고별 재고현황', file: 'WmsStockDashboard.jsx', action: 'SELECT', desc: '창고×화주별 재고 트렌드 및 현황 차트' },
   { menu: '🤖 WMS 재고 수집 RPA', file: 'rpa/wms_stock.py',   action: 'UPSERT', desc: 'WMS 스크래핑 후 일별 스냅샷 자동 적재' },
  ]
 },
 incoming_plans: {
  name: '입고계획 캐시 (incoming_plans)',
  description: 'MS-SQL ERP의 입고예정 데이터를 주기적으로 Supabase에 동기화한 캐시 테이블. company 기준으로 회사별 격리',
  columns: [
   { name: 'id',                type: 'bigserial',   desc: '고유 식별자' },
   { name: 'company',           type: 'text',        desc: '회사 구분 (fursys / sidiz)' },
   { name: 'plan_date',         type: 'date',        desc: '입고예정일' },
   { name: 'plan_seq',          type: 'text',        desc: '입고차수' },
   { name: 'item_code',         type: 'text',        desc: '단품코드' },
   { name: 'item_color',        type: 'text',        desc: '단품 색상코드' },
   { name: 'item_name',         type: 'text',        desc: '단품 명칭' },
   { name: 'inbound_type',      type: 'text',        desc: '입고 구분' },
   { name: 'vendor',            type: 'text',        desc: '공급업체' },
   { name: 'inbound_category',  type: 'text',        desc: '입고 유형' },
   { name: 'planned_qty',       type: 'numeric',     desc: '입고예정 수량' },
   { name: 'is_completed',      type: 'boolean',     desc: '입고 완료 여부' },
   { name: 'synced_at',         type: 'timestamptz', desc: '마지막 동기화 일시' },
  ],
  usages: [
   { menu: '🤖 입고예정 동기화', file: 'scripts/sync_incoming_plans.mjs', action: 'UPSERT', desc: 'MS-SQL → Supabase 주기적 자동 동기화' },
  ]
 },
 erp_inbound_config: {
  name: 'ERP 입고예정생성 설정 (erp_inbound_config)',
  description: 'RPA가 ERP 입고예정을 생성할 때 순서대로 처리하는 회사/창고 매핑 설정 목록. is_active=false이면 해당 설정을 건너뜀',
  columns: [
   { name: 'id',               type: 'bigserial',   desc: '고유 식별자' },
   { name: 'company',          type: 'text',        desc: '회사명 (예: 퍼시스)' },
   { name: 'input_warehouse',  type: 'text',        desc: '입고예정창고 (예: 퍼시스양지)' },
   { name: 'output_warehouse', type: 'text',        desc: '출고창고 (예: 시디즈평택)' },
   { name: 'note',             type: 'text',        desc: '비고 (선택)' },
   { name: 'is_active',        type: 'boolean',     desc: '활성 여부 (false면 RPA가 건너뜀)' },
   { name: 'created_at',       type: 'timestamptz', desc: '등록 일시' },
  ],
  usages: [
   { menu: '⚙️ 시스템 데이터 관리', file: 'ErpInboundConfig.jsx',   action: 'SELECT / INSERT / UPDATE / DELETE', desc: 'ERP 입고예정생성 설정 목록 관리' },
   { menu: '🤖 ERP RPA',           file: 'rpa/erp_scraper_v2.py', action: 'SELECT',                           desc: 'RPA 실행 시 처리할 창고 목록 참조' },
  ]
 },
 products: {
  name: 'ITEM DB 마스터 (products)',
  description: '취급하는 모든 제품의 코드, 색상, 업체, 재고구분 등의 마스터 데이터. MS-SQL에서 주기적으로 동기화. item_code+item_color가 고유키',
  columns: [
   { name: 'id',               type: 'bigserial', desc: '고유 식별자' },
   { name: 'item_code',        type: 'text',      desc: '단품코드 (예: A1234)' },
   { name: 'item_color',       type: 'text',      desc: '색상코드 (예: BK). item_code와 합쳐 A1234-BK 형태로 사용' },
   { name: 'item_name',        type: 'text',      desc: '단품명칭' },
   { name: 'vendor',           type: 'text',      desc: '공급업체명 (원본)' },
   { name: 'display_vendor',   type: 'text',      desc: '표시용 공급업체명 (vendor_aliases 정규화 적용)' },
   { name: 'brand_category',   type: 'text',      desc: '브랜드 분류' },
   { name: 'company_division', type: 'text',      desc: '법인 구분' },
   { name: 'production_line',  type: 'text',      desc: '생산 라인' },
   { name: 'outbound_warehouse',type: 'text',     desc: '출고 창고' },
   { name: 'stock_type',       type: 'text',      desc: '재고 구분' },
   { name: 'product_type',     type: 'text',      desc: '제품 구분' },
   { name: 'factory_price',    type: 'numeric',   desc: '공장도가 (재고금액 계산용)' },
   { name: 'stock',            type: 'integer',   desc: '재고 수량' },
  ],
  usages: [
   { menu: '📦 ITEM DB 수동 업데이트', file: 'ProductManager.jsx',       action: 'SELECT / UPSERT', desc: '엑셀 파일 업로드 시 신규/변경 상품 일괄 적재' },
   { menu: '🤖 상품 마스터 동기화',   file: 'scripts/sync_products.mjs', action: 'UPSERT',          desc: 'MS-SQL → Supabase 자동 동기화 (200행 청크)' },
   { menu: '📱 바코드 스캔',          file: 'MobileIssueRegister.jsx',   action: 'SELECT',          desc: '바코드 스캔 시 품목 정보 조회' },
  ]
 },
 vendor_aliases: {
  name: '공급업체명 정규화 (vendor_aliases)',
  description: 'WMS/ERP에서 오는 원본 업체명을 통일된 표시명으로 정규화. canonical_name이 NULL이면 차트에서 제외됨',
  columns: [
   { name: 'id',             type: 'serial',      desc: '고유 식별자' },
   { name: 'raw_name',       type: 'text',        desc: '원본 업체명 (WMS/ERP 원문 그대로, UNIQUE)' },
   { name: 'canonical_name', type: 'text',        desc: '정규화된 표시명. NULL이면 차트 제외' },
   { name: 'created_at',     type: 'timestamptz', desc: '등록 일시' },
  ],
  usages: [
   { menu: '📊 특이사항 대시보드',  file: 'LogisticsDashboard.jsx',    action: 'SELECT', desc: '업체명 정규화 후 차트 렌더링' },
   { menu: '🤖 상품 마스터 동기화', file: 'scripts/sync_products.mjs', action: 'SELECT', desc: 'MS-SQL 데이터 동기화 시 업체명 정규화 참조' },
  ]
 },
 rpa_jobs: {
  name: 'RPA 봇 정의 (rpa_jobs)',
  description: 'Local Worker(worker.mjs)가 실행하는 RPA 봇의 정의 목록. cron 스케줄 자동 등록 및 수동 트리거 대상',
  columns: [
   { name: 'id',                type: 'uuid',    desc: '고유 식별자' },
   { name: 'rpa_name',          type: 'text',    desc: 'RPA 봇 이름' },
   { name: 'description',       type: 'text',    desc: 'UI 설명 텍스트' },
   { name: 'runner_type',       type: 'text',    desc: '실행 환경 (local / github_actions)' },
   { name: 'script_command',    type: 'text',    desc: '실행 명령어 (예: node scripts/sync_products.mjs)' },
   { name: 'working_dir',       type: 'text',    desc: '작업 디렉토리 (비어있으면 프로젝트 루트)' },
   { name: 'cron_expr',         type: 'text',    desc: 'cron 스케줄 표현식 (예: 0 0 * * *)' },
   { name: 'enabled',           type: 'boolean', desc: '자동 실행 활성화 여부' },
   { name: 'parameters_schema', type: 'jsonb',   desc: '수동 실행 시 입력 파라미터 정의 (JSON 배열)' },
  ],
  usages: [
   { menu: '🤖 RPA 관리',    file: 'RpaManagement.jsx',     action: 'SELECT / UPDATE', desc: '봇 목록 조회, 활성화/비활성화, 수동 트리거' },
   { menu: '🤖 Local Worker', file: 'scripts/worker.mjs',   action: 'SELECT',          desc: 'cron 스케줄 로드 및 pending 이벤트 감지' },
  ]
 },
 rpa_runs: {
  name: 'RPA 실행 이력 (rpa_runs)',
  description: 'RPA 봇의 매 실행 결과 기록. 스케줄 자동 실행과 수동 트리거 결과 모두 포함',
  columns: [
   { name: 'id',            type: 'uuid',        desc: '고유 식별자' },
   { name: 'definition_id', type: 'uuid',        desc: '연결된 봇 정의 ID (rpa_jobs.id)' },
   { name: 'status',        type: 'text',        desc: '실행 상태 (pending / running / success / failed / timeout)' },
   { name: 'triggered_by',  type: 'text',        desc: '트리거 방식 (schedule / manual)' },
   { name: 'started_at',    type: 'timestamptz', desc: '실행 시작 일시' },
   { name: 'finished_at',   type: 'timestamptz', desc: '실행 완료 일시' },
   { name: 'exit_code',     type: 'integer',     desc: '프로세스 종료 코드' },
   { name: 'stdout_log',    type: 'text',        desc: '표준 출력 로그' },
   { name: 'stderr_log',    type: 'text',        desc: '표준 에러 로그' },
   { name: 'error_message', type: 'text',        desc: '에러 메시지 요약' },
  ],
  usages: [
   { menu: '🤖 RPA 관리',      file: 'RpaManagement.jsx',     action: 'SELECT / UPDATE', desc: '실행 이력 조회 및 상태 모니터링' },
   { menu: '🤖 RPA 이력 모달', file: 'RpaRunHistoryModal.jsx', action: 'SELECT',          desc: '봇별 실행 기록 상세 조회' },
  ]
 },
 ai_analysis_logs: {
  name: 'AI 분석 이력 (ai_analysis_logs)',
  description: 'Claude AI의 분석 결과 및 관리자 보정 데이터. 향후 Fine-tuning 학습 데이터로 활용 예정',
  columns: [
   { name: 'id',                   type: 'uuid',        desc: '고유 식별자' },
   { name: 'source_menu',          type: 'text',        desc: '분석 요청 출처 (AccidentManagement / MobileBarcode)' },
   { name: 'target_id',            type: 'text',        desc: '원본 레코드 ID' },
   { name: 'original_text',        type: 'text',        desc: 'AI 판단에 사용된 원본 텍스트' },
   { name: 'ai_analyzed_cause',    type: 'text',        desc: 'AI 판별 대분류 원인' },
   { name: 'ai_cause_detail',      type: 'text',        desc: 'AI 판별 소분류 코드 (예: W-01)' },
   { name: 'ai_cause_summary',     type: 'text',        desc: 'AI 분석 요약 설명' },
   { name: 'ai_confidence',        type: 'text',        desc: '신뢰도 (high / medium / low / human)' },
   { name: 'low_confidence_reason',type: 'text',        desc: '신뢰도 낮음 사유' },
   { name: 'is_reviewed',          type: 'boolean',     desc: '관리자 검토 완료 여부' },
   { name: 'reviewed_at',          type: 'timestamptz', desc: '검토 일시' },
   { name: 'corrected_cause',      type: 'text',        desc: '관리자 보정 대분류' },
   { name: 'corrected_detail',     type: 'text',        desc: '관리자 보정 소분류' },
   { name: 'created_at',           type: 'timestamptz', desc: '생성 일시' },
  ],
  usages: [
   { menu: '🔬 AI 인사이트 랩', file: 'AiInsightLab.jsx',  action: 'SELECT / UPDATE', desc: 'AI 분석 결과 검토 및 관리자 보정' },
   { menu: '📋 사고분석 LIST', file: 'AccidentList.jsx',   action: 'INSERT',          desc: '사고 처리 시 AI 분석 결과 자동 저장' },
  ]
 },
 workers: {
  name: '물류 근무자 마스터 (workers)',
  description: '물류센터에 투입되는 모든 정규직 및 외주 협력사 근무자들의 마스터 DB',
  columns: [
   { name: 'id',              type: 'uuid', desc: '고유 식별자' },
   { name: 'name',            type: 'text', desc: '근무자 이름' },
   { name: 'employment_type', type: 'text', desc: '고용 형태 (지입 / 소속 / 도급 등)' },
   { name: 'work_location',   type: 'text', desc: '근무 센터' },
   { name: 'managed_brand',   type: 'text', desc: '투입 브랜드' },
   { name: 'support_status',  type: 'text', desc: '타 현장 지원 상태' },
  ],
  usages: [
   { menu: '👷 근무자 관리',      file: 'WorkerManagement.jsx',   action: 'SELECT / INSERT / UPDATE', desc: '전체 근무자 명단 조회 및 등록/수정' },
   { menu: '🏭 근무자 근태 관리', file: 'AttendanceManagement.jsx', action: 'SELECT',                  desc: '근태 입력을 위한 기준 인원 목록으로 활용' },
  ]
 },
 worker_attendance: {
  name: '근로자 일일 근태 (worker_attendance)',
  description: '협력사 및 외주 도급사의 매일 출퇴근 및 작업 시간 가공 데이터',
  columns: [
   { name: 'id',             type: 'uuid',    desc: '고유 식별자' },
   { name: 'work_date',      type: 'date',    desc: '근무 일자' },
   { name: 'worker_name',    type: 'text',    desc: '근로자명' },
   { name: 'vendor_name',    type: 'text',    desc: '원 소속 업체' },
   { name: 'worked_vendor',  type: 'text',    desc: '실투입 업체 (지원/파견 반영)' },
   { name: 'normal_hours',   type: 'numeric', desc: '정상 근무 시간' },
   { name: 'weighted_hours', type: 'numeric', desc: '가중치 적용 시간 (정산용)' },
  ],
  usages: [
   { menu: '🏭 근무자 근태 관리', file: 'AttendanceManagement.jsx', action: 'SELECT / UPDATE', desc: '기간별/브랜드별 집계 현황, 지원 수기 변경' },
  ]
 },
 company_holidays: {
  name: '회사 휴무일 (company_holidays)',
  description: '공휴일 및 자체 휴가 등의 정보. 근태 요율(평일/휴일) 계산에 사용',
  columns: [
   { name: 'id',           type: 'serial', desc: '고유 식별자' },
   { name: 'holiday_date', type: 'date',   desc: '휴일 지정 날짜' },
   { name: 'name',         type: 'text',   desc: '명절, 법정동휴일 등 명칭' },
  ],
  usages: [
   { menu: '🏭 근무자 근태 관리', file: 'AttendanceManagement.jsx', action: 'SELECT', desc: '평일과 휴일을 구분해 특근 가중치 자동 계산' },
   { menu: '🤖 공휴일 동기화',   file: 'scripts/sync_holidays.mjs', action: 'UPSERT', desc: '공공데이터포털 API → DB 자동 동기화' },
  ]
 },
 suggestions: {
  name: '시스템 건의사항 (suggestions)',
  description: '시스템 사용자들의 기능 개선 건의 및 지원 요청 목록',
  columns: [
   { name: 'id',         type: 'uuid',        desc: '고유 식별자' },
   { name: 'user_name',  type: 'text',        desc: '작성자 이름' },
   { name: 'content',    type: 'text',        desc: '건의/문의 내용' },
   { name: 'answer',     type: 'text',        desc: '관리자 답변' },
   { name: 'status',     type: 'text',        desc: '처리 상태 (대기중 / 완료)' },
   { name: 'created_at', type: 'timestamptz', desc: '작성 일시' },
  ],
  usages: [
   { menu: '🎧 지원센터', file: 'SupportCenter.jsx', action: 'SELECT / INSERT / UPDATE', desc: '건의사항 목록 표출, 새 건의 등록, 답변 작성' },
  ]
 },
 faqs: {
  name: '자주 묻는 질문 (faqs)',
  description: '시스템 사용법 관련 FAQ 데이터베이스',
  columns: [
   { name: 'id',       type: 'uuid', desc: '고유 식별자' },
   { name: 'category', type: 'text', desc: '분류 카테고리' },
   { name: 'question', type: 'text', desc: '질문' },
   { name: 'answer',   type: 'text', desc: '가이드/답변 내용' },
  ],
  usages: [
   { menu: '🎧 지원센터', file: 'SupportCenter.jsx', action: 'SELECT', desc: '분류별 도움말 항목 렌더링' },
  ]
 },
 todos: {
  name: '개인 할 일 (todos)',
  description: '워크스페이스에 기록되는 개인별 상시 할 일 체크리스트',
  columns: [
   { name: 'id',           type: 'uuid',    desc: '고유 식별자' },
   { name: 'user_id',      type: 'uuid',    desc: '작성자 ID (profiles.id)' },
   { name: 'title',        type: 'text',    desc: '할 일 명칭' },
   { name: 'memo',         type: 'text',    desc: '상세 메모' },
   { name: 'is_important', type: 'boolean', desc: '중요 표시 여부' },
  ],
  usages: [
   { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx', action: 'SELECT / INSERT / UPDATE / DELETE', desc: '체크리스트 표출 및 CRUD 처리' },
  ]
 },
 todo_logs: {
  name: '개인 할 일 완료 기록 (todo_logs)',
  description: '매일 할 일이 완료된 날짜를 남기는 히스토리 테이블. 날짜별 완료 여부 추적',
  columns: [
   { name: 'id',             type: 'uuid', desc: '고유 식별자' },
   { name: 'todo_id',        type: 'uuid', desc: '연결된 할 일 ID (todos.id)' },
   { name: 'completed_date', type: 'date', desc: '체크(완료)된 날짜' },
   { name: 'user_id',        type: 'uuid', desc: '사용자 ID' },
  ],
  usages: [
   { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx', action: 'SELECT / INSERT / DELETE', desc: '오늘 완료한 항목 체크 및 해제 상태 동기화' },
  ]
 },
 calendar_events: {
  name: '팀 일정 관리 (calendar_events)',
  description: '물류팀 및 타 부서와의 협업 일정을 저장하는 달력 이벤트 테이블',
  columns: [
   { name: 'id',            type: 'uuid',    desc: '고유 식별자' },
   { name: 'title',         type: 'text',    desc: '일정 제목' },
   { name: 'start_date',    type: 'date',    desc: '시작 일자' },
   { name: 'end_date',      type: 'date',    desc: '종료 일자' },
   { name: 'start_time',    type: 'time',    desc: '시작 시간' },
   { name: 'end_time',      type: 'time',    desc: '종료 시간' },
   { name: 'is_important',  type: 'boolean', desc: '중요 일정 여부 (별표)' },
   { name: 'description',   type: 'text',    desc: '상세 내용' },
   { name: 'collab_teams',  type: 'text',    desc: '협업 대상 팀 (예: SCM팀, 배송팀)' },
   { name: 'creator_name',  type: 'text',    desc: '일정 등록자' },
   { name: 'collaborators', type: 'text',    desc: '참여자 명단' },
  ],
  usages: [
   { menu: '📅 팀 캘린더',        file: 'TeamCalendar.jsx', action: 'SELECT / INSERT / UPDATE / DELETE', desc: '월간/주간 달력 렌더링 및 일정 CRUD' },
   { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx',       action: 'SELECT',                           desc: '이번 주 일정 요약 표출' },
  ]
 },
};

const DatabaseDictionary = () => {
 const [selectedTable, setSelectedTable] = useState('calendar_events');
 const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);

 const currentData = DB_DICTIONARY[selectedTable];

 return (
 <div className="p-6 bg-slate-50 min-h-[calc(100vh-64px)] slide-up w-full flex gap-6">

 {/* 좌측: 테이블 목차 */}
 <div className="w-72 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden shrink-0 h-fit">
 <div className="p-4 bg-slate-800 text-white font-black text-sm tracking-wide">
 🗄️ 시스템 DB 테이블
 </div>
 <div className="flex flex-col p-2 gap-1">
 {Object.keys(DB_DICTIONARY).map((tableName) => (
 <button
 key={tableName}
 onClick={() => setSelectedTable(tableName)}
 className={`text-left px-4 py-3 rounded-lg text-sm font-bold transition-all ${selectedTable === tableName ? 'bg-blue-50 text-letusBlue border border-blue-100' : 'text-gray-600 hover:bg-gray-100 border border-transparent'}`}
 >
 {tableName}
 </button>
 ))}
 </div>
 </div>

 {/* 우측: 상세 명세서 */}
 <div className="flex-1 flex flex-col gap-4">
 <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
 <div className="flex justify-between items-start mb-6">
 <div>
 <h2 className="text-2xl font-black text-gray-800">{currentData.name}</h2>
 <p className="text-sm text-gray-500 font-medium mt-2">{currentData.description}</p>
 </div>
 {/* 🚩 기훈님이 원하시던 '어디서 쓰이는지 보기' 모달 띄우기 버튼 */}
 <button
 onClick={() => setIsUsageModalOpen(true)}
 className="bg-letusBlue hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
 >
 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
 화면 연결 맵 보기
 </button>
 </div>

 <div className="border border-slate-200 rounded-lg overflow-hidden">
 <table className="w-full text-left whitespace-nowrap">
 <thead className="bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-600">
 <tr>
 <th className="p-3 border-r border-slate-200">컬럼명 (Column)</th>
 <th className="p-3 border-r border-slate-200 w-32 text-center">데이터 타입</th>
 <th className="p-3">설명 (Description)</th>
 </tr>
 </thead>
 <tbody className="text-[13px] text-gray-700 divide-y divide-slate-100">
 {currentData.columns.map((col, idx) => (
 <tr key={idx} className="hover:bg-slate-50 transition-colors">
 <td className="p-3 border-r border-slate-200 font-mono font-bold text-letusBlue">{col.name}</td>
 <td className="p-3 border-r border-slate-200 text-center"><span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-bold text-gray-500 uppercase">{col.type}</span></td>
 <td className="p-3 font-medium text-gray-600">{col.desc}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>

 {/* 🚩 메뉴 연결 맵 모달창 */}
 {isUsageModalOpen && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
 <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setIsUsageModalOpen(false)}></div>
 <div className="bg-white rounded-2xl shadow-2xl z-10 w-full max-w-2xl flex flex-col overflow-hidden slide-up">
 <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
 <h3 className="text-[15px] font-black text-gray-800 flex items-center gap-2">
 🔗 <span className="text-letusBlue font-mono">{selectedTable}</span> 테이블 연결 맵
 </h3>
 <button onClick={() => setIsUsageModalOpen(false)} className="text-gray-400 hover:text-gray-600"><CloseIcon /></button>
 </div>
 <div className="p-6 flex flex-col gap-4 bg-slate-50/50 max-h-[70vh] overflow-y-auto">
 {currentData.usages.map((use, idx) => (
 <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex flex-col gap-2">
 <div className="flex items-center justify-between">
 <span className="text-sm font-black text-gray-800">{use.menu}</span>
 <span className={`px-2 py-1 text-[10px] font-bold rounded ${use.action.includes('UPDATE') ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
 {use.action}
 </span>
 </div>
 <div className="text-xs font-mono text-blue-500 font-bold flex items-center gap-1.5">
 <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
 {use.file}
 </div>
 <p className="text-[13px] text-gray-600 mt-1">{use.desc}</p>
 </div>
 ))}
 </div>
 </div>
 </div>
 )}
 </div>
 );
};

export { DatabaseDictionary };