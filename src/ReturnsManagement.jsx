import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient.js';
import { loadXLSXStyle } from './utils.js';
import { SearchButton, DateRangeInput } from './SharedUI.jsx';

const INCIDENT_REASONS     = ['시공팀 상차 누락', '센터 과/오출', '확인 중', '미출고', '연기건 미상차', '반품건 미적재'];
const CONSTRUCTION_ACTIONS = ['조치 완료', '센터 반납'];
const RECEIVE_ACTIONS      = ['수령 완료', '확인 불가'];
const RETURN_CENTER_LIST   = ['양지1센터', '양지2센터', '양지3센터', '안성센터', '평택센터', '음성센터'];

const REASON_COLORS = {
    '시공팀 상차 누락': 'bg-red-100 text-red-700 border-red-200',
    '센터 과/오출':     'bg-orange-100 text-orange-700 border-orange-200',
    '확인 중':          'bg-slate-100 text-slate-600 border-slate-200',
    '미출고':           'bg-yellow-100 text-yellow-700 border-yellow-200',
    '연기건 미상차':    'bg-amber-100 text-amber-700 border-amber-200',
    '반품건 미적재':    'bg-purple-100 text-purple-700 border-purple-200',
};
const ACTION_COLORS = {
    '조치 완료': 'bg-green-100 text-green-700 border-green-200',
    '센터 반납':  'bg-sky-100 text-sky-700 border-sky-200',
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
        { on: 'bg-amber-100 text-amber-700 border-amber-300',    off: 'bg-gray-100 text-gray-300 border-gray-200' },
        { on: 'bg-blue-100 text-blue-700 border-blue-300',       off: 'bg-gray-100 text-gray-300 border-gray-200' },
        { on: 'bg-green-100 text-green-700 border-green-300',    off: 'bg-gray-100 text-gray-300 border-gray-200' },
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

    const [form, setForm]         = useState({ ...row, incident_center: row.incident_center || myWorkplace || '', return_date: row.return_date || new Date().toISOString().split('T')[0] });
    const [isSaving, setIsSaving] = useState(false);

    const set = (field, value) => setForm(prev => {
        const next = { ...prev, [field]: value };
        if (field === 'receive_action' && value) next.is_completed = true;
        return next;
    });

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = { ...form, updated_at: new Date().toISOString() };
            const changed = (fields) => fields.some(f => (form[f] ?? '') !== (row[f] ?? ''));
            const sec1Changed = changed(['incident_date', 'incident_center', 'brand', 'item_code', 'color', 'quantity', 'incident_reason']);
            const sec2Changed = changed(['construction_action', 'construction_handler']);
            const sec3Changed = changed(['return_center', 'return_date', 'return_handler']);
            const sec4Changed = changed(['receive_center', 'receive_action', 'receiver']);
            if (secs.field        && sec1Changed && !payload.writer)               payload.writer               = myName;
            if (secs.construction && sec2Changed && !payload.construction_handler) payload.construction_handler = myName;
            if (secs.field        && sec3Changed && !payload.return_handler)       payload.return_handler       = myName;
            if (secs.receive      && sec4Changed && !payload.receiver)             payload.receiver             = myName;
            const { error } = await supabase.from('logistics_returns')
                .update(payload)
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
                        <Field label="작성자">{inp('writer', 'text', true)}</Field>
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
                        <Field label="확인 담당자">{inp('construction_handler', 'text', true)}</Field>
                        <Field label="조치 여부">{sel('construction_action', CONSTRUCTION_ACTIONS, disabled2)}</Field>
                    </Section>

                    {/* ③ 반납 (현장 관리자) */}
                    <Section no="③" title='센터 현장 관리자 작성 (센터 과/오출 시)' canEdit={secs.field}
                        borderColor="border-green-200" bgColor="bg-green-50/40" titleColor="text-green-700">
                        <Field label="반납 센터">{sel('return_center', RETURN_CENTER_LIST, disabled1)}</Field>
                        <Field label="반납 일자">{inp('return_date', 'date', disabled1)}</Field>
                        <Field label="반납 담당자">{inp('return_handler', 'text', true)}</Field>
                    </Section>

                    {/* ④ 수신센터 */}
                    <Section no="④" title='수신센터 담당자 작성 (센터 과/오출 시)' canEdit={secs.receive}
                        borderColor="border-purple-200" bgColor="bg-purple-50/40" titleColor="text-purple-700">
                        <Field label="수신센터">{sel('receive_center', RETURN_CENTER_LIST, disabled4)}</Field>
                        <Field label="수신자">{inp('receiver', 'text', true)}</Field>
                        <Field label="조치 여부">{sel('receive_action', RECEIVE_ACTIONS, disabled4)}</Field>
                        <Field label="완결 여부" span={3}>
                            <div className={`flex items-center h-[30px] px-2.5 border rounded-[3px] text-xs ${form.is_completed ? 'bg-green-50 border-green-200 text-green-700 font-bold' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                                {form.is_completed ? '완결 (Y)' : '미완결 (N) — 조치여부 선택 시 자동 처리'}
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

// ── 선출고 상세 / 편집 모달 ──────────────────────────────────────────────────
const PreDeliveryDetailModal = ({ row, onClose, onSaved, workplaceList, userProfile }) => {
    const isAdmin     = userProfile?.role === '관리자';
    const myWorkplace = userProfile?.workplace;
    const myName      = userProfile?.name || '';

    const [form, setForm]         = useState({ ...row });
    const [isSaving, setIsSaving] = useState(false);

    const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const handleToggleRecovered = () => {
        const newVal = !form.is_recovered;
        setForm(prev => ({
            ...prev,
            is_recovered:      newVal,
            recovered_at:      newVal && !prev.recovered_at      ? new Date().toISOString().split('T')[0] : prev.recovered_at,
            recovery_handler:  newVal && !prev.recovery_handler  ? myName : prev.recovery_handler,
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = { ...form, updated_at: new Date().toISOString() };
            const { error } = await supabase.from('logistics_returns').update(payload).eq('id', row.id);
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

    const canEditBase = isAdmin || row.incident_center === myWorkplace;
    const d1 = !canEditBase;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-2xl border border-gray-100 overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

                {/* 헤더 */}
                <div className="p-4 border-b border-amber-100 bg-amber-50 flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">선출고</span>
                            {form.is_recovered
                                ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">회수완료</span>
                                : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">미회수</span>}
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

                    {/* ① 품목 정보 */}
                    <Section no="①" title="품목 정보" canEdit={canEditBase}
                        borderColor="border-amber-200" bgColor="bg-amber-50/40" titleColor="text-amber-700">
                        <Field label="발생일">{inp('incident_date', 'date', d1)}</Field>
                        <Field label="발생센터">{sel('incident_center', workplaceList, d1)}</Field>
                        <Field label="작성자">{inp('writer', 'text', true)}</Field>
                        <Field label="브랜드">{inp('brand', 'text', d1)}</Field>
                        <Field label="품목코드">{inp('item_code', 'text', d1)}</Field>
                        <Field label="색상">{inp('color', 'text', d1)}</Field>
                        <Field label="수량" span={3}>
                            <input type="number" value={form.quantity ?? ''} onChange={e => !d1 && set('quantity', e.target.value === '' ? null : parseInt(e.target.value, 10))} disabled={d1}
                                className={`w-full border rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusBlue ${d1 ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-100' : 'border-gray-200 text-gray-700 bg-white'}`} />
                        </Field>
                    </Section>

                    {/* ② 선출 정보 */}
                    <Section no="②" title="선출 정보" canEdit={canEditBase}
                        borderColor="border-blue-200" bgColor="bg-blue-50/40" titleColor="text-blue-700">
                        <Field label="발생 사유">{sel('incident_reason', INCIDENT_REASONS, d1)}</Field>
                        <Field label="시공팀명" span={2}>{inp('construction_team', 'text', d1)}</Field>
                    </Section>

                    {/* ③ 회수 정보 */}
                    <Section no="③" title="회수 정보" canEdit={true}
                        borderColor="border-green-200" bgColor="bg-green-50/40" titleColor="text-green-700">
                        <div className="col-span-3 grid gap-3" style={{ gridTemplateColumns: '1fr 120px 170px' }}>
                            <div>
                                <label className={lbl}>회수여부</label>
                                <button type="button" onClick={handleToggleRecovered}
                                    className={`w-full h-[30px] px-3 rounded-[3px] text-xs font-bold border transition-colors ${form.is_recovered ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}>
                                    {form.is_recovered ? '✓ 회수완료' : '미회수 — 클릭 시 회수완료'}
                                </button>
                            </div>
                            <div>
                                <label className={lbl}>회수일</label>
                                {inp('recovered_at', 'date', !form.is_recovered)}
                            </div>
                            <div>
                                <label className={lbl}>회수담당자</label>
                                {inp('recovery_handler', 'text', !form.is_recovered)}
                            </div>
                        </div>
                    </Section>
                </div>

                {/* 푸터 */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                    <p className="text-[10px] text-gray-400">③ 회수 정보는 모든 담당자가 수정 가능합니다</p>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-600 text-xs font-bold rounded-[3px] hover:bg-gray-100">닫기</button>
                        <button onClick={handleSave} disabled={isSaving}
                            className="px-5 py-2 bg-letusBlue text-white text-xs font-bold rounded-[3px] hover:bg-blue-700 disabled:opacity-50 shadow-sm">
                            {isSaving ? '저장 중...' : '저장'}
                        </button>
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
    const [isSaving, setIsSaving]         = useState(false);
    const [isLooking, setIsLooking]       = useState(false);
    const [lookupResult, setLookupResult] = useState(null);
    const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

    const lookupProduct = async () => {
        const code = form.item_code?.trim();
        if (!code) return;
        setIsLooking(true);
        setLookupResult(null);
        const { data } = await supabase.from('products').select('brand_category, item_color').eq('item_code', code).single();
        if (data) {
            set('brand', data.brand_category || '');
            set('color', data.item_color || '');
            setLookupResult('found');
        } else {
            setLookupResult('notfound');
        }
        setIsLooking(false);
    };

    const handleSave = async () => {
        if (!form.incident_date || !form.incident_center) return alert('발생일과 발생센터는 필수입니다.');
        setIsSaving(true);
        try {
            const { error } = await supabase.from('logistics_returns').insert([{
                ...form,
                type: '회수품',
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
                    <div className="col-span-2">
                        <label className={lbl}>품목코드</label>
                        <div className="flex gap-1.5">
                            <input type="text" value={form.item_code}
                                onChange={e => { set('item_code', e.target.value); setLookupResult(null); }}
                                onKeyDown={e => e.key === 'Enter' && lookupProduct()}
                                placeholder="품목코드 입력 후 조회"
                                className={`flex-1 ${inp}`} />
                            <button onClick={lookupProduct} disabled={isLooking || !form.item_code?.trim()}
                                className="px-3 h-[30px] border border-letusBlue text-letusBlue text-xs font-bold rounded-[3px] hover:bg-blue-50 disabled:opacity-40 shrink-0 flex items-center gap-1 transition-colors">
                                {isLooking
                                    ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                    : '조회'}
                            </button>
                        </div>
                        {lookupResult === 'found'    && <p className="text-[10px] text-green-600 font-bold mt-1">✓ 품목 정보 자동 입력됨</p>}
                        {lookupResult === 'notfound' && <p className="text-[10px] text-amber-500 font-bold mt-1">DB에 없는 코드입니다 — 직접 입력하세요</p>}
                    </div>
                    <div><label className={lbl}>브랜드</label><input type="text" value={form.brand} onChange={e => set('brand', e.target.value)} className={inp} /></div>
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

// ── 일괄 변경 모달 ───────────────────────────────────────────────────────────
const ReturnsBulkEditModal = ({ selectedIds, onClose, onReload }) => {
    const [updateTarget, setUpdateTarget] = useState({
        incidentReasonGroup: false,
        constructionGroup:   false,
        receiveGroup:        false,
    });
    const [incidentReason,    setIncidentReason]    = useState('');
    const [constructionAction, setConstructionAction] = useState('');
    const [receiveAction,     setReceiveAction]     = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        const { incidentReasonGroup, constructionGroup, receiveGroup } = updateTarget;
        if (!incidentReasonGroup && !constructionGroup && !receiveGroup)
            return alert('변경할 항목 그룹을 최소 하나 이상 체크해 주세요.');
        if (incidentReasonGroup && !incidentReason)    return alert('발생사유를 선택해 주세요.');
        if (constructionGroup   && !constructionAction) return alert('조치여부(시공)를 선택해 주세요.');
        if (receiveGroup        && !receiveAction)      return alert('조치여부(수신)을 선택해 주세요.');

        setIsSaving(true);
        try {
            const updateData = { updated_at: new Date().toISOString() };
            if (incidentReasonGroup) updateData.incident_reason     = incidentReason;
            if (constructionGroup)   updateData.construction_action = constructionAction;
            if (receiveGroup)        { updateData.receive_action = receiveAction; updateData.is_completed = true; }

            const CHUNK = 200;
            for (let i = 0; i < selectedIds.length; i += CHUNK) {
                const chunk = selectedIds.slice(i, i + CHUNK);
                const { error } = await supabase.from('logistics_returns').update(updateData).in('id', chunk);
                if (error) throw error;
            }
            alert(`총 ${selectedIds.length}건의 항목이 일괄 수정되었습니다.`);
            onReload(); onClose();
        } catch (e) { alert('저장 실패: ' + e.message); }
        finally { setIsSaving(false); }
    };

    const isAnyChecked = updateTarget.incidentReasonGroup || updateTarget.constructionGroup || updateTarget.receiveGroup;
    const selectCls = 'border border-gray-300 rounded px-2.5 py-1.5 text-[11px] outline-none w-full bg-white cursor-pointer text-gray-700';

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[480px] overflow-hidden flex flex-col slide-up">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white shrink-0">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full mr-2"></span>
                        선택 항목 일괄 수정
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
                </div>

                <div className="p-6 bg-slate-50 flex-1 flex flex-col overflow-hidden">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px] font-bold text-letusBlue text-center shrink-0 mb-4">
                        현재 <span className="text-lg mx-1">{selectedIds.length}</span>건이 선택되었습니다.
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
                        {/* 발생사유 */}
                        <div className={`border rounded-lg transition-all overflow-hidden ${updateTarget.incidentReasonGroup ? 'border-letusBlue bg-white shadow-sm' : 'border-gray-200 bg-gray-50/70'}`}>
                            <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800 text-sm p-3 hover:bg-gray-50 transition-colors">
                                <input type="checkbox" checked={updateTarget.incidentReasonGroup} onChange={e => setUpdateTarget({ ...updateTarget, incidentReasonGroup: e.target.checked })} className="w-4 h-4 accent-letusBlue" />
                                발생사유 변경
                            </label>
                            {updateTarget.incidentReasonGroup && (
                                <div className="px-4 pb-4 pt-1 animate-fade-in">
                                    <select value={incidentReason} onChange={e => setIncidentReason(e.target.value)} className={selectCls}>
                                        <option value="">선택 안함</option>
                                        {INCIDENT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* 조치여부(시공) */}
                        <div className={`border rounded-lg transition-all overflow-hidden ${updateTarget.constructionGroup ? 'border-orange-400 bg-white shadow-sm' : 'border-gray-200 bg-gray-50/70'}`}>
                            <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800 text-sm p-3 hover:bg-gray-50 transition-colors">
                                <input type="checkbox" checked={updateTarget.constructionGroup} onChange={e => setUpdateTarget({ ...updateTarget, constructionGroup: e.target.checked })} className="w-4 h-4 accent-orange-500" />
                                조치여부 (시공) 변경
                            </label>
                            {updateTarget.constructionGroup && (
                                <div className="px-4 pb-4 pt-1 animate-fade-in">
                                    <select value={constructionAction} onChange={e => setConstructionAction(e.target.value)} className={selectCls}>
                                        <option value="">선택 안함</option>
                                        {CONSTRUCTION_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* 조치여부(수신) */}
                        <div className={`border rounded-lg transition-all overflow-hidden ${updateTarget.receiveGroup ? 'border-green-500 bg-white shadow-sm' : 'border-gray-200 bg-gray-50/70'}`}>
                            <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800 text-sm p-3 hover:bg-gray-50 transition-colors">
                                <input type="checkbox" checked={updateTarget.receiveGroup} onChange={e => setUpdateTarget({ ...updateTarget, receiveGroup: e.target.checked })} className="w-4 h-4 accent-green-500" />
                                조치여부 (수신) 변경
                            </label>
                            {updateTarget.receiveGroup && (
                                <div className="px-4 pb-4 pt-1 animate-fade-in">
                                    <select value={receiveAction} onChange={e => setReceiveAction(e.target.value)} className={selectCls}>
                                        <option value="">선택 안함</option>
                                        {RECEIVE_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                    <p className="text-[10px] text-green-600 font-bold mt-1.5">* 수신 조치 선택 시 완결여부 자동 Y 처리됩니다.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 text-[11px] font-bold rounded hover:bg-gray-50">취소</button>
                    <button onClick={handleSave} disabled={isSaving || !isAnyChecked}
                        className="px-5 py-2 bg-letusBlue text-white text-[11px] font-bold rounded hover:bg-blue-600 flex items-center gap-1.5 disabled:opacity-50">
                        {isSaving ? '적용 중...' : '선택 대상 일괄 덮어쓰기'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 컬럼 정의 (체크박스 제외) ──────────────────────────────────────────────────
const DEFAULT_COLUMNS = [
    { label: '유형',      key: 'type',            w: 80  },
    { label: '발생일',    key: 'incident_date',   w: 100 },
    { label: '발생센터',  key: 'incident_center', w: 120 },
    { label: '브랜드',    key: 'brand',           w: 90  },
    { label: '품목코드',  key: 'item_code',       w: 140 },
    { label: '색상',      key: 'color',           w: 90  },
    { label: '수량',      key: 'quantity',        w: 80  },
    { label: '발생 사유', key: 'incident_reason', w: 150 },
    { label: '진행 단계', key: null,              w: 120 },
    { label: '완결',      key: 'is_completed',    w: 70  },
];

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
const ReturnsManagement = ({ userProfile }) => {
    const [items, setItems]                   = useState([]);
    const [isLoading, setIsLoading]           = useState(false);
    const [workplaceList, setWorkplaceList]   = useState([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [activeRow, setActiveRow]           = useState(null);
    const [selectedIds, setSelectedIds]       = useState(new Set());
    const [isActionMenuOpen, setIsActionMenuOpen]   = useState(false);
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
    const [sortConfig, setSortConfig]         = useState({ key: null, direction: 'none' });

    // ── 컬럼 순서/너비 상태 ──
    const [colOrder, setColOrder]     = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths]   = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef  = useRef(null);
    const dragSrcRef   = useRef(null);
    const wasDraggedRef = useRef(false);

    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const initialFilters = { startDate: firstOfMonth, endDate: today, center: '전체', reason: '전체', returnCenter: '전체', completed: '전체', type: '전체' };
    const [draftFilters, setDraftFilters]     = useState(initialFilters);
    const [appliedFilters, setAppliedFilters] = useState(initialFilters);
    const [searchTrigger, setSearchTrigger]   = useState(0);

    const isAdmin = userProfile?.role === '관리자';

    useEffect(() => { fetchWorkplaces(); }, []);
    useEffect(() => { fetchData(); }, [appliedFilters, searchTrigger]);

    // ── localStorage 불러오기 ──
    useEffect(() => {
        if (!userProfile?.id) return;
        try {
            const saved = JSON.parse(localStorage.getItem(`letus_returns_col_${userProfile.id}`));
            if (saved?.order?.length === DEFAULT_COLUMNS.length) setColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS.length) setColWidths(saved.widths);
        } catch {}
    }, [userProfile?.id]);

    // ── localStorage 저장 ──
    useEffect(() => {
        if (!userProfile?.id) return;
        localStorage.setItem(`letus_returns_col_${userProfile.id}`, JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths, userProfile?.id]);

    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS.map(c => c.w));
        if (userProfile?.id) localStorage.removeItem(`letus_returns_col_${userProfile.id}`);
    };

    // ── 컬럼 리사이즈 핸들러 ──
    const handleResizeStart = (e, visualIdx) => {
        e.preventDefault(); e.stopPropagation();
        const origIdx = colOrder[visualIdx];
        resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
        const onMove = (ev) => {
            const { origIdx: oi, startX, startW } = resizingRef.current;
            setColWidths(prev => { const n = [...prev]; n[oi] = Math.max(50, startW + (ev.clientX - startX)); return n; });
        };
        const onUp = () => { resizingRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    // ── 컬럼 드래그 핸들러 ──
    const handleDragStart = (e, visualIdx) => { dragSrcRef.current = visualIdx; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver  = (e, visualIdx) => { e.preventDefault(); setDragOverIdx(visualIdx); };
    const handleDrop = (e, visualIdx) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === visualIdx) return;
        wasDraggedRef.current = true;
        const newOrder = [...colOrder]; const [moved] = newOrder.splice(dragSrcRef.current, 1); newOrder.splice(visualIdx, 0, moved);
        setColOrder(newOrder); dragSrcRef.current = null;
    };
    const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

    // ── 셀 렌더러 (origIdx 기준) ──
    const renderCell = (origIdx, row) => {
        switch (origIdx) {
            case 0: // 유형
                return (
                    <td key={origIdx} className="p-4 text-center" style={{ width: colWidths[origIdx] }}>
                        {row.type === '선출고'
                            ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">선출고</span>
                            : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">회수품</span>}
                    </td>
                );
            case 1: // 발생일
                return <td key={origIdx} className="p-4 text-center text-gray-600" style={{ width: colWidths[origIdx] }}>{fmtDate(row.incident_date) || '-'}</td>;
            case 2: // 발생센터
                return <td key={origIdx} className="p-4 text-center font-semibold" style={{ width: colWidths[origIdx] }}>{row.incident_center || '-'}</td>;
            case 3: // 브랜드
                return <td key={origIdx} className="p-4 text-center text-gray-600" style={{ width: colWidths[origIdx] }}>{row.brand || '-'}</td>;
            case 4: // 품목코드
                return <td key={origIdx} className="p-4 text-center font-mono text-gray-500" style={{ width: colWidths[origIdx] }}>{row.item_code || '-'}</td>;
            case 5: // 색상
                return <td key={origIdx} className="p-4 text-center text-gray-600" style={{ width: colWidths[origIdx] }}>{row.color || '-'}</td>;
            case 6: // 수량
                return <td key={origIdx} className="p-4 text-center font-bold" style={{ width: colWidths[origIdx] }}>{row.quantity != null ? `${row.quantity} EA` : '-'}</td>;
            case 7: // 발생 사유
                return (
                    <td key={origIdx} className="p-4 text-center" style={{ width: colWidths[origIdx] }}>
                        {row.incident_reason
                            ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${REASON_COLORS[row.incident_reason] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>{row.incident_reason}</span>
                            : <span className="text-gray-300">-</span>}
                    </td>
                );
            case 8: // 진행 단계
                return <td key={origIdx} className="p-4 text-center" style={{ width: colWidths[origIdx] }}><StepIndicator row={row} /></td>;
            case 9: // 완결
                return (
                    <td key={origIdx} className="p-4 text-center" style={{ width: colWidths[origIdx] }}>
                        {row.type === '선출고'
                            ? (row.is_recovered
                                ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">회수</span>
                                : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">미회수</span>)
                            : (row.is_completed
                                ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">Y</span>
                                : <span className="text-gray-300 text-xs font-bold">N</span>)}
                    </td>
                );
            default:
                return <td key={origIdx} />;
        }
    };

    const handleSearchClick = () => { setAppliedFilters({ ...draftFilters }); setSearchTrigger(t => t + 1); setSelectedIds(new Set()); };

    const fetchWorkplaces = async () => {
        const { data } = await supabase.from('workers').select('workplace').not('workplace', 'is', null);
        if (data) setWorkplaceList([...new Set(data.map(w => w.workplace).filter(Boolean))].sort());
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            let q = supabase.from('logistics_returns').select('*').order('created_at', { ascending: false });
            if (appliedFilters.startDate)              q = q.gte('incident_date', appliedFilters.startDate);
            if (appliedFilters.endDate)                q = q.lte('incident_date', appliedFilters.endDate);
            if (appliedFilters.center !== '전체')       q = q.eq('incident_center', appliedFilters.center);
            if (appliedFilters.reason !== '전체')       q = q.eq('incident_reason', appliedFilters.reason);
            if (appliedFilters.returnCenter !== '전체') q = q.eq('return_center', appliedFilters.returnCenter);
            if (appliedFilters.completed === 'Y')      q = q.eq('is_completed', true);
            if (appliedFilters.completed === 'N')      q = q.eq('is_completed', false);
            if (appliedFilters.type === '회수품')        q = q.or('type.eq.회수품,type.is.null');
            else if (appliedFilters.type !== '전체')    q = q.eq('type', appliedFilters.type);
            const { data, error } = await q;
            if (error) throw error;
            setItems(data || []);
        } catch (e) { console.error(e); }
        finally { setIsLoading(false); }
    };

    // ── 정렬 ──
    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key) {
            if (sortConfig.direction === 'asc') direction = 'desc';
            else if (sortConfig.direction === 'desc') direction = 'none';
        }
        setSortConfig({ key: direction === 'none' ? null : key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc'
            ? <span className="ml-1 text-letusBlue">↑</span>
            : <span className="ml-1 text-letusBlue">↓</span>;
    };

    const sortedItems = useMemo(() => {
        const sortable = [...items];
        if (sortConfig.key && sortConfig.direction !== 'none') {
            sortable.sort((a, b) => {
                const aVal = a[sortConfig.key] ?? '';
                const bVal = b[sortConfig.key] ?? '';
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortable;
    }, [items, sortConfig]);

    // ── 삭제 ──
    const handleDeleteSelected = async () => {
        if (!isAdmin) return alert('삭제 권한이 없습니다. 관리자에게 문의하세요.');
        if (selectedIds.size === 0) return alert('삭제할 항목을 체크해 주세요.');
        if (!window.confirm(`선택하신 ${selectedIds.size}건의 데이터를 삭제하시겠습니까?\n이 작업은 복구할 수 없습니다.`)) return;
        try {
            const ids = Array.from(selectedIds);
            const CHUNK = 200;
            for (let i = 0; i < ids.length; i += CHUNK) {
                const chunk = ids.slice(i, i + CHUNK);
                const { error } = await supabase.from('logistics_returns').delete().in('id', chunk);
                if (error) throw error;
            }
            alert(`${ids.length}건이 삭제되었습니다.`);
            setSelectedIds(new Set());
            fetchData();
        } catch (e) { alert('삭제 중 오류: ' + e.message); }
    };

    // ── 엑셀 추출 ──
    const handleExportExcel = async () => {
        if (selectedIds.size === 0) return alert('다운로드할 항목을 선택해 주세요.');
        const XLSX = await loadXLSXStyle();
        const ids = Array.from(selectedIds);
        const targetItems = sortedItems.filter(item => ids.includes(item.id));
        const headersMap = {
            incident_date: '발생일', incident_center: '발생센터', writer: '작성자',
            brand: '브랜드', item_code: '품목코드', color: '색상', quantity: '수량',
            incident_reason: '발생사유', construction_handler: '확인 담당자', construction_action: '조치여부(시공)',
            return_center: '반납센터', return_date: '반납일자', return_handler: '반납 담당자',
            receive_center: '수신센터', receiver: '수신자', receive_action: '조치여부(수신)',
            is_completed: '완결여부', created_at: '등록일시',
        };
        const excelData = targetItems.map(row => {
            const r = {};
            Object.keys(headersMap).forEach(key => {
                r[headersMap[key]] = key === 'is_completed' ? (row[key] ? 'Y' : 'N') : (row[key] ?? '');
            });
            return r;
        });
        const ws = XLSX.utils.json_to_sheet(excelData);
        ws['!cols'] = Object.keys(headersMap).map(() => ({ wch: 15 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '회수품_데이터');
        XLSX.writeFile(wb, `회수품_데이터_${today}.xlsx`);
    };

    const filterSel = 'border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700 bg-white';

    const selectedArr = Array.from(selectedIds);

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* ── 필터 ── */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 z-30 shrink-0">
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 whitespace-nowrap">기간</label>
                        <DateRangeInput
                            startDate={draftFilters.startDate}
                            endDate={draftFilters.endDate}
                            onChange={(s, e) => setDraftFilters(p => ({ ...p, startDate: s, endDate: e }))}
                        />
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
                        <label className="text-[11px] font-bold text-gray-600">반납센터</label>
                        <select value={draftFilters.returnCenter} onChange={e => setDraftFilters(p => ({ ...p, returnCenter: e.target.value }))} className={filterSel}>
                            <option value="전체">전체</option>
                            {RETURN_CENTER_LIST.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[11px] font-bold text-gray-600">유형</label>
                        <select value={draftFilters.type} onChange={e => setDraftFilters(p => ({ ...p, type: e.target.value }))} className={filterSel}>
                            <option value="전체">전체</option>
                            <option value="회수품">회수품</option>
                            <option value="선출고">선출고</option>
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
                        <SearchButton onClick={handleSearchClick} />
                    </div>
                </div>
            </div>

            {/* ── 선택실행 드롭박스 ── */}
            <div className="flex justify-end w-full px-2 z-30 -mt-1 mb-1 shrink-0 gap-2">
                <button onClick={resetColSettings}
                    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    title="컬럼 너비·순서를 기본값으로 초기화">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    칼럼 초기화
                </button>
                <div className="relative z-50">
                    <button
                        onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                        className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[90px] h-[32px]"
                    >
                        선택실행 {selectedIds.size > 0 && `(${selectedIds.size})`}
                        <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {isActionMenuOpen && (
                        <>
                            <div className="fixed inset-0" onClick={() => setIsActionMenuOpen(false)} />
                            <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5">

                                <button
                                    onClick={() => { setIsActionMenuOpen(false); if (selectedIds.size === 0) return alert('항목을 체크해 주세요.'); setIsBulkEditModalOpen(true); }}
                                    className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors ${selectedIds.size > 0 ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
                                >
                                    일괄 변경
                                </button>

                                <div className="h-px bg-gray-100 my-1" />

                                <button
                                    onClick={() => { setIsActionMenuOpen(false); handleExportExcel(); }}
                                    className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors flex items-center justify-between ${selectedIds.size > 0 ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 cursor-not-allowed'}`}
                                >
                                    엑셀 추출
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                </button>

                                {isAdmin && (
                                    <>
                                        <div className="h-px bg-gray-100 my-1" />
                                        <button
                                            onClick={() => { setIsActionMenuOpen(false); handleDeleteSelected(); }}
                                            className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex justify-between items-center ${selectedIds.size > 0 ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}
                                        >
                                            삭제
                                            {selectedIds.size > 0 && <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── 테이블 ── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left whitespace-nowrap text-[13px] table-fixed">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                {/* 체크박스 고정 컬럼 */}
                                <th className="p-4 text-center select-none" style={{ width: 50 }}>
                                    <input type="checkbox"
                                        checked={sortedItems.length > 0 && selectedIds.size === sortedItems.length}
                                        onChange={e => setSelectedIds(e.target.checked ? new Set(sortedItems.map(r => r.id)) : new Set())}
                                        className="w-4 h-4 cursor-pointer accent-letusBlue"
                                    />
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
                                            <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                                onMouseDown={(e) => handleResizeStart(e, visualIdx)} onClick={e => e.stopPropagation()} />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                            {isLoading ? (
                                <tr><td colSpan={colOrder.length + 1} className="py-32 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin" />
                                        <p className="text-gray-500 font-bold">데이터 로딩 중...</p>
                                    </div>
                                </td></tr>
                            ) : sortedItems.length === 0 ? (
                                <tr><td colSpan={colOrder.length + 1} className="p-20 text-center text-gray-400 font-bold">조회 결과가 없습니다.</td></tr>
                            ) : sortedItems.map(row => (
                                <tr key={row.id}
                                    onClick={() => setActiveRow(row)}
                                    className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.has(row.id) ? 'bg-blue-50/50' : ''} ${row.is_completed ? 'opacity-60' : ''}`}>
                                    <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
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
                                    {colOrder.map(origIdx => renderCell(origIdx, row))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── 상세 모달 ── */}
            {activeRow && activeRow.type === '선출고' && (
                <PreDeliveryDetailModal
                    row={activeRow}
                    onClose={() => setActiveRow(null)}
                    onSaved={fetchData}
                    workplaceList={workplaceList}
                    userProfile={userProfile}
                />
            )}
            {activeRow && activeRow.type !== '선출고' && (
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

            {/* ── 일괄 변경 모달 ── */}
            {isBulkEditModalOpen && (
                <ReturnsBulkEditModal
                    selectedIds={selectedArr}
                    onClose={() => { setIsBulkEditModalOpen(false); setSelectedIds(new Set()); }}
                    onReload={fetchData}
                />
            )}
        </div>
    );
};

export { ReturnsManagement };
