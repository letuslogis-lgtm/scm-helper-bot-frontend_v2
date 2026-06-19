import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient.js';

const TABLE = 'erp_inbound_config';
const LS_KEY = 'letus_inbound_config_col';

// ── 입고 실적 마감 설정 상수 ──────────────────────────────────────────────────
const CLOSING_TABLE   = 'erp_closing_config';
const CLOSING_LS_KEY  = 'letus_closing_config_col';
const CLOSING_DATA_TYPES = ['입고실적', '반입집계', '반출집계'];
const CLOSING_COLUMNS = [
    { label: '회사',       key: 'company',        w: 140 },
    { label: '창고명',     key: 'warehouse_name', w: 180 },
    { label: '데이터유형', key: 'data_type',      w: 140 },
    { label: '입고구분',   key: 'inbound_type',   w: 120 },
    { label: '시작일',     key: 'date_from',      w: 110 },
    { label: '종료일',     key: 'date_to',        w: 110 },
    { label: '활성',       key: 'is_active',      w: 90  },
    { label: '비고',       key: 'note',           w: 200 },
    { label: '수정/삭제',  key: null,             w: 110 },
];
const getClosingEmpty = () => {
    const today = new Date().toISOString().split('T')[0];
    return { company: '', warehouse_name: '', data_type: '입고실적', inbound_type: '', date_from: today, date_to: today, note: '', is_active: true };
};
const DATA_TYPE_BADGE = {
    '입고실적': 'bg-blue-100 text-blue-700 border-blue-200',
    '반입집계': 'bg-green-100 text-green-700 border-green-200',
    '반출집계': 'bg-orange-100 text-orange-700 border-orange-200',
};

const DEFAULT_COLUMNS = [
    { label: '회사',         key: 'company',          w: 140 },
    { label: '입고예정창고', key: 'input_warehouse',  w: 180 },
    { label: '출고창고',     key: 'output_warehouse', w: 180 },
    { label: '활성',         key: 'is_active',        w: 90  },
    { label: '비고',         key: 'note',             w: 240 },
    { label: '수정/삭제',    key: null,               w: 110 },
];

const EMPTY_FORM = { company: '', input_warehouse: '', output_warehouse: '', note: '', is_active: true };

