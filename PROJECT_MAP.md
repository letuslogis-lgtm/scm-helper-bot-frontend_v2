# LETUS LOGIS — 프로젝트 맵

> 일룸 물류 입고 특이사항 통합 관리 시스템  
> 마지막 업데이트: 2026-06-18

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | React 18, Vite, TailwindCSS, Recharts, XLSX, Lucide React |
| 백엔드 | Supabase (PostgreSQL + Edge Functions / Deno) |
| RPA 자동화 | Python (Playwright) + Node.js Local Worker |
| 내부 DB | MS-SQL (fgdw, 192.9.201.23:1672) |
| 배포 | Vercel (dist/) + Supabase Cloud |

---

## 디렉토리 구조

```
LetusLogis/
├── src/                        # React 프론트엔드
│   ├── main.jsx                # 진입점 — 라우팅 정의 (데스크톱 33개 + 모바일 6개)
│   ├── supabaseClient.js       # Supabase 클라이언트 초기화
│   ├── menuConfig.jsx          # 사이드바 메뉴 구조 (9개 카테고리)
│   ├── MainLayout.jsx          # 전체 레이아웃 (헤더 + 사이드바 + 본문)
│   │
│   ├── [대시보드]
│   │   ├── MyHome.jsx                   # MY DASHBOARD (개인 홈)
│   │   └── LogisticsDashboard.jsx        # 입고 특이사항 대시보드
│   │
│   ├── [입고 특이사항]
│   │   ├── IssueList.jsx                 # 특이사항 목록 조회 / 필터링
│   │   ├── SupportCenter.jsx             # 특이사항 등록 · 이관 · 조치 (3단계)
│   │   └── WmsShortageList.jsx           # D-2 결품 리스트
│   │
│   ├── [출고 특이사항 / 사고분석]
│   │   ├── AccidentDashboard.jsx         # 사고분석 대시보드
│   │   ├── AccidentList.jsx              # 사고분석 목록
│   │   ├── AccidentAnalyticsReport.jsx   # 사고분석 보고서
│   │   ├── AccidentManagement.jsx        # 사고 데이터 모달
│   │   ├── AccidentModals.jsx            # 사고 UI 컴포넌트
│   │   └── ReturnsManagement.jsx         # 회수품 / 선출고 관리
│   │
│   ├── [모바일 PWA]
│   │   ├── MobileLoginView.jsx           # 모바일 로그인
│   │   ├── MobileMenuScreen.jsx          # 모바일 메인 메뉴
│   │   ├── MobileIssueRegister.jsx       # 바코드 스캔 + 특이사항 등록
│   │   ├── MobileMyIssues.jsx            # 내 특이사항 조회 + 조치결과 전달
│   │   ├── MobileReturnsRegister.jsx     # 회수품 등록
│   │   ├── MobileReturnsList.jsx         # 회수품 목록
│   │   ├── MobilePreDeliveryManage.jsx   # 선출고 관리
│   │   └── MobileNotice.jsx             # 공지사항
│   │
│   ├── [관리자]
│   │   ├── UserManagement.jsx            # 사용자 관리
│   │   ├── WorkerManagement.jsx          # 근무자 관리
│   │   ├── WorkerModals.jsx              # 근무자 모달
│   │   ├── ProductManager.jsx            # 상품(ITEM) DB 관리
│   │   ├── AttendanceManagement.jsx      # 근태 관리
│   │   ├── AttendanceUploadModal.jsx     # 근태 파일 업로드
│   │   ├── LoadingMap.jsx                # 상차 맵 관리
│   │   ├── DatabaseDictionary.jsx        # DB 용어 정의
│   │   └── LogisticsClosing.jsx          # 물류 마감 자동화
│   │
│   ├── [입고 실적 마감] /inbound_closing
│   │   ├── inbound/InboundClosing.jsx    # 메인 페이지 (업로드 관리 / 집계 현황 탭)
│   │   ├── inbound/InboundUploadTab.jsx  # 날짜별 파일 업로드 현황 테이블
│   │   ├── inbound/InboundSummaryTab.jsx # 입고실적 / 반출입 / CUT 집계 뷰
│   │   ├── inbound/InboundUploadModal.jsx# 파일 업로드 모달 (파일유형·기준일·창고명)
│   │   ├── inbound/parsers.js            # Excel 파서 × 4종 + 브랜드 매칭 (products JOIN)
│   │   └── inbound/constants.js          # FILE_TYPES 정의 (입고실적·반입·반출·WMS직송컷)
│   │
│   ├── [지게차 관리] /forklift_*
│   │   ├── forklift/ForkliftDashboard.jsx    # 지게차 현황 대시보드 (PieChart, LineChart)
│   │   ├── forklift/ForkliftManagement.jsx   # 지게차 관리대장 (CRUD, 변경이력, 수리이력)
│   │   ├── forklift/ForkliftDailyCheck.jsx   # 일일점검 (사전·사후·외관 점검 + 승인)
│   │   ├── forklift/ForkliftRepair.jsx       # 정비·수리 이력 (차트 + CRUD)
│   │   └── forklift/ForkliftIssue.jsx        # 이슈 등록 (reported→accepted→completed→approved)
│   │
│   ├── [RPA / AI]
│   │   ├── RpaManagement.jsx             # RPA 봇 실행 관리
│   │   ├── RpaRunHistoryModal.jsx        # RPA 실행 이력 모달
│   │   ├── AiInsightLab.jsx              # AI 분석 결과 검토소
│   │   └── AgentCommandCenter.jsx        # AI 에이전트 명령 센터
│   │
│   ├── [지원 / 커뮤니티]
│   │   ├── NoticeBoard.jsx               # 공지사항
│   │   └── TeamCalendar.jsx             # 팀 캘린더 (이벤트 / 공휴일)
│   │
│   ├── [인증 / 공용 UI]
│   │   ├── LoginView.jsx                 # 데스크톱 로그인
│   │   ├── Header.jsx                    # 상단 헤더 (알림, 사용자 메뉴)
│   │   ├── Sidebar.jsx                   # 좌측 사이드바
│   │   ├── SharedUI.jsx                  # 공용 UI 컴포넌트
│   │   └── CommonComponents.jsx          # 공용 유틸리티 컴포넌트
│   │
│   ├── [Hooks — 상태 관리]
│   │   ├── useAuth.jsx                   # 세션 · 프로필 · 즐겨찾기
│   │   ├── useIssues.jsx                 # 특이사항 데이터 · 필터
│   │   ├── useNotifications.jsx          # 실시간 알림 구독 (Supabase Realtime)
│   │   └── usePushNotification.js        # 푸시 알림
│   │
│   ├── [유틸]
│   │   ├── utils.js                      # 공용 함수
│   │   └── closingUtils.js               # 물류 마감 관련 유틸
│   │
│   ├── components/
│   │   └── ErrorBoundary.jsx             # 에러 바운더리
│   │
│   ├── index.css                         # 전역 스타일 (TailwindCSS)
│   └── sw.js                             # Service Worker (PWA)
│
├── rpa/                        # Python RPA 자동화
│   ├── main_runner.py           # GitHub Actions용 실행자 (스크립트 다운로드 → 격리 실행 → 로그 수집)
│   ├── wms_extract.py           # WMS CUT리스트 자동 추출 (5개 센터, Playwright)
│   ├── wms_picking.py           # WMS PALLET HISTORY 추출 → logistics_accidents zone/shift/worker 보완
│   ├── wms_stock_report.py      # WMS 재고보유현황 수집 → wms_stock_snapshots upsert (Playwright 로그인 + requests API)
│   ├── erp_scraper_v2.py        # ERP 상차이슈 추출 → logistics_accidents INSERT
│   ├── fursys_auth.json         # 퍼시스 인증 (Secrets)
│   ├── fursys_login.json        # 로그인 정보 (Secrets)
│   └── payload.json             # 봇 실행 파라미터 샘플
│
├── scripts/                    # Node.js 유틸리티
│   ├── worker.mjs               # Local RPA Worker 데몬 (cron + pending 이벤트 감지)
│   ├── sync_products.mjs        # 상품 마스터 동기화 (MS-SQL → Supabase UPSERT)
│   ├── sync_holidays.mjs        # 공휴일 동기화 (공공API → DB)
│   ├── analyze_closing_excel.mjs # 물류 마감 엑셀 분석
│   ├── start-worker.bat         # Windows 워커 시작 스크립트
│   └── start-worker-silent.vbs  # 백그라운드 실행
│
├── supabase/                   # Supabase 설정
│   ├── functions/               # Edge Functions (Deno TypeScript)
│   │   ├── user-admin/          # 사용자 생성·삭제·비밀번호 변경 (Auth Admin API 게이트웨이)
│   │   ├── analyze-barcode/     # 바코드 → 상품 정보 AI 분석
│   │   ├── analyze-accidents/   # 사고 데이터 AI 분석
│   │   ├── generate-insight-report/ # 통계 인사이트 보고서 생성
│   │   ├── send-push-notification/  # 푸시 알림 발송
│   │   └── submit-mobile-issue/     # 모바일 특이사항 제출
│   │
│   └── migrations/              # DB 마이그레이션 (SQL, 17개+)
│
├── .claude/                    # Claude Code 설정
│   └── agents/                  # AI 에이전트 역할 정의
│       ├── rpa-automation.md
│       ├── supabase-backend.md
│       ├── frontend-ui.md
│       └── ai-integration.md
│
├── docs/                       # 기술 문서
│   └── closing_excel_analysis.md
│
├── dist/                       # Vite 빌드 결과물 (배포용)
├── public/                     # 정적 자산 (로고, PWA 아이콘)
│
├── .env                        # 환경변수 (Supabase, MS-SQL, WMS, API 키)
├── vite.config.js              # Vite 빌드 설정 (청크 분리)
├── tailwind.config.js
├── vercel.json                 # Vercel 배포 설정
└── package.json
```

