import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient.js';

const INCIDENT_REASONS = ['시공팀 상차 누락', '센터 과/오출', '연기건 입시차'];
const CONSTRUCTION_ACTIONS = ['조치 완료', '센터 판납'];
const RECEIVE_ACTIONS = ['수령 완료'];

const REASON_COLORS = {
    '시공팀 상차 누락': 'bg-red-100 text-red-700 border-red-200',
    '센터 과/오출':     'bg-orange-100 text-orange-700 border-orange-200',
    '연기건 입시차':    'bg-yellow-100 text-yellow-700 border-yellow-200',
};
const ACTION_COLORS = {
    '조치 완료': 'bg-green-100 text-green-700 border-green-200',
    '센터 판납':  'bg-blue-100 text-blue-700 border-blue-200',
    '수령 완료': 'bg-green-100 text-green-700 border-green-200',
};

const fmtDate = (d) => {
    if (!d) return '-';
    const [y, m, day] = d.split('-');
    return `${y}.${m}.${day}`;
};

// ── 신규 등록 모달 ──────────────────────────────────────────────────────────
const AddReturnModal = ({ onClose, onSave, workplaceList, userProfile }) => {
    const isAdmin = userProfile?.role === '관리자';
    const [form, setForm] = useState({
        incident_date: new Date().toISOString().split('T')[0],
        incident_center: isAdmin ? '' : (userProfile?.workplace || ''),
        writer: userProfile?.name || '',
        brand: '',
        item_code: '',
        color: '',
        quantity: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const handleSave = async () => {
        if (!form.incident_date || !form.incident_center) {
            return alert('발생일과 발생센터는 필수입니다.');
        }
        setIsSaving(true);
        try {
            const { error } = await supabase.from('logistics_returns').insert([{
                ...form,
                quantity: form.quantity !== '' ? parseInt(form.quantity, 10) : null,
            }]);
            if (error) throw error;
            onSave();
            onClose();
        } catch (e) {
            alert('저장 중 오류: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const inputCls = 'w-full border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusBlue text-gray-700';
    const selectCls = `${inputCls} cursor-pointer disabled:bg-gray-50 disabled:cursor-default bg-white`;
    const labelCls = 'text-[11px] font-bold text-gray-600 mb-1 block';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-lg border border-gray-100 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-amber-100 bg-amber-50 flex justify-between items-center">
                    <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        회수 건 등록
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="p-5 grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>발생일 <span className="text-red-500">*</span></label>
                        <input type="date" value={form.incident_date} onChange={e => set('incident_date', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>발생센터 <span className="text-red-500">*</span></label>
                        <select value={form.incident_center} onChange={e => set('incident_center', e.target.value)} disabled={!isAdmin} className={selectCls}>
                            <option value="">선택</option>
                            {workplaceList.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>작성자</label>
                        <input type="text" value={form.writer} onChange={e => set('writer', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>브랜드</label>
                        <input type="text" value={form.brand} onChange={e => set('brand', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>품목코드</label>
                        <input type="text" value={form.item_code} onChange={e => set('item_code', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className={labelCls}>색상</label>
                        <input type="text" value={form.color} onChange={e => set('color', e.target.value)} className={inputCls} />
                    </div>
                    <div className="col-span-2">
                        <label className={labelCls}>수량 <span className="text-[10px] text-gray-400">(숫자만)</span></label>
                        <input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} className={inputCls} />
                    </div>
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-600 text-xs font-bold rounded-[3px] hover:bg-gray-100">취소</button>
                    <button onClick={handleSave} disabled={isSaving}
                        className="px-4 py-2 bg-letusBlue text-white text-xs font-bold rounded-[3px] hover:bg-blue-700 disabled:opacity-50 shadow-sm">
                        {isSaving ? '저장 중...' : '등록'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
const ReturnsManagement = ({ userProfile }) => {
    const [items, setItems]                   = useState([]);
    const [isLoading, setIsLoading]           = useState(false);
    const [workplaceList, setWorkplaceList]   = useState([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingRowId, setEditingRowId]     = useState(null);
    const [editDraft, setEditDraft]           = useState({});

    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const [filters, setFilters] = useState({
        startDate: firstOfMonth,
        endDate: today,
        center: '전체',
        reason: '전체',
        completed: '전체',
    });

    const isAdmin     = userProfile?.role === '관리자';
    const myWorkplace = userProfile?.workplace;

    const getSections = (row) => ({
        field:        isAdmin || row.incident_center === myWorkplace,
        construction: isAdmin,
        receive:      isAdmin || row.receive_center === myWorkplace,
    });
    const canEditRow = (row) => { const s = getSections(row); return s.field || s.construction || s.receive; };

    // ── 데이터 로드 ─────────────────────────────────────────────────────────
    useEffect(() => { fetchWorkplaces(); }, []);
    useEffect(() => { fetchData(); }, [filters]);

    const fetchWorkplaces = async () => {
        const { data } = await supabase.from('workers').select('workplace').not('workplace', 'is', null);
        if (data) {
            const unique = [...new Set(data.map(w => w.workplace).filter(Boolean))].sort();
            setWorkplaceList(unique);
        }
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            let q = supabase.from('logistics_returns').select('*').order('created_at', { ascending: false });
            if (filters.startDate) q = q.gte('incident_date', filters.startDate);
            if (filters.endDate)   q = q.lte('incident_date', filters.endDate);
            if (filters.center !== '전체') q = q.eq('incident_center', filters.center);
            if (filters.reason !== '전체') q = q.eq('incident_reason', filters.reason);
            if (filters.completed === 'Y') q = q.eq('is_completed', true);
            if (filters.completed === 'N') q = q.eq('is_completed', false);
            const { data, error } = await q;
            if (error) throw error;
            setItems(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    // ── 행 편집 ─────────────────────────────────────────────────────────────
    const startEdit  = (row) => { setEditingRowId(row.id); setEditDraft({ ...row }); };
    const cancelEdit = ()    => { setEditingRowId(null); setEditDraft({}); };

    const setDraft = (field, value) => setEditDraft(prev => {
        const next = { ...prev, [field]: value };
        if (field === 'receive_action' && value === '수령 완료') next.is_completed = true;
        return next;
    });

    const saveEdit = async () => {
        const payload = { ...editDraft, updated_at: new Date().toISOString() };
        const { error } = await supabase.from('logistics_returns').update(payload).eq('id', editingRowId);
        if (!error) {
            setItems(prev => prev.map(item => item.id === editingRowId ? { ...item, ...payload } : item));
            cancelEdit();
        } else {
            alert('저장 실패: ' + error.message);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('이 건을 삭제하시겠습니까?')) return;
        const { error } = await supabase.from('logistics_returns').delete().eq('id', id);
        if (!error) setItems(prev => prev.filter(item => item.id !== id));
    };

    // ── 셀 렌더 헬퍼 ────────────────────────────────────────────────────────
    const editInput = (field, type = 'text', options = []) => {
        const val = editDraft[field] ?? '';
        const cls = 'w-full border border-blue-300 rounded-[3px] px-2 h-[26px] text-xs focus:outline-none focus:border-letusBlue';
        if (type === 'select') return (
            <select value={val} onChange={e => setDraft(field, e.target.value)} className={`${cls} bg-white cursor-pointer`}>
                <option value="">선택</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        );
        if (type === 'date')   return <input type="date"   value={val} onChange={e => setDraft(field, e.target.value)} className={cls} />;
        if (type === 'number') return <input type="number" value={val} onChange={e => setDraft(field, e.target.value)} className={cls} />;
        return <input type="text" value={val} onChange={e => setDraft(field, e.target.value)} className={cls} />;
    };

    const badge = (val, colorMap) => {
        if (!val) return <span className="text-gray-300">-</span>;
        return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorMap[val] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>{val}</span>;
    };

    // 섹션별 배경색
    const BG = {
        field:        'bg-amber-50/40',
        construction: 'bg-blue-50/40',
        returnSec:    'bg-green-50/40',
        receive:      'bg-purple-50/40',
    };

    const filterSelectCls = 'border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700 bg-white';

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* ── 헤더 + 필터 카드 ── */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex flex-col gap-3 z-30 shrink-0">
                {/* 타이틀 + 버튼 */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-black text-gray-900">회수품 / 전시품 관리</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">오출고·과출고 품목의 회수 과정 추적 관리</p>
                    </div>
                    <button onClick={() => setIsAddModalOpen(true)}
                        className="bg-letusBlue text-white hover:bg-blue-700 font-bold px-4 h-[30px] rounded-[3px] transition-colors text-xs flex items-center justify-center shadow-sm gap-1.5">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        발생 등록
                    </button>
                </div>

                {/* 필터 행 */}
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 whitespace-nowrap">기간</label>
                        <input type="date" value={filters.startDate}
                            onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))}
                            className={filterSelectCls} />
                        <span className="text-gray-400 text-xs">~</span>
                        <input type="date" value={filters.endDate}
                            onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))}
                            className={filterSelectCls} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] font-bold text-gray-600">발생센터</label>
                        <select value={filters.center} onChange={e => setFilters(p => ({ ...p, center: e.target.value }))} className={filterSelectCls}>
                            <option value="전체">전체</option>
                            {workplaceList.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] font-bold text-gray-600">발생사유</label>
                        <select value={filters.reason} onChange={e => setFilters(p => ({ ...p, reason: e.target.value }))} className={filterSelectCls}>
                            <option value="전체">전체</option>
                            {INCIDENT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] font-bold text-gray-600">완결여부</label>
                        <select value={filters.completed} onChange={e => setFilters(p => ({ ...p, completed: e.target.value }))} className={filterSelectCls}>
                            <option value="전체">전체</option>
                            <option value="N">미완결</option>
                            <option value="Y">완결</option>
                        </select>
                    </div>
                    <div className="flex items-center bg-blue-50/50 px-3 h-[30px] rounded-[3px] border border-blue-100 ml-auto shrink-0">
                        <span className="text-[11px] font-bold text-letusBlue">총 {items.length}건</span>
                    </div>
                </div>
            </div>

            {/* ── 테이블 카드 ── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar">
                    <table className="w-full text-left whitespace-nowrap text-[13px]" style={{ minWidth: '1560px' }}>
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            {/* 1행: 섹션 헤더 */}
                            <tr className="text-[11px] font-black">
                                <th className="bg-slate-100 border-r border-slate-200 text-slate-400 p-4 text-center w-10" rowSpan={2}>#</th>
                                <th className="bg-amber-100 border-r border-amber-200 text-amber-800 p-3 text-center" colSpan={7}>
                                    센터 현장 관리자 작성
                                </th>
                                <th className="bg-blue-100 border-r border-blue-200 text-blue-800 p-3 text-center" colSpan={3}>
                                    센터 시공 관리자 작성
                                </th>
                                <th className="bg-green-100 border-r border-green-200 text-green-800 p-3 text-center" colSpan={3}>
                                    <div>센터 현장 관리자 작성</div>
                                    <div className="text-[10px] font-normal opacity-70">(1열 "센터 과/오출시 작성")</div>
                                </th>
                                <th className="bg-purple-100 border-r border-purple-200 text-purple-800 p-3 text-center" colSpan={4}>
                                    <div>수신센터 담당자 작성</div>
                                    <div className="text-[10px] font-normal opacity-70">(1열 "과출" or "오출" 일시 작성)</div>
                                </th>
                                <th className="bg-slate-100 text-slate-400 p-3 text-center w-20" rowSpan={2}>관리</th>
                            </tr>
                            {/* 2행: 컬럼 헤더 */}
                            <tr>
                                {[
                                    ['발생일', BG.field], ['발생센터', BG.field], ['작성자', BG.field],
                                    ['브랜드', BG.field], ['품목코드', BG.field], ['색상', BG.field], ['수량', BG.field],
                                    ['발생 사유', BG.construction], ['확인 담당자', BG.construction], ['조치 여부', BG.construction],
                                    ['반납 센터', BG.returnSec], ['반납 일자', BG.returnSec], ['반납 담당자', BG.returnSec],
                                    ['수신센터', BG.receive], ['수신자', BG.receive], ['조치 여부', BG.receive], ['완결 여부', BG.receive],
                                ].map(([label, bg], i) => (
                                    <th key={i} className={`p-4 text-center border-r border-gray-200 ${bg}`}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={19} className="py-32 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div>
                                            <p className="text-gray-500 font-bold">데이터 로딩 중...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={19} className="p-20 text-center text-gray-400 font-bold">조회 결과가 없습니다.</td>
                                </tr>
                            ) : items.map((row, idx) => {
                                const isEditing = editingRowId === row.id;
                                const secs = getSections(row);

                                const TD = ({ bg, children }) => (
                                    <td className={`p-4 text-center border-r border-gray-100 ${bg} ${row.is_completed ? 'opacity-60' : ''}`}>
                                        {children}
                                    </td>
                                );

                                return (
                                    <tr key={row.id}
                                        className={`hover:bg-blue-50/30 transition-colors
                                            ${isEditing ? 'bg-blue-50/20 ring-1 ring-inset ring-blue-200' : ''}`}>

                                        {/* # */}
                                        <td className="p-4 text-center text-gray-400 text-xs">{idx + 1}</td>

                                        {/* ── 섹션 1: 현장 관리자 ── */}
                                        <TD bg={BG.field}>
                                            {isEditing && secs.field ? editInput('incident_date', 'date') : fmtDate(row.incident_date)}
                                        </TD>
                                        <TD bg={BG.field}>
                                            {isEditing && secs.field ? editInput('incident_center', 'select', workplaceList) : row.incident_center || '-'}
                                        </TD>
                                        <TD bg={BG.field}>
                                            {isEditing && secs.field ? editInput('writer') : row.writer || '-'}
                                        </TD>
                                        <TD bg={BG.field}>
                                            {isEditing && secs.field ? editInput('brand') : row.brand || '-'}
                                        </TD>
                                        <TD bg={BG.field}>
                                            {isEditing && secs.field ? editInput('item_code') : <span className="font-mono text-gray-500">{row.item_code || '-'}</span>}
                                        </TD>
                                        <TD bg={BG.field}>
                                            {isEditing && secs.field ? editInput('color') : row.color || '-'}
                                        </TD>
                                        <TD bg={BG.field}>
                                            {isEditing && secs.field
                                                ? editInput('quantity', 'number')
                                                : row.quantity != null ? <span className="font-bold">{row.quantity} EA</span> : '-'}
                                        </TD>

                                        {/* ── 섹션 2: 시공 관리자 ── */}
                                        <TD bg={BG.construction}>
                                            {isEditing && secs.construction
                                                ? editInput('incident_reason', 'select', INCIDENT_REASONS)
                                                : badge(row.incident_reason, REASON_COLORS)}
                                        </TD>
                                        <TD bg={BG.construction}>
                                            {isEditing && secs.construction ? editInput('construction_handler') : row.construction_handler || '-'}
                                        </TD>
                                        <TD bg={BG.construction}>
                                            {isEditing && secs.construction
                                                ? editInput('construction_action', 'select', CONSTRUCTION_ACTIONS)
                                                : badge(row.construction_action, ACTION_COLORS)}
                                        </TD>

                                        {/* ── 섹션 3: 반납 (현장 관리자) ── */}
                                        <TD bg={BG.returnSec}>
                                            {isEditing && secs.field ? editInput('return_center', 'select', workplaceList) : row.return_center || '-'}
                                        </TD>
                                        <TD bg={BG.returnSec}>
                                            {isEditing && secs.field ? editInput('return_date', 'date') : fmtDate(row.return_date)}
                                        </TD>
                                        <TD bg={BG.returnSec}>
                                            {isEditing && secs.field ? editInput('return_handler') : row.return_handler || '-'}
                                        </TD>

                                        {/* ── 섹션 4: 수신센터 ── */}
                                        <TD bg={BG.receive}>
                                            {isEditing && secs.receive ? editInput('receive_center', 'select', workplaceList) : row.receive_center || '-'}
                                        </TD>
                                        <TD bg={BG.receive}>
                                            {isEditing && secs.receive ? editInput('receiver') : row.receiver || '-'}
                                        </TD>
                                        <TD bg={BG.receive}>
                                            {isEditing && secs.receive
                                                ? editInput('receive_action', 'select', RECEIVE_ACTIONS)
                                                : badge(row.receive_action, ACTION_COLORS)}
                                        </TD>
                                        <TD bg={BG.receive}>
                                            {row.is_completed
                                                ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">Y</span>
                                                : <span className="text-gray-300 text-xs font-bold">N</span>}
                                        </TD>

                                        {/* ── 관리 버튼 ── */}
                                        <td className="p-4 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                            {isEditing ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <button onClick={saveEdit}
                                                        className="px-2.5 py-1 bg-letusBlue text-white text-[11px] font-bold rounded-[3px] hover:bg-blue-700 shadow-sm">
                                                        저장
                                                    </button>
                                                    <button onClick={cancelEdit}
                                                        className="px-2.5 py-1 border border-gray-300 text-gray-600 text-[11px] font-bold rounded-[3px] hover:bg-gray-100">
                                                        취소
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center gap-1">
                                                    {canEditRow(row) && (
                                                        <button onClick={() => startEdit(row)} title="편집"
                                                            className="p-1.5 text-gray-400 hover:text-letusBlue hover:bg-blue-50 rounded transition-colors">
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    {isAdmin && (
                                                        <button onClick={() => handleDelete(row.id)} title="삭제"
                                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── 신규 등록 모달 ── */}
            {isAddModalOpen && (
                <AddReturnModal
                    onClose={() => setIsAddModalOpen(false)}
                    onSave={fetchData}
                    workplaceList={workplaceList}
                    userProfile={userProfile}
                />
            )}
        </div>
    );
};

export { ReturnsManagement };
