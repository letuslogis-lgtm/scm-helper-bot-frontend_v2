import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon, SearchButton, DateRangeInput, formatDateTime } from './SharedUI.jsx';

const BRANDS = ['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소', '기타'];

const DEFAULT_COLUMNS = [
    { label: '출고예정일',  key: 'scheduled_date',    w: 110 },
    { label: '브랜드',      key: 'brand',              w: 100 },
    { label: '품목코드',    key: 'item_code',          w: 130 },
    { label: '수량',        key: 'quantity',           w: 70  },
    { label: '하차지',      key: 'destination',        w: 130 },
    { label: '상차시간',    key: 'loading_time',       w: 90  },
    { label: '등록자',      key: 'registered_by_name', w: 100 },
    { label: '등록일시',    key: 'created_at',         w: 145 },
];

const LSKey = (uid) => `letus_outgoing_notes_col_${uid}`;

const toKST = () =>
    new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const displayBrand = (row) =>
    row.brand === '기타' && row.brand_custom ? row.brand_custom : row.brand;

const displayDest = (row) =>
    row.destination === '기타' && row.destination_custom ? row.destination_custom : row.destination;

const INIT_FORM = {
    scheduled_date: '', brand: '', brand_custom: '',
    item_code: '', quantity: '', destination: '', destination_custom: '', loading_time: '',
};