---

## 주요 데이터베이스 테이블

| 테이블 | 용도 | 주요 컬럼 |
|--------|------|-----------|
| `logistics_issues` | 입고 특이사항 | status, brand, item_code, reporter, action_content, worker_response, purchase_response |
| `logistics_returns` | 회수품 / 선출고 | is_recovered, is_completed, writer |
| `wms_shortage_list` | D-2 결품 / 부족컷 | item_code, vendor, shortage_qty, upload_date, upload_id, brand(=OWNER) |
| `wms_stock_snapshots` | 창고별 재고 스냅샷 | snapshot_date, warehouse_id, warehouse_name, company_id, company_name, item_count, stock_qty, stock_amount, anomaly_count, unpriced_count |
| `products` | 상품 마스터 | item_code, item_color, item_name, brand_category, vendor, stock, product_type |
| `vendor_aliases` | Vendor 정규화 | raw_name, canonical_name |
| `profiles` | 사용자 프로필 | name, role, email |
| `rpa_jobs` | RPA 봇 정의 | rpa_name, runner_type, script_command, cron_expr, enabled |
| `rpa_runs` | RPA 실행 이력 | definition_id, status, started_at, finished_at, triggered_by |
| `company_holidays` | 공휴일 | holiday_date, holiday_name |
| `ai_analysis_logs` | AI 분석 결과 | type, input, output |
| `inbound_upload_batches` | 입고 실적 업로드 배치 | file_type, business_date, warehouse_name, row_count, uploaded_by |
| `inbound_performance` | 입고실적등록 (ERP) | batch_id, business_date, warehouse_name, item_code, item_color, brand_category, 입고유형, 수량, 입고금액 |
| `inbound_transfer` | 반출입 집계 (ERP) | batch_id, business_date, transfer_type(반입/반출), other_warehouse, item_code, item_color, brand_category, 수량, 금액 |
| `inbound_cut_list` | WMS 직송컷 (수동 업로드) | batch_id, business_date, cut_type(직송컷), item_code, item_color, brand_category, wave명, cut수량 |
| `forklifts` | 지게차 마스터 | no, model, status(정상/정비중/고장/반납/매각), center, driver_name, asset_code, own_type, manager_org |
| `forklift_repairs` | 수리·정비 이력 | id(REP-xxx), forklift_id, repair_date, repair_type, repair_cost, repair_vendor, technician |
| `forklift_change_logs` | 지게차 변경 이력 | forklift_id, changed_by, changed_at, fields(jsonb: [{label,before,after}]) |
| `forklift_daily_checks` | 일일점검 기록 | forklift_id, check_date, checker_name, pre_exterior/pre_op/post_op(jsonb), approved_at, approved_by |
| `forklift_issues` | 지게차 이슈 | id(ISS-xxx), forklift_id, fault_type, status(reported/accepted/completed/approved), reported_at |

