# LETUS LOGIS — 프로젝트 지침

## 세션 시작 시 필수 행동

이 프로젝트 디렉토리에서 세션이 시작되면, 가장 먼저 아래 파일을 읽어 프로젝트 전체 구조를 파악한다.

```
C:\Users\FURSYS\Desktop\Python\LetusLogis\PROJECT_MAP.md
```

PROJECT_MAP.md에는 다음이 포함되어 있다:
- 전체 디렉토리 구조 및 각 파일 역할
- 주요 DB 테이블 / Storage 버킷 목록
- 핵심 기능 흐름 (입고 특이사항, WMS 결품 추출, RPA Worker 등)
- 시스템 아키텍처 다이어그램
- Edge Functions, 환경변수, 빌드 명령어
- 최근 변경 이력

사용자의 첫 번째 요청을 처리하기 전에 이 파일을 읽어 컨텍스트를 확보한다.

---

## 테이블 UI 표준 (전 메뉴 공통)

모든 데이터 테이블은 아래 표준을 따른다. **새 테이블을 만들거나 기존 테이블을 수정할 때 반드시 이 표준을 적용한다.**

### 적용 파일 목록

| 파일 | localStorage 키 | 비고 |
|------|-----------------|------|
| IssueList.jsx | `letus_col_${userId}` | 기준 구현체 |
| AccidentList.jsx | `letus_accident_col_${userId}` / `letus_accident_ai_col_${userId}` | isAiView 뷰별 분리 |
| WmsShortageList.jsx | `letus_wms_col_${userId}` | sub 라벨(소제목) 지원 |
| ReturnsManagement.jsx | `letus_returns_col_${userId}` | |
| UserManagement.jsx | `letus_users_col` | userId 없음(전역) |
| WorkerManagement.jsx | `letus_workers_col` | userId 없음(전역) |
| AttendanceManagement.jsx | `letus_attendance_col` | 상세 탭만 적용 |
| RpaManagement.jsx | `letus_rpa_col` | userId 없음(전역) |

### localStorage 키 규칙
- `userProfile`이 있는 파일: `letus_{name}_col_${userProfile.id}` (사용자별 저장)
- `userProfile`이 없는 파일: `letus_{name}_col` (브라우저 공용)
- 새 파일 추가 시 기존 키와 충돌하지 않도록 고유한 `{name}` 사용

### 필수 구현 요소

#### 1. DEFAULT_COLUMNS 상수 (컴포넌트 밖)
```jsx
const DEFAULT_COLUMNS = [
    { label: '컬럼명', key: 'db_field', w: 150 },  // w는 픽셀 숫자
    { label: '버튼 컬럼', key: null, w: 110 },       // key: null = 정렬 불가
    { label: '소제목 있는 컬럼', key: 'field', sub: '(부연설명)', w: 80 }, // sub 선택사항
];
```

#### 2. 상태 & refs (컴포넌트 내부)
```jsx
const [colOrder, setColOrder] = useState(DEFAULT_COLUMNS.map((_, i) => i));
const [colWidths, setColWidths] = useState(DEFAULT_COLUMNS.map(c => c.w));
const [dragOverIdx, setDragOverIdx] = useState(null);
const resizingRef = useRef(null);
const dragSrcRef = useRef(null);
const wasDraggedRef = useRef(false);
```

#### 3. useEffect: 로드/저장/초기화
```jsx
// 로드 (userProfile 있는 경우)
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
    localStorage.setItem(`letus_NAME_col_${userProfile.id}`, JSON.stringify({ order: colOrder, widths: colWidths }));
}, [colOrder, colWidths, userProfile?.id]);

const resetColSettings = () => {
    setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
    setColWidths(DEFAULT_COLUMNS.map(c => c.w));
    if (userProfile?.id) localStorage.removeItem(`letus_NAME_col_${userProfile.id}`);
};
```

