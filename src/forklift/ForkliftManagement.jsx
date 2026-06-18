import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';

// ─────────────────────────────────────────────────────────
// 뱃지 컴포넌트
// ─────────────────────────────────────────────────────────
const STATUS_STYLE = {
    '정상':   'bg-green-100 text-green-700 border border-green-200',
    '정비중': 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    '고장':   'bg-red-100 text-red-700 border border-red-200',
    '반납':   'bg-gray-100 text-gray-500 border border-gray-200',
    '매각':   'bg-gray-100 text-gray-400 border border-gray-200',
};

// 상태 뱃지 — 고장/정비중은 호버 시 툴팁 (이슈 고장유형 포함)
const ForkliftStatusBadge = ({ status, row, issue }) => {
    const tipRef = useRef(null);
    const showTip = status === '고장' || status === '정비중';

    const handleEnter = (e) => {
        if (!showTip) return;
        const el = tipRef.current;
        if (!el) return;
        const colorMap = { '고장': '#ef4444', '정비중': '#facc15' };
        const color = colorMap[status] || '#6b7280';
        const faultRow = issue?.faultType
            ? `<div style="font-size:12px;font-weight:700;color:#ea580c;margin-top:4px;padding:4px 6px;background:#fff7ed;border-radius:6px">${issue.faultType}</div>`
            : `<div style="font-size:12px;font-weight:700;color:#ea580c;margin-top:4px;padding:4px 6px;background:#fff7ed;border-radius:6px">기타</div>`;
        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
                <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
                <span style="font-size:14px;font-weight:900;color:#1f2937">${status}</span>
                <span style="font-size:12px;color:#6b7280;margin-left:auto">${row?.no ?? ''}</span>
            </div>
            ${faultRow}`;
        el.style.display = 'block';
        el.style.left = (e.clientX + 14) + 'px';
        el.style.top  = (e.clientY - 10) + 'px';
    };
    const handleMove  = (e) => {
        const el = tipRef.current;
        if (el && el.style.display !== 'none') {
            el.style.left = (e.clientX + 14) + 'px';
            el.style.top  = (e.clientY - 10) + 'px';
        }
    };
    const handleLeave = () => { if (tipRef.current) tipRef.current.style.display = 'none'; };

    return (
        <>
            <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-500'} ${showTip ? 'cursor-pointer' : ''}`}
                onMouseEnter={handleEnter}
                onMouseMove={handleMove}
                onMouseLeave={handleLeave}>
                {status ?? '-'}
            </span>
            <div ref={tipRef} style={{
                display: 'none', position: 'fixed', zIndex: 9999, pointerEvents: 'none',
                minWidth: '200px', maxWidth: '280px',
            }} className="bg-white border border-gray-200 rounded-xl shadow-xl p-3" />
        </>
    );
};

const OwnBadge = ({ type }) => (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
        type === '자가'
            ? 'bg-orange-100 text-orange-700 border border-orange-200'
            : 'bg-blue-100 text-blue-700 border border-blue-200'
    }`}>{type}</span>
);

// ─────────────────────────────────────────────────────────
// 컬럼 정의 (구분·소회사·관리자 제거됨)
// ─────────────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
    { label: '관리번호',    key: 'no',             w: 110 },
    { label: '센터',        key: 'center',         w: 90  },
    { label: '관리주체',    key: 'manager_org',    w: 100 },
    { label: '업무',        key: 'work_type',      w: 120 },
    { label: '제조사',      key: 'maker',          w: 80  },
    { label: '형태',        key: 'shape',          w: 100 },
    { label: '모델명',      key: 'model',          w: 100 },
    { label: '톤수',        key: 'ton',            w: 70  },
    { label: '소유구분',    key: 'own_type',       w: 85  },
    { label: '렌탈업체',    key: 'rental_company', w: 105 },
    { label: '탑승자(주)',  key: 'driver_day',     w: 90  },
    { label: '탑승자(야)',  key: 'driver_night',   w: 90  },
    { label: '장비상태',    key: 'status',         w: 80  },
    { label: '비고',        key: null,             w: 160 },
    { label: '제조연식',    key: 'made_year',      w: 95  },
    { label: '배터리연식',  key: 'battery_year',   w: 95  },
    { label: '차대번호',    key: 'vin',            w: 175 },
    { label: '자산코드',    key: 'asset_code',     w: 130 },
];

const STORAGE_KEY = (userId) => `letus_forklift_col_${userId}`;

const useCountUp = (target) => {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        if (target === 0) { setDisplay(0); return; }
        const steps = 40;
        const interval = 500 / steps;
        let step = 0;
        const timer = setInterval(() => {
            step++;
            setDisplay(Math.round(target * (step / steps)));
            if (step >= steps) clearInterval(timer);
        }, interval);
        return () => clearInterval(timer);
    }, [target]);
    return display;
};

const SummaryCard = ({ label, value, color, bg }) => {
    const display = useCountUp(value);
    return (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${bg}`}>
            <span className="text-xs text-gray-400 font-medium">{label}</span>
            <span className={`text-xl font-black ${color}`}>{display}</span>
            <span className="text-xs text-gray-400">대</span>
        </div>
    );
};

const CENTERS       = ['양지1', '양지2', '양지3', '안성', '평택', '음성', '대전', '대구', '부산', '광주', '전북', '전남', '울산', '창원', '기장', '제주', '이케아'];
const SHAPES        = ['리치', '카운터', '하이리치', '오더피커'];
const SHAPE_COLORS  = { '리치': '#4b89ff', '카운터': '#22c55e', '하이리치': '#eab308', '오더피커': '#a855f7' };
const SHAPE_BG      = { '리치': '#eff6ff', '카운터': '#f0fdf4', '하이리치': '#fefce8', '오더피커': '#faf5ff' };
const OWN_TYPES     = ['자가', '렌탈'];
const STATUSES      = ['정상', '정비중', '고장', '반납', '매각'];
const MANAGER_ORGS  = ['바로서비스', '하나물류', '에프스토리', '한국사람들', 'IPC', 'J&T'];
const EXCLUDE_STATUSES = ['반납', '매각'];