### Supabase Storage 버킷

| 버킷 | 용도 |
|------|------|
| `issue_images` | 특이사항 / 조치결과 사진 |
| `rpa-artifacts` | RPA 실행 산출물 |
| `rpa-logs` | RPA 실행 로그 |
| `rpa-secrets` | 스크립트 인증 파일 |

---

## 품목코드 컬럼 구조 (시스템별 차이)

> **매번 헷갈리지 않도록 반드시 숙지할 것**

| 시스템 | 원본 컬럼 | DB 저장 컬럼 | 형식 예시 |
|--------|-----------|-------------|-----------|
| **ERP** | `단품코드` + `색상` (별도 컬럼) | `item_code` | `A1234` + `BK` → `A1234-BK` |
| **WMS** | `ITEM ID` (이미 조합된 값) | `item_code` | `A1234-BK` |

- ERP RPA (`erp_scraper_v2.py`): `단품코드 + "-" + 색상` 으로 조합하여 `item_code` 저장
- WMS RPA (`wms_extract.py`, `wms_picking.py`): `ITEM ID` 값을 그대로 `item_code` 사용
- 두 시스템의 `item_code`는 동일한 값 → `order_no + item_code` 기준으로 매칭 가능

### 사고분석 LIST 중복 체크 기준
- **수기 업데이트**: `order_no + item_code` 2중 키
- **RPA (상차이슈)**: `order_no + item_code + service_date` 3중 키
- **RPA (PALLET HISTORY)**: `order_no + item_code` 기준으로 logistics_accidents 매칭 후 zone/shift/worker 업데이트

