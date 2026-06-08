import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient.js';

const TABLE = 'erp_inbound_config';
const LS_KEY = 'letus_inbound_config_col';

const DEFAULT_COLUMNS = [
    { label: '순서',         key: 'sort_order',       w: 70  },
    { label: '회사',         key: 'company',          w: 120 },
    { label: '입고예정창고', key: 'input_warehouse',  w: 150 },
    { label: '출고창고',     key: 'output_warehouse', w: 150 },
    { label: '활성',         key: 'is_active',        w: 80  },
    { label: '비고',         key: 'note',             w: 200 },
    { label: '수정/삭제',    key: null,               w: 110 },
];

const EMPTY_FORM = { company: '', input_warehouse: '', output_warehouse: '', sort_order: 0, note: '', is_active: true };

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
                company:         form.company.trim(),
                input_warehouse: form.input_warehouse.trim(),
                output_warehouse: form.output_warehouse.trim(),
                sort_order:      Number(form.sort_order) || 0,
                note:            form.note.trim() || null,
                is_active:       form.is_active,
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[460px] p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-base font-bold text-gray-800">
                        {isEdit ? '설정 수정' : '설정 추가'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>

                <div className="space-y-3">
                    {[
                        { label: '회사 *',         key: 'company',          ph: '예) 퍼시스' },
                        { label: '입고예정창고 *',  key: 'input_warehouse',  ph: '예) 퍼시스양지' },
                        { label: '출고창고 *',      key: 'output_warehouse', ph: '예) 시디즈평택' },
                        { label: '비고',            key: 'note',             ph: '(선택)' },
                    ].map(({ label, key, ph }) => (
                        <div key={key}>
                            <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
                            <input
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                placeholder={ph}
                                value={form[key] || ''}
                                onChange={e => set(key, e.target.value)}
                            />
                        </div>
                    ))}

                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-600 mb-1">정렬 순서</label>
                            <input
                                type="number"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={form.sort_order}
                                onChange={e => set('sort_order', e.target.value)}
                            />
                        </div>
                        <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 font-bold">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 accent-blue-500"
                                    checked={form.is_active}
                                    onChange={e => set('is_active', e.target.checked)}
                                />
                                활성
                            </label>
                        </div>
                    </div>
                </div>

                {err && <p className="text-red-500 text-xs mt-3">{err}</p>}

                <div className="flex gap-2 mt-5 justify-end">
                    <button onClick={onClose}
                        className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                        취소
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
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
    const [modal, setModal]       = useState(null); // null | 'add' | row(edit)
    const [deleteTarget, setDeleteTarget] = useState(null);

    // 컬럼 관리
    const [colOrder, setColOrder]   = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths] = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef  = useRef(null);
    const dragSrcRef   = useRef(null);
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
        const { data, error } = await supabase.from(TABLE).select('*').order('sort_order').order('id');
        if (error) console.error('[ErpInboundConfig] fetchRows error:', error.message, error);
        setRows(data || []);
        setLoading(false);
    }, []);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    // 활성 토글
    const toggleActive = async (row) => {
        await supabase.from(TABLE).update({ is_active: !row.is_active }).eq('id', row.id);
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !r.is_active } : r));
    };

    // 삭제
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
        const col = DEFAULT_COLUMNS[oIdx];
        switch (oIdx) {
            case 0: return <td key={oIdx} className="p-3 text-center text-gray-500 text-sm">{row.sort_order}</td>;
            case 1: return <td key={oIdx} className="p-3 font-bold text-gray-800 text-sm">{row.company}</td>;
            case 2: return <td key={oIdx} className="p-3 text-gray-700 text-sm">{row.input_warehouse}</td>;
            case 3: return <td key={oIdx} className="p-3 text-gray-700 text-sm">{row.output_warehouse}</td>;
            case 4: return (
                <td key={oIdx} className="p-3 text-center">
                    <button
                        onClick={() => toggleActive(row)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                            row.is_active
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                    >
                        {row.is_active ? '활성' : '비활성'}
                    </button>
                </td>
            );
            case 5: return <td key={oIdx} className="p-3 text-gray-500 text-sm">{row.note || '-'}</td>;
            case 6: return (
                <td key={oIdx} className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                        <button
                            onClick={() => setModal(row)}
                            className="px-2 py-1 text-xs border border-blue-300 text-blue-600 rounded hover:bg-blue-50"
                        >수정</button>
                        <button
                            onClick={() => setDeleteTarget(row)}
                            className="px-2 py-1 text-xs border border-red-300 text-red-500 rounded hover:bg-red-50"
                        >삭제</button>
                    </div>
                </td>
            );
            default: return null;
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* 상단 툴바 */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shrink-0">
                <div>
                    <h1 className="text-sm font-bold text-gray-800">ERP 입고예정생성 설정</h1>
                    <p className="text-xs text-gray-400 mt-0.5">
                        RPA가 이 목록을 순서대로 처리합니다. 활성 토글로 임시 제외 가능합니다.
                    </p>
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
                        className="flex items-center gap-1.5 px-3 h-[32px] bg-blue-600 text-white text-xs font-bold rounded shadow-sm hover:bg-blue-700 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        설정 추가
                    </button>
                </div>
            </div>

            {/* 테이블 */}
            <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                <table className="w-full text-left whitespace-nowrap table-fixed">
                    <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                        <tr>
                            {colOrder.map((oIdx, vIdx) => {
                                const col = DEFAULT_COLUMNS[oIdx];
                                return (
                                    <th key={oIdx}
                                        className={`relative p-3 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${dragOverIdx === vIdx ? 'bg-blue-100' : ''}`}
                                        style={{ width: colWidths[oIdx] }}
                                        draggable
                                        onDragStart={e => handleDragStart(e, vIdx)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={e => handleDragOver(e, vIdx)}
                                        onDrop={e => handleDrop(e, vIdx)}
                                        onDragLeave={() => setDragOverIdx(null)}
                                    >
                                        {col.label}
                                        <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400/40 z-10"
                                            onMouseDown={e => handleResizeStart(e, vIdx)}
                                            onClick={e => e.stopPropagation()} />
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan={colOrder.length} className="p-8 text-center text-gray-400 text-sm">로딩 중...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={colOrder.length} className="p-8 text-center text-gray-400 text-sm">
                                설정이 없습니다. <span className="text-blue-500 cursor-pointer font-bold" onClick={() => setModal('add')}>+ 설정 추가</span>
                            </td></tr>
                        ) : rows.map(row => (
                            <tr key={row.id} className={`hover:bg-blue-50/30 transition-colors ${!row.is_active ? 'opacity-40' : ''}`}>
                                {colOrder.map(oIdx => renderCell(oIdx, row))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 총계 */}
            <div className="px-6 py-2 border-t border-gray-200 bg-white shrink-0 text-xs text-gray-400">
                전체 {rows.length}건 | 활성 {rows.filter(r => r.is_active).length}건
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
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl w-[360px] p-6">
                        <h2 className="text-base font-bold text-gray-800 mb-2">삭제 확인</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            <span className="font-bold text-red-500">{deleteTarget.company} / {deleteTarget.output_warehouse}</span> 설정을 삭제할까요?
                            <br /><span className="text-xs text-gray-400 mt-1 block">삭제 대신 비활성화를 권장합니다.</span>
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteTarget(null)}
                                className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                                취소
                            </button>
                            <button onClick={handleDelete}
                                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">
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
            {/* 탭 네비게이션 */}
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

            {/* 탭 컨텐츠 */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'erp_inbound' && <ErpInboundConfigPanel />}
            </div>
        </div>
    );
};

export { ErpInboundConfig };