// ── 모달 ──────────────────────────────────────────────────────────────────────
const ConfigModal = ({ initial, onClose, onSaved }) => {
    const [form, setForm] = useState(initial || EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const isEdit = !!initial?.id;

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSave = async () => {
        if (!form.company.trim())          return setErr('회사를 입력하세요');
        if (!form.input_warehouse.trim())  return setErr('입고예정창고를 입력하세요');
        if (!form.output_warehouse.trim()) return setErr('출고창고를 입력하세요');
        setSaving(true); setErr('');
        try {
            const payload = {
                company:          form.company.trim(),
                input_warehouse:  form.input_warehouse.trim(),
                output_warehouse: form.output_warehouse.trim(),
                note:             (form.note ?? '').trim() || null,
                is_active:        form.is_active,
            };
            if (isEdit) {
                const { error } = await supabase.from(TABLE).update(payload).eq('id', initial.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from(TABLE).insert(payload);
                if (error) throw error;
            }
            onSaved();
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[480px] flex flex-col border border-gray-100 overflow-hidden slide-up" onClick={e => e.stopPropagation()}>

                {/* 헤더 */}
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full"></span>
                        <h3 className="font-bold text-sm text-gray-800">
                            {isEdit ? '설정 수정' : '설정 추가'}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 본문 */}
                <div className="p-5 space-y-3">
                    {[
                        { label: '회사',        key: 'company',          ph: '예) 퍼시스',    required: true },
                        { label: '입고예정창고', key: 'input_warehouse',  ph: '예) 퍼시스양지', required: true },
                        { label: '출고창고',     key: 'output_warehouse', ph: '예) 시디즈평택', required: true },
                        { label: '비고',         key: 'note',             ph: '(선택)',        required: false },
                    ].map(({ label, key, ph, required }) => (
                        <div key={key}>
                            <label className="block text-xs font-bold text-gray-600 mb-1">
                                {label} {required && <span className="text-red-400">*</span>}
                            </label>
                            <input
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/30 focus:border-letusBlue transition-colors"
                                placeholder={ph}
                                value={form[key] || ''}
                                onChange={e => set(key, e.target.value)}
                            />
                        </div>
                    ))}

                    <div className="flex items-center gap-2 pt-1">
                        <input
                            type="checkbox"
                            id="modal-is-active"
                            className="w-4 h-4 accent-letusBlue cursor-pointer"
                            checked={form.is_active}
                            onChange={e => set('is_active', e.target.checked)}
                        />
                        <label htmlFor="modal-is-active" className="text-sm text-gray-700 font-bold cursor-pointer">활성</label>
                        <span className="text-xs text-gray-400">비활성 시 RPA가 해당 설정을 건너뜁니다</span>
                    </div>
                </div>

                {err && (
                    <div className="px-5 pb-2">
                        <p className="text-red-500 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>
                    </div>
                )}

                {/* 푸터 */}
                <div className="p-4 border-t bg-gray-50 flex gap-2 justify-end shrink-0">
                    <button onClick={onClose}
                        className="px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 shadow-sm transition-colors">
                        취소
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-5 py-1.5 bg-letusBlue text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors">
                        {saving ? '저장 중...' : (isEdit ? '수정' : '추가')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 패널: ERP 입고예정생성 설정 ───────────────────────────────────────────────
const ErpInboundConfigPanel = () => {
    const [rows, setRows]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [modal, setModal]         = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // 체크박스
    const [selectedIds, setSelectedIds] = useState([]);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    // 컬럼 관리
    const [colOrder, setColOrder]     = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths]   = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef   = useRef(null);
    const dragSrcRef    = useRef(null);
    const wasDraggedRef = useRef(false);

    // localStorage
    useEffect(() => {
        try {
            const s = JSON.parse(localStorage.getItem(LS_KEY));
            if (s?.order?.length  === DEFAULT_COLUMNS.length) setColOrder(s.order);
            if (s?.widths?.length === DEFAULT_COLUMNS.length) setColWidths(s.widths);
        } catch {}
    }, []);
    useEffect(() => {
        localStorage.setItem(LS_KEY, JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths]);

    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS.map(c => c.w));
        localStorage.removeItem(LS_KEY);
    };

    // 데이터 로드
    const fetchRows = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from(TABLE).select('*').order('id');
        if (error) console.error('[ErpInboundConfig] fetchRows error:', error.message, error);
        setRows(data || []);
        setSelectedIds([]);
        setLoading(false);
    }, []);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    // 체크박스 핸들러
    const handleSelectAll = (e) => {
        setSelectedIds(e.target.checked ? rows.map(r => r.id) : []);
    };
    const handleSelectOne = (e, id) => {
        e.stopPropagation();
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    // 선택 삭제
    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return;
        setIsActionMenuOpen(false);
        if (!window.confirm(`선택한 ${selectedIds.length}건을 삭제하시겠습니까?`)) return;
        await supabase.from(TABLE).delete().in('id', selectedIds);
        fetchRows();
    };

    // 단건 활성 토글
    const toggleActive = async (row) => {
        await supabase.from(TABLE).update({ is_active: !row.is_active }).eq('id', row.id);
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
    };

    // 단건 삭제
    const handleDelete = async () => {
        if (!deleteTarget) return;
        await supabase.from(TABLE).delete().eq('id', deleteTarget.id);
        setDeleteTarget(null);
        fetchRows();
    };

    // 컬럼 핸들러
    const handleResizeStart = (e, vIdx) => {
        e.preventDefault(); e.stopPropagation();
        const oIdx = colOrder[vIdx];
        resizingRef.current = { oIdx, startX: e.clientX, startW: colWidths[oIdx] };
        const onMove = (ev) => {
            const { oIdx, startX, startW } = resizingRef.current;
            setColWidths(p => { const n = [...p]; n[oIdx] = Math.max(50, startW + (ev.clientX - startX)); return n; });
        };
        const onUp = () => { resizingRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    const handleDragStart = (e, vIdx) => { dragSrcRef.current = vIdx; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver  = (e, vIdx) => { e.preventDefault(); setDragOverIdx(vIdx); };
    const handleDrop = (e, vIdx) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === vIdx) return;
        wasDraggedRef.current = true;
        const o = [...colOrder]; const [m] = o.splice(dragSrcRef.current, 1); o.splice(vIdx, 0, m);
        setColOrder(o); dragSrcRef.current = null;
    };
    const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

    const renderCell = (oIdx, row) => {
        switch (oIdx) {
            case 0: return <td key={oIdx} className="p-4 font-bold text-gray-800 text-sm">{row.company}</td>;
            case 1: return <td key={oIdx} className="p-4 text-gray-700 text-sm">{row.input_warehouse}</td>;
            case 2: return <td key={oIdx} className="p-4 text-gray-700 text-sm">{row.output_warehouse}</td>;
            case 3: return (
                <td key={oIdx} className="p-4 text-center">
                    <button
                        onClick={() => toggleActive(row)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                            row.is_active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200'
                        }`}
                    >
                        {row.is_active ? '활성' : '비활성'}
                    </button>
                </td>
            );
            case 4: return <td key={oIdx} className="p-4 text-gray-400 text-sm">{row.note || <span className="text-gray-200">—</span>}</td>;
            case 5: return (
                <td key={oIdx} className="p-4 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1.5 justify-center">
                        <button
                            onClick={() => setModal(row)}
                            className="px-2.5 py-1 text-xs font-bold border border-letusBlue/30 text-letusBlue bg-blue-50 rounded-lg hover:bg-letusBlue hover:text-white transition-colors"
                        >수정</button>
                        <button
                            onClick={() => setDeleteTarget(row)}
                            className="px-2.5 py-1 text-xs font-bold border border-red-200 text-red-500 bg-red-50 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
                        >삭제</button>
                    </div>
                </td>
            );
            default: return null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-100 p-6 gap-4 animate-fade-in">

            {/* 액션바 */}
            <div className="flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded shadow-sm">
                        전체 {rows.length}건
                    </span>
                    <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded shadow-sm">
                        활성 {rows.filter(r => r.is_active).length}건
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={resetColSettings}
                        className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                        title="컬럼 너비·순서 초기화">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        칼럼 초기화
                    </button>

                    {/* 선택실행 드롭다운 */}
                    <div className="relative">
                        <button
                            onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                            className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[90px] h-[32px]"
                        >
                            선택실행
                            <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {isActionMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsActionMenuOpen(false)}></div>
                                <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">
                                    <button
                                        onClick={handleDeleteSelected}
                                        disabled={selectedIds.length === 0}
                                        className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex justify-between items-center ${
                                            selectedIds.length > 0
                                                ? 'text-red-600 hover:bg-red-50'
                                                : 'text-gray-300 cursor-not-allowed'
                                        }`}
                                    >
                                        삭제
                                        {selectedIds.length > 0 && (
                                            <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <button
                        onClick={() => setModal('add')}
                        className="flex items-center gap-1.5 px-3 h-[32px] bg-letusBlue text-white text-xs font-bold rounded shadow-sm hover:bg-blue-700 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        설정 추가
                    </button>
                </div>
            </div>

            {/* 테이블 카드 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left whitespace-nowrap table-fixed">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-6 w-10 text-center shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={rows.length > 0 && selectedIds.length === rows.length}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 accent-letusBlue cursor-pointer"
                                    />
                                </th>
                                {colOrder.map((oIdx, vIdx) => {
                                    const col = DEFAULT_COLUMNS[oIdx];
                                    return (
                                        <th key={oIdx}
                                            className={`relative p-4 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${dragOverIdx === vIdx ? 'bg-blue-100' : ''}`}
                                            style={{ width: colWidths[oIdx] }}
                                            draggable
                                            onDragStart={e => handleDragStart(e, vIdx)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={e => handleDragOver(e, vIdx)}
                                            onDrop={e => handleDrop(e, vIdx)}
                                            onDragLeave={() => setDragOverIdx(null)}
                                        >
                                            {col.label}
                                            <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                                onMouseDown={e => handleResizeStart(e, vIdx)}
                                                onClick={e => e.stopPropagation()} />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={colOrder.length + 1} className="p-12 text-center">
                                        <div className="w-7 h-7 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin mx-auto"></div>
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={colOrder.length + 1} className="p-16 text-center text-gray-400 text-sm">
                                        설정이 없습니다.{' '}
                                        <span className="text-letusBlue cursor-pointer font-bold hover:underline" onClick={() => setModal('add')}>+ 설정 추가</span>
                                    </td>
                                </tr>
                            ) : rows.map(row => (
                                <tr key={row.id}
                                    className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''} ${!row.is_active ? 'opacity-40' : ''}`}
                                    onClick={e => handleSelectOne(e, row.id)}
                                >
                                    <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(row.id)}
                                            onChange={e => handleSelectOne(e, row.id)}
                                            className="w-4 h-4 accent-letusBlue cursor-pointer"
                                        />
                                    </td>
                                    {colOrder.map(oIdx => renderCell(oIdx, row))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 추가/수정 모달 */}
            {modal && (
                <ConfigModal
                    initial={modal === 'add' ? null : modal}
                    onClose={() => setModal(null)}
                    onSaved={() => { setModal(null); fetchRows(); }}
                />
            )}

            {/* 삭제 확인 모달 */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-[400px] flex flex-col border border-gray-100 overflow-hidden slide-up">
                        <div className="p-4 border-b bg-gray-50 flex items-center gap-2">
                            <span className="w-1.5 h-3.5 bg-red-400 rounded-full"></span>
                            <h3 className="font-bold text-sm text-gray-800">삭제 확인</h3>
                        </div>
                        <div className="p-5">
                            <p className="text-sm text-gray-600">아래 설정을 삭제하시겠습니까?</p>
                            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                <span className="font-bold text-gray-800">{deleteTarget.company}</span>
                                <span className="text-gray-400 mx-2">·</span>
                                <span className="text-gray-600">{deleteTarget.input_warehouse}</span>
                                <span className="text-gray-400 mx-1">→</span>
                                <span className="text-gray-600">{deleteTarget.output_warehouse}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">삭제 대신 비활성화를 권장합니다.</p>
                        </div>
                        <div className="p-4 border-t bg-gray-50 flex gap-2 justify-end shrink-0">
                            <button onClick={() => setDeleteTarget(null)}
                                className="px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 shadow-sm transition-colors">
                                취소
                            </button>
                            <button onClick={handleDelete}
                                className="px-4 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 shadow-sm transition-colors">
                                삭제
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── 모달: 입고 실적 마감 설정 ─────────────────────────────────────────────────
const ClosingConfigModal = ({ initial, onClose, onSaved }) => {
    const [form, setForm] = useState(initial || getClosingEmpty());
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const isEdit = !!initial?.id;

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSave = async () => {
        if (!form.company.trim())        return setErr('회사를 입력하세요');
        if (!form.warehouse_name.trim()) return setErr('창고명을 입력하세요');
        setSaving(true); setErr('');
        try {
            const payload = {
                company:        form.company.trim(),
                warehouse_name: form.warehouse_name.trim(),
                data_type:      form.data_type,
                inbound_type:   form.inbound_type?.trim() || null,
                date_from:      form.date_from || new Date().toISOString().split('T')[0],
                date_to:        form.date_to   || new Date().toISOString().split('T')[0],
                note:           (form.note ?? '').trim() || null,
                is_active:      form.is_active,
            };
            if (isEdit) {
                const { error } = await supabase.from(CLOSING_TABLE).update(payload).eq('id', initial.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from(CLOSING_TABLE).insert(payload);
                if (error) throw error;
            }
            onSaved();
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[480px] flex flex-col border border-gray-100 overflow-hidden slide-up" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full"></span>
                        <h3 className="font-bold text-sm text-gray-800">{isEdit ? '설정 수정' : '설정 추가'}</h3>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    {[
                        { label: '회사',   key: 'company',        ph: '예) 퍼시스',    required: true },
                        { label: '창고명', key: 'warehouse_name', ph: '예) 퍼시스양지', required: true },
                        { label: '입고구분', key: 'inbound_type', ph: '예) 구매입고 (선택)', required: false },
                        { label: '비고',   key: 'note',           ph: '(선택)',         required: false },
                    ].map(({ label, key, ph, required }) => (
                        <div key={key}>
                            <label className="block text-xs font-bold text-gray-600 mb-1">
                                {label} {required && <span className="text-red-400">*</span>}
                            </label>
                            <input
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/30 focus:border-letusBlue transition-colors"
                                placeholder={ph}
                                value={form[key] || ''}
                                onChange={e => set(key, e.target.value)}
                            />
                        </div>
                    ))}

                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">
                            데이터 유형 <span className="text-red-400">*</span>
                        </label>
                        <select
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/30 focus:border-letusBlue transition-colors bg-white"
                            value={form.data_type}
                            onChange={e => set('data_type', e.target.value)}
                        >
                            {CLOSING_DATA_TYPES.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-3">
                        {[
                            { label: '입고일자 시작일', key: 'date_from' },
                            { label: '입고일자 종료일', key: 'date_to'   },
                        ].map(({ label, key }) => (
                            <div key={key} className="flex-1">
                                <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
                                <input
                                    type="date"
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/30 focus:border-letusBlue transition-colors"
                                    value={form[key] || ''}
                                    onChange={e => set(key, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <input type="checkbox" id="closing-modal-is-active"
                            className="w-4 h-4 accent-letusBlue cursor-pointer"
                            checked={form.is_active}
                            onChange={e => set('is_active', e.target.checked)}
                        />
                        <label htmlFor="closing-modal-is-active" className="text-sm text-gray-700 font-bold cursor-pointer">활성</label>
                        <span className="text-xs text-gray-400">비활성 시 RPA가 해당 설정을 건너뜁니다</span>
                    </div>
                </div>

                {err && (
                    <div className="px-5 pb-2">
                        <p className="text-red-500 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>
                    </div>
                )}

                <div className="p-4 border-t bg-gray-50 flex gap-2 justify-end shrink-0">
                    <button onClick={onClose}
                        className="px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 shadow-sm transition-colors">
                        취소
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-5 py-1.5 bg-letusBlue text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors">
                        {saving ? '저장 중...' : (isEdit ? '수정' : '추가')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 패널: 입고 실적 마감 설정 ─────────────────────────────────────────────────
const ErpClosingConfigPanel = () => {
    const [rows, setRows]           = useState([]);
    const [loading, setLoading]     = useState(false);
    const [modal, setModal]         = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const [selectedIds, setSelectedIds] = useState([]);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    const [colOrder, setColOrder]     = useState(CLOSING_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths]   = useState(CLOSING_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef   = useRef(null);
    const dragSrcRef    = useRef(null);
    const wasDraggedRef = useRef(false);

    useEffect(() => {
        try {
            const s = JSON.parse(localStorage.getItem(CLOSING_LS_KEY));
            if (s?.order?.length  === CLOSING_COLUMNS.length) setColOrder(s.order);
            if (s?.widths?.length === CLOSING_COLUMNS.length) setColWidths(s.widths);
        } catch {}
    }, []);
    useEffect(() => {
        localStorage.setItem(CLOSING_LS_KEY, JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths]);

    const resetColSettings = () => {
        setColOrder(CLOSING_COLUMNS.map((_, i) => i));
        setColWidths(CLOSING_COLUMNS.map(c => c.w));
        localStorage.removeItem(CLOSING_LS_KEY);
    };

    const fetchRows = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from(CLOSING_TABLE).select('*').order('company').order('warehouse_name');
        if (error) console.error('[ErpClosingConfig] fetchRows error:', error.message);
        setRows(data || []);
        setSelectedIds([]);
        setLoading(false);
    }, []);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    const handleSelectAll = (e) => setSelectedIds(e.target.checked ? rows.map(r => r.id) : []);
    const handleSelectOne = (e, id) => {
        e.stopPropagation();
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return;
        setIsActionMenuOpen(false);
        if (!window.confirm(`선택한 ${selectedIds.length}건을 삭제하시겠습니까?`)) return;
        await supabase.from(CLOSING_TABLE).delete().in('id', selectedIds);
        fetchRows();
    };

    const toggleActive = async (row) => {
        await supabase.from(CLOSING_TABLE).update({ is_active: !row.is_active }).eq('id', row.id);
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        await supabase.from(CLOSING_TABLE).delete().eq('id', deleteTarget.id);
        setDeleteTarget(null);
        fetchRows();
    };

    const handleResizeStart = (e, vIdx) => {
        e.preventDefault(); e.stopPropagation();
        const oIdx = colOrder[vIdx];
        resizingRef.current = { oIdx, startX: e.clientX, startW: colWidths[oIdx] };
        const onMove = (ev) => {
            const { oIdx, startX, startW } = resizingRef.current;
            setColWidths(p => { const n = [...p]; n[oIdx] = Math.max(50, startW + (ev.clientX - startX)); return n; });
        };
        const onUp = () => { resizingRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    const handleDragStart = (e, vIdx) => { dragSrcRef.current = vIdx; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver  = (e, vIdx) => { e.preventDefault(); setDragOverIdx(vIdx); };
    const handleDrop = (e, vIdx) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === vIdx) return;
        wasDraggedRef.current = true;
        const o = [...colOrder]; const [m] = o.splice(dragSrcRef.current, 1); o.splice(vIdx, 0, m);
        setColOrder(o); dragSrcRef.current = null;
    };
    const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

    const renderCell = (oIdx, row) => {
        switch (oIdx) {
            case 0: return <td key={oIdx} className="p-4 font-bold text-gray-800 text-sm">{row.company}</td>;
            case 1: return <td key={oIdx} className="p-4 text-gray-700 text-sm">{row.warehouse_name}</td>;
            case 2: return (
                <td key={oIdx} className="p-4 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${DATA_TYPE_BADGE[row.data_type] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {row.data_type}
                    </span>
                </td>
            );
            case 3: return <td key={oIdx} className="p-4 text-gray-500 text-sm text-center">{row.inbound_type || <span className="text-gray-200">—</span>}</td>;
            case 4: return <td key={oIdx} className="p-4 text-gray-500 text-sm text-center">{row.date_from || '—'}</td>;
            case 5: return <td key={oIdx} className="p-4 text-gray-500 text-sm text-center">{row.date_to || '—'}</td>;
            case 6: return (
                <td key={oIdx} className="p-4 text-center">
                    <button onClick={() => toggleActive(row)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                            row.is_active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200'
                        }`}>
                        {row.is_active ? '활성' : '비활성'}
                    </button>
                </td>
            );
            case 7: return <td key={oIdx} className="p-4 text-gray-400 text-sm">{row.note || <span className="text-gray-200">—</span>}</td>;
            case 8: return (
                <td key={oIdx} className="p-4 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1.5 justify-center">
                        <button onClick={() => setModal(row)}
                            className="px-2.5 py-1 text-xs font-bold border border-letusBlue/30 text-letusBlue bg-blue-50 rounded-lg hover:bg-letusBlue hover:text-white transition-colors">수정</button>
                        <button onClick={() => setDeleteTarget(row)}
                            className="px-2.5 py-1 text-xs font-bold border border-red-200 text-red-500 bg-red-50 rounded-lg hover:bg-red-500 hover:text-white transition-colors">삭제</button>
                    </div>
                </td>
            );
            default: return null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-100 p-6 gap-4 animate-fade-in">
            {/* 액션바 */}
            <div className="flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded shadow-sm">
                        전체 {rows.length}건
                    </span>
                    <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded shadow-sm">
                        활성 {rows.filter(r => r.is_active).length}건
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={resetColSettings}
                        className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                        title="컬럼 너비·순서 초기화">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        칼럼 초기화
                    </button>
                    <div className="relative">
                        <button onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                            className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[90px] h-[32px]">
                            선택실행
                            <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {isActionMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsActionMenuOpen(false)}></div>
                                <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">
                                    <button onClick={handleDeleteSelected} disabled={selectedIds.length === 0}
                                        className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex justify-between items-center ${
                                            selectedIds.length > 0 ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'
                                        }`}>
                                        삭제
                                        {selectedIds.length > 0 && (
                                            <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    <button onClick={() => setModal('add')}
                        className="flex items-center gap-1.5 px-3 h-[32px] bg-letusBlue text-white text-xs font-bold rounded shadow-sm hover:bg-blue-700 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        설정 추가
                    </button>
                </div>
            </div>

            {/* 테이블 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left whitespace-nowrap table-fixed">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-6 w-10 text-center shrink-0">
                                    <input type="checkbox"
                                        checked={rows.length > 0 && selectedIds.length === rows.length}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 accent-letusBlue cursor-pointer"
                                    />
                                </th>
                                {colOrder.map((oIdx, vIdx) => {
                                    const col = CLOSING_COLUMNS[oIdx];
                                    return (
                                        <th key={oIdx}
                                            className={`relative p-4 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${dragOverIdx === vIdx ? 'bg-blue-100' : ''}`}
                                            style={{ width: colWidths[oIdx] }}
                                            draggable
                                            onDragStart={e => handleDragStart(e, vIdx)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={e => handleDragOver(e, vIdx)}
                                            onDrop={e => handleDrop(e, vIdx)}
                                            onDragLeave={() => setDragOverIdx(null)}
                                        >
                                            {col.label}
                                            <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                                onMouseDown={e => handleResizeStart(e, vIdx)}
                                                onClick={e => e.stopPropagation()} />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={colOrder.length + 1} className="p-12 text-center">
                                        <div className="w-7 h-7 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin mx-auto"></div>
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={colOrder.length + 1} className="p-16 text-center text-gray-400 text-sm">
                                        설정이 없습니다.{' '}
                                        <span className="text-letusBlue cursor-pointer font-bold hover:underline" onClick={() => setModal('add')}>+ 설정 추가</span>
                                    </td>
                                </tr>
                            ) : rows.map(row => (
                                <tr key={row.id}
                                    className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''} ${!row.is_active ? 'opacity-40' : ''}`}
                                    onClick={e => handleSelectOne(e, row.id)}
                                >
                                    <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox"
                                            checked={selectedIds.includes(row.id)}
                                            onChange={e => handleSelectOne(e, row.id)}
                                            className="w-4 h-4 accent-letusBlue cursor-pointer"
                                        />
                                    </td>
                                    {colOrder.map(oIdx => renderCell(oIdx, row))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 추가/수정 모달 */}
            {modal && (
                <ClosingConfigModal
                    initial={modal === 'add' ? null : modal}
                    onClose={() => setModal(null)}
                    onSaved={() => { setModal(null); fetchRows(); }}
                />
            )}

            {/* 삭제 확인 모달 */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-[400px] flex flex-col border border-gray-100 overflow-hidden slide-up">
                        <div className="p-4 border-b bg-gray-50 flex items-center gap-2">
                            <span className="w-1.5 h-3.5 bg-red-400 rounded-full"></span>
                            <h3 className="font-bold text-sm text-gray-800">삭제 확인</h3>
                        </div>
                        <div className="p-5">
                            <p className="text-sm text-gray-600">아래 설정을 삭제하시겠습니까?</p>
                            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                                <span className="font-bold text-gray-800">{deleteTarget.company}</span>
                                <span className="text-gray-400 mx-2">·</span>
                                <span className="text-gray-600">{deleteTarget.warehouse_name}</span>
                                <span className="text-gray-400 mx-2">·</span>
                                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${DATA_TYPE_BADGE?.[deleteTarget.data_type] || 'text-gray-600'}`}>{deleteTarget.data_type}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">삭제 대신 비활성화를 권장합니다.</p>
                        </div>
                        <div className="p-4 border-t bg-gray-50 flex gap-2 justify-end shrink-0">
                            <button onClick={() => setDeleteTarget(null)}
                                className="px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 shadow-sm transition-colors">취소</button>
                            <button onClick={handleDelete}
                                className="px-4 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 shadow-sm transition-colors">삭제</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── 센터 설정 상수 ────────────────────────────────────────────────────────────
const CENTER_TABLE   = 'centers';
const CENTER_LS_KEY  = 'letus_center_col';
const CENTER_COLUMNS = [
    { label: '정렬순서', key: 'sort_order', w: 100 },
    { label: '센터명',   key: 'name',       w: 160 },
    { label: '주소',     key: 'address',    w: 300 },
    { label: '활성',     key: 'is_active',  w: 80  },
    { label: '비고',     key: 'note',       w: 220 },
    { label: '수정/삭제', key: null,        w: 110 },
];
const CENTER_EMPTY = { name: '', address: '', sort_order: '', is_active: true, note: '' };

// ── 모달: 센터 등록/수정 ──────────────────────────────────────────────────────
const CenterModal = ({ initial, existingOrders, existingNames, onClose, onSaved }) => {
    const [form, setForm] = useState(initial ? { ...initial, sort_order: String(initial.sort_order) } : CENTER_EMPTY);
    const [saving, setSaving] = useState(false);
    const [err, setErr]       = useState('');
    const isEdit = !!initial?.id;

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSave = async () => {
        if (!form.name.trim())    return setErr('센터명을 입력하세요');
        if (form.sort_order === '' || isNaN(Number(form.sort_order))) return setErr('정렬순서를 숫자로 입력하세요');
        const order = Number(form.sort_order);
        // 중복 체크 (자기 자신 제외)
        if (existingOrders.filter(o => (!isEdit || o !== initial.sort_order)).includes(order))
            return setErr(`정렬순서 ${order}은(는) 이미 사용 중입니다`);
        if (existingNames.filter(n => (!isEdit || n !== initial.name)).includes(form.name.trim()))
            return setErr(`센터명 "${form.name.trim()}"은(는) 이미 등록되어 있습니다`);
        setSaving(true); setErr('');
        try {
            const payload = {
                name:       form.name.trim(),
                address:    (form.address ?? '').trim() || null,
                sort_order: order,
                is_active:  form.is_active,
                note:       (form.note ?? '').trim() || null,
            };
            if (isEdit) {
                const { error } = await supabase.from(CENTER_TABLE).update(payload).eq('id', initial.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from(CENTER_TABLE).insert(payload);
                if (error) throw error;
            }
            onSaved();
        } catch (e) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-3.5 bg-letusBlue rounded-full" />
                        <span className="font-black text-gray-800 text-base">{isEdit ? '센터 수정' : '센터 등록'}</span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto">
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                        <div className="flex gap-3">
                            <div className="w-28 shrink-0">
                                <label className="block text-xs font-bold text-gray-600 mb-1">정렬순서 <span className="text-red-400">*</span></label>
                                <input type="number" min="1"
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/30 focus:border-letusBlue"
                                    value={form.sort_order}
                                    onChange={e => set('sort_order', e.target.value)}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-600 mb-1">센터명 <span className="text-red-400">*</span></label>
                                <input type="text" placeholder="예: 양지1"
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/30 focus:border-letusBlue"
                                    value={form.name}
                                    onChange={e => set('name', e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">주소</label>
                            <input type="text" placeholder="센터 주소 (선택)"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/30 focus:border-letusBlue"
                                value={form.address}
                                onChange={e => set('address', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">비고</label>
                            <input type="text" placeholder="비고 (선택)"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/30 focus:border-letusBlue"
                                value={form.note}
                                onChange={e => set('note', e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                            <input type="checkbox" id="center-modal-is-active"
                                className="w-4 h-4 accent-letusBlue cursor-pointer"
                                checked={form.is_active}
                                onChange={e => set('is_active', e.target.checked)}
                            />
                            <label htmlFor="center-modal-is-active" className="text-sm text-gray-700 font-bold cursor-pointer">활성</label>
                        </div>
                    </div>
                </div>
                {err && (
                    <div className="px-5 pb-2">
                        <p className="text-red-500 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>
                    </div>
                )}
                <div className="p-4 border-t bg-gray-50 flex gap-2 justify-end shrink-0">
                    <button onClick={onClose}
                        className="px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 shadow-sm transition-colors">
                        취소
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-5 py-1.5 bg-letusBlue text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors">
                        {saving ? '저장 중...' : isEdit ? '수정' : '등록'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 패널: 센터 설정 ───────────────────────────────────────────────────────────
const CenterConfigPanel = () => {
    const [rows, setRows]               = useState([]);
    const [loading, setLoading]         = useState(false);
    const [modal, setModal]             = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    const [colOrder, setColOrder]       = useState(CENTER_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths]     = useState(CENTER_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef   = useRef(null);
    const dragSrcRef    = useRef(null);
    const wasDraggedRef = useRef(false);

    useEffect(() => {
        try {
            const s = JSON.parse(localStorage.getItem(CENTER_LS_KEY));
            if (s?.order?.length  === CENTER_COLUMNS.length) setColOrder(s.order);
            if (s?.widths?.length === CENTER_COLUMNS.length) setColWidths(s.widths);
        } catch {}
    }, []);
    useEffect(() => {
        localStorage.setItem(CENTER_LS_KEY, JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths]);

    const resetColSettings = () => {
        setColOrder(CENTER_COLUMNS.map((_, i) => i));
        setColWidths(CENTER_COLUMNS.map(c => c.w));
        localStorage.removeItem(CENTER_LS_KEY);
    };

    const fetchRows = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase.from(CENTER_TABLE).select('*').order('sort_order');
        setRows(data ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    const handleSelectAll = e => {
        setSelectedIds(e.target.checked ? rows.map(r => r.id) : []);
    };
    const handleSelectOne = (e, id) => {
        e.stopPropagation();
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleDeleteSelected = async () => {
        if (!selectedIds.length) return;
        if (!window.confirm(`선택한 ${selectedIds.length}개 센터를 삭제하시겠습니까?`)) return;
        await supabase.from(CENTER_TABLE).delete().in('id', selectedIds);
        setSelectedIds([]);
        fetchRows();
    };

    const handleResizeStart = (e, visualIdx) => {
        e.preventDefault(); e.stopPropagation();
        const origIdx = colOrder[visualIdx];
        resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const onMove = ev => {
            if (!resizingRef.current) return;
            const { origIdx: oi, startX, startW } = resizingRef.current;
            setColWidths(prev => { const n = [...prev]; n[oi] = Math.max(50, startW + (ev.clientX - startX)); return n; });
        };
        const onUp = () => { resizingRef.current = null; el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
    };
    const handleDragStart = (e, vi) => { dragSrcRef.current = vi; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver  = (e, vi) => { e.preventDefault(); setDragOverIdx(vi); };
    const handleDrop      = (e, vi) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === vi) return;
        wasDraggedRef.current = true;
        const o = [...colOrder]; const [m] = o.splice(dragSrcRef.current, 1); o.splice(vi, 0, m);
        setColOrder(o); dragSrcRef.current = null;
    };
    const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

    const getSortIcon = () => null;

    const existingOrders = rows.map(r => r.sort_order);
    const existingNames  = rows.map(r => r.name);

    const renderCell = (origIdx, row) => {
        switch (origIdx) {
            case 0: return <td key={origIdx} className="p-4 text-center text-[13px] text-gray-700 font-bold">{row.sort_order}</td>;
            case 1: return <td key={origIdx} className="p-4 text-[13px] font-bold text-gray-800">{row.name}</td>;
            case 2: return <td key={origIdx} className="p-4 text-[13px] text-gray-600">{row.address || <span className="text-gray-300">-</span>}</td>;
            case 3: return (
                <td key={origIdx} className="p-4 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${row.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                        {row.is_active ? '활성' : '비활성'}
                    </span>
                </td>
            );
            case 4: return <td key={origIdx} className="p-4 text-[13px] text-gray-600">{row.note || <span className="text-gray-300">-</span>}</td>;
            case 5: return (
                <td key={origIdx} className="p-4 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setModal(row)}
                            className="text-xs font-bold text-letusBlue border border-letusBlue/30 bg-blue-50 rounded px-2 py-0.5 hover:bg-blue-100">
                            수정
                        </button>
                        <button onClick={() => setDeleteTarget(row)}
                            className="text-xs font-bold text-red-500 border border-red-200 bg-red-50 rounded px-2 py-0.5 hover:bg-red-100">
                            삭제
                        </button>
                    </div>
                </td>
            );
            default: return null;
        }
    };

    return (
        <div className="p-6 flex flex-col gap-4 h-full bg-slate-100">
            {/* 툴바 */}
            <div className="flex justify-end items-center gap-2 shrink-0">
                <button onClick={resetColSettings}
                    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    title="칼럼 너비·순서를 기본값으로 초기화">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    칼럼 초기화
                </button>
                <div className="relative">
                    <button onClick={() => setIsActionMenuOpen(v => !v)}
                        className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[100px] h-[32px]">
                        선택실행 {selectedIds.length > 0 && `(${selectedIds.length})`}
                        <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {isActionMenuOpen && (
                        <>
                            <div className="fixed inset-0" onClick={() => setIsActionMenuOpen(false)} />
                            <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">
                                <button onClick={() => { setIsActionMenuOpen(false); setModal({}); }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-letusBlue hover:bg-blue-50 transition-colors flex items-center justify-between">
                                    센터 등록
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                </button>
                                <div className="h-px bg-gray-100 my-1" />
                                <button onClick={() => { setIsActionMenuOpen(false); handleDeleteSelected(); }}
                                    disabled={!selectedIds.length}
                                    className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors flex items-center justify-between ${selectedIds.length ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}>
                                    선택 삭제 {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 테이블 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left whitespace-nowrap table-fixed">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-6 w-10 text-center shrink-0">
                                    <input type="checkbox"
                                        checked={selectedIds.length === rows.length && rows.length > 0}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                </th>
                                {colOrder.map((origIdx, visualIdx) => {
                                    const col = CENTER_COLUMNS[origIdx];
                                    return (
                                        <th key={origIdx}
                                            className={`relative p-4 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                                            style={{ width: colWidths[origIdx] }}
                                            draggable
                                            onClick={() => !wasDraggedRef.current && col.key && undefined}
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
                                                onPointerDown={e => handleResizeStart(e, visualIdx)} onClick={e => e.stopPropagation()} />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px]">
                            {loading ? (
                                <tr><td colSpan={colOrder.length + 1} className="p-4 text-center text-gray-400">불러오는 중...</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={colOrder.length + 1} className="p-8 text-center text-gray-400">등록된 센터가 없습니다</td></tr>
                            ) : rows.map(row => (
                                <tr key={row.id}
                                    className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''}`}
                                    onClick={e => handleSelectOne(e, row.id)}>
                                    <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox"
                                            checked={selectedIds.includes(row.id)}
                                            onChange={e => handleSelectOne(e, row.id)}
                                            className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                    </td>
                                    {colOrder.map(origIdx => renderCell(origIdx, row))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 모달 */}
            {modal !== null && (
                <CenterModal
                    initial={modal?.id ? modal : null}
                    existingOrders={existingOrders}
                    existingNames={existingNames}
                    onClose={() => setModal(null)}
                    onSaved={() => { setModal(null); fetchRows(); }}
                />
            )}

            {/* 단건 삭제 확인 */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <p className="font-black text-gray-800 mb-2">센터 삭제</p>
                        <p className="text-sm text-gray-600 mb-5"><span className="font-bold text-red-500">{deleteTarget.name}</span> 센터를 삭제하시겠습니까?</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteTarget(null)}
                                className="px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors">
                                취소
                            </button>
                            <button onClick={async () => {
                                await supabase.from(CENTER_TABLE).delete().eq('id', deleteTarget.id);
                                setDeleteTarget(null);
                                fetchRows();
                            }}
                                className="px-5 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors">
                                삭제
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── 탭 정의 ───────────────────────────────────────────────────────────────────
const TABS = [
    { id: 'erp_inbound',    label: 'ERP 입고예정생성 설정' },
    { id: 'erp_closing',    label: '입고 실적 마감 설정' },
    { id: 'center_config',  label: '센터 설정' },
];

// ── 래퍼: 시스템 데이터 관리 ──────────────────────────────────────────────────
const ErpInboundConfig = () => {
    const [activeTab, setActiveTab] = useState('erp_inbound');

    return (
        <div className="flex flex-col h-[calc(100vh-64px)]">
            <div className="bg-white border-b border-gray-200 px-6 flex items-center shrink-0">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-5 py-3 text-sm font-bold border-b-2 -mb-px transition-colors ${
                            activeTab === tab.id
                                ? 'border-letusBlue text-letusBlue'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-hidden">
                {activeTab === 'erp_inbound'   && <ErpInboundConfigPanel />}
                {activeTab === 'erp_closing'   && <ErpClosingConfigPanel />}
                {activeTab === 'center_config' && <CenterConfigPanel />}
            </div>
        </div>
    );
};

export { ErpInboundConfig };