---

## 핵심 기능 흐름

### 1. 입고 특이사항 양방향 피드백

```
[모바일 작업자]
  바코드 스캔 → analyze-barcode (Edge Function)
                → products 테이블에서 item_color 조회
  특이사항 등록 → logistics_issues INSERT (status='접수')
                                              ↓
[데스크톱 관리자]
  목록 조회 / 필터 → RequestModal: 이관 또는 직접 조치
                   → HandleModal: 구매/생산 확인 → 조치완료
                   → is_notified=true, feedback_sent_at=NOW()
                                              ↓
[모바일 작업자]
  Realtime 알림 수신
  조치결과 전달 → 텍스트 메모 + 사진 최대 3장 업로드 (canvas 압축 JPEG 0.6)
               → issue_images 버킷 저장
               → worker_response, worker_response_photos 업데이트
```

### 2. WMS D-2 결품 자동 추출

```
Local Worker (cron, 매일 00:00~00:20)
  → wms_extract.py 실행 (5개 센터별)
  → 공휴일 API 조회 → 평일만 실행
  → Playwright: WMS 로그인 → CUT리스트 스크래핑
  → Pandas 정제 → wms_shortage_list UPSERT (upload_id로 배치 관리)
```

### 3. 상품 마스터 동기화

```
sync_products.mjs
  → MS-SQL: [group].[DM_단품마스터+소속법인사별단품마스터]
  → vendor_aliases 정규화
  → Supabase products UPSERT (200행 청크, item_code+item_color unique)
```

### 4. RPA Local Worker

```
scripts/worker.mjs (24/7 데몬)
  ├── rpa_jobs에서 runner_type='local' AND enabled=true 로드
  ├── cron_expr → node-cron 스케줄 자동 등록
  └── rpa_runs.status='pending' 감지 (Realtime) → 즉시 실행
      → script_command 실행 → stdout/stderr 수집
      → rpa_runs 상태 업데이트 (success / failed / timeout)
```

---

## 시스템 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│                     LETUS LOGIS                          │
└─────────────────────────────────────────────────────────┘

[모바일 PWA]              [데스크톱 앱]
  바코드 스캔               대시보드 / 리스트
  특이사항 등록             특이사항 관리
  사진 업로드               통계 / 리포팅
  조치결과 전달             RPA 관리
        ↓                       ↓
        └──────────┬────────────┘
                   ↓
       [Supabase PostgreSQL]
        logistics_issues      ← 특이사항
        logistics_returns     ← 회수품
        wms_shortage_list     ← D-2 결품
        products              ← 상품마스터
        profiles              ← 사용자
        rpa_jobs / rpa_runs   ← 자동화
        ai_analysis_logs      ← AI 결과
                   ↓
       [Supabase Storage]
        issue_images / rpa-artifacts / rpa-secrets
                   ↓
       [Edge Functions (Deno)]
        analyze-barcode       ← 바코드 AI
        analyze-accidents     ← 사고 AI
        user-admin            ← 권한관리
        send-push-notification ← 알림

[Local Worker (Node.js)]
  sync_products.mjs   ← MS-SQL → Supabase
  sync_holidays.mjs   ← 공공API → Supabase
  wms_extract.py      ← WMS → Supabase