// 체크박스 드롭다운 필터 컴포넌트
const CheckboxDropdown = ({ label, options, selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const allSelected = selected.length === 0;

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggle = (opt) => {
        if (selected.includes(opt)) onChange(selected.filter(x => x !== opt));
        else onChange([...selected, opt]);
    };
    const toggleAll = () => onChange([]);

    const displayLabel = allSelected ? '전체' : selected.length === 1 ? selected[0] : `${selected.length}개 선택`;

    return (
        <div className="relative flex items-center gap-1.5" ref={ref}>
            <span className="text-xs font-bold text-gray-500 whitespace-nowrap">{label}</span>
            <button
                onClick={() => setOpen(v => !v)}
                className={`flex items-center gap-1 text-xs font-bold border rounded px-2.5 h-[28px] min-w-[80px] bg-white hover:border-letusBlue transition-colors ${open ? 'border-letusBlue' : 'border-gray-300'}`}
            >
                <span className="flex-1 text-left text-gray-600">{displayLabel}</span>
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[130px] py-1">
                    <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll}
                            className="w-4 h-4 accent-letusBlue cursor-pointer" />
                        <span className="text-sm font-bold text-gray-700">전체</span>
                    </label>
                    <div className="border-t border-gray-100 my-0.5" />
                    {options.map(opt => (
                        <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)}
                                className="w-4 h-4 accent-letusBlue cursor-pointer" />
                            <span className="text-sm text-gray-700">{opt}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

// 단일선택 드롭다운 (라벨 포함)
const LabeledSelect = ({ label, options, value, onChange }) => (
    <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-gray-500 whitespace-nowrap">{label}</span>
        <select value={value} onChange={e => onChange(e.target.value)}
            className="text-xs font-bold text-gray-600 border border-gray-300 rounded px-2.5 h-[28px] bg-white focus:outline-none focus:border-letusBlue min-w-[80px]">
            <option value="전체">전체</option>
            {options.map(o => <option key={o}>{o}</option>)}
        </select>
    </div>
);

// ─────────────────────────────────────────────────────────
// 등록/수정 모달 — 필드 컴포넌트는 모달 외부에 정의 (커서 유지)
// ─────────────────────────────────────────────────────────
const EMPTY_FORM = {
    no: '', center: '양지1', manager_org: '바로서비스', work_type: '',
    maker: '클락', makerCustom: '',
    shape: '리치', model: '', ton: '',
    own_type: '자가',
    rental_company: '', rentalCustom: '',
    driver_day: '', driver_night: '',
    made_year: '', battery_year: '',
    asset_code: '', vin: '', status: '정상', note: '',
};

// 월 입력값(YYYY-MM) → "YYYY년 MM월" 변환
const monthToKorean = (v) => {
    if (!v) return '';
    const [y, m] = v.split('-');
    return `${y}년 ${m}월`;
};
// "YYYY년 MM월" → "YYYY-MM" 역변환
const koreanToMonth = (v) => {
    if (!v) return '';
    const m = v.match(/(\d{4})년\s*(\d{1,2})월/);
    if (!m) return '';
    return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
};

// 공통 input 스타일
const INP = "w-full text-sm border border-gray-300 rounded px-2 h-[34px] focus:outline-none focus:border-letusBlue bg-white";
const SEL = "w-full text-sm border border-gray-300 rounded px-2 h-[34px] focus:outline-none focus:border-letusBlue bg-white";
const LBL = "block text-xs font-bold text-gray-500 mb-1";

// 최대 6개 표시 + 스크롤 커스텀 드롭다운 (센터용)
const ScrollSelect = ({ value, onChange, options }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);
    return (
        <div className="relative w-full" ref={ref}>
            <button type="button" onClick={() => setOpen(v => !v)}
                className={`w-full flex items-center justify-between text-sm border rounded px-2 h-[34px] bg-white focus:outline-none transition-colors ${open ? 'border-letusBlue' : 'border-gray-300 hover:border-gray-400'}`}>
                <span className="text-gray-700">{value}</span>
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                    style={{ maxHeight: '192px', overflowY: 'auto' }}>
                    {options.map(opt => (
                        <div key={opt}
                            onClick={() => { onChange(opt); setOpen(false); }}
                            className={`px-3 py-1.5 text-sm cursor-pointer transition-colors
                                ${opt === value ? 'bg-letusBlue text-white font-bold' : 'text-gray-700 hover:bg-blue-50'}`}>
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ForkliftModal = ({ mode, data, onClose, onSave }) => {
    const [form, setForm] = useState(mode === 'edit' ? { ...EMPTY_FORM, ...data } : { ...EMPTY_FORM });
    const set = useCallback((k, v) => setForm(prev => ({ ...prev, [k]: v })), []);

    const handleSaveClick = () => {
        const msg = mode === 'add' ? '등록하시겠습니까?' : '저장하시겠습니까?';
        if (!window.confirm(msg)) return;
        // 최종 저장 전 커스텀 값 병합
        const final = { ...form };
        if (form.maker === '기타') final.maker = form.makerCustom?.trim() || '기타';
        if (form.rental_company === '기타') final.rental_company = form.rentalCustom?.trim() || '기타';
        if (form.rental_company === '자가') final.rental_company = '';
        delete final.makerCustom;
        delete final.rentalCustom;
        onSave(final);
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
                    <h2 className="font-bold text-gray-800 text-base">
                        {mode === 'add' ? '지게차 신규 등록' : `지게차 정보 수정 — ${data?.no}`}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-4">

                        {/* 관리번호 */}
                        <div>
                            <label className={LBL}>관리번호</label>
                            <input value={form.no} onChange={e => set('no', e.target.value)}
                                placeholder="예: 양지-001" className={INP} />
                        </div>

                        {/* 센터 — 최대 6개 표시 + 스크롤 커스텀 드롭다운 */}
                        <div>
                            <label className={LBL}>센터</label>
                            <ScrollSelect value={form.center} onChange={v => set('center', v)} options={CENTERS} />
                        </div>

                        {/* 관리주체 */}
                        <div>
                            <label className={LBL}>관리주체</label>
                            <select value={form.manager_org} onChange={e => set('manager_org', e.target.value)} className={SEL}>
                                {MANAGER_ORGS.map(o => <option key={o}>{o}</option>)}
                            </select>
                        </div>

                        {/* 업무 */}
                        <div>
                            <label className={LBL}>업무</label>
                            <input value={form.work_type} onChange={e => set('work_type', e.target.value)}
                                placeholder="예: 피킹(E/F), 입고" className={INP} />
                        </div>

                        {/* 제조사 + 기타 직접입력 */}
                        <div>
                            <label className={LBL}>제조사</label>
                            <select value={form.maker} onChange={e => set('maker', e.target.value)} className={SEL}>
                                {['클락', '예일', '현대', '크라운', '도요타', '기타'].map(o => <option key={o}>{o}</option>)}
                            </select>
                            {form.maker === '기타' && (
                                <input value={form.makerCustom ?? ''} onChange={e => set('makerCustom', e.target.value)}
                                    placeholder="제조사 직접 입력" className={`${INP} mt-1.5`} />
                            )}
                        </div>

                        {/* 형태 */}
                        <div>
                            <label className={LBL}>형태</label>
                            <select value={form.shape} onChange={e => set('shape', e.target.value)} className={SEL}>
                                {['리치', '카운터', '하이리치', '오더피커'].map(o => <option key={o}>{o}</option>)}
                            </select>
                        </div>

                        {/* 모델명 */}
                        <div>
                            <label className={LBL}>모델명</label>
                            <input value={form.model} onChange={e => set('model', e.target.value)}
                                placeholder="예: CRX25, MR16HD" className={INP} />
                        </div>

                        {/* 톤수 — 소수점 직접 입력, 't' 단위 */}
                        <div>
                            <label className={LBL}>톤수</label>
                            <div className="relative">
                                <input type="number" step="0.1" min="0"
                                    value={form.ton?.replace(/[tT]/g, '') ?? ''}
                                    onChange={e => set('ton', e.target.value ? `${e.target.value}t` : '')}
                                    placeholder="예: 2.5"
                                    className={`${INP} pr-6`} />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">t</span>
                            </div>
                        </div>

                        {/* 소유구분 */}
                        <div>
                            <label className={LBL}>소유구분</label>
                            <select value={form.own_type} onChange={e => {
                                set('own_type', e.target.value);
                                if (e.target.value === '자가') {
                                    set('rental_company', '');
                                    set('rentalCustom', '');
                                }
                            }} className={SEL}>
                                {['자가', '렌탈'].map(o => <option key={o}>{o}</option>)}
                            </select>
                        </div>

                        {/* 렌탈업체 — 소유구분이 자가면 비활성화 */}
                        <div>
                            <label className={`${LBL} ${form.own_type === '자가' ? 'opacity-40' : ''}`}>렌탈업체</label>
                            <select
                                disabled={form.own_type === '자가'}
                                value={form.rental_company}
                                onChange={e => set('rental_company', e.target.value)}
                                className={`${SEL} ${form.own_type === '자가' ? 'opacity-40 cursor-not-allowed bg-gray-50' : ''}`}>
                                <option value="">선택</option>
                                {['한국공항', 'J&U', '크라운', 'DPL', '삼성건기', '기타'].map(o => <option key={o}>{o}</option>)}
                            </select>
                            {form.own_type === '렌탈' && form.rental_company === '기타' && (
                                <input value={form.rentalCustom ?? ''} onChange={e => set('rentalCustom', e.target.value)}
                                    placeholder="렌탈업체 직접 입력" className={`${INP} mt-1.5`} />
                            )}
                        </div>

                        {/* 탑승자(주간) */}
                        <div>
                            <label className={LBL}>탑승자(주간)</label>
                            <input value={form.driver_day} onChange={e => set('driver_day', e.target.value)}
                                placeholder="주간 탑승자" className={INP} />
                        </div>

                        {/* 탑승자(야간) */}
                        <div>
                            <label className={LBL}>탑승자(야간)</label>
                            <input value={form.driver_night} onChange={e => set('driver_night', e.target.value)}
                                placeholder="야간 탑승자" className={INP} />
                        </div>

                        {/* 제조연식 — month picker */}
                        <div>
                            <label className={LBL}>제조연식</label>
                            <input type="month"
                                value={koreanToMonth(form.made_year)}
                                onChange={e => set('made_year', monthToKorean(e.target.value))}
                                className={INP} />
                        </div>

                        {/* 배터리연식 — month picker */}
                        <div>
                            <label className={LBL}>배터리연식</label>
                            <input type="month"
                                value={koreanToMonth(form.battery_year)}
                                onChange={e => set('battery_year', monthToKorean(e.target.value))}
                                className={INP} />
                        </div>

                        {/* 비고 */}
                        <div className="col-span-2">
                            <label className={LBL}>비고</label>
                            <input value={form.note} onChange={e => set('note', e.target.value)}
                                placeholder="특이사항 입력" className={INP} />
                        </div>

                    </div>
                </div>
                <div className="px-6 py-4 border-t flex justify-end gap-2 shrink-0">
                    <button onClick={onClose}
                        className="text-sm font-bold text-gray-500 border border-gray-300 bg-white rounded px-4 h-[36px] hover:bg-gray-50">
                        취소
                    </button>
                    <button onClick={handleSaveClick}
                        className="text-sm font-bold text-white bg-letusBlue rounded px-5 h-[36px] hover:bg-blue-500 transition-colors">
                        {mode === 'add' ? '등록하기' : '저장하기'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 지게차 상세 / 이력 모달
// ─────────────────────────────────────────────────────────
const HISTORY_TYPES = ['배터리 교체', '타이어 교체', '마스트 수리', '유압 수리', '일반 정비', '부품 교체', '기타'];

// 필드 한글 라벨 매핑
const FIELD_LABELS = {
    no: '관리번호', center: '센터', manager_org: '관리주체', work_type: '업무',
    maker: '제조사', shape: '형태', model: '모델명', vin: '차대번호', ton: '톤수',
    own_type: '소유구분', rental_company: '렌탈업체', driver_day: '탑승자(주)',
    driver_night: '탑승자(야)', made_year: '제조연식', battery_year: '배터리연식',
    asset_code: '자산코드', status: '장비상태', note: '비고',
};

const ForkliftDetailModal = ({ forklift, onClose, onAddRepair, repairHistory, changeLogs }) => {
    const [tab,      setTab]      = useState('info');   // 'info' | 'repair' | 'changes'
    const [showForm, setShowForm] = useState(false);
    const [form, setForm]         = useState({ type: '일반 정비', date: '', detail: '', cost: '' });
    const [isSaving, setIsSaving] = useState(false);

    const handleAdd = async () => {
        if (!form.date || !form.detail) { alert('날짜와 내용을 입력해주세요.'); return; }
        setIsSaving(true);
        await onAddRepair(forklift.id, { ...form });
        setForm({ type: '일반 정비', date: '', detail: '', cost: '' });
        setShowForm(false);
        setIsSaving(false);
    };

    const TAB = ({ id, label, count }) => (
        <button onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
                tab === id ? 'border-letusBlue text-letusBlue' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {label}{count > 0 && <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">{count}</span>}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                {/* 헤더 */}
                <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div>
                            <span className="font-black text-gray-800 text-base">{forklift.no}</span>
                            <span className="ml-2 text-sm text-gray-400">{forklift.center} · {forklift.shape} · {forklift.model}</span>
                        </div>
                        <span className="text-[10px] font-mono text-gray-300 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                            ID: {forklift.id}
                        </span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
                </div>

                {/* 탭 */}
                <div className="px-6 flex gap-1 border-b shrink-0">
                    <TAB id="info"    label="기본 정보"      count={0} />
                    <TAB id="repair"  label="수리·정비 이력" count={repairHistory.length} />
                    <TAB id="changes" label="정보 변경 이력" count={changeLogs.length} />
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">

                    {/* ── 탭1: 기본 정보 */}
                    {tab === 'info' && (
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: '관리번호',    value: forklift.no },
                                { label: '센터',        value: forklift.center },
                                { label: '관리주체',    value: forklift.manager_org },
                                { label: '소유구분',    value: forklift.own_type },
                                { label: '장비상태',    value: forklift.status },
                                { label: '제조사',      value: forklift.maker },
                                { label: '형태',        value: forklift.shape },
                                { label: '모델명',      value: forklift.model },
                                { label: '톤수',        value: forklift.ton },
                                { label: '차대번호',    value: forklift.vin },
                                { label: '자산코드',    value: forklift.asset_code || '-' },
                                { label: '탑승자(주)',  value: forklift.driver_day || '-' },
                                { label: '탑승자(야)',  value: forklift.driver_night || '-' },
                                { label: '제조연식',    value: forklift.made_year || '-' },
                                { label: '배터리연식',  value: forklift.battery_year || '-' },
                                { label: '렌탈업체',    value: forklift.rental_company || '-' },
                                { label: '비고',        value: forklift.note || '-' },
                            ].map(item => (
                                <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                                    <div className="text-[10px] text-gray-400 font-bold mb-0.5">{item.label}</div>
                                    <div className="text-sm font-bold text-gray-700">{item.value}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── 탭2: 수리·정비 이력 */}
                    {tab === 'repair' && (
                        <>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-black text-gray-700">수리 · 정비 이력</span>
                                <button onClick={() => setShowForm(v => !v)}
                                    className="text-xs font-bold text-white bg-letusBlue rounded px-3 h-[28px] hover:bg-blue-500 transition-colors">
                                    + 이력 추가
                                </button>
                            </div>
                            {showForm && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 block mb-1">구분</label>
                                            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                                                className="w-full text-sm border border-gray-300 rounded px-2 h-[32px] focus:outline-none focus:border-letusBlue bg-white">
                                                {HISTORY_TYPES.map(t => <option key={t}>{t}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 block mb-1">날짜</label>
                                            <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                                                className="w-full text-sm border border-gray-300 rounded px-2 h-[32px] focus:outline-none focus:border-letusBlue bg-white" />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-xs font-bold text-gray-500 block mb-1">내용</label>
                                            <input value={form.detail} onChange={e => setForm(p => ({ ...p, detail: e.target.value }))}
                                                placeholder="수리/정비 내용을 입력하세요"
                                                className="w-full text-sm border border-gray-300 rounded px-2 h-[32px] focus:outline-none focus:border-letusBlue bg-white" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 block mb-1">비용 (원)</label>
                                            <input value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))}
                                                placeholder="예: 150000"
                                                className="w-full text-sm border border-gray-300 rounded px-2 h-[32px] focus:outline-none focus:border-letusBlue bg-white" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => setShowForm(false)}
                                            className="text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded px-3 h-[28px]">취소</button>
                                        <button onClick={handleAdd} disabled={isSaving}
                                            className="text-xs font-bold text-white bg-letusBlue rounded px-3 h-[28px] hover:bg-blue-500 disabled:opacity-50">
                                            {isSaving ? '저장 중...' : '저장'}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {repairHistory.length === 0 ? (
                                <div className="text-center text-gray-400 py-8 text-sm">등록된 수리·정비 이력이 없습니다.</div>
                            ) : (
                                <div className="space-y-2">
                                    {repairHistory.map((h, i) => (
                                        <div key={h.id ?? i} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
                                            <span className="shrink-0 inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 mt-0.5">{h.type}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-gray-700">{h.detail}</div>
                                                {h.cost && <div className="text-xs text-gray-400 mt-0.5">비용: {Number(h.cost).toLocaleString()}원</div>}
                                            </div>
                                            <div className="text-xs text-gray-400 shrink-0">{h.repair_date ?? h.date}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── 탭3: 정보 변경 이력 */}
                    {tab === 'changes' && (
                        <>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-black text-gray-700">정보 변경 이력</span>
                                <span className="text-xs text-gray-400">저장 시 자동 기록됩니다</span>
                            </div>
                            {changeLogs.length === 0 ? (
                                <div className="text-center text-gray-400 py-8 text-sm">변경 이력이 없습니다.</div>
                            ) : (
                                <div className="space-y-3">
                                    {changeLogs.map((h, i) => (
                                        <div key={h.id ?? i} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                                                <span className="text-xs font-black text-gray-600">
                                                    {h.changed_by || '관리자'} 수정
                                                </span>
                                                <span className="text-xs text-gray-400">{h.changed_at ? new Date(h.changed_at).toLocaleString('ko-KR') : ''}</span>
                                            </div>
                                            <div className="divide-y divide-gray-100">
                                                {(h.fields || []).map((f, fi) => (
                                                    <div key={fi} className="flex items-center gap-2 px-3 py-2 text-xs">
                                                        <span className="w-20 shrink-0 font-bold text-gray-500">{f.label}</span>
                                                        <span className="text-gray-400 line-through">{f.before || '(없음)'}</span>
                                                        <span className="text-gray-300">→</span>
                                                        <span className="font-bold text-gray-700">{f.after || '(없음)'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-6 py-3 border-t flex justify-end shrink-0">
                    <button onClick={onClose}
                        className="text-sm font-bold text-gray-500 border border-gray-300 bg-white rounded px-4 h-[34px] hover:bg-gray-50">닫기</button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────
export const ForkliftManagement = ({ userProfile }) => {

    const [colOrder,     setColOrder]     = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths,    setColWidths]    = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx,  setDragOverIdx]  = useState(null);
    const resizingRef   = useRef(null);
    const dragSrcRef    = useRef(null);
    const wasDraggedRef = useRef(false);

    const [data,         setData]         = useState([]);
    const [isLoading,    setIsLoading]    = useState(true);
    const [selectedIds,  setSelectedIds]  = useState([]);
    const [issues,       setIssues]       = useState([]);

    // 상세모달용 이력 상태
    const [repairHistory, setRepairHistory] = useState([]);
    const [changeLogs,    setChangeLogs]    = useState([]);

    // 필터 (센터·형태·상태는 다중선택, [] = 전체)
    const [filterCenter,     setFilterCenter]     = useState([]);
    const [filterShape,      setFilterShape]      = useState([]);
    const [filterOwn,        setFilterOwn]        = useState('전체');
    const [filterStatus,     setFilterStatus]     = useState([]);
    const [filterManagerOrg, setFilterManagerOrg] = useState('전체');
    const [excludeRetired,   setExcludeRetired]   = useState(true);  // 반납·매각 제외 (기본 체크)
    const [searchField,      setSearchField]      = useState('관리번호');
    const [searchValue,      setSearchValue]      = useState('');

    // 정렬
    const [sortConfig, setSortConfig] = useState({ key: 'no', direction: 'asc' });

    // 모달
    const [editModal,   setEditModal]   = useState(null);   // { mode, data? }
    const [detailModal, setDetailModal] = useState(null);   // forklift 객체

    // ── localStorage 복원/저장 (컬럼 설정 — UI 전용, 마이그레이션 대상 아님)
    useEffect(() => {
        if (!userProfile?.id) return;
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY(userProfile.id)));
            if (saved?.order?.length  === DEFAULT_COLUMNS.length) setColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS.length) setColWidths(saved.widths);
        } catch {}
    }, [userProfile?.id]);

    useEffect(() => {
        if (!userProfile?.id) return;
        localStorage.setItem(STORAGE_KEY(userProfile.id), JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths, userProfile?.id]);

    // ── Supabase 데이터 로딩
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            const { data: fData } = await supabase.from('forklifts').select('*').order('no');
            const { data: iData } = await supabase.from('forklift_issues').select('id, forklift_id, status');
            setData(fData || []);
            setIssues(iData || []);
            setIsLoading(false);
        };
        loadData();
    }, []);

    // 활성 이슈 맵 (forklift_id → issue)
    const issueMap = useMemo(() => {
        const map = {};
        (issues || []).forEach(issue => {
            if (['reported', 'accepted', 'completed'].includes(issue.status)) {
                if (!map[issue.forklift_id]) map[issue.forklift_id] = issue;
            }
        });
        return map;
    }, [issues]);

    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS.map(c => c.w));
        if (userProfile?.id) localStorage.removeItem(STORAGE_KEY(userProfile.id));
    };

    // ── 필터 + 정렬
    const filteredData = useMemo(() => {
        let r = [...data];
        // 반납·매각 제외 (기본 동작)
        if (excludeRetired) r = r.filter(x => !EXCLUDE_STATUSES.includes(x.status));
        // 다중선택 필터 (빈 배열 = 전체)
        if (filterCenter.length)     r = r.filter(x => filterCenter.includes(x.center));
        if (filterShape.length)      r = r.filter(x => filterShape.includes(x.shape));
        if (filterStatus.length)     r = r.filter(x => filterStatus.includes(x.status));
        if (filterOwn        !== '전체') r = r.filter(x => x.own_type    === filterOwn);
        if (filterManagerOrg !== '전체') r = r.filter(x => x.manager_org === filterManagerOrg);
        if (searchValue.trim()) {
            const q = searchValue.trim().toLowerCase();
            if (searchField === '관리번호')
                r = r.filter(x => x.no?.toLowerCase().includes(q));
            else
                r = r.filter(x => x.rental_company?.toLowerCase().includes(q));
        }
        if (sortConfig.key) {
            r.sort((a, b) => {
                const av = a[sortConfig.key] ?? '', bv = b[sortConfig.key] ?? '';
                if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
                if (av > bv) return sortConfig.direction === 'asc' ?  1 : -1;
                return 0;
            });
        }
        return r;
    }, [data, filterCenter, filterShape, filterOwn, filterStatus, filterManagerOrg, excludeRetired, searchField, searchValue, sortConfig]);

    // ── 현황 통계 카드
    const stats = useMemo(() => {
        // 반납·매각 제외한 운영 중 기준으로 현황 집계
        const active = data.filter(x => !EXCLUDE_STATUSES.includes(x.status));
        return {
            total:  active.length,
            own:    active.filter(x => x.own_type === '자가').length,
            rental: active.filter(x => x.own_type === '렌탈').length,
            normal: active.filter(x => x.status   === '정상').length,
            fault:  active.filter(x => x.status   === '고장').length,
            repair: active.filter(x => x.status   === '정비중').length,
        };
    }, [data]);

    // ── 정렬
    const requestSort = (key) => setSortConfig(prev =>
        prev.key === key && prev.direction === 'asc' ? { key, direction: 'desc' } : { key, direction: 'asc' }
    );
    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return <span className="text-letusBlue font-black text-[10px] ml-0.5">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    // ── 체크박스
    const handleSelectAll = () =>
        setSelectedIds(prev => prev.length === filteredData.length ? [] : filteredData.map(r => r.id));
    const handleSelectOne = (e, id) => {
        if (e.target.type === 'checkbox') return;
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    // ── 핸들러 5개
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
    const handleDragStart = (e, vi) => { dragSrcRef.current = vi; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver  = (e, vi) => { e.preventDefault(); setDragOverIdx(vi); };
    const handleDrop = (e, vi) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === vi) return;
        wasDraggedRef.current = true;
        const newOrder = [...colOrder];
        const [moved] = newOrder.splice(dragSrcRef.current, 1);
        newOrder.splice(vi, 0, moved);
        setColOrder(newOrder);
        dragSrcRef.current = null;
    };
    const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

    // ── renderCell
    const renderCell = (origIdx, row) => {
        const cls = "px-2 py-1.5 text-xs text-center";
        switch (origIdx) {
            case 0:  return <td key={origIdx} className={`${cls} font-bold text-letusBlue cursor-pointer hover:underline`}
                                onClick={e => { e.stopPropagation(); openDetailModal(row); }}>{row.no}</td>;
            case 1:  return <td key={origIdx} className={cls}>{row.center}</td>;
            case 2:  return <td key={origIdx} className={cls}>{row.manager_org}</td>;
            case 3:  return <td key={origIdx} className={`${cls} text-left`}>{row.work_type}</td>;
            case 4:  return <td key={origIdx} className={cls}>{row.maker}</td>;
            case 5:  return <td key={origIdx} className={cls}><span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ background: SHAPE_BG[row.shape] ?? '#f1f5f9', color: SHAPE_COLORS[row.shape] ?? '#64748b' }}>{row.shape}</span></td>;
            case 6:  return <td key={origIdx} className={cls}>{row.model}</td>;
            case 7:  return <td key={origIdx} className={cls}>{row.ton?.replace('T', 't')}</td>;
            case 8:  return <td key={origIdx} className={cls}><OwnBadge type={row.own_type} /></td>;
            case 9:  return <td key={origIdx} className={cls}>{row.rental_company || '-'}</td>;
            case 10: return <td key={origIdx} className={cls}>{row.driver_day || '-'}</td>;
            case 11: return <td key={origIdx} className={cls}>{row.driver_night || '-'}</td>;
            case 12: return <td key={origIdx} className={cls}><ForkliftStatusBadge status={row.status} row={row} issue={issueMap[row.id]} /></td>;
            case 13: return <td key={origIdx} className={`${cls} text-left text-gray-500`}>{row.note || ''}</td>;
            case 14: return <td key={origIdx} className={cls}>{row.made_year || '-'}</td>;
            case 15: return <td key={origIdx} className={cls}>{row.battery_year || '-'}</td>;
            case 16: return <td key={origIdx} className={`${cls} font-mono text-gray-400`}>{row.vin}</td>;
            case 17: return <td key={origIdx} className={`${cls} font-mono text-gray-400`}>{row.asset_code || '-'}</td>;
            default: return null;
        }
    };

    // ── 상세모달 열기 (수리이력 + 변경이력 로딩)
    const openDetailModal = async (forklift) => {
        setDetailModal(forklift);
        setRepairHistory([]);
        setChangeLogs([]);

        const { data: repairs } = await supabase
            .from('forklift_repairs')
            .select('*')
            .eq('forklift_id', forklift.id)
            .order('repair_date', { ascending: false });
        setRepairHistory(repairs || []);

        const { data: logs } = await supabase
            .from('forklift_change_logs')
            .select('*')
            .eq('forklift_id', forklift.id)
            .order('changed_at', { ascending: false });
        setChangeLogs(logs || []);
    };

    // ── 수리이력 추가 (Supabase insert)
    const handleAddRepair = async (forkliftId, entry) => {
        const { data: inserted } = await supabase.from('forklift_repairs').insert({
            forklift_id: forkliftId,
            type: entry.type,
            repair_date: entry.date,
            detail: entry.detail,
            repair_cost: entry.cost ? Number(entry.cost) : null,
            created_at: new Date().toISOString(),
        }).select().single();
        if (inserted) {
            setRepairHistory(prev => [inserted, ...prev]);
        }
    };

    // ── 등록/수정 저장 (Supabase CRUD)
    const handleSave = async (form, mode, originalData) => {
        if (mode === 'add') {
            const { data: inserted, error } = await supabase.from('forklifts').insert({
                no:             form.no,
                center:         form.center,
                manager_org:    form.manager_org,
                work_type:      form.work_type,
                maker:          form.maker,
                shape:          form.shape,
                model:          form.model,
                ton:            form.ton,
                own_type:       form.own_type,
                rental_company: form.rental_company,
                driver_day:     form.driver_day,
                driver_night:   form.driver_night,
                made_year:      form.made_year,
                battery_year:   form.battery_year,
                asset_code:     form.asset_code,
                vin:            form.vin,
                status:         form.status,
                note:           form.note,
                created_at:     new Date().toISOString(),
                updated_at:     new Date().toISOString(),
            }).select().single();
            if (!error && inserted) {
                setData(prev => [inserted, ...prev]);
            }
        } else {
            // 변경된 필드 자동 감지
            const old = originalData;
            const changedFieldsArr = Object.keys(FIELD_LABELS)
                .filter(k => (old[k] ?? '') !== (form[k] ?? ''))
                .map(k => ({ label: FIELD_LABELS[k], before: old[k] || '', after: form[k] || '' }));

            // forklifts 테이블 업데이트
            const { data: updated } = await supabase.from('forklifts').update({
                no:             form.no,
                center:         form.center,
                manager_org:    form.manager_org,
                work_type:      form.work_type,
                maker:          form.maker,
                shape:          form.shape,
                model:          form.model,
                ton:            form.ton,
                own_type:       form.own_type,
                rental_company: form.rental_company,
                driver_day:     form.driver_day,
                driver_night:   form.driver_night,
                made_year:      form.made_year,
                battery_year:   form.battery_year,
                asset_code:     form.asset_code,
                vin:            form.vin,
                status:         form.status,
                note:           form.note,
                updated_at:     new Date().toISOString(),
            }).eq('id', form.id).select().single();

            if (updated) {
                setData(prev => prev.map(x => x.id === form.id ? updated : x));
            }

            // 변경이력 기록
            if (changedFieldsArr.length > 0) {
                await supabase.from('forklift_change_logs').insert({
                    forklift_id: form.id,
                    changed_by:  userProfile?.name || '관리자',
                    changed_at:  new Date().toISOString(),
                    fields:      changedFieldsArr,
                });
            }
        }
        setSelectedIds([]);
        setEditModal(null);
    };

    // ── 반납·매각 모달
    const [retireModal, setRetireModal] = useState(null); // { type: '반납'|'매각', reason: '' }

    const openRetireModal = () => {
        if (!selectedIds.length) return;
        const today = new Date();
        const yy = String(today.getFullYear()).slice(2);
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        setRetireModal({ type: '반납', reason: '', date: `${yy}.${mm}.${dd}` });
    };

    const handleRetire = async () => {
        if (!retireModal) return;
        const { type, reason, date } = retireModal;

        for (const id of selectedIds) {
            const target = data.find(x => x.id === id);
            if (!target) continue;
            const parts = [`[${type}]`];
            if (reason) parts.push(reason);
            if (date) parts.push(`(${date})`);
            await supabase.from('forklifts').update({
                status:     type,
                note:       parts.join(' '),
                updated_at: new Date().toISOString(),
            }).eq('id', id);
        }

        setData(prev => prev.map(x => {
            if (!selectedIds.includes(x.id)) return x;
            const parts = [`[${type}]`];
            if (reason) parts.push(reason);
            if (date) parts.push(`(${date})`);
            return { ...x, status: type, note: parts.join(' ') };
        }));
        setSelectedIds([]);
        setRetireModal(null);
    };

    // ── 원복
    const [restoreModal, setRestoreModal] = useState(false);

    const handleRestore = async () => {
        for (const id of selectedIds) {
            await supabase.from('forklifts').update({
                status:     '정상',
                updated_at: new Date().toISOString(),
            }).eq('id', id);
        }
        setData(prev => prev.map(x => {
            if (!selectedIds.includes(x.id)) return x;
            return { ...x, status: '정상' };
        }));
        setSelectedIds([]);
        setRestoreModal(false);
    };

    // ── 삭제 확인 모달
    const [deleteModal, setDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    const openDeleteModal = () => {
        if (!selectedIds.length) return;
        setDeleteConfirmText('');
        setDeleteModal(true);
    };

    const handleDelete = async () => {
        await supabase.from('forklifts').delete().in('id', selectedIds);
        setData(prev => prev.filter(x => !selectedIds.includes(x.id)));
        setSelectedIds([]);
        setDeleteModal(false);
        setDeleteConfirmText('');
    };

    const isAdmin = userProfile?.role === '관리자';

    // 원복 버튼: 선택 항목 중 반납/매각 상태인 것이 있을 때
    const hasRetired = selectedIds.length > 0
        && data.filter(x => selectedIds.includes(x.id)).some(x => EXCLUDE_STATUSES.includes(x.status));

    // 수정 버튼: 1개만 선택했을 때만 활성화
    const selectedOne = selectedIds.length === 1
        ? data.find(x => x.id === selectedIds[0])
        : null;

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* ━━━ 헤더 + 필터 + 툴바 카드 ━━━ */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex flex-col z-30 shrink-0">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-base font-black text-gray-800">지게차 관리대장</span>
                    <span className="text-xs text-gray-400">전동식 운영 현황</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <SummaryCard label="전체 장비" value={stats.total}  color="text-gray-800"    bg="bg-gray-50 border-gray-200" />
                    <SummaryCard label="자가"      value={stats.own}    color="text-letusOrange" bg="bg-orange-50 border-orange-200" />
                    <SummaryCard label="렌탈"      value={stats.rental} color="text-letusBlue"   bg="bg-blue-50 border-blue-200" />
                    <SummaryCard label="정상"      value={stats.normal} color="text-green-600"   bg="bg-green-50 border-green-200" />
                    <SummaryCard label="정비중"    value={stats.repair} color="text-yellow-600"  bg="bg-yellow-50 border-yellow-200" />
                    <SummaryCard label="고장"      value={stats.fault}  color="text-red-600"     bg="bg-red-50 border-red-200" />
                </div>

                {/* 조회 필터 */}
                <div className="border-t border-gray-100 pt-2.5 mt-2.5">
                <div className="flex items-center gap-3 flex-wrap">
                    <LabeledSelect label="관리주체" options={MANAGER_ORGS} value={filterManagerOrg} onChange={v => { setFilterManagerOrg(v); setFilterCenter([]); }} />
                    <div className="w-px h-5 bg-gray-200" />
                    <CheckboxDropdown label="센터" options={filterManagerOrg === '전체' ? CENTERS : CENTERS.filter(c => data.some(x => x.manager_org === filterManagerOrg && x.center === c))} selected={filterCenter} onChange={setFilterCenter} />
                    <div className="w-px h-5 bg-gray-200" />
                    <CheckboxDropdown label="장비형태" options={SHAPES} selected={filterShape} onChange={setFilterShape} />
                    <div className="w-px h-5 bg-gray-200" />
                    <LabeledSelect label="소유구분" options={OWN_TYPES} value={filterOwn} onChange={setFilterOwn} />
                    <div className="w-px h-5 bg-gray-200" />
                    <CheckboxDropdown label="장비상태" options={STATUSES} selected={filterStatus} onChange={setFilterStatus} />
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={excludeRetired} onChange={e => setExcludeRetired(e.target.checked)}
                            className="w-4 h-4 accent-letusBlue cursor-pointer" />
                        <span className="text-xs font-bold text-gray-500">반납·매각 제외</span>
                    </label>
                    <div className="w-px h-5 bg-gray-200" />
                    <div className="flex items-center gap-1">
                        <select value={searchField} onChange={e => setSearchField(e.target.value)}
                            className="text-xs font-bold text-gray-600 border border-gray-300 rounded px-2 h-[28px] bg-white focus:outline-none focus:border-letusBlue">
                            <option>관리번호</option>
                            <option>렌탈업체</option>
                        </select>
                        <input type="text" placeholder="검색어 입력"
                            value={searchValue} onChange={e => setSearchValue(e.target.value)}
                            className="text-xs text-gray-600 border border-gray-300 rounded px-3 h-[28px] w-36 focus:outline-none focus:border-letusBlue" />
                    </div>
                </div>
            </div>

                {/* 툴바 */}
                <div className="border-t border-gray-100 pt-2.5 mt-2.5 flex items-center">
                {/* 왼쪽: 조회 결과 수 */}
                <span className="text-sm text-gray-500">
                    총 <strong className="text-letusBlue">{filteredData.length}</strong>건
                    {selectedIds.length > 0 && (
                        <span className="ml-2 text-letusOrange font-bold">{selectedIds.length}건 선택됨</span>
                    )}
                </span>

                {/* 오른쪽: 액션 버튼들 */}
                <div className="ml-auto flex items-center gap-2">
                    {/* 칼럼 초기화 */}
                    <button onClick={resetColSettings}
                        className="flex items-center gap-1.5 text-xs font-bold text-gray-600 border border-gray-300 bg-white rounded-lg px-3 h-[32px] hover:bg-gray-50 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        칼럼 초기화
                    </button>

                    {isAdmin && (
                        <>
                            {/* 원복 */}
                            {hasRetired && (
                                <button onClick={() => setRestoreModal(true)}
                                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 border border-emerald-300 bg-white rounded-lg px-3 h-[32px] hover:bg-emerald-50 transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                    </svg>
                                    원복 ({selectedIds.length})
                                </button>
                            )}

                            {/* 반납·매각 — 선택 항목이 모두 정상/정비/고장 상태일 때만 표시 */}
                            {selectedIds.length > 0 && !hasRetired && (
                                <button onClick={openRetireModal}
                                    className="flex items-center gap-1.5 text-xs font-bold text-amber-600 border border-amber-300 bg-white rounded-lg px-3 h-[32px] hover:bg-amber-50 transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    반납·매각 ({selectedIds.length})
                                </button>
                            )}

                            {/* 선택 삭제 */}
                            {selectedIds.length > 0 && (
                                <button onClick={openDeleteModal}
                                    className="flex items-center gap-1.5 text-xs font-bold text-red-500 border border-red-300 bg-white rounded-lg px-3 h-[32px] hover:bg-red-50 transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    삭제 ({selectedIds.length})
                                </button>
                            )}

                            {/* 수정 — 1개 선택 시 활성화 */}
                            <button
                                onClick={() => selectedOne && setEditModal({ mode: 'edit', data: selectedOne })}
                                disabled={!selectedOne}
                                className={`flex items-center gap-1.5 text-xs font-bold border rounded-lg px-3 h-[32px] transition-colors
                                    ${selectedOne
                                        ? 'text-letusBlue border-letusBlue/50 bg-blue-50 hover:bg-blue-100 cursor-pointer'
                                        : 'text-gray-300 border-gray-200 bg-white cursor-not-allowed'}`}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                {selectedOne ? `수정 (${selectedOne.no})` : '수정'}
                            </button>

                            {/* 장비 등록 */}
                            <button onClick={() => setEditModal({ mode: 'add' })}
                                className="flex items-center gap-1.5 text-sm font-bold text-white bg-letusBlue rounded-lg px-4 h-[32px] hover:bg-blue-500 transition-colors shadow-sm">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                장비 등록
                            </button>
                        </>
                    )}
                </div>
                </div>
            </div>

            {/* ━━━ 3영역: 리스트 테이블 ━━━ */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
            <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                <table className="w-full text-left whitespace-nowrap table-fixed">
                    <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="w-10 text-center shrink-0">
                                <label className="flex items-center justify-center w-full h-full px-3 py-2 cursor-pointer">
                                    <input type="checkbox"
                                        checked={selectedIds.length === filteredData.length && filteredData.length > 0}
                                        onChange={handleSelectAll}
                                        className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                                </label>
                            </th>
                            {colOrder.map((origIdx, visualIdx) => {
                                const col = DEFAULT_COLUMNS[origIdx];
                                return (
                                    <th key={origIdx}
                                        className={`relative px-2 py-2 text-center select-none transition-colors cursor-grab active:cursor-grabbing
                                            ${col.key ? 'hover:bg-gray-100' : ''}
                                            ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                                        style={{ width: colWidths[origIdx] }}
                                        draggable
                                        onClick={() => !wasDraggedRef.current && col.key && requestSort(col.key)}
                                        onDragStart={e => handleDragStart(e, visualIdx)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={e => handleDragOver(e, visualIdx)}
                                        onDrop={e => handleDrop(e, visualIdx)}
                                        onDragLeave={() => setDragOverIdx(null)}>
                                        <div className="flex items-center justify-center gap-1">
                                            {col.label}
                                            {col.key && getSortIcon(col.key)}
                                        </div>
                                        <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                            onMouseDown={e => handleResizeStart(e, visualIdx)}
                                            onClick={e => e.stopPropagation()} />
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>

                    {isLoading ? (
                        <tbody>
                            {Array.from({ length: 8 }).map((_, i) => (
                                <tr key={i} className="border-b">
                                    <td colSpan={colOrder.length + 1} className="p-4">
                                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    ) : filteredData.length === 0 ? (
                        <tbody>
                            <tr>
                                <td colSpan={colOrder.length + 1} className="py-20 text-center text-gray-400">
                                    <div className="text-3xl mb-2">🏗️</div>
                                    <div className="font-bold">조건에 맞는 장비가 없습니다.</div>
                                </td>
                            </tr>
                        </tbody>
                    ) : (
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredData.map(row => (
                                <tr key={row.id}
                                    className={`hover:bg-blue-50/30 transition-colors
                                        ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''}`}>
                                    <td className="text-center">
                                        <label className="flex items-center justify-center w-full h-full px-3 py-2 cursor-pointer">
                                            <input type="checkbox"
                                                checked={selectedIds.includes(row.id)}
                                                onChange={() => setSelectedIds(prev =>
                                                    prev.includes(row.id) ? prev.filter(i => i !== row.id) : [...prev, row.id])}
                                                className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                                        </label>
                                    </td>
                                    {colOrder.map(origIdx => renderCell(origIdx, row))}
                                </tr>
                            ))}
                        </tbody>
                    )}
                </table>
            </div>
            </div>

            {/* ── 모달들 */}
            {editModal && (
                <ForkliftModal
                    mode={editModal.mode}
                    data={editModal.data}
                    onClose={() => setEditModal(null)}
                    onSave={(form) => handleSave(form, editModal.mode, editModal.data)}
                />
            )}
            {detailModal && (
                <ForkliftDetailModal
                    forklift={detailModal}
                    onClose={() => setDetailModal(null)}
                    onAddRepair={handleAddRepair}
                    repairHistory={repairHistory}
                    changeLogs={changeLogs}
                />
            )}

            {/* ── 반납·매각 모달 */}
            {retireModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-2xl shadow-2xl w-[400px] p-6">
                        <h2 className="text-base font-black text-gray-800 mb-4">반납 / 매각 처리</h2>
                        <p className="text-xs text-gray-500 mb-4">
                            선택한 <span className="font-bold text-gray-700">{selectedIds.length}대</span>의 장비를 처리합니다.
                        </p>

                        {/* 반납 / 매각 선택 */}
                        <div className="flex gap-3 mb-4">
                            {['반납', '매각'].map(t => (
                                <button key={t}
                                    onClick={() => setRetireModal(prev => ({ ...prev, type: t }))}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-colors
                                        ${retireModal.type === t
                                            ? t === '반납'
                                                ? 'border-amber-400 bg-amber-50 text-amber-700'
                                                : 'border-red-400 bg-red-50 text-red-700'
                                            : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>

                        {/* 날짜 선택 */}
                        <div className="mb-4">
                            <label className="text-xs font-bold text-gray-500 mb-1.5 block">날짜</label>
                            <input
                                type="date"
                                value={retireModal.date
                                    ? `20${retireModal.date.replace(/\./g, '-')}`
                                    : ''}
                                onChange={e => {
                                    const v = e.target.value; // "2026-06-05"
                                    if (!v) { setRetireModal(prev => ({ ...prev, date: '' })); return; }
                                    const [y, m, d] = v.split('-');
                                    setRetireModal(prev => ({ ...prev, date: `${String(y).slice(2)}.${m}.${d}` }));
                                }}
                                className="text-sm border border-gray-300 rounded-lg px-3 h-[34px] focus:outline-none focus:border-letusBlue"
                            />
                        </div>

                        {/* 사유 입력 */}
                        <div className="mb-5">
                            <label className="text-xs font-bold text-gray-500 mb-1.5 block">
                                사유 <span className="text-gray-400 font-normal">(비고란에 자동 기록됩니다)</span>
                            </label>
                            <textarea
                                value={retireModal.reason}
                                onChange={e => setRetireModal(prev => ({ ...prev, reason: e.target.value }))}
                                placeholder={`${retireModal.type} 사유를 입력하세요`}
                                rows={3}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-letusBlue"
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <button onClick={() => setRetireModal(null)}
                                className="px-4 py-2 text-sm font-bold text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                                취소
                            </button>
                            <button onClick={handleRetire}
                                className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors
                                    ${retireModal.type === '반납' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-500 hover:bg-red-600'}`}>
                                {retireModal.type} 처리
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 삭제 확인 모달 */}
            {deleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-2xl shadow-2xl w-[400px] p-6">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                            </div>
                            <h2 className="text-base font-black text-gray-800">장비 삭제</h2>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                            선택한 <span className="font-bold text-red-600">{selectedIds.length}대</span>의 장비를 영구 삭제합니다.
                        </p>
                        <p className="text-xs text-gray-400 mb-4">삭제된 데이터는 복구할 수 없습니다.</p>

                        <div className="bg-gray-50 rounded-lg px-3 py-2.5 mb-4">
                            <p className="text-xs text-gray-500 mb-2">
                                삭제를 원하시면 아래에 <span className="font-black text-red-600">삭제</span> 를 입력하세요.
                            </p>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                placeholder="삭제"
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400"
                                autoFocus
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setDeleteModal(false); setDeleteConfirmText(''); }}
                                className="px-4 py-2 text-sm font-bold text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                                취소
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleteConfirmText !== '삭제'}
                                className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors
                                    ${deleteConfirmText === '삭제'
                                        ? 'bg-red-500 hover:bg-red-600 cursor-pointer'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 원복 확인 모달 */}
            {restoreModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-2xl shadow-2xl w-[360px] p-6">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                            </div>
                            <h2 className="text-base font-black text-gray-800">운행상태 원복</h2>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                            선택한 <span className="font-bold text-emerald-600">{selectedIds.length}대</span>의 장비를 <span className="font-bold">정상</span> 상태로 원복하시겠습니까?
                        </p>
                        <p className="text-xs text-gray-400 mb-5">운행상태가 '정상'으로 변경되며 관리대장에 다시 표시됩니다.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setRestoreModal(false)}
                                className="px-4 py-2 text-sm font-bold text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                                취소
                            </button>
                            <button onClick={handleRestore}
                                className="px-4 py-2 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors">
                                원복
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
