import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient.js';

const INCIDENT_REASONS     = ['시공팀 상차 누락', '센터 과/오출', '연기건 입시차'];
const CONSTRUCTION_ACTIONS = ['조치 완료', '센터 판납'];
const RECEIVE_ACTIONS      = ['수령 완료'];

const REASON_COLORS = {
    '시공팀 상차 누락': 'bg-red-100 text-red-700 border-red-200',
    '센터 과/오출':     'bg-orange-100 text-orange-700 border-orange-200',
    '연기건 입시차':    'bg-yellow-100 text-yellow-700 border-yellow-200',
};
const ACTION_COLORS = {
    '조치 완료': 'bg-green-100 text-green-700 border-green-200',
    '센터 판납':  'bg-sky-100 text-sky-700 border-sky-200',
    '수령 완료': 'bg-green-100 text-green-700 border-green-200',
};

const fmtDate = (d) => {
    if (!d) return null;
    const [y, m, day] = d.split('-');
    return `${y}.${m}.${day}`;
};

// ── 진행 단계 인디케이터 ──────────────────────────────────────────────────────
const StepIndicator = ({ row }) => {
    const steps = [
        !!(row.incident_date && row.incident_center),
        !!(row.incident_reason),
        !!(row.return_center && row.return_date),
        !!(row.is_completed),
    ];
    const colors = [
        { on: 'bg-amber-100 text-amber-700 border-amber-300',   off: 'bg-gray-100 text-gray-300 border-gray-200' },
        { on: 'bg-blue-100 text-blue-700 border-blue-300',      off: 'bg-gray-100 text-gray-300 border-gray-200' },
        { on: 'bg-green-100 text-green-700 border-green-300',   off: 'bg-gray-100 text-gray-300 border-gray-200' },
        { on: 'bg-purple-100 text-purple-700 border-purple-300', off: 'bg-gray-100 text-gray-300 border-gray-200' },
    ];
    return (
        <div className="flex items-center gap-1 justify-center">
            {steps.map((done, i) => (
                <div key={i} className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center border ${done ? colors[i].on : colors[i].off}`}>
                    {i + 1}
                </div>
            ))}
        </div>
    );
};

// ── 상세 / 편집 모달 ─────────────────────────────────────────────────────────
const ReturnDetailModal = ({ row, onClose, onSaved, workplaceList, userProfile }) => {
    const isAdmin     = userProfile?.role === '관리자';
    const myWorkplace = userProfile?.workplace;
    const myName      = userProfile?.name || '';

    const secs = {
        field:        isAdmin || row.incident_center === myWorkplace,
        construction: isAdmin,
        receive:      isAdmin || row.receive_center === myWorkplace,
    };

    const [form, setForm] = useState(() => {
        const initial = { ...row };
        if (secs.field        && !initial.writer)               initial.writer               = myName;
        if (secs.construction && !initial.construction_handler) initial.construction_handler = myName;
        if (secs.field        && !initial.return_handler)       initial.return_handler       = myName;
        if (secs.receive      && !initial.receiver)             initial.receiver             = myName;
        return initial;
    });
    const [isSaving, setIsSaving] = useState(false);

    const set = (field, value) => setForm(prev => {
        const next = { ...prev, [field]: value };
        if (field === 'receive_action' && value === '수령 완료') next.is_completed = true;
        return next;
    });

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase.from('logistics_returns')
                .update({ ...form, updated_at: new Date().toISOString() })
                .eq('id', row.id);
            if (error) throw error;
            onSaved();
            onClose();
        } catch (e) {
            alert('저장 실패: ' + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const inp = (field, type = 'text', disabled = false) => {
        const cls = `w-full border rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusBlue
            ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100' : 'border-gray-200 text-gray-700 bg-white'}`;
        return <input type={type} value={form[field] ?? ''} onChange={e => !disabled && set(field, e.target.value)} disabled={disabled} className={cls} />;
    };

    const sel = (field, options, disabled = false) => {
        const cls = `w-full border rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusBlue
            ${disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100' : 'border-gray-200 text-gray-700 bg-white cursor-pointer'}`;
        return (
            <select value={form[field] ?? ''} onChange={e => !disabled && set(field, e.target.value)} disabled={disabled} className={cls}>
                <option value="">선택</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        );
    };

    const lbl = 'text-[11px] font-bold text-gray-500 mb-1 block';

    const Section = ({ title, no, canEdit, borderColor, bgColor, titleColor, children }) => (
        <div className={`rounded-lg border p-4 ${canEdit ? `${borderColor} ${bgColor}` : 'border-gray-100 bg-gray-50/50'}`}>
            <h4 className={`text-[11px] font-black mb-3 flex items-center gap-1.5 ${canEdit ? titleColor : 'text-gray-400'}`}>
                <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-black ${canEdit ? `${borderColor} border ${bgColor}` : 'bg-gray-200 text-gray-400'}`}>{no}</span>
                {title}
                {!canEdit && <span className="text-gray-300 font-normal text-[10px]">(열람 전용)</span>}
            </h4>
            <div className="grid grid-cols-3 gap-3">{children}</div>
        </div>
    );

    const Field = ({ label, children, span = 1 }) => (
        <div className={span === 2 ? 'col-span-2' : span === 3 ? 'col-span-3' : ''}>
            <label className={lbl}>{label}</label>
            {children}
        </div>
    );

    const disabled1 = !secs.field;
    const disabled2 = !secs.construction;
    const disabled4 = !secs.receive;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-2xl border border-gray-100 overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

                {/* 헤더 */}
                <div className="p-4 border-b border-gray-100 bg-slate-50 flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <StepIndicator row={form} />
                            {form.is_completed && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">완결</span>
                            )}
                        </div>
                        <p className="text-[11px] text-gray-400">
                            {fmtDate(form.incident_date) || '-'} · {form.incident_center || '-'}
                            {form.item_code && ` · ${form.item_code}`}
                            {form.quantity != null && ` · ${form.quantity}EA`}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5">✕</button>
                </div>

                {/* 바디 */}
                <div className="overflow-y-auto p-5 flex flex-col gap-4 custom-scrollbar">

                    {/* ① 현장 관리자 */}
                    <Section no="①" title="센터 현장 관리자 작성" canEdit={secs.field}
                        borderColor="border-amber-200" bgColor="bg-amber-50/40" titleColor="text-amber-700">
                        <Field label="발생일">{inp('incident_date', 'date', disabled1)}</Field>
                        <Field label="발생센터">{sel('incident_center', workplaceList, disabled1)}</Field>
                        <Field label="작성자">{inp('writer', 'text', disabled1)}</Field>
                        <Field label="브랜드">{inp('brand', 'text', disabled1)}</Field>
                        <Field label="품목코드">{inp('item_code', 'text', disabled1)}</Field>
                        <Field label="색상">{inp('color', 'text', disabled1)}</Field>
                        <Field label="수량" span={3}><input type="number" value={form.quantity ?? ''} onChange={e => !disabled1 && set('quantity', e.target.value === '' ? null : parseInt(e.target.value, 10))} disabled={disabled1}
                            className={`w-full border rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusBlue ${disabled1 ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100' : 'border-gray-200 text-gray-700 bg-white'}`} /></Field>
                    </Section>

                    {/* ② 시공 관리자 */}
                    <Section no="②" title="센터 시공 관리자 작성" canEdit={secs.construction}
                        borderColor="border-blue-200" bgColor="bg-blue-50/40" titleColor="text-blue-700">
                        <Field label="발생 사유">{sel('incident_reason', INCIDENT_REASONS, disabled2)}</Field>
                        <Field label="확인 담당자">{inp('construction_handler', 'text', disabled2)}</Field>
                        <Field label="조치 여부">{sel('construction_action', CONSTRUCTION_ACTIONS, disabled2)}</Field>
                    </Section>

                    {/* ③ 반납 (현장 관리자) */}
                    <Section no="③" title='센터 현장 관리자 작성 (센터 과/오출시)' canEdit={secs.field}
                        borderColor="border-green-200" bgColor="bg-green-50/40" titleColor="text-green-700">
                        <Field label="반납 센터">{sel('return_center', workplaceList, disabled1)}</Field>
                        <Field label="반납 일자">{inp('return_date', 'date', disabled1)}</Field>
                        <Field label="반납 담당자">{inp('return_handler', 'text', disabled1)}</Field>
                    </Section>

                    {/* ④ 수신센터 */}
                    <Section no="④" title='수신센터 담당자 작성 (과출/오출 일시)' canEdit={secs.receive}
                        borderColor="border-purple-200" bgColor="bg-purple-50/40" titleColor="text-purple-700">
                        <Field label="수신센터">{sel('receive_center', workplaceList, disabled4)}</Field>
                        <Field label="수신자">{inp('receiver', 'text', disabled4)}</Field>
                        <Field label="조치 여부">{sel('receive_action', RECEIVE_ACTIONS, disabled4)}</Field>
                        <Field label="완결 여부" span={3}>
                            <div className={`flex items-center h-[30px] px-2.5 border rounded-[3px] text-xs ${form.is_completed ? 'bg-green-50 border-green-200 text-green-700 font-bold' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                                {form.is_completed ? '완결 (Y)' : '미완결 (N) — 수령 완료 선택 시 자동 처리'}
                            </div>
                        </Field>
                    </Section>
                </div>

                {/* 푸터 */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                    <p className="text-[10px] text-gray-400">권한 있는 섹션만 수정 가능합니다</p>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-600 text-xs font-bold rounded-[3px] hover:bg-gray-100">닫기</button>
                        {(secs.field || secs.construction || secs.receive) && (
                            <button onClick={handleSave} disabled={isSaving}
                                className="px-5 py-2 bg-letusBlue text-white text-xs font-bold rounded-[3px] hover:bg-blue-700 disabled:opacity-50 shadow-sm">
                                {isSaving ? '저장 중...' : '저장'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── 신규 등록 모달 ──────────────────────────────────────────────────────────
const AddReturnModal = ({ onClose, onSave, workplaceList, userProfile }) => {
    const isAdmin = userProfile?.role === '관리자';
    const [form, setForm] = useState({
        incident_date: new Date().toISOString().split('T')[0],
        incident_center: isAdmin ? '' : (userProfile?.workplace || ''),
        writer: userProfile?.name || '',
        brand: '', item_code: '', color: '', quantity: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

    const handleSave = async () => {
        if (!form.incident_date || !form.incident_center) return alert('발생일과 발생센터는 필수입니다.');
        setIsSaving(true);
        try {
            const { error } = await supabase.from('logistics_returns').insert([{
                ...form,
                quantity: form.quantity !== '' ? parseInt(form.quantity, 10) : null,
            }]);
            if (error) throw error;
            onSave(); onClose();
        } catch (e) { alert('저장 중 오류: ' + e.message); }
        finally { setIsSaving(false); }
    };

    const inp = 'w-full border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusBlue text-gray-700';
    const sel = `${inp} cursor-pointer bg-white disabled:bg-gray-50`;
    const lbl = 'text-[11px] font-bold text-gray-600 mb-1 block';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-lg border border-gray-100 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-amber-100 bg-amber-50 flex justify-between items-center">
                    <h3 className="font-black text-gray-900 text-sm">회수 건 등록</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="p-5 grid grid-cols-2 gap-4">
                    <div><label className={lbl}>발생일 <span className="text-red-500">*</span></label><input type="date" value={form.incident_date} onChange={e => set('incident_date', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>발생센터 <span className="text-red-500">*</span></label>
                        <select value={form.incident_center} onChange={e => set('incident_center', e.target.value)} disabled={!isAdmin} className={sel}>
                            <option value="">선택</option>
                            {workplaceList.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                    </div>
                    <div><label className={lbl}>작성자</label><input type="text" value={form.writer} readOnly className="w-full border border-gray-100 rounded-[3px] text-xs px-2.5 h-[30px] bg-gray-50 text-gray-400 cursor-not-allowed" /></div>
                    <div><label className={lbl}>브랜드</label><input type="text" value={form.brand} onChange={e => set('brand', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>품목코드</label><input type="text" value={form.item_code} onChange={e => set('item_code', e.target.value)} className={inp} /></div>
                    <div><label className={lbl}>색상</label><input type="text" value={form.color} onChange={e => set('color', e.target.value)} className={inp} /></div>
                    <div className="col-span-2"><label className={lbl}>수량 <span className="text-[10px] text-gray-400">(숫자만)</span></label><input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} className={inp} /></div>
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-600 text-xs font-bold rounded-[3px] hover:bg-gray-100">취소</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-letusBlue text-white text-xs font-bold rounded-[3px] hover:bg-blue-700 disabled:opacity-50 shadow-sm">
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
    const [activeRow, setActiveRow]           = useState(null);
    const [selectedIds, setSelectedIds]       = useState(new Set());

    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const initialFilters = { startDate: firstOfMonth, endDate: today, center: '전체', reason: '전체', completed: '전체' };
    const [draftFilters, setDraftFilters]     = useState(initialFilters);
    const [appliedFilters, setAppliedFilters] = useState(initialFilters);

    const isAdmin = userProfile?.role === '관리자';

    useEffect(() => { fetchWorkplaces(); }, []);
    useEffect(() => { fetchData(); }, [appliedFilters]);

    const handleSearchClick = () => setAppliedFilters({ ...draftFilters });

    const fetchWorkplaces = async () => {
        const { data } = await supabase.from('workers').select('workplace').not('workplace', 'is', null);
        if (data) setWorkplaceList([...new Set(data.map(w => w.workplace).filter(Boolean))].sort());
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            let q = supabase.from('logistics_returns').select('*').order('created_at', { ascending: false });
            if (appliedFilters.startDate) q = q.gte('incident_date', appliedFilters.startDate);
            if (appliedFilters.endDate)   q = q.lte('incident_date', appliedFilters.endDate);
            if (appliedFilters.center !== '전체')  q = q.eq('incident_center', appliedFilters.center);
            if (appliedFilters.reason !== '전체')  q = q.eq('incident_reason', appliedFilters.reason);
            if (appliedFilters.completed === 'Y') q = q.eq('is_completed', true);
            if (appliedFilters.completed === 'N') q = q.eq('is_completed', false);
            const { data, error } = await q;
            if (error) throw error;
            setItems(data || []);
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    };

    const filterSel = 'border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700 bg-white';

    const COLS = [
        { isCheckbox: true, w: '44px'  },
        { label: '발생일',  w: '90px'  },
        { label: '발생센터', w: '110px' },
        { label: '브랜드',  w: '80px'  },
        { label: '품목코드', w: '130px' },
        { label: '수량',    w: '70px'  },
        { label: '발생 사유', w: '140px' },
        { label: '진행 단계', w: '110px' },
        { label: '완결',    w: '60px'  },
    ];

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* ── 필터 ── */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 z-30 shrink-0">
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 whitespace-nowrap">기간</label>
                        <input type="date" value={draftFilters.startDate} onChange={e => setDraftFilters(p => ({ ...p, startDate: e.target.value }))} className={filterSel} />
                        <span className="text-gray-400 text-xs">~</span>
                        <input type="date" value={draftFilters.endDate} onChange={e => setDraftFilters(p => ({ ...p, endDate: e.target.value }))} className={filterSel} />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] font-bold text-gray-600">발생센터</label>
                        <select value={draftFilters.center} onChange={e => setDraftFilters(p => ({ ...p, center: e.target.value }))} className={filterSel}>
                            <option value="전체">전체</option>
                            {workplaceList.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] font-bold text-gray-600">발생사유</label>
                        <select value={draftFilters.reason} onChange={e => setDraftFilters(p => ({ ...p, reason: e.target.value }))} className={filterSel}>
                            <option value="전체">전체</option>
                            {INCIDENT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] font-bold text-gray-600">완결여부</label>
                        <select value={draftFilters.completed} onChange={e => setDraftFilters(p => ({ ...p, completed: e.target.value }))} className={filterSel}>
                            <option value="전체">전체</option>
                            <option value="N">미완결</option>
                            <option value="Y">완결</option>
                        </select>
                    </div>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button onClick={() => setIsAddModalOpen(true)}
                            className="bg-letusBlue text-white hover:bg-blue-700 font-bold px-4 h-[30px] rounded-[3px] transition-colors text-xs flex items-center gap-1.5 shadow-sm">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                            발생 등록
                        </button>
                        <button onClick={handleSearchClick}
                            className="bg-letusOrange text-white hover:bg-orange-600 font-bold px-6 h-[30px] rounded-[3px] transition-colors text-xs flex items-center gap-1.5 shadow-sm">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            조회하기
                        </button>
                    </div>
                </div>
            </div>

            {/* ── 테이블 ── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar">
                    <table className="w-full text-left whitespace-nowrap text-[13px]">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                {COLS.map((col, i) => (
                                    <th key={i} className="p-4 text-center" style={{ width: col.w }}>
                                        {col.isCheckbox ? (
                                            <input type="checkbox"
                                                checked={items.length > 0 && selectedIds.size === items.length}
                                                onChange={e => setSelectedIds(e.target.checked ? new Set(items.map(r => r.id)) : new Set())}
                                                className="w-4 h-4 cursor-pointer accent-letusBlue"
                                            />
                                        ) : col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                            {isLoading ? (
                                <tr><td colSpan={COLS.length} className="py-32 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin" />
                                        <p className="text-gray-500 font-bold">데이터 로딩 중...</p>
                                    </div>
                                </td></tr>
                            ) : items.length === 0 ? (
                                <tr><td colSpan={COLS.length} className="p-20 text-center text-gray-400 font-bold">조회 결과가 없습니다.</td></tr>
                            ) : items.map((row, idx) => (
                                <tr key={row.id}
                                    onClick={() => setActiveRow(row)}
                                    className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${row.is_completed ? 'opacity-60' : ''}`}>
                                    <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox"
                                            checked={selectedIds.has(row.id)}
                                            onChange={e => setSelectedIds(prev => {
                                                const next = new Set(prev);
                                                e.target.checked ? next.add(row.id) : next.delete(row.id);
                                                return next;
                                            })}
                                            className="w-4 h-4 cursor-pointer accent-letusBlue"
                                        />
                                    </td>
                                    <td className="p-4 text-center text-gray-600">{fmtDate(row.incident_date) || '-'}</td>
                                    <td className="p-4 text-center font-semibold">{row.incident_center || '-'}</td>
                                    <td className="p-4 text-center text-gray-600">{row.brand || '-'}</td>
                                    <td className="p-4 text-center font-mono text-gray-500">{row.item_code || '-'}</td>
                                    <td className="p-4 text-center font-bold">{row.quantity != null ? `${row.quantity} EA` : '-'}</td>
                                    <td className="p-4 text-center">
                                        {row.incident_reason
                                            ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${REASON_COLORS[row.incident_reason] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>{row.incident_reason}</span>
                                            : <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="p-4 text-center"><StepIndicator row={row} /></td>
                                    <td className="p-4 text-center">
                                        {row.is_completed
                                            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">Y</span>
                                            : <span className="text-gray-300 text-xs font-bold">N</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── 상세 모달 ── */}
            {activeRow && (
                <ReturnDetailModal
                    row={activeRow}
                    onClose={() => setActiveRow(null)}
                    onSaved={fetchData}
                    workplaceList={workplaceList}
                    userProfile={userProfile}
                />
            )}

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