[내부 시스템]
  MS-SQL (fgdw)       ← 상품마스터
  WMS                 ← 결품추출
  공휴일 API          ← 특일정보
```

---

## Edge Functions 요약

| 함수 | 입력 | 출력 |
|------|------|------|
| `user-admin` | action, payload | { success } |
| `analyze-barcode` | barcode | { product_code, item_name, item_color } |
| `analyze-accidents` | accident_data | { probable_causes, preventions } |
| `generate-insight-report` | date_range, filters | { report_url } |
| `send-push-notification` | title, message, users | { sent_count } |
| `submit-mobile-issue` | issue_data, images | { id, status } |

---

## 개발 / 배포 명령어

```bash
# 개발
npm run dev          # Vite dev server (http://localhost:5173, HMR)
node scripts/worker.mjs  # Local RPA Worker

# 배포 전 빌드
npm run build        # dist/ 생성 (청크 분리 최적화)
npm run preview      # 빌드 결과물 로컬 미리보기
```

### Vite 빌드 청크 분리 (`vite.config.js`)

| 청크 | 포함 내용 |
|------|-----------|
| `react-vendor` | React 코어 |
| `supabase` | Supabase 클라이언트 |
| `charts` | Recharts |
| `excel` | XLSX |
| `vendor` | 나머지 라이브러리 |

---

## 환경변수 목록 (`.env`)

| 변수 | 용도 |
|------|------|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase 익명 키 (프론트) |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 키 (관리자) |
| `MSSQL_USER / PASSWORD / SERVER / PORT / DATABASE` | 사내 MS-SQL 접속 정보 |
| `WMS_USER / WMS_PASSWORD` | WMS 로그인 정보 |
| `HOLIDAY_API_KEY` | 공공데이터포털 특일 정보 API |

---

## 최근 주요 변경 이력

### 2026-06-18 (지게차 관리 메뉴 신규 개발)
- `src/forklift/` 폴더 신규: ForkliftDashboard, ForkliftManagement, ForkliftDailyCheck, ForkliftRepair, ForkliftIssue (5개)
- Supabase 테이블 5개 추가: forklifts, forklift_repairs, forklift_change_logs, forklift_daily_checks, forklift_issues
- 지게차 144대 실데이터 시드 적재 완료
- localStorage 전면 → Supabase 마이그레이션 (컬럼 UI 설정만 localStorage 유지)
- menuConfig: `지게차 관리` 카테고리 추가 (5개 하위 메뉴)
- 이슈 상태 4단계: reported → accepted → completed → approved

### 2026-06-17 (입고 실적 마감 메뉴 신규 개발)
- `src/inbound/` 모듈 신규 생성 (InboundClosing, UploadTab, SummaryTab, UploadModal, parsers, constants)
- DB 테이블 4개 추가: `inbound_upload_batches`, `inbound_performance`, `inbound_transfer`, `inbound_cut_list`
- Excel 파서 4종: 입고실적(ERP), 반입집계(ERP), 반출집계(ERP), WMS직송컷
- 브랜드 매칭: `단품코드 + 색상` → `products` JOIN → `brand_category`
- 부족컷은 기존 `wms_shortage_list` (RPA) 활용, 별도 업로드 불필요
- 집계 현황: 입고실적·반출입·CUT 탭별 브랜드 집계
- menuConfig: `물류 마감 관리` 카테고리에 `입고 실적 마감` 추가
- 향후: 입고실적·반출입집계 RPA 자동화 예정

### 2026-05-20 (WMS 결품 2차 개발)
- `WmsShortageList.jsx` 주요 기능 완성
- `wms_shortage_list` 테이블 점진적 개선 (컬럼 추가, 인덱스 보강)
- `wms_extract.py` 5개 센터 자동 추출 완성

### 2026-05-15 (입고 특이사항 개편)
- 양방향 피드백: 모바일 조치결과 사진 + 메모 업로드
- RequestModal 3단계 진행 표시 / 직접 조치 버튼 추가
- HandleModal 버그 수정 (action_content 정상 저장)
- 바코드 스캔 시 item_color 자동 조회 보강
- 모바일 시트 레이아웃 안정화 (vh → svh, overscroll-contain)

### 2026-05-14 (PWA 1차 완료)
- 모바일 4개 화면 (로그인, 메뉴, 특이사항 등록, 내 특이사항) 완성
- Service Worker / PWA 설치 지원