export function OutgoingNotes({ userProfile }) {
    const today = toKST();

    // ── 필터 상태
    const [startDate, setStartDate]     = useState(today);
    const [endDate,   setEndDate]       = useState(today);
    const [centerFilter, setCenterFilter] = useState('');

    // ── 데이터
    const [notes,       setNotes]       = useState([]);
    const [loading,     setLoading]     = useState(false);
    const [allCenters,  setAllCenters]  = useState([]);
    const [operCenters, setOperCenters] = useState([]);

    // ── 선택
    const [selectedIds,   setSelectedIds]   = useState([]);
    const [isActionOpen,  setIsActionOpen]  = useState(false);

    // ── 모달
    const [isRegOpen,    setIsRegOpen]    = useState(false);
    const [isDelConfirm, setIsDelConfirm] = useState(false);
    const [form,         setForm]         = useState(INIT_FORM);
    const [submitting,   setSubmitting]   = useState(false);

    // ── 정렬
    const [sortKey, setSortKey] = useState('scheduled_date');
    const [sortDir, setSortDir] = useState('desc');

    // ── 칼럼 설정
    const [colOrder,    setColOrder]    = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths,   setColWidths]   = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef   = useRef(null);
    const dragSrcRef    = useRef(null);
    const wasDraggedRef = useRef(false);

    // ── localStorage 로드 / 저장
    useEffect(() => {
        if (!userProfile?.id) return;
        try {
            const saved = JSON.parse(localStorage.getItem(LSKey(userProfile.id)));
            if (saved?.order?.length  === DEFAULT_COLUMNS.length) setColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS.length) setColWidths(saved.widths);
        } catch {}
    }, [userProfile?.id]);

    useEffect(() => {
        if (!userProfile?.id) return;
        localStorage.setItem(LSKey(userProfile.id), JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths, userProfile?.id]);

    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS.map(c => c.w));
        if (userProfile?.id) localStorage.removeItem(LSKey(userProfile.id));
    };

    // ── 초기 로드
    useEffect(() => { fetchCenters(); }, []);
    useEffect(() => { fetchNotes(); },   []);  // eslint-disable-line react-hooks/exhaustive-deps

    const fetchCenters = async () => {
        const { data } = await supabase
            .from('centers').select('name, purposes')
            .eq('is_active', true).order('sort_order');
        if (!data) return;
        setAllCenters(data.map(c => c.name));
        setOperCenters(
            data.filter(c => Array.isArray(c.purposes) && c.purposes.includes('재고 운영')).map(c => c.name)
        );
    };

    const fetchNotes = async () => {
        setLoading(true);
        let q = supabase.from('outgoing_notes').select('*')
            .gte('scheduled_date', startDate)
            .lte('scheduled_date', endDate)
            .order('scheduled_date', { ascending: false })
            .order('created_at',     { ascending: false });
        if (centerFilter) q = q.eq('destination', centerFilter);
        const { data, error } = await q;
        if (!error) setNotes(data || []);
        setLoading(false);
        setSelectedIds([]);
    };

    // ── 정렬
    const sorted = useMemo(() => {
        if (!sortKey) return notes;
        return [...notes].sort((a, b) => {
            const av = a[sortKey] ?? '';
            const bv = b[sortKey] ?? '';
            return sortDir === 'asc'
                ? (av < bv ? -1 : av > bv ? 1 : 0)
                : (av > bv ? -1 : av < bv ? 1 : 0);
        });
    }, [notes, sortKey, sortDir]);

    const requestSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };

    const getSortIcon = (key) => {
        if (sortKey !== key) return null;
        return <span className="text-letusBlue font-black ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };

    // ── 선택
    const handleSelectAll = (e) =>
        setSelectedIds(e.target.checked ? sorted.map(r => r.id) : []);
    const handleSelectOne = (e, id) => {
        e.stopPropagation();
        setSelectedIds(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id));
    };

    const isAdmin = userProfile?.role?.includes('관리자');

    // ── 등록
    const handleRegister = async () => {
        if (!form.scheduled_date || !form.brand || !form.item_code || !form.quantity || !form.destination) {
            alert('필수 항목을 모두 입력해주세요.'); return;
        }
        if (form.brand === '기타' && !form.brand_custom.trim()) {
            alert('브랜드명을 직접 입력해주세요.'); return;
        }
        if (form.destination === '기타' && !form.destination_custom.trim()) {
            alert('하차지를 직접 입력해주세요.'); return;
        }
        setSubmitting(true);
        const { error } = await supabase.from('outgoing_notes').insert({
            scheduled_date:     form.scheduled_date,
            brand:              form.brand,
            brand_custom:       form.brand === '기타' ? form.brand_custom.trim() : null,
            item_code:          form.item_code.trim(),
            quantity:           Number(form.quantity),
            destination:        form.destination,
            destination_custom: form.destination === '기타' ? form.destination_custom.trim() : null,
            loading_time:       form.loading_time || null,
            registered_by:      userProfile?.id,
            registered_by_name: userProfile?.name || userProfile?.email,
        });
        setSubmitting(false);
        if (error) { alert('등록 실패: ' + error.message); return; }
        setIsRegOpen(false);
        setForm(INIT_FORM);
        fetchNotes();
    };

    // ── 삭제
    const handleDelete = async () => {
        const { error } = await supabase.from('outgoing_notes').delete().in('id', selectedIds);
        if (error) { alert('삭제 실패: ' + error.message); return; }
        setSelectedIds([]);
        setIsDelConfirm(false);
        fetchNotes();
    };

    // ── 칼럼 핸들러
    const handleResizeStart = (e, vi) => {
        e.preventDefault(); e.stopPropagation();
        const origIdx = colOrder[vi];
        resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const onMove = (ev) => {
            if (!resizingRef.current) return;
            const { origIdx: oi, startX, startW } = resizingRef.current;
            setColWidths(prev => { const n = [...prev]; n[oi] = Math.max(50, startW + (ev.clientX - startX)); return n; });
        };
        const onUp = () => {
            resizingRef.current = null;
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
        };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
    };
    const handleDragStart = (e, vi) => { dragSrcRef.current = vi; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver  = (e, vi) => { e.preventDefault(); setDragOverIdx(vi); };
    const handleDrop = (e, vi) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === vi) return;
        wasDraggedRef.current = true;
        const no = [...colOrder];
        const [m] = no.splice(dragSrcRef.current, 1);
        no.splice(vi, 0, m);
        setColOrder(no);
        dragSrcRef.current = null;
    };
    const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

    // ── 셀 렌더
    const renderCell = (origIdx, row) => {
        const col = DEFAULT_COLUMNS[origIdx];
        let content;
        switch (col.key) {
            case 'scheduled_date':     content = row.scheduled_date;                           break;
            case 'brand':              content = displayBrand(row);                            break;
            case 'item_code':          content = row.item_code;                                break;
            case 'quantity':           content = row.quantity?.toLocaleString();               break;
            case 'destination':        content = displayDest(row);                             break;
            case 'loading_time':       content = row.loading_time ? row.loading_time.slice(0,5) : '—'; break;
            case 'registered_by_name': content = row.registered_by_name || '—';               break;
            case 'created_at':         content = formatDateTime(row.created_at);               break;
            default:                   content = '—';
        }
        return <td key={origIdx} className="p-4 text-center text-[13px]">{content}</td>;
    };

    const openRegModal = () => {
        setForm({ ...INIT_FORM, scheduled_date: today });
        setIsRegOpen(true);
        setIsActionOpen(false);
    };

    return (
        <div className="flex flex-col h-full gap-3 p-4">

            {/* ── 필터 바 ── */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex items-center gap-5 flex-wrap shrink-0">
                <div className="flex items-center shrink-0">
                    <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">출고예정일</label>
                    <DateRangeInput
                        startDate={startDate} endDate={endDate}
                        onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
                    />
                </div>
                <div className="flex items-center shrink-0">
                    <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">출고센터</label>
                    <select value={centerFilter} onChange={e => setCenterFilter(e.target.value)}
                        className="border border-gray-200 rounded-[3px] text-xs px-2 h-[30px] text-gray-700 bg-gray-50 focus:outline-none cursor-pointer min-w-[130px]">
                        <option value="">전체</option>
                        {operCenters.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="ml-auto shrink-0 flex items-center gap-2">
                    <button
                        onClick={() => { setStartDate(today); setEndDate(today); setCenterFilter(''); }}
                        className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] transition-colors text-xs"
                    >초기화</button>
                    <SearchButton onClick={fetchNotes} />
                </div>
            </div>

            {/* ── 선택실행 + 칼럼 초기화 ── */}
            <div className="flex justify-end items-center gap-2 shrink-0 px-2 z-30">
                <button onClick={resetColSettings}
                    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    칼럼 초기화
                </button>
                <div className="relative z-50">
                    <button
                        onClick={() => setIsActionOpen(p => !p)}
                        className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[100px] h-[32px]"
                    >
                        선택실행 {selectedIds.length > 0 && `(${selectedIds.length})`}
                        <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {isActionOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsActionOpen(false)} />
                            <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">
                                {isAdmin && (
                                    <button onClick={openRegModal}
                                        className="w-full text-left px-4 py-2 text-xs font-bold text-letusBlue hover:bg-blue-50 transition-colors flex items-center justify-between">
                                        등록
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    </button>
                                )}
                                <div className="h-px bg-gray-100 my-1" />
                                {isAdmin && (
                                    <button
                                        disabled={selectedIds.length === 0}
                                        onClick={() => { if (!selectedIds.length) return; setIsActionOpen(false); setIsDelConfirm(true); }}
                                        className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 transition-colors flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed">
                                        삭제
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── 테이블 ── */}
            <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none bg-white rounded-lg shadow-sm border border-slate-200">
                <table className="w-full text-left whitespace-nowrap table-fixed">
                    <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="p-4 pl-6 w-10 text-center shrink-0">
                                <input type="checkbox"
                                    onChange={handleSelectAll}
                                    checked={selectedIds.length === sorted.length && sorted.length > 0}
                                    className="w-4 h-4 accent-letusBlue cursor-pointer"
                                />
                            </th>
                            {colOrder.map((origIdx, vi) => {
                                const col = DEFAULT_COLUMNS[origIdx];
                                return (
                                    <th key={origIdx}
                                        className={`relative p-4 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${dragOverIdx === vi ? 'bg-blue-100' : ''}`}
                                        style={{ width: colWidths[origIdx] }}
                                        draggable
                                        onClick={() => !wasDraggedRef.current && col.key && requestSort(col.key)}
                                        onDragStart={e => handleDragStart(e, vi)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={e => handleDragOver(e, vi)}
                                        onDrop={e => handleDrop(e, vi)}
                                        onDragLeave={() => setDragOverIdx(null)}
                                    >
                                        <div className="flex items-center justify-center gap-1">
                                            {col.label}{col.key && getSortIcon(col.key)}
                                        </div>
                                        <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                            onPointerDown={e => handleResizeStart(e, vi)}
                                            onClick={e => e.stopPropagation()}
                                        />
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={colOrder.length + 1} className="p-8 text-center text-gray-500 font-bold text-[13px]">
                                    데이터 조회 중...
                                </td>
                            </tr>
                        )}
                        {!loading && sorted.length === 0 && (
                            <tr>
                                <td colSpan={colOrder.length + 1} className="p-8 text-center text-gray-400 font-bold text-[13px]">
                                    조회된 데이터가 없습니다.
                                </td>
                            </tr>
                        )}
                        {!loading && sorted.map(row => (
                            <tr key={row.id}
                                className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''}`}
                                onClick={e => handleSelectOne(e, row.id)}>
                                <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                    <input type="checkbox"
                                        checked={selectedIds.includes(row.id)}
                                        onChange={e => handleSelectOne(e, row.id)}
                                        className="w-4 h-4 accent-letusBlue cursor-pointer"
                                    />
                                </td>
                                {colOrder.map(origIdx => renderCell(origIdx, row))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── 등록 모달 ── */}
            {isRegOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 fade-in">
                    <div className="bg-white rounded-xl shadow-xl w-[420px] max-h-[90vh] overflow-y-auto slide-up">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-800">출고 특이사항 등록</h3>
                            <button onClick={() => setIsRegOpen(false)}><CloseIcon /></button>
                        </div>
                        <div className="px-6 py-5 flex flex-col gap-4">
                            {/* 출고예정일 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold text-gray-600">
                                    출고예정일 <span className="text-red-500">*</span>
                                </label>
                                <input type="date" value={form.scheduled_date}
                                    onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                                    className="border border-gray-200 rounded-[4px] px-3 py-2 text-xs focus:outline-none focus:border-letusBlue w-40"
                                />
                            </div>
                            {/* 브랜드 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold text-gray-600">
                                    브랜드 <span className="text-red-500">*</span>
                                </label>
                                <select value={form.brand}
                                    onChange={e => setForm(f => ({ ...f, brand: e.target.value, brand_custom: '' }))}
                                    className="border border-gray-200 rounded-[4px] px-3 py-2 text-xs focus:outline-none focus:border-letusBlue cursor-pointer">
                                    <option value="">선택</option>
                                    {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                                <input type="text" value={form.brand_custom}
                                    disabled={form.brand !== '기타'}
                                    onChange={e => setForm(f => ({ ...f, brand_custom: e.target.value }))}
                                    placeholder="브랜드명 직접 입력 (기타 선택 시 활성화)"
                                    className="border border-gray-200 rounded-[4px] px-3 py-2 text-xs focus:outline-none focus:border-letusBlue disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                                />
                            </div>
                            {/* 품목코드 / 수량 */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-gray-600">
                                        품목코드 <span className="text-red-500">*</span>
                                    </label>
                                    <input type="text" value={form.item_code}
                                        onChange={e => setForm(f => ({ ...f, item_code: e.target.value }))}
                                        placeholder="예) P-1001"
                                        className="border border-gray-200 rounded-[4px] px-3 py-2 text-xs focus:outline-none focus:border-letusBlue"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-gray-600">
                                        수량 <span className="text-red-500">*</span>
                                    </label>
                                    <input type="number" min="1" value={form.quantity}
                                        onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                                        placeholder="0"
                                        className="border border-gray-200 rounded-[4px] px-3 py-2 text-xs focus:outline-none focus:border-letusBlue"
                                    />
                                </div>
                            </div>
                            {/* 하차지 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold text-gray-600">
                                    하차지 <span className="text-red-500">*</span>
                                </label>
                                <select value={form.destination}
                                    onChange={e => setForm(f => ({ ...f, destination: e.target.value, destination_custom: '' }))}
                                    className="border border-gray-200 rounded-[4px] px-3 py-2 text-xs focus:outline-none focus:border-letusBlue cursor-pointer">
                                    <option value="">선택</option>
                                    {allCenters.map(c => <option key={c} value={c}>{c}</option>)}
                                    <option value="기타">기타</option>
                                </select>
                                <input type="text" value={form.destination_custom}
                                    disabled={form.destination !== '기타'}
                                    onChange={e => setForm(f => ({ ...f, destination_custom: e.target.value }))}
                                    placeholder="하차지 직접 입력 (기타 선택 시 활성화)"
                                    className="border border-gray-200 rounded-[4px] px-3 py-2 text-xs focus:outline-none focus:border-letusBlue disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                                />
                            </div>
                            {/* 상차시간 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold text-gray-600">
                                    상차시간
                                    <span className="text-[10px] font-normal text-gray-400 ml-1">선택 입력</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.loading_time}
                                    onChange={e => {
                                        let v = e.target.value.replace(/[^0-9:]/g, '');
                                        if (v.length === 2 && !v.includes(':') && form.loading_time.length === 1) v += ':';
                                        if (v.length > 5) return;
                                        setForm(f => ({ ...f, loading_time: v }));
                                    }}
                                    placeholder="예) 09:00"
                                    maxLength={5}
                                    className="border border-gray-200 rounded-[4px] px-3 py-2 text-xs focus:outline-none focus:border-letusBlue w-28"
                                />
                            </div>
                            {/* 등록자 / 등록일시 (자동) */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-gray-600">등록자</label>
                                    <div className="border border-gray-100 rounded-[4px] px-3 py-2 text-xs bg-gray-50 text-gray-400">
                                        {userProfile?.name || userProfile?.email || '—'}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-gray-600">등록일시</label>
                                    <div className="border border-gray-100 rounded-[4px] px-3 py-2 text-xs bg-gray-50 text-gray-400">자동 입력</div>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
                            <button onClick={() => setIsRegOpen(false)}
                                className="px-4 py-2 rounded-[4px] text-xs font-bold border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
                                취소
                            </button>
                            <button onClick={handleRegister} disabled={submitting}
                                className="px-5 py-2 rounded-[4px] text-xs font-bold bg-letusBlue text-white hover:bg-letusBlue/90 transition-colors disabled:opacity-60">
                                {submitting ? '등록 중...' : '등록'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 삭제 확인 모달 ── */}
            {isDelConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 fade-in">
                    <div className="bg-white rounded-xl shadow-xl w-80 p-6 slide-up">
                        <p className="font-bold text-gray-800 mb-2">선택 항목 삭제</p>
                        <p className="text-sm text-gray-500 mb-5">
                            {selectedIds.length}건을 삭제하시겠습니까?<br />이 작업은 되돌릴 수 없습니다.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsDelConfirm(false)}
                                className="px-4 py-2 rounded-[4px] text-xs font-bold border border-gray-300 text-gray-600 hover:bg-gray-50">
                                취소
                            </button>
                            <button onClick={handleDelete}
                                className="px-5 py-2 rounded-[4px] text-xs font-bold bg-red-500 text-white hover:bg-red-600">
                                삭제
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
