import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient.js';

const TABLE = 'erp_inbound_config';
const LS_KEY = 'letus_inbound_config_col';

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
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [modal, setModal]       = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const [colOrder, setColOrder]   = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths] = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef   = useRef(null);
    const dragSrcRef    = useRef(null);
    const wasDraggedRef = useRef(false);

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

    const fetchRows = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from(TABLE).select('*').order('id');
        if (error) console.error('[ErpInboundConfig] fetchRows error:', error.message, error);
        setRows(data || []);
        setLoading(false);
    }, []);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    const toggleActive = async (row) => {
        await supabase.from(TABLE).update({ is_active: !row.is_active }).eq('id', row.id);
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        await supabase.from(TABLE).delete().eq('id', deleteTarget.id);
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
                <td key={oIdx} className="p-4 text-center">
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
                                    <td colSpan={colOrder.length} className="p-12 text-center">
                                        <div className="w-7 h-7 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin mx-auto"></div>
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={colOrder.length} className="p-16 text-center text-gray-400 text-sm">
                                        설정이 없습니다.{' '}
                                        <span className="text-letusBlue cursor-pointer font-bold hover:underline" onClick={() => setModal('add')}>+ 설정 추가</span>
                                    </td>
                                </tr>
                            ) : rows.map(row => (
                                <tr key={row.id} className={`hover:bg-blue-50/30 transition-colors ${!row.is_active ? 'opacity-40' : ''}`}>
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
                            <p className="text-sm text-gray-600">
                                아래 설정을 삭제하시겠습니까?
                            </p>
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

// ── 탭 정의 (탭 추가 시 여기에만 추가) ────────────────────────────────────────
const TABS = [
    { id: 'erp_inbound', label: 'ERP 입고예정생성 설정' },
    // { id: 'next_tab', label: '다음 탭 이름' },
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
                {activeTab === 'erp_inbound' && <ErpInboundConfigPanel />}
            </div>
        </div>
    );
};

export { ErpInboundConfig };