#### 4. 핸들러 (5개, 모든 파일 동일)
```jsx
const handleResizeStart = (e, visualIdx) => {
    e.preventDefault(); e.stopPropagation();
    const origIdx = colOrder[visualIdx];
    resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
    const onMove = (ev) => {
        const { origIdx, startX, startW } = resizingRef.current;
        setColWidths(prev => { const n = [...prev]; n[origIdx] = Math.max(50, startW + (ev.clientX - startX)); return n; });
    };
    const onUp = () => { resizingRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
};
const handleDragStart = (e, visualIdx) => { dragSrcRef.current = visualIdx; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
const handleDragOver = (e, visualIdx) => { e.preventDefault(); setDragOverIdx(visualIdx); };
const handleDrop = (e, visualIdx) => {
    e.preventDefault(); setDragOverIdx(null);
    if (dragSrcRef.current === null || dragSrcRef.current === visualIdx) return;
    wasDraggedRef.current = true;
    const newOrder = [...colOrder]; const [moved] = newOrder.splice(dragSrcRef.current, 1); newOrder.splice(visualIdx, 0, moved);
    setColOrder(newOrder); dragSrcRef.current = null;
};
const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };
```

#### 5. renderCell (origIdx 기준 switch)
```jsx
const renderCell = (origIdx, row) => {
    switch (origIdx) {
        case 0: return <td key={origIdx} className="p-4 text-center">{row.field}</td>;
        default: return null;
    }
};
```

#### 6. thead 구조
> **기준 구현체: IssueList.jsx** — `<th>` 자체에 `draggable` 적용. 별도 ⠿ span 사용하지 않음.
> `getSortIcon`은 활성 컬럼에만 ↑/↓ 반환, 비활성은 `null` 반환.

```jsx
<thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
    <tr>
        {/* 체크박스: 항상 고정 첫 번째 (행 선택이 있는 테이블만) */}
        <th className="p-4 pl-6 w-10 text-center shrink-0">
            <input type="checkbox" ... className="w-4 h-4 accent-letusBlue cursor-pointer" />
        </th>
        {colOrder.map((origIdx, visualIdx) => {
            const col = DEFAULT_COLUMNS[origIdx];
            return (
                <th key={origIdx}
                    className={`relative p-4 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                    style={{ width: colWidths[origIdx] }}
                    draggable
                    onClick={() => !wasDraggedRef.current && col.key && requestSort(col.key)}
                    onDragStart={(e) => handleDragStart(e, visualIdx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, visualIdx)}
                    onDrop={(e) => handleDrop(e, visualIdx)}
                    onDragLeave={() => setDragOverIdx(null)}
                >
                    <div className="flex items-center justify-center gap-1">
                        {col.label}
                        {col.key && getSortIcon(col.key)}
                    </div>
                    {col.sub && <div className="text-[9px] text-gray-400 font-normal mt-0.5">{col.sub}</div>}
                    <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                        onMouseDown={(e) => handleResizeStart(e, visualIdx)} onClick={e => e.stopPropagation()} />
                </th>
            );
        })}
    </tr>
</thead>
```

#### 7. tbody tr 구조
```jsx
<tr key={row.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''}`}
    onClick={(e) => handleSelectOne(e, row.id)}>
    <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={(e) => handleSelectOne(e, row.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" />
    </td>
    {colOrder.map(origIdx => renderCell(origIdx, row))}
</tr>
```

#### 8. 칼럼 초기화 버튼 (테이블 상단 우측, 선택실행 버튼 왼쪽)
```jsx
<button onClick={resetColSettings}
    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
    title="컬럼 너비·순서를 기본값으로 초기화">
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
    칼럼 초기화
</button>
```

### 기타 표준
- `<table>` className: `w-full text-left whitespace-nowrap table-fixed`
- scroll container: `p-0 overflow-auto flex-1 custom-scrollbar outline-none`
- 로딩/빈 상태 `colSpan`: `{colOrder.length + 1}` (체크박스 포함)
- `getSortIcon(key)` 함수: 활성 컬럼만 `↑`/`↓` (`text-letusBlue font-black`), 비활성은 `null` 반환
- 행 선택 스타일: `bg-blue-50` (선택), `hover:bg-blue-50/30` (hover)

---

## 프로젝트 개요

- **시스템명**: LETUS LOGIS (일룸 물류 입고 특이사항 통합 관리 시스템)
- **기술 스택**: React 18 + Vite + TailwindCSS / Supabase (PostgreSQL + Edge Functions) / Python RPA (Playwright) / Node.js Local Worker
- **배포**: Vercel (프론트엔드) + Supabase Cloud (백엔드)
- **내부 연동**: MS-SQL (fgdw, 상품마스터) / WMS (결품추출)
