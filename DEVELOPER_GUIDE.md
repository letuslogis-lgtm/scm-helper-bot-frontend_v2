# LETUS LOGIS — 개발자 가이드

> 이 문서는 여러 명이 동일한 패턴으로 개발하고 나중에 합칠 수 있도록  
> 프로젝트의 구조, 컴포넌트 규칙, 코딩 패턴을 정리한 것입니다.  
> **새 화면이나 기능을 개발할 때 반드시 이 가이드를 먼저 읽고 시작하세요.**

---

## 목차

1. [기술 스택](#1-기술-스택)
2. [디렉토리 구조](#2-디렉토리-구조)
3. [라우팅 구조](#3-라우팅-구조)
4. [디자인 시스템 (색상·폰트·레이아웃)](#4-디자인-시스템)
5. [인증 & 전역 상태 (Hooks)](#5-인증--전역-상태-hooks)
6. [Supabase 사용 패턴](#6-supabase-사용-패턴)
7. [공용 컴포넌트 목록](#7-공용-컴포넌트-목록)
8. [테이블 UI 표준 (필수)](#8-테이블-ui-표준-필수)
9. [메뉴 추가 방법](#9-메뉴-추가-방법)
10. [모바일(PWA) vs 데스크톱 차이점](#10-모바일pwa-vs-데스크톱-차이점)
11. [새 페이지 만들기 체크리스트](#11-새-페이지-만들기-체크리스트)
12. [localStorage 키 네이밍 규칙](#12-localstorage-키-네이밍-규칙)
13. [금지 사항 / 주의 사항](#13-금지-사항--주의-사항)

---

## 1. 기술 스택

| 레이어 | 기술 | 버전/비고 |
|--------|------|-----------|
| 프론트엔드 | React | 18 |
| 빌드 도구 | Vite | HMR 개발 서버 (`npm run dev`) |
| 스타일 | TailwindCSS | 커스텀 색상 있음 → 아래 [디자인 시스템] 참고 |
| 차트 | Recharts | |
| 엑셀 | XLSX | |
| 아이콘 | Lucide React | |
| 백엔드 | Supabase | PostgreSQL + Edge Functions (Deno) |
| 실시간 | Supabase Realtime | `postgres_changes` 구독 |
| 배포 | Vercel (프론트) + Supabase Cloud | |
| RPA | Python (Playwright) | `rpa/` 폴더 |
| Local Worker | Node.js | `scripts/worker.mjs` |
| 내부 DB | MS-SQL | `192.9.201.23:1672` / fgdw DB |

---

## 2. 디렉토리 구조

```
LetusLogis/
├── src/                        # React 프론트엔드 (모든 화면 코드)
│   ├── main.jsx                # 진입점 — 라우팅 전체 정의
│   ├── supabaseClient.js       # Supabase 클라이언트 초기화 + invokeFunction 헬퍼
│   ├── menuConfig.jsx          # 사이드바 메뉴 구조 (추가 시 여기만 수정)
│   ├── MainLayout.jsx          # 데스크톱 전체 레이아웃 (헤더+사이드바+본문)
│   │
│   ├── [데스크톱 화면 파일들]  # 각 메뉴 = 1개 파일 (또는 기능별 분리)
│   │
│   ├── hooks/                  # 전역 상태 관리 훅
│   │   ├── useAuth.jsx         # 세션, 프로필, 즐겨찾기
│   │   ├── useIssues.jsx       # 특이사항 데이터, 필터 상태
│   │   ├── useNotifications.jsx # 실시간 알림
│   │   └── usePushNotification.js
│   │
│   ├── components/
│   │   └── ErrorBoundary.jsx   # 전역 에러 처리
│   │
│   ├── SharedUI.jsx            # 공용 UI 컴포넌트 (모달, 뱃지 등)
│   ├── CommonComponents.jsx    # 공용 유틸리티 컴포넌트
│   ├── utils.js                # 공용 함수
│   └── index.css               # 전역 스타일
│
├── rpa/                        # Python RPA 자동화 스크립트
├── scripts/                    # Node.js 유틸리티 (Local Worker, DB 동기화)
├── supabase/
│   ├── functions/              # Edge Functions (Deno TypeScript)
│   └── migrations/             # DB 마이그레이션 SQL
│
├── .env                        # 환경변수 (절대 커밋 금지)
├── vite.config.js
├── tailwind.config.js
├── PROJECT_MAP.md              # 프로젝트 전체 맵 (세션 시작 시 참조)
└── DEVELOPER_GUIDE.md          # 이 파일
```

---

## 3. 라우팅 구조

라우팅은 **`src/main.jsx` 한 곳에서만** 관리합니다. 새 화면을 추가하면 여기에 `<Route>`를 추가해야 합니다.

### 데스크톱 라우트 구조

```
/                 → /home 으로 리다이렉트
/home             → MyDashboard (개인 홈)
/dashboard        → LogisticsDashboard (입고 특이사항 대시보드)
/list             → IssueList (특이사항 목록)
/wms_shortage     → WmsShortageList (D-2 결품)
/accident_list    → AccidentList
/support          → SupportCenter
...
```

### 모바일 라우트 구조

모바일은 `/mobile/*` 하위에서 **완전히 독립된 라우팅**을 사용합니다.

```
/mobile           → MobileMenuScreen 또는 MobileAdminMenu (관리자면 자동 전환)
/mobile/register  → MobileIssueRegister (바코드 스캔 + 특이사항 등록)
/mobile/my-issues → MobileMyIssues (내 특이사항 조회)
/mobile/returns   → MobileReturnsRegister
/mobile/returns-list → MobileReturnsList
/mobile/notice    → MobileNotice
/mobile/admin/issues → MobileAdminIssueList (관리자 전용)
```

### 라우트 추가 방법

```jsx
// 1. src/main.jsx 상단에 import 추가
import { MyNewPage } from './MyNewPage.jsx';

// 2. <Routes> 안에 Route 추가
<Route path="/my_new_page" element={<MyNewPage userProfile={logic.userProfile} />} />
```

> **주의**: 데스크톱 라우트에 추가할 때는 `logic` 객체에서 필요한 props만 골라서 전달합니다.

---

## 4. 디자인 시스템

### 커스텀 색상 (tailwind.config.js)

| Tailwind 클래스 | 색상값 | 용도 |
|-----------------|--------|------|
| `bg-letusBg` | `#f5f7fa` | 전체 배경색 |
| `bg-letusSidebar` | `#273444` | 사이드바 배경 |
| `text-letusBlue`, `bg-letusBlue` | `#4b89ff` | 주요 강조색 (버튼, 링크, 선택 등) |
| `text-letusOrange`, `bg-letusOrange` | `#f58220` | 경고/주목 강조색 |

> **기본 색상이 있을 때는 Tailwind 기본값(blue-500 등)보다 letusBlue를 우선 사용하세요.**

### 폰트

- 기본 폰트: `Pretendard` (전역 적용됨, 별도 설정 불필요)
- 클래스: `font-sans` (이미 기본값)

### 레이아웃 구조

```
<div class="flex h-screen overflow-hidden bg-letusBg">   ← 최상위 고정
  <Sidebar />                                             ← 좌측 고정
  <div class="flex-1 flex flex-col overflow-hidden">
    <Header />                                            ← 상단 고정
    <main class="flex-1 overflow-auto p-6">               ← 스크롤 영역
      {children}                                          ← 각 페이지 내용
    </main>
  </div>
</div>
```

### 페이지 내부 기본 구조 (데스크톱)

```jsx
return (
    <div className="flex flex-col h-full">
        {/* 상단: 필터 / 검색 영역 */}
        <div className="p-4 border-b bg-white flex items-center gap-3 flex-wrap shrink-0">
            ...필터 컴포넌트들...
        </div>

        {/* 테이블 스크롤 영역 */}
        <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
            <table className="w-full text-left whitespace-nowrap table-fixed">
                ...
            </table>
        </div>
    </div>
);
```

### 공통 버튼 스타일

```jsx
// 주요 액션 버튼 (파란색)
<button className="flex items-center gap-1.5 text-sm font-bold text-white bg-letusBlue rounded shadow px-4 h-[34px] hover:bg-blue-500 transition-colors">
    버튼명
</button>

// 보조 버튼 (흰색 테두리)
<button className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors">
    버튼명
</button>
```

---

## 5. 인증 & 전역 상태 (Hooks)

모든 전역 상태는 `src/hooks/` 폴더의 훅에서 관리합니다. **각 페이지 컴포넌트에서 직접 supabase.auth를 호출하지 마세요.**

### useAuth (세션 & 사용자 정보)

```jsx
// main.jsx에서 최상위로 한 번만 호출됨
const { session, userProfile, handleLogout, fetchProfile, favorites, toggleFavorite } = useAuth();
```

| 반환값 | 타입 | 설명 |
|--------|------|------|
| `session` | object \| null | Supabase 세션 (로그인 여부 판단) |
| `userProfile` | object \| null | `profiles` 테이블 사용자 정보 |
| `userProfile.role` | string | `'관리자'` / `'사용자'` |
| `userProfile.id` | string | UUID (localStorage 키에 사용) |
| `userProfile.name` | string | 표시 이름 |
| `handleLogout` | function | 로그아웃 처리 |
| `fetchProfile` | function | 프로필 재조회 |
| `favorites` | string[] | 즐겨찾기 메뉴 ID 배열 |

### 각 페이지에서 userProfile 받는 방법

페이지 컴포넌트는 `userProfile`을 **props로 받습니다**. `useAuth`를 페이지 안에서 직접 호출하지 않습니다.

```jsx
// ✅ 올바른 방법
const MyPage = ({ userProfile }) => {
    const isAdmin = userProfile?.role === '관리자';
    ...
};

// ❌ 잘못된 방법 (페이지 안에서 훅 직접 호출 금지)
const MyPage = () => {
    const { userProfile } = useAuth(); // 사용하지 마세요
};
```

---

## 6. Supabase 사용 패턴

### 클라이언트 초기화

```jsx
import { supabase, invokeFunction } from './supabaseClient.js';
```

`supabaseClient.js`에서 이미 초기화된 클라이언트를 가져옵니다. **절대 컴포넌트 안에서 `createClient`를 직접 호출하지 마세요.**

### 데이터 조회 패턴

```jsx
// 기본 조회
const { data, error } = await supabase
    .from('테이블명')
    .select('*')
    .order('id', { ascending: false });

if (error) throw error;
```

### Edge Function 호출 패턴

```jsx
// invokeFunction 헬퍼 사용 (에러 처리 포함됨)
try {
    const result = await invokeFunction('함수명', {
        action: 'create',
        payload: { ... }
    });
    // result = 함수의 반환 데이터
} catch (err) {
    console.error(err.message); // 에러 메시지 자동 추출됨
}
```

### 실시간 구독 패턴

```jsx
useEffect(() => {
    if (!session) return;

    const channel = supabase.channel('채널명_고유하게')
        .on('postgres_changes', {
            event: 'UPDATE',         // 'INSERT' | 'UPDATE' | 'DELETE' | '*'
            schema: 'public',
            table: 'logistics_issues',
            filter: `reporter=eq.${userProfile.name}`, // 선택사항
        }, (payload) => {
            // payload.new = 변경 후 데이터
            // payload.old = 변경 전 데이터
            // payload.eventType = 'INSERT' | 'UPDATE' | 'DELETE'
        })
        .subscribe();

    return () => supabase.removeChannel(channel); // 반드시 정리!
}, [session, userProfile?.name]);
```

> **주의**: 채널명은 앱 전체에서 고유해야 합니다. 동일 채널명이 겹치면 한쪽이 무시됩니다.

---

## 7. 공용 컴포넌트 목록

### SharedUI.jsx에서 import 가능한 것들

| 컴포넌트/상수 | 설명 |
|--------------|------|
| `StatusBadge` | 특이사항 상태 뱃지 (조치대기/이관중/조치완료 등) |
| `CategoryBadge` | 이슈 카테고리 색상 점 + 텍스트 |
| `TableSkeleton` | 테이블 로딩 중 스피너 (colCount props 전달) |
| `UserEditModal` | 사용자 프로필 편집 모달 |
| `CATEGORY_COLORS` | 카테고리별 색상 맵 객체 |
| `BRAND_COLORS` | 브랜드 차트 색상 배열 |

```jsx
import { StatusBadge, CategoryBadge, TableSkeleton, CATEGORY_COLORS } from './SharedUI.jsx';

// 사용 예
<StatusBadge status={row.status} />
<CategoryBadge category={row.issue_type} />

// 로딩 중
{isLoading && <TableSkeleton colCount={colOrder.length + 1} />}
```

### CommonComponents.jsx에서 import 가능한 것들

| 컴포넌트 | 설명 |
|---------|------|
| `VendorSearchModal` | 업체 검색 모달 |
| `MenuPermissionModal` | 메뉴 권한 설정 모달 |

---

## 8. 테이블 UI 표준 (필수)

**이 프로젝트의 모든 데이터 테이블은 이 표준을 따릅니다.**  
기능: 컬럼 드래그 순서 변경, 컬럼 너비 조절, 사용자별 localStorage 저장/복원, 초기화 버튼

### 적용 파일 목록

| 파일 | localStorage 키 |
|------|-----------------|
| IssueList.jsx | `letus_col_${userId}` |
| AccidentList.jsx | `letus_accident_col_${userId}` |
| WmsShortageList.jsx | `letus_wms_col_${userId}` |
| ReturnsManagement.jsx | `letus_returns_col_${userId}` |
| UserManagement.jsx | `letus_users_col` |

### Step 1: DEFAULT_COLUMNS 정의 (컴포넌트 밖에 선언)

```jsx
const DEFAULT_COLUMNS = [
    { label: '컬럼명',    key: 'db_field',  w: 150 },  // key = DB 컬럼명 (정렬용)
    { label: '액션 버튼', key: null,         w: 110 },  // key: null → 정렬 불가
    { label: '결품수량',  key: 'qty',        w: 80, sub: '(개)' }, // sub = 소제목
];
```

### Step 2: 상태 & refs

```jsx
const [colOrder, setColOrder] = useState(DEFAULT_COLUMNS.map((_, i) => i));
const [colWidths, setColWidths] = useState(DEFAULT_COLUMNS.map(c => c.w));
const [dragOverIdx, setDragOverIdx] = useState(null);
const resizingRef = useRef(null);
const dragSrcRef = useRef(null);
const wasDraggedRef = useRef(false);
```

### Step 3: localStorage 저장/복원/초기화

```jsx
// 복원 (userProfile이 있는 파일)
useEffect(() => {
    if (!userProfile?.id) return;
    try {
        const saved = JSON.parse(localStorage.getItem(`letus_NAME_col_${userProfile.id}`));
        if (saved?.order?.length === DEFAULT_COLUMNS.length) setColOrder(saved.order);
        if (saved?.widths?.length === DEFAULT_COLUMNS.length) setColWidths(saved.widths);
    } catch {}
}, [userProfile?.id]);

// 저장
useEffect(() => {
    if (!userProfile?.id) return;
    localStorage.setItem(
        `letus_NAME_col_${userProfile.id}`,
        JSON.stringify({ order: colOrder, widths: colWidths })
    );
}, [colOrder, colWidths, userProfile?.id]);

// 초기화 함수
const resetColSettings = () => {
    setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
    setColWidths(DEFAULT_COLUMNS.map(c => c.w));
    if (userProfile?.id) localStorage.removeItem(`letus_NAME_col_${userProfile.id}`);
};
```

### Step 4: 핸들러 5개 (복사해서 그대로 사용)

```jsx
const handleResizeStart = (e, visualIdx) => {
    e.preventDefault(); e.stopPropagation();
    const origIdx = colOrder[visualIdx];
    resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
    const onMove = (ev) => {
        const { origIdx, startX, startW } = resizingRef.current;
        setColWidths(prev => {
            const n = [...prev];
            n[origIdx] = Math.max(50, startW + (ev.clientX - startX));
            return n;
        });
    };
    const onUp = () => {
        resizingRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
};

const handleDragStart = (e, visualIdx) => {
    dragSrcRef.current = visualIdx;
    wasDraggedRef.current = false;
    e.dataTransfer.effectAllowed = 'move';
};

const handleDragOver = (e, visualIdx) => {
    e.preventDefault();
    setDragOverIdx(visualIdx);
};

const handleDrop = (e, visualIdx) => {
    e.preventDefault(); setDragOverIdx(null);
    if (dragSrcRef.current === null || dragSrcRef.current === visualIdx) return;
    wasDraggedRef.current = true;
    const newOrder = [...colOrder];
    const [moved] = newOrder.splice(dragSrcRef.current, 1);
    newOrder.splice(visualIdx, 0, moved);
    setColOrder(newOrder);
    dragSrcRef.current = null;
};

const handleDragEnd = () => {
    setDragOverIdx(null);
    setTimeout(() => { wasDraggedRef.current = false; }, 50);
};
```

### Step 5: renderCell 함수

```jsx
const renderCell = (origIdx, row) => {
    switch (origIdx) {
        case 0: return <td key={origIdx} className="p-4 text-center">{row.field_name}</td>;
        case 1: return <td key={origIdx} className="p-4 text-center"><StatusBadge status={row.status} /></td>;
        case 2: return (
            <td key={origIdx} className="p-4 text-center">
                <button onClick={() => handleAction(row)}>처리</button>
            </td>
        );
        default: return null;
    }
};
```

### Step 6: thead (헤더) 구조

```jsx
<thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
    <tr>
        {/* 체크박스: 항상 첫 번째 고정 */}
        <th className="p-4 pl-6 w-10 text-center shrink-0">
            <input type="checkbox"
                checked={selectedIds.length === filteredData.length && filteredData.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 accent-letusBlue cursor-pointer"
            />
        </th>
        {colOrder.map((origIdx, visualIdx) => {
            const col = DEFAULT_COLUMNS[origIdx];
            return (
                <th key={origIdx}
                    className={`relative p-4 text-center select-none transition-colors
                        ${col.key ? 'hover:bg-gray-100 cursor-pointer' : ''}
                        ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                    style={{ width: colWidths[origIdx] }}
                    onClick={() => !wasDraggedRef.current && col.key && requestSort(col.key)}
                    onDragOver={(e) => handleDragOver(e, visualIdx)}
                    onDrop={(e) => handleDrop(e, visualIdx)}
                    onDragLeave={() => setDragOverIdx(null)}
                >
                    <div className="flex items-center justify-center gap-1">
                        <span
                            draggable
                            onDragStart={(e) => handleDragStart(e, visualIdx)}
                            onDragEnd={handleDragEnd}
                            onClick={e => e.stopPropagation()}
                            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 text-base leading-none"
                            title="드래그로 순서 변경"
                        >⠿</span>
                        {col.label}
                        {col.key && getSortIcon(col.key)}
                    </div>
                    {col.sub && <div className="text-[9px] text-gray-400 font-normal mt-0.5">{col.sub}</div>}
                    <div
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                        onMouseDown={(e) => handleResizeStart(e, visualIdx)}
                        onClick={e => e.stopPropagation()}
                    />
                </th>
            );
        })}
    </tr>
</thead>
```

### Step 7: tbody 행 구조

```jsx
<tbody className="bg-white divide-y divide-gray-100">
    {filteredData.map(row => (
        <tr key={row.id}
            className={`hover:bg-blue-50/30 transition-colors cursor-pointer
                ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''}`}
            onClick={(e) => handleSelectOne(e, row.id)}
        >
            <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                <input type="checkbox"
                    checked={selectedIds.includes(row.id)}
                    onChange={(e) => handleSelectOne(e, row.id)}
                    className="w-4 h-4 accent-letusBlue cursor-pointer"
                />
            </td>
            {colOrder.map(origIdx => renderCell(origIdx, row))}
        </tr>
    ))}
</tbody>
```

### Step 8: 정렬 함수

```jsx
const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

const requestSort = (key) => {
    setSortConfig(prev =>
        prev.key === key && prev.direction === 'asc'
            ? { key, direction: 'desc' }
            : { key, direction: 'asc' }
    );
};

const getSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc'
        ? <span className="text-letusBlue font-black">↑</span>
        : <span className="text-letusBlue font-black">↓</span>;
};

// useMemo로 정렬 적용
const sortedData = useMemo(() => {
    if (!sortConfig.key) return rawData;
    return [...rawData].sort((a, b) => {
        const aVal = a[sortConfig.key] ?? '';
        const bVal = b[sortConfig.key] ?? '';
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
}, [rawData, sortConfig]);
```

### Step 9: 칼럼 초기화 버튼 (상단 우측)

```jsx
<button onClick={resetColSettings}
    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
    title="컬럼 너비·순서를 기본값으로 초기화">
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
    칼럼 초기화
</button>
```

---

## 9. 메뉴 추가 방법

새 메뉴를 추가할 때 수정해야 하는 파일은 **3곳**입니다.

### 1단계: menuConfig.jsx — 메뉴 항목 추가

```jsx
// src/menuConfig.jsx
export const ALL_MENUS = [
    {
        id: '카테고리_id', label: '카테고리명',
        icon: <svg>...</svg>,
        children: [
            { id: 'my_new_page', label: '새 메뉴명' }, // ← 여기에 추가
        ]
    },
    ...
];
```

> `id`는 라우트 경로와 동일하게 맞춥니다 (`/my_new_page` → id: `'my_new_page'`)

### 2단계: main.jsx — Route 추가

```jsx
import { MyNewPage } from './MyNewPage.jsx'; // import 추가

// <Routes> 안에 추가
<Route path="/my_new_page" element={<MyNewPage userProfile={logic.userProfile} />} />
```

### 3단계: 화면 파일 생성

`src/MyNewPage.jsx` 생성 (아래 [새 페이지 만들기 체크리스트] 참고)

---

## 10. 모바일(PWA) vs 데스크톱 차이점

| 항목 | 데스크톱 | 모바일 |
|------|---------|--------|
| 진입 경로 | `/` ~ | `/mobile/*` |
| 레이아웃 | MainLayout (헤더+사이드바+본문) | 각 화면이 독립 전체화면 |
| 스타일 기조 | 밝은 배경 (`bg-letusBg`) | 어두운 배경 (`bg-slate-900`) |
| 인증 훅 | main.jsx의 AppContent에서 관리 | ProtectedMobileRoute에서 별도 관리 |
| 폰트 크기 | 일반 (xs~sm) | 큰 터치 UI (base~lg) |
| 스크롤 | `overflow-auto` + `custom-scrollbar` | `overflow-y-auto` + `overscroll-contain` |
| 높이 단위 | `h-screen`, `min-h-screen` | `min-h-svh` (모바일 브라우저 주소창 대응) |
| 사진 업로드 | 일반 file input | canvas로 JPEG 0.6 압축 후 업로드 |

### 모바일 화면 파일 명명 규칙

```
Mobile{기능명}.jsx
예: MobileIssueRegister.jsx, MobileReturnsList.jsx
```

---

## 11. 새 페이지 만들기 체크리스트

새 데스크톱 화면 파일(`src/MyNewPage.jsx`)을 만들 때 확인하세요.

```jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient.js';
// 필요한 공용 컴포넌트 import

// ① DEFAULT_COLUMNS 정의 (테이블이 있는 경우)
const DEFAULT_COLUMNS = [...];

export const MyNewPage = ({ userProfile }) => {
    // ② 테이블 상태 (테이블이 있는 경우)
    const [colOrder, setColOrder] = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths] = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef = useRef(null);
    const dragSrcRef = useRef(null);
    const wasDraggedRef = useRef(false);

    // ③ 데이터 상태
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // ④ localStorage 저장/복원 (테이블이 있는 경우)
    // → 섹션 8 Step 3 코드 복사

    // ⑤ 데이터 조회
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('테이블명').select('*');
            if (error) throw error;
            setData(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (userProfile) fetchData();
    }, [userProfile?.id]);

    // ⑥ 핸들러 5개 (섹션 8 Step 4 복사)
    // ⑦ renderCell (섹션 8 Step 5 참고)
    // ⑧ getSortIcon + requestSort (섹션 8 Step 8 참고)

    return (
        <div className="flex flex-col h-full">
            {/* 상단 필터 영역 */}
            <div className="p-4 border-b bg-white flex items-center gap-3 flex-wrap shrink-0">
                ...
                {/* 칼럼 초기화 버튼 (테이블 있는 경우) */}
            </div>

            {/* 테이블 영역 */}
            <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                <table className="w-full text-left whitespace-nowrap table-fixed">
                    {/* thead, tbody → 섹션 8 참고 */}
                </table>
            </div>
        </div>
    );
};
```

### 체크리스트

- [ ] 파일명: `PascalCase.jsx`
- [ ] named export 사용: `export const MyPage = () => {...}`
- [ ] `userProfile`은 props로 받음 (훅 직접 호출 금지)
- [ ] localStorage 키가 기존과 겹치지 않는지 확인
- [ ] `main.jsx`에 Route 추가
- [ ] `menuConfig.jsx`에 메뉴 항목 추가 (사이드바 노출 원할 때)
- [ ] 테이블 있으면 섹션 8 표준 적용 완료
- [ ] `TableSkeleton`으로 로딩 상태 표시

---

## 12. localStorage 키 네이밍 규칙

| 상황 | 키 형식 | 예시 |
|------|--------|------|
| 테이블 컬럼 (사용자별) | `letus_{name}_col_${userProfile.id}` | `letus_wms_col_abc123` |
| 테이블 컬럼 (전역) | `letus_{name}_col` | `letus_users_col` |
| 즐겨찾기 | `letus_favorites` | |
| 기타 UI 설정 | `letus_{feature}_{setting}` | `letus_filter_period` |

> - `userProfile`이 있는 파일 → 반드시 `_${userProfile.id}` 붙여서 사용자별로 분리
> - `{name}`은 파일/기능명으로, **기존 키와 겹치지 않아야 합니다**

---

## 13. 금지 사항 / 주의 사항

### ❌ 하면 안 되는 것

| 금지 | 이유 |
|------|------|
| 컴포넌트 안에서 `createClient()` 직접 호출 | `supabaseClient.js`의 싱글톤 인스턴스만 사용 |
| 페이지 컴포넌트 안에서 `useAuth()` 직접 호출 | `userProfile`은 props로 받아야 함 |
| `.env` 파일 커밋 | API 키 노출 위험 |
| `VITE_SUPABASE_SERVICE_ROLE_KEY`를 프론트에서 사용 | 관리자 권한 → Edge Function을 통해서만 |
| 채널명 중복 사용 | Realtime 구독 충돌 발생 |
| `window.supabase` 직접 사용 | 하위 호환용 임시 코드, 신규 코드에서는 import 사용 |

### ⚠️ 주의할 것

- **빌드(`npm run build`)는 배포 직전에만** 실행. 개발 중에는 `npm run dev` 사용
- 모달 컴포넌트는 가능하면 `createPortal`을 사용해 z-index 충돌 방지
- 이미지 업로드 시 **canvas 압축 (JPEG quality 0.6)** 후 Storage에 저장 (용량 절약)
- Supabase Realtime 구독은 `useEffect` cleanup에서 **반드시 `removeChannel`** 호출
- 테이블 `colSpan` 값은 `{colOrder.length + 1}` (체크박스 컬럼 포함)

---

## 부록: 주요 DB 테이블 요약

| 테이블 | 용도 | 자주 쓰는 컬럼 |
|--------|------|----------------|
| `logistics_issues` | 입고 특이사항 | status, brand, item_code, reporter, action_content |
| `logistics_returns` | 회수품/선출고 | is_recovered, is_completed, writer |
| `wms_shortage_list` | D-2 결품 | item_code, vendor, shortage_qty, upload_date |
| `products` | 상품 마스터 | item_code, item_color, item_name, vendor |
| `profiles` | 사용자 프로필 | name, role, managed_brands, managed_vendors |
| `rpa_jobs` | RPA 봇 정의 | rpa_name, runner_type, cron_expr, enabled |
| `rpa_runs` | RPA 실행 이력 | definition_id, status, started_at, finished_at |

## 부록: Edge Functions 요약

| 함수명 | 용도 |
|--------|------|
| `user-admin` | 사용자 생성·삭제·비번 변경 (Auth Admin) |
| `analyze-barcode` | 바코드 → 상품 정보 AI 조회 |
| `analyze-accidents` | 사고 데이터 AI 분석 |
| `send-push-notification` | 푸시 알림 발송 |
| `submit-mobile-issue` | 모바일 특이사항 제출 |

---

> 마지막 업데이트: 2026-05-27  
> 문의: 이 파일에 내용을 추가하거나 수정할 때는 날짜도 함께 갱신해 주세요.
