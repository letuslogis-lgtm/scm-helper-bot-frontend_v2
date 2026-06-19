import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../supabaseClient.js';

// ── 상수
const CENTER_ORDER = ['양지1','양지2','양지3','안성','평택','음성','대전','대구','부산','광주','전북','전남','울산','창원','기장','제주','이케아'];
const sortCenters = arr => [...arr].sort((a, b) => {
    const ia = CENTER_ORDER.indexOf(a); const ib = CENTER_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1; if (ib === -1) return -1;
    return ia - ib;
});

const FAULT_TYPES = ['배터리 불량','유압 이상','조향 불량','브레이크 불량','포크/마스트 이상','타이어 손상','전기 계통','기타'];

// ── 유틸
const fmtDate = iso => {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
};

const diffDays = (from, to) => {
    if (!from || !to) return null;
    const a = new Date(from); const b = new Date(to);
    const diff = Math.round((b - a) / 86400000);
    return isNaN(diff) ? null : diff;
};

const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const isSameMonth = (iso, year, month) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === year && d.getMonth() === month;
};

const fmtMoney = v => (v == null ? '-' : `${Number(v).toLocaleString()}원`);

// ── 장비 드롭다운 검색
const ForkliftPicker = ({ forklifts, value, onChange }) => {
    const [query, setQuery] = useState('');
    const [open,  setOpen]  = useState(false);
    const ref = useRef(null);

    const selected = forklifts.find(f => f.id === value);

    useEffect(() => {
        const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = useMemo(() => {
        if (!query.trim()) return forklifts;
        const q = query.toLowerCase();
        return forklifts.filter(f =>
            f.no?.toLowerCase().includes(q) ||
            f.center?.toLowerCase().includes(q) ||
            f.manager_org?.toLowerCase().includes(q)
        );
    }, [forklifts, query]);

    return (
        <div ref={ref} className="relative">
            {selected ? (
                <div className="flex items-center justify-between px-3 py-2 border border-letusBlue rounded-lg bg-blue-50">
                    <div className="text-sm">
                        <span className="font-bold text-letusBlue">{selected.no}</span>
                        <span className="text-gray-500 ml-2 text-xs">{selected.center} · {selected.manager_org}</span>
                    </div>
                    <button onClick={() => { onChange(''); setQuery(''); }} className="text-gray-400 hover:text-gray-600 ml-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            ) : (
                <input value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    placeholder="장비번호 · 센터 · 관리주체로 검색"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
            )}
            {open && !selected && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                    {filtered.length === 0
                        ? <div className="px-3 py-3 text-xs text-gray-400 text-center">검색 결과가 없습니다</div>
                        : filtered.map(f => (
                            <button key={f.id} onClick={() => { onChange(f.id); setQuery(''); setOpen(false); }}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0">
                                <span className="text-sm font-bold text-letusBlue">{f.no}</span>
                                <span className="text-xs text-gray-500 ml-2">{f.center} · {f.manager_org}</span>
                            </button>
                        ))
                    }
                </div>
            )}
        </div>
    );
};

// ── 요약 카드
const useCountUp = (target) => {
    const [display, setDisplay] = React.useState(0);
    React.useEffect(() => {
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

const SummaryCard = ({ label, value, unit = '건', labelClass = 'text-gray-500', valueClass = 'text-gray-800', borderClass = 'border-b-gray-300', onClick, active }) => {
    const display = useCountUp(typeof value === 'number' ? value : 0);
    const formatted = unit === '원' ? display.toLocaleString() : display;
    return (
        <div onClick={onClick}
            className={`bg-white rounded-xl border p-4 flex flex-col justify-center transition-all border-b-4 ${borderClass} ${onClick ? 'cursor-pointer' : ''} ${active ? 'shadow-lg -translate-y-0.5' : 'shadow-sm border-slate-200 hover:shadow-md'}`}>
            <span className={`text-xs font-bold mb-1 ${labelClass}`}>{label}</span>
            <span className={`text-2xl font-black ${valueClass}`}>
                {formatted}
                <span className="text-sm font-bold opacity-30 ml-0.5">{unit}</span>
            </span>
        </div>
    );
};

const LabeledSelect = ({ label, options, value, onChange }) => (
    <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-gray-600 whitespace-nowrap">{label}</span>
        <select value={value} onChange={e => onChange(e.target.value)}
            className="text-[11px] font-bold text-gray-700 border border-gray-200 rounded-[3px] px-2.5 h-[30px] bg-white focus:outline-none focus:border-letusBlue min-w-[80px] cursor-pointer">
            {options.map(o => <option key={o}>{o}</option>)}
        </select>
    </div>
);

const CheckboxDropdown = ({ label, options, selected, onChange }) => {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);
    const allSelected = selected.length === 0;
    React.useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    const toggle = (opt) => {
        if (selected.includes(opt)) onChange(selected.filter(x => x !== opt));
        else onChange([...selected, opt]);
    };
    const displayLabel = allSelected ? '전체' : selected.length === 1 ? selected[0] : `${selected.length}개 선택`;
    return (
        <div className="relative flex items-center gap-2" ref={ref}>
            <span className="text-[11px] font-bold text-gray-600 whitespace-nowrap">{label}</span>
            <button onClick={() => setOpen(v => !v)}
                className={`flex items-center gap-1 text-[11px] font-bold border rounded-[3px] px-2.5 h-[30px] min-w-[80px] bg-white hover:border-letusBlue transition-colors ${open ? 'border-letusBlue text-letusBlue' : 'border-gray-200 text-gray-700'}`}>
                <span className="flex-1 text-left">{displayLabel}</span>
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-[3px] shadow-lg z-50 min-w-[130px] py-1">
                    <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={allSelected} onChange={() => onChange([])} className="w-3.5 h-3.5 accent-letusBlue" />
                        <span className="text-xs font-bold text-gray-700">전체</span>
                    </label>
                    <div className="border-t border-gray-100 my-0.5" />
                    {options.map(opt => (
                        <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="w-3.5 h-3.5 accent-letusBlue" />
                            <span className="text-xs text-gray-700">{opt}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

const MonthPicker = ({ year, month, onChange, maxYear, maxMonth }) => {
    const [open, setOpen] = React.useState(false);
    const [pickerYear, setPickerYear] = React.useState(year);
    const ref = React.useRef(null);
    React.useEffect(() => {
        const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    React.useEffect(() => { if (!open) setPickerYear(year); }, [open, year]);
    const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    return (
        <div ref={ref} className="relative">
            <button onClick={() => setOpen(v => !v)}
                className={`flex items-center gap-2 h-[30px] px-3 border rounded-[3px] text-[11px] font-bold transition-colors bg-white hover:border-letusBlue min-w-[110px] ${open ? 'border-letusBlue text-letusBlue' : 'border-gray-200 text-gray-700'}`}>
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {year}년 {month + 1}월
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 w-[190px] overflow-hidden">
                    <div className="flex items-center justify-between bg-orange-500 px-3 py-2.5">
                        <button onClick={() => setPickerYear(y => y - 1)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-orange-400 text-white">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                        </button>
                        <span className="text-[13px] font-bold text-white">{pickerYear}년</span>
                        <button onClick={() => setPickerYear(y => y + 1)} disabled={pickerYear >= maxYear}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-orange-400 text-white disabled:opacity-40 disabled:cursor-not-allowed">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                        </button>
                    </div>
                    <div className="p-3">
                        <div className="grid grid-cols-3 gap-1">
                            {MONTHS.map((label, idx) => {
                                const disabled = pickerYear === maxYear && idx > maxMonth;
                                const selected = pickerYear === year && idx === month;
                                return (
                                    <button key={idx} onClick={() => { if (disabled) return; onChange(pickerYear, idx); setOpen(false); }} disabled={disabled}
                                        className={`py-1.5 rounded-[3px] text-[11px] font-bold transition-colors ${selected ? 'bg-orange-500 text-white' : disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-orange-50 hover:text-orange-500'}`}>
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── 비용 입력/수정 모달
const CostModal = ({ repair, forklift, onSave, onClose }) => {
    const [costFree,  setCostFree]  = useState(repair.cost_free === true);
    const [partsCost, setPartsCost] = useState(repair.parts_cost != null ? String(repair.parts_cost) : '');
    const [laborCost, setLaborCost] = useState(repair.labor_cost != null ? String(repair.labor_cost) : '');

    const total = (Number(partsCost) || 0) + (Number(laborCost) || 0);

    const handleSave = () => {
        if (costFree) {
            onSave({ cost_free: true, parts_cost: null, labor_cost: null });
        } else {
            onSave({ cost_free: false, parts_cost: partsCost !== '' ? Number(partsCost) : null, labor_cost: laborCost !== '' ? Number(laborCost) : null });
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                    <div>
                        <span className="font-black text-gray-800">비용 입력</span>
                        <span className="text-xs text-gray-400 ml-2">{forklift?.no} · {forklift?.center} · {repair.fault_type || '-'}</span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="px-6 py-4 space-y-4">
                    {/* 비용없음 토글 */}
                    <label className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all select-none"
                        style={{ borderColor: costFree ? '#22c55e' : '#e5e7eb', background: costFree ? '#f0fdf4' : '#f9fafb' }}>
                        <input type="checkbox" checked={costFree} onChange={e => setCostFree(e.target.checked)}
                            className="w-4 h-4 accent-green-500 cursor-pointer" />
                        <div>
                            <span className="text-sm font-black text-gray-800">비용없음 (무상)</span>
                            <span className="text-xs text-gray-400 ml-2">렌탈 무상수리 등 실비용이 없는 경우</span>
                        </div>
                    </label>

                    {/* 비용 입력 (비용없음 아닐 때만) */}
                    {!costFree && (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5">부품비 (원)</label>
                                <input type="number" value={partsCost} onChange={e => setPartsCost(e.target.value)}
                                    placeholder="0"
                                    className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5">공임 (원)</label>
                                <input type="number" value={laborCost} onChange={e => setLaborCost(e.target.value)}
                                    placeholder="0"
                                    className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                            </div>
                            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-500">합계</span>
                                <span className="text-lg font-black text-letusBlue">{total.toLocaleString()}원</span>
                            </div>
                        </>
                    )}
                </div>
                <div className="flex gap-2 px-6 pb-5 pt-1">
                    <button onClick={onClose}
                        className="flex-1 py-2.5 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                        취소
                    </button>
                    <button onClick={handleSave}
                        className="flex-1 py-2.5 text-sm font-bold text-white bg-letusBlue hover:opacity-90 rounded-xl transition-opacity">
                        저장
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 직접 등록 모달
const ManualAddModal = ({ forklifts, onSave, onClose }) => {
    const [forkliftId,   setForkliftId]   = useState('');
    const [faultType,    setFaultType]    = useState('');
    const [faultDesc,    setFaultDesc]    = useState('');
    const [repairDesc,   setRepairDesc]   = useState('');
    const [repairVendor, setRepairVendor] = useState('');
    const [reportedAt,   setReportedAt]   = useState('');
    const [completedAt,  setCompletedAt]  = useState(todayStr());
    const [partsCost,    setPartsCost]    = useState('');
    const [laborCost,    setLaborCost]    = useState('');

    const canSave = forkliftId && completedAt;

    const handleSave = () => {
        if (!canSave) return;
        onSave({
            forklift_id:   forkliftId,
            fault_type:    faultType,
            fault_desc:    faultDesc,
            repair_desc:   repairDesc,
            repair_vendor: repairVendor,
            reported_at:   reportedAt || null,
            completed_at:  completedAt,
            parts_cost:    partsCost !== '' ? Number(partsCost) : null,
            labor_cost:    laborCost !== '' ? Number(laborCost) : null,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[480px] overflow-hidden flex flex-col slide-up">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center">
                        <span className="w-1.5 h-3.5 bg-letusOrange rounded-full mr-2"></span>
                        정비이력 직접 등록
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 bg-slate-50 flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-700">장비 선택 <span className="text-red-500">*</span></label>
                        <ForkliftPicker forklifts={forklifts} value={forkliftId} onChange={setForkliftId} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-700">고장유형</label>
                        <div className="flex flex-wrap gap-2">
                            {FAULT_TYPES.map(t => (
                                <button key={t} onClick={() => setFaultType(t === faultType ? '' : t)}
                                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                                        faultType === t
                                            ? 'border-letusBlue bg-blue-50 text-letusBlue font-bold'
                                            : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                                    }`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-700">고장내용</label>
                        <textarea value={faultDesc} onChange={e => setFaultDesc(e.target.value)}
                            rows={2} placeholder="고장 증상 입력"
                            className="w-full text-xs border border-gray-300 rounded-[4px] px-3.5 py-2 focus:outline-none focus:border-letusBlue transition-all bg-white resize-none" />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-700">정비업체</label>
                        <input value={repairVendor} onChange={e => setRepairVendor(e.target.value)}
                            placeholder="업체명 입력"
                            className="w-full text-xs border border-gray-300 rounded-[4px] px-3.5 py-2 focus:outline-none focus:border-letusBlue transition-all bg-white" />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-700">정비내용</label>
                        <textarea value={repairDesc} onChange={e => setRepairDesc(e.target.value)}
                            rows={2} placeholder="수행한 정비 내용 입력"
                            className="w-full text-xs border border-gray-300 rounded-[4px] px-3.5 py-2 focus:outline-none focus:border-letusBlue transition-all bg-white resize-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-700">신고일 <span className="text-[11px] font-normal text-gray-400">(선택)</span></label>
                            <input type="date" value={reportedAt} onChange={e => setReportedAt(e.target.value)}
                                className="w-full text-xs border border-gray-300 rounded-[4px] px-3.5 py-2 focus:outline-none focus:border-letusBlue transition-all bg-white" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-700">완료일 <span className="text-red-500">*</span></label>
                            <input type="date" value={completedAt} onChange={e => setCompletedAt(e.target.value)}
                                className="w-full text-xs border border-gray-300 rounded-[4px] px-3.5 py-2 focus:outline-none focus:border-letusBlue transition-all bg-white" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-700">부품비 <span className="text-[11px] font-normal text-gray-400">(원, 선택)</span></label>
                            <input type="number" value={partsCost} onChange={e => setPartsCost(e.target.value)}
                                placeholder="0"
                                className="w-full text-xs border border-gray-300 rounded-[4px] px-3.5 py-2 focus:outline-none focus:border-letusBlue transition-all bg-white" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-700">공임 <span className="text-[11px] font-normal text-gray-400">(원, 선택)</span></label>
                            <input type="number" value={laborCost} onChange={e => setLaborCost(e.target.value)}
                                placeholder="0"
                                className="w-full text-xs border border-gray-300 rounded-[4px] px-3.5 py-2 focus:outline-none focus:border-letusBlue transition-all bg-white" />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-2 items-center shrink-0">
                    <button onClick={onClose}
                        className="px-5 py-[9px] border border-gray-300 text-gray-600 text-[11px] font-bold rounded-[3px] hover:bg-gray-50 transition-colors">
                        취소
                    </button>
                    <button onClick={handleSave} disabled={!canSave}
                        className={`px-5 py-[9px] text-white text-[11px] font-bold rounded-[3px] transition-colors ${
                            canSave ? 'bg-letusBlue hover:bg-blue-600' : 'bg-gray-300 cursor-not-allowed'
                        }`}>
                        등록하기
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 탭1: 이력 목록
const DEFAULT_COLUMNS_REPAIR = [
    { label: '출처',     key: null,             w: 70  },
    { label: '장비번호', key: 'no',             w: 110 },
    { label: '센터',     key: 'center',         w: 80  },
    { label: '관리주체', key: 'manager_org',    w: 90  },
    { label: '소유',     key: 'own_type',       w: 60  },
    { label: '고장유형', key: 'fault_type',     w: 90  },
    { label: '정비업체', key: 'repair_vendor',  w: 90  },
    { label: '신고일',   key: 'reported_at',    w: 90  },
    { label: '완료일',   key: 'completed_at',   w: 90  },
    { label: '소요일수', key: 'days',           w: 70  },
    { label: '부품비',   key: 'parts_cost',     w: 80  },
    { label: '공임',     key: 'labor_cost',     w: 80  },
    { label: '합계',     key: 'total_cost',     w: 90  },
    { label: '액션',     key: null,             w: 120 },
];

const Tab1 = ({ repairs, forklifts, forkliftMap, onCostSave, onDelete, onAddManual, userProfile, activeCard, selYear, selMonth, filterOrg, filterCenter, filterNo, filterNoCost, resetColsRef }) => {
    const [costTarget,   setCostTarget]   = useState(null);

    const [sortConfig,   setSortConfig]   = useState({ key: 'completed_at', dir: 'desc' });
    const [colOrder,     setColOrder]     = useState(DEFAULT_COLUMNS_REPAIR.map((_, i) => i));
    const [colWidths,    setColWidths]    = useState(DEFAULT_COLUMNS_REPAIR.map(c => c.w));
    const [dragOverIdx,  setDragOverIdx]  = useState(null);
    const resizingRef   = useRef(null);
    const dragSrcRef    = useRef(null);
    const wasDraggedRef = useRef(false);

    const filtered = useMemo(() => {
        const noQ = filterNo.trim().toLowerCase();
        let result = repairs.filter(r => {
            if (!isSameMonth(r.completed_at, selYear, selMonth)) return false;
            const f = forkliftMap[r.forklift_id];
            if (filterCenter !== '전체' && f?.center !== filterCenter) return false;
            if (filterOrg    !== '전체' && f?.manager_org !== filterOrg) return false;
            if (filterNoCost && !(r.parts_cost == null && r.labor_cost == null && !r.cost_free)) return false;
            if (noQ && !(f?.no?.toLowerCase().includes(noQ))) return false;
            return true;
        });
        const { key, dir } = sortConfig;
        if (key) {
            result = [...result].sort((a, b) => {
                let av, bv;
                const fa = forkliftMap[a.forklift_id];
                const fb = forkliftMap[b.forklift_id];
                if (key === 'no')               { av = fa?.no ?? ''; bv = fb?.no ?? ''; }
                else if (key === 'center')      { av = fa?.center ?? ''; bv = fb?.center ?? ''; }
                else if (key === 'manager_org') { av = fa?.manager_org ?? ''; bv = fb?.manager_org ?? ''; }
                else if (key === 'own_type')    { av = fa?.own_type ?? ''; bv = fb?.own_type ?? ''; }
                else if (key === 'fault_type')  { av = a.fault_type ?? ''; bv = b.fault_type ?? ''; }
                else if (key === 'repair_vendor') { av = a.repair_vendor ?? ''; bv = b.repair_vendor ?? ''; }
                else if (key === 'reported_at')   { av = a.reported_at ?? ''; bv = b.reported_at ?? ''; }
                else if (key === 'completed_at')  { av = a.completed_at ?? ''; bv = b.completed_at ?? ''; }
                else if (key === 'days') {
                    const calcDays = (s, e) => s && e ? Math.floor((new Date(e)-new Date(s))/(1000*60*60*24)) : -1;
                    av = calcDays(a.reported_at, a.completed_at);
                    bv = calcDays(b.reported_at, b.completed_at);
                }
                else if (key === 'parts_cost')  { av = a.parts_cost ?? -1; bv = b.parts_cost ?? -1; }
                else if (key === 'labor_cost')  { av = a.labor_cost ?? -1; bv = b.labor_cost ?? -1; }
                else if (key === 'total_cost')  { av = (a.parts_cost||0)+(a.labor_cost||0); bv = (b.parts_cost||0)+(b.labor_cost||0); }
                else { av = ''; bv = ''; }
                if (av < bv) return dir === 'asc' ? -1 : 1;
                if (av > bv) return dir === 'asc' ?  1 : -1;
                return 0;
            });
        }
        return result;
    }, [repairs, forkliftMap, filterCenter, filterOrg, filterNoCost, filterNo, selYear, selMonth, sortConfig]);

    useEffect(() => {
        if (!userProfile?.id) return;
        try {
            const saved = JSON.parse(localStorage.getItem(`letus_repair_col_${userProfile.id}`));
            if (saved?.order?.length === DEFAULT_COLUMNS_REPAIR.length) setColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS_REPAIR.length) setColWidths(saved.widths);
        } catch {}
    }, [userProfile?.id]);

    useEffect(() => {
        if (!userProfile?.id) return;
        localStorage.setItem(`letus_repair_col_${userProfile.id}`, JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths, userProfile?.id]);

    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS_REPAIR.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS_REPAIR.map(c => c.w));
        if (userProfile?.id) localStorage.removeItem(`letus_repair_col_${userProfile.id}`);
    };
    useEffect(() => { if (resetColsRef) resetColsRef.current = resetColSettings; });

    const requestSort = (key) => {
        setSortConfig(prev => prev.key === key && prev.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return <span className="text-letusBlue font-black text-[10px] ml-0.5">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>;
    };

    const handleResizeStart = (e, visualIdx) => {
        e.preventDefault(); e.stopPropagation();
        const origIdx = colOrder[visualIdx];
        resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const onMove = (ev) => {
            if (!resizingRef.current) return;
            const { origIdx, startX, startW } = resizingRef.current;
            setColWidths(prev => { const n = [...prev]; n[origIdx] = Math.max(50, startW + (ev.clientX - startX)); return n; });
        };
        const onUp = () => { resizingRef.current = null; el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
    };
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

    const handleCostSave = useCallback((data) => {
        onCostSave(costTarget.id, data);
        setCostTarget(null);
    }, [costTarget, onCostSave]);

    const renderCell = (origIdx, r) => {
        const f = forkliftMap[r.forklift_id];
        const days = diffDays(r.reported_at, r.completed_at);
        const isPending = r.parts_cost == null && r.labor_cost == null && !r.cost_free;
        const total = (r.parts_cost || 0) + (r.labor_cost || 0);

        switch (origIdx) {
            case 0: // 출처 배지
                return (
                    <td key={origIdx} className="px-3 py-2">
                        {r.source === 'issue'
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">이슈</span>
                            : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">직접</span>
                        }
                    </td>
                );
            case 1: // 장비번호
                return <td key={origIdx} className="p-4 font-bold text-letusBlue whitespace-nowrap">{f?.no || '-'}</td>;
            case 2: // 센터
                return <td key={origIdx} className="p-4 text-gray-600 whitespace-nowrap">{f?.center || '-'}</td>;
            case 3: // 관리주체
                return <td key={origIdx} className="p-4 text-gray-600 whitespace-nowrap">{f?.manager_org || '-'}</td>;
            case 4: // 소유
                return (
                    <td key={origIdx} className="p-4 whitespace-nowrap">
                        {f?.own_type ? <span className={`text-xs font-bold ${f.own_type === '자가' ? 'text-orange-500' : 'text-blue-400'}`}>{f.own_type}</span> : '-'}
                    </td>
                );
            case 5: // 고장유형
                return <td key={origIdx} className="p-4 text-gray-600 whitespace-nowrap">{r.fault_type || '-'}</td>;
            case 6: // 정비업체
                return <td key={origIdx} className="p-4 text-gray-600 whitespace-nowrap">{r.repair_vendor || '-'}</td>;
            case 7: // 신고일
                return <td key={origIdx} className="p-4 text-gray-500 whitespace-nowrap">{fmtDate(r.reported_at)}</td>;
            case 8: // 완료일
                return <td key={origIdx} className="p-4 text-gray-500 whitespace-nowrap">{fmtDate(r.completed_at)}</td>;
            case 9: // 소요일수
                return <td key={origIdx} className="p-4 text-center text-gray-500">{days != null ? `${days}일` : '-'}</td>;
            case 10: // 부품비
                return (
                    <td key={origIdx} className="p-4 text-right text-gray-600">
                        {r.cost_free ? <span className="text-green-600 font-bold text-xs">무상</span> : r.parts_cost != null ? r.parts_cost.toLocaleString() : '-'}
                    </td>
                );
            case 11: // 공임
                return (
                    <td key={origIdx} className="p-4 text-right text-gray-600">
                        {r.cost_free ? <span className="text-green-600 font-bold text-xs">무상</span> : r.labor_cost != null ? r.labor_cost.toLocaleString() : '-'}
                    </td>
                );
            case 12: // 합계
                return (
                    <td key={origIdx} className="p-4 text-right font-bold text-gray-700">
                        {r.cost_free ? <span className="text-green-600 text-xs">비용없음</span> : isPending ? '-' : total.toLocaleString()}
                    </td>
                );
            case 13: // 액션
                return (
                    <td key={origIdx} className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                            {isPending ? (
                                <button onClick={() => setCostTarget(r)}
                                    className="bg-orange-500 text-white rounded-lg px-3 py-1 text-xs font-bold whitespace-nowrap">
                                    비용 입력
                                </button>
                            ) : (
                                <button onClick={() => setCostTarget(r)}
                                    className="bg-gray-100 text-gray-600 border border-gray-200 rounded-lg px-3 py-1 text-xs font-bold whitespace-nowrap hover:bg-gray-200">
                                    수정
                                </button>
                            )}
                            {r.source === 'manual' && (
                                <button onClick={() => onDelete(r.id)}
                                    className="text-red-400 hover:text-red-600 p-1 ml-0.5" title="삭제">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </td>
                );
            default: return null;
        }
    };

    return (
        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
            {/* 테이블 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left whitespace-nowrap table-fixed text-[13px]">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                {colOrder.map((origIdx, visualIdx) => {
                                    const col = DEFAULT_COLUMNS_REPAIR[origIdx];
                                    return (
                                        <th key={origIdx}
                                            className={`relative p-4 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                                            style={{ width: colWidths[origIdx] }}
                                            draggable
                                            onClick={() => !wasDraggedRef.current && col.key && requestSort(col.key)}
                                            onDragStart={e => handleDragStart(e, visualIdx)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={e => handleDragOver(e, visualIdx)}
                                            onDrop={e => handleDrop(e, visualIdx)}
                                            onDragLeave={() => setDragOverIdx(null)}
                                        >
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
                        <tbody className="divide-y divide-gray-50">
                            {filtered.length === 0 && (
                                <tr><td colSpan={colOrder.length} className="text-center py-12 text-gray-400">
                                    {repairs.length === 0 ? '정비이력이 없습니다.' : '조건에 맞는 이력이 없습니다.'}
                                </td></tr>
                            )}
                            {filtered.map(r => (
                                <tr key={r.id} className="hover:bg-blue-50/20 transition-colors">
                                    {colOrder.map(origIdx => renderCell(origIdx, r))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 비용 입력/수정 모달 */}
            {costTarget && (
                <CostModal
                    repair={costTarget}
                    forklift={forkliftMap[costTarget.forklift_id]}
                    onSave={handleCostSave}
                    onClose={() => setCostTarget(null)}
                />
            )}
        </div>
    );
};

// ── 공통 소계 테이블
const SubtotalTable = ({ title, rows, colLabel }) => (
    <div>
        <h3 className="text-sm font-black text-gray-700 mb-2">{title}</h3>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-[13px] text-left table-fixed">
                <colgroup>
                    <col style={{ width: '25%' }} />{/* 센터/관리주체 */}
                    <col style={{ width: '15%' }} />{/* 건수 */}
                    <col style={{ width: '20%' }} />{/* 부품비 */}
                    <col style={{ width: '20%' }} />{/* 공임 */}
                    <col style={{ width: '20%' }} />{/* 합계 */}
                </colgroup>
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs font-bold uppercase">
                    <tr>
                        <th className="px-3 py-2.5">{colLabel}</th>
                        <th className="px-3 py-2.5 text-right">건수</th>
                        <th className="px-3 py-2.5 text-right">부품비</th>
                        <th className="px-3 py-2.5 text-right">공임</th>
                        <th className="px-3 py-2.5 text-right">합계</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {rows.map((row, i) => {
                        const isTotal = row.isTotal;
                        return (
                            <tr key={i} className={isTotal ? 'bg-gray-50 font-bold' : 'hover:bg-blue-50/20'}>
                                <td className={`px-3 py-2 ${isTotal ? 'text-gray-800 font-black' : 'text-gray-700'}`}>{row.label}</td>
                                <td className="p-4 text-right text-gray-700">{row.count}</td>
                                <td className="p-4 text-right text-gray-700">{row.parts > 0 ? row.parts.toLocaleString() : '-'}</td>
                                <td className="p-4 text-right text-gray-700">{row.labor > 0 ? row.labor.toLocaleString() : '-'}</td>
                                <td className={`px-3 py-2 text-right ${isTotal ? 'text-letusBlue font-black' : 'text-gray-700'}`}>
                                    {(row.parts + row.labor) > 0 ? (row.parts + row.labor).toLocaleString() : '-'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
);

// ── 탭2: 월별 비용 정리
const Tab2 = ({ repairs, forklifts, forkliftMap, selYear, selMonth }) => {
    const today = new Date();

    const monthRepairs = useMemo(() =>
        repairs.filter(r => isSameMonth(r.completed_at, selYear, selMonth)),
    [repairs, selYear, selMonth]);

    // 요약
    const totalCnt   = monthRepairs.length;
    const totalParts = monthRepairs.reduce((s, r) => s + (r.parts_cost || 0), 0);
    const totalLabor = monthRepairs.reduce((s, r) => s + (r.labor_cost || 0), 0);
    const totalCost  = totalParts + totalLabor;

    // 센터별
    const centerRows = useMemo(() => {
        const map = {};
        monthRepairs.forEach(r => {
            const f = forkliftMap[r.forklift_id];
            const key = f?.center || '미지정';
            if (!map[key]) map[key] = { count: 0, parts: 0, labor: 0 };
            map[key].count++;
            map[key].parts += r.parts_cost || 0;
            map[key].labor += r.labor_cost || 0;
        });
        const rows = sortCenters(Object.keys(map)).map(k => ({ label: k, ...map[k] }));
        rows.push({ label: '합계', count: totalCnt, parts: totalParts, labor: totalLabor, isTotal: true });
        return rows;
    }, [monthRepairs, forkliftMap, totalCnt, totalParts, totalLabor]);

    // 관리주체별
    const orgRows = useMemo(() => {
        const map = {};
        monthRepairs.forEach(r => {
            const f = forkliftMap[r.forklift_id];
            const key = f?.manager_org || '미지정';
            if (!map[key]) map[key] = { count: 0, parts: 0, labor: 0 };
            map[key].count++;
            map[key].parts += r.parts_cost || 0;
            map[key].labor += r.labor_cost || 0;
        });
        const rows = Object.keys(map).sort().map(k => ({ label: k, ...map[k] }));
        rows.push({ label: '합계', count: totalCnt, parts: totalParts, labor: totalLabor, isTotal: true });
        return rows;
    }, [monthRepairs, forkliftMap, totalCnt, totalParts, totalLabor]);

    // 최근 1년 월별 수리비용
    const yearlyData = useMemo(() => {
        return Array.from({ length: 12 }, (_, i) => {
            const d = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
            const y = d.getFullYear();
            const m = d.getMonth();
            const label = `${m + 1}월`;
            const total = repairs
                .filter(r => isSameMonth(r.completed_at, y, m))
                .reduce((s, r) => s + (r.parts_cost || 0) + (r.labor_cost || 0), 0);
            return { label, total, y, m };
        });
    }, [repairs]);

    return (
        <div className="flex-1 overflow-auto px-6 py-4">
            {/* 첫 번째 행: 연간 수리비용 그래프 */}
            <div className="flex gap-4 mb-5 items-stretch">
                {/* 최근 1년 수리비용 그래프 */}
                <div className="flex-1 bg-white rounded-xl border border-gray-200 px-4 pt-3 pb-2 min-w-0">
                    <p className="text-xs font-bold text-gray-400 mb-2">최근 1년 수리비용</p>
                    <ResponsiveContainer width="100%" height={90}>
                        <BarChart data={yearlyData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 10000 ? `${(v/10000).toFixed(0)}만` : v} />
                            <Tooltip
                                formatter={v => [`${v.toLocaleString()}원`, '수리비용']}
                                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                                labelStyle={{ fontWeight: 900, color: '#1e293b' }}
                            />
                            <Bar dataKey="total" fill="#4b89ff" radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {monthRepairs.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
                    해당 월의 정비이력이 없습니다.
                </div>
            ) : (
                <div className="space-y-5">
                    {/* 센터별 + 관리주체별 — 한 줄 */}
                    <div className="grid grid-cols-2 gap-4">
                        <SubtotalTable title="센터별" colLabel="센터" rows={centerRows} />
                        <SubtotalTable title="관리주체별" colLabel="관리주체" rows={orgRows} />
                    </div>

                    {/* 이달 이력 상세 */}
                    <div>
                        <h3 className="text-sm font-black text-gray-700 mb-2">이달 이력 상세</h3>
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <table className="w-full text-[13px] text-left table-fixed">
                                <colgroup>
                                    <col style={{ width: '100px' }} />{/* 장비번호 */}
                                    <col style={{ width: '80px' }} />{/* 업무 */}
                                    <col style={{ width: '54px' }} />{/* 소유 */}
                                    <col style={{ width: '90px' }} />{/* 고장유형 */}
                                    <col style={{ width: '80px' }} />{/* 정비업체 */}
                                    <col style={{ width: '84px' }} />{/* 완료일 */}
                                    <col style={{ width: '160px' }} />{/* 정비내용 */}
                                    <col style={{ width: '90px' }} />{/* 부품비 */}
                                    <col style={{ width: '90px' }} />{/* 공임 */}
                                    <col style={{ width: '100px' }} />{/* 합계 */}
                                </colgroup>
                                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs font-bold uppercase">
                                    <tr>
                                        <th className="px-3 py-2.5">장비번호</th>
                                        <th className="px-2 py-2.5">업무</th>
                                        <th className="px-2 py-2.5">소유</th>
                                        <th className="px-2 py-2.5">고장유형</th>
                                        <th className="px-2 py-2.5">정비업체</th>
                                        <th className="px-2 py-2.5">완료일</th>
                                        <th className="px-2 py-2.5">정비내용</th>
                                        <th className="px-2 py-2.5 text-right">부품비</th>
                                        <th className="px-2 py-2.5 text-right">공임</th>
                                        <th className="px-2 py-2.5 text-right">합계</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {monthRepairs.map(r => {
                                        const f = forkliftMap[r.forklift_id];
                                        const total = (r.parts_cost || 0) + (r.labor_cost || 0);
                                        const isPendingM = r.parts_cost == null && r.labor_cost == null && !r.cost_free;
                                        return (
                                            <tr key={r.id} className="hover:bg-blue-50/20">
                                                <td className="p-4 font-bold text-letusBlue whitespace-nowrap overflow-hidden text-ellipsis">{f?.no || '-'}</td>
                                                <td className="px-2 py-2 text-gray-600 overflow-hidden text-ellipsis whitespace-nowrap">{f?.work_type || '-'}</td>
                                                <td className="px-2 py-2 whitespace-nowrap">
                                                    {f?.own_type ? <span className={`text-xs font-bold ${f.own_type === '자가' ? 'text-orange-500' : 'text-blue-400'}`}>{f.own_type}</span> : '-'}
                                                </td>
                                                <td className="px-2 py-2 text-gray-600 overflow-hidden text-ellipsis whitespace-nowrap">{r.fault_type || '-'}</td>
                                                <td className="px-2 py-2 text-gray-600 overflow-hidden text-ellipsis whitespace-nowrap">{r.repair_vendor || '-'}</td>
                                                <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{fmtDate(r.completed_at)}</td>
                                                <td className="px-2 py-2 text-gray-600">
                                                    <span className="block truncate" title={r.repair_desc || ''}>{r.repair_desc || '-'}</span>
                                                </td>
                                                <td className="px-2 py-2 text-right text-gray-600">{r.cost_free ? <span className="text-green-600 font-bold text-xs">무상</span> : r.parts_cost != null ? r.parts_cost.toLocaleString() : '-'}</td>
                                                <td className="px-2 py-2 text-right text-gray-600">{r.cost_free ? <span className="text-green-600 font-bold text-xs">무상</span> : r.labor_cost != null ? r.labor_cost.toLocaleString() : '-'}</td>
                                                <td className="px-2 py-2 text-right font-bold text-gray-700">{r.cost_free ? <span className="text-green-600 text-xs">비용없음</span> : isPendingM ? '-' : total.toLocaleString()}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── 메인
export const ForkliftRepair = ({ userProfile }) => {
    const [tab,       setTab]       = useState('list'); // 'list' | 'monthly'
    const [repairs,   setRepairs]   = useState([]);
    const [forklifts, setForklifts] = useState([]);
    const [issues,    setIssues]    = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showAdd,   setShowAdd]   = useState(false);
    const [activeCard, setActiveCard] = useState('all');
    const resetColsRef = useRef(null);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    // 공통 필터 state
    const now = new Date();
    const [selYear,      setSelYear]      = useState(now.getFullYear());
    const [selMonth,     setSelMonth]     = useState(now.getMonth());
    const [filterOrg,    setFilterOrg]    = useState('전체');
    const [filterCenter, setFilterCenter] = useState('전체');
    const [filterNo,     setFilterNo]     = useState('');
    const [filterNoCost, setFilterNoCost] = useState(false);

    const prevMonth = () => {
        if (selMonth === 0) { setSelYear(y => y - 1); setSelMonth(11); }
        else setSelMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (selYear === now.getFullYear() && selMonth === now.getMonth()) return;
        if (selMonth === 11) { setSelYear(y => y + 1); setSelMonth(0); }
        else setSelMonth(m => m + 1);
    };
    const isCurrentMonth = selYear === now.getFullYear() && selMonth === now.getMonth();

    // 마운트 시 데이터 로드
    useEffect(() => {
        const loadAll = async () => {
            setIsLoading(true);
            const [{ data: fData }, { data: rData }, { data: iData }] = await Promise.all([
                supabase.from('forklifts').select('*').order('no'),
                supabase.from('forklift_repairs').select('*').order('completed_at', { ascending: false }),
                supabase.from('forklift_issues').select('id, forklift_id, status, fault_type, fault_desc, repair_desc, repair_vendor, reported_at, completed_at')
            ]);
            const forkliftsData = fData || [];
            const repairsData   = rData || [];
            const issuesData    = iData || [];

            setForklifts(forkliftsData);
            setIssues(issuesData);

            // approved 이슈 중 repair에 없는 것 자동 추가
            const existingIssueIds = new Set(repairsData.filter(r => r.issue_id).map(r => r.issue_id));
            const approvedIssues   = issuesData.filter(i => i.status === 'approved');

            const toAdd = approvedIssues.filter(i => !existingIssueIds.has(i.id));

            if (toAdd.length > 0) {
                const newRows = toAdd.map(i => ({
                    id:            `REP-${Date.now().toString(36).toUpperCase()}-${i.id.slice(-4)}`,
                    source:        'issue',
                    issue_id:      i.id,
                    forklift_id:   i.forklift_id,
                    fault_type:    i.fault_type    || '',
                    fault_desc:    i.fault_desc    || '',
                    repair_desc:   i.repair_desc   || '',
                    repair_vendor: i.repair_vendor || '',
                    reported_at:   i.reported_at   || null,
                    completed_at:  i.completed_at  || new Date().toISOString().split('T')[0],
                    parts_cost:    null,
                    labor_cost:    null,
                    cost_free:     false,
                    created_at:    new Date().toISOString(),
                }));

                const { data: inserted } = await supabase
                    .from('forklift_repairs')
                    .insert(newRows)
                    .select();

                const merged = [...(inserted || newRows), ...repairsData];
                setRepairs(merged);
            } else {
                setRepairs(repairsData);
            }

            setIsLoading(false);
        };
        loadAll();
    }, []);

    const forkliftMap = useMemo(() =>
        Object.fromEntries(forklifts.map(f => [f.id, f])),
    [forklifts]);

    const CENTERS = useMemo(() => ['전체', ...sortCenters([...new Set(forklifts.map(f => f.center).filter(Boolean))])], [forklifts]);
    const ORGS    = useMemo(() => ['전체', ...([...new Set(forklifts.map(f => f.manager_org).filter(Boolean))].sort())], [forklifts]);

    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();
    const thisMonthAll   = repairs.filter(r => isSameMonth(r.completed_at, thisYear, thisMonth));
    const totalRepairCnt = repairs.length;
    const noCostCount    = repairs.filter(r => r.parts_cost == null && r.labor_cost == null && !r.cost_free).length;
    const thisMonthCnt   = thisMonthAll.length;
    const thisMonthParts = thisMonthAll.reduce((s, r) => s + (r.parts_cost || 0), 0);
    const thisMonthLabor = thisMonthAll.reduce((s, r) => s + (r.labor_cost || 0), 0);
    const thisMonthCost  = thisMonthParts + thisMonthLabor;

    // 비용 저장
    const handleCostSave = useCallback(async (repairId, { cost_free, parts_cost, labor_cost }) => {
        const { data } = await supabase
            .from('forklift_repairs')
            .update({
                cost_free:  !!cost_free,
                parts_cost,
                labor_cost,
                updated_at: new Date().toISOString(),
            })
            .eq('id', repairId)
            .select()
            .single();
        if (data) {
            setRepairs(prev => prev.map(r => r.id === data.id ? data : r));
        }
    }, []);

    // 삭제 (manual만)
    const handleDelete = useCallback(async (repairId) => {
        if (!window.confirm('이 정비이력을 삭제하시겠습니까?')) return;
        await supabase.from('forklift_repairs').delete().eq('id', repairId);
        setRepairs(prev => prev.filter(r => r.id !== repairId));
    }, []);

    // 직접 등록
    const handleManualAdd = useCallback(async ({ forklift_id, fault_type, fault_desc, repair_desc, repair_vendor, reported_at, completed_at, parts_cost, labor_cost }) => {
        const id = `REP-${Date.now().toString(36).toUpperCase()}`;
        const { data, error } = await supabase
            .from('forklift_repairs')
            .insert({
                id,
                source:        'manual',
                issue_id:      null,
                forklift_id,
                fault_type,
                fault_desc,
                repair_desc,
                repair_vendor,
                reported_at,
                completed_at,
                parts_cost,
                labor_cost,
                cost_free:     false,
                created_at:    new Date().toISOString(),
            })
            .select()
            .single();
        if (!error && data) {
            setRepairs(prev => [data, ...prev]);
        }
        setShowAdd(false);
    }, []);

    const activeForklifts = useMemo(() =>
        forklifts.filter(f => f.status !== '반납' && f.status !== '매각'),
    [forklifts]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                데이터를 불러오는 중...
            </div>
        );
    }

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* ━━━ 요약 카드 ━━━ */}
            <div className="grid grid-cols-6 gap-4 shrink-0">
                <SummaryCard
                    label="전체 건수" value={totalRepairCnt} unit="건"
                    labelClass="text-gray-500" valueClass="text-gray-800" borderClass="border-b-gray-300"
                    active={activeCard === 'all'}
                    onClick={() => { setActiveCard('all'); setTab('list'); setFilterNoCost(false); }}
                />
                <SummaryCard
                    label="이번달 건수" value={thisMonthCnt} unit="건"
                    labelClass="text-blue-500" valueClass="text-letusBlue" borderClass="border-b-letusBlue"
                    active={activeCard === 'thisMonth'}
                    onClick={() => { setActiveCard('thisMonth'); setTab('list'); setFilterNoCost(false); }}
                />
                <SummaryCard
                    label="이번달 부품비" value={thisMonthParts} unit="원"
                    labelClass="text-blue-400" valueClass="text-blue-600" borderClass="border-b-blue-400"
                />
                <SummaryCard
                    label="이번달 공임" value={thisMonthLabor} unit="원"
                    labelClass="text-orange-400" valueClass="text-orange-500" borderClass="border-b-orange-400"
                />
                <SummaryCard
                    label="이번달 총비용" value={thisMonthCost} unit="원"
                    labelClass="text-green-500" valueClass="text-green-600" borderClass="border-b-green-500"
                />
                <SummaryCard
                    label="비용 미입력" value={noCostCount} unit="건"
                    labelClass={noCostCount > 0 ? 'text-orange-400' : 'text-gray-500'}
                    valueClass={noCostCount > 0 ? 'text-orange-500' : 'text-gray-400'}
                    borderClass={noCostCount > 0 ? 'border-b-orange-400' : 'border-b-gray-300'}
                    active={activeCard === 'noCost'}
                    onClick={() => { setActiveCard('noCost'); setTab('list'); setFilterNoCost(true); }}
                />
            </div>

            {/* ━━━ 공통 필터 카드 ━━━ */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 shrink-0 z-30">
                <div className="flex items-center gap-5 flex-wrap">
                    {/* 조회월 */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-600 whitespace-nowrap">조회월</span>
                        <MonthPicker
                            year={selYear} month={selMonth}
                            onChange={(y, m) => { setSelYear(y); setSelMonth(m); }}
                            maxYear={now.getFullYear()} maxMonth={now.getMonth()}
                        />
                    </div>
                    <LabeledSelect label="관리주체" options={['전체', ...ORGS.filter(o => o !== '전체')]} value={filterOrg} onChange={setFilterOrg} />
                    <CheckboxDropdown label="센터" options={CENTERS.filter(c => c !== '전체')} selected={filterCenter === '전체' ? [] : [filterCenter]} onChange={v => setFilterCenter(v.length === 0 ? '전체' : v[v.length - 1])} />
                    <div className="flex items-center gap-0 h-[30px]">
                        <input type="text" placeholder="장비번호 검색" value={filterNo} onChange={e => setFilterNo(e.target.value)}
                            className="border border-gray-200 rounded-[3px] text-[11px] px-2.5 w-36 focus:outline-none focus:border-letusBlue h-full" />
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={filterNoCost} onChange={e => setFilterNoCost(e.target.checked)}
                            className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                        <span className="text-[11px] font-bold text-gray-600">비용미입력만</span>
                    </label>
                </div>
            </div>

            {/* ━━━ 탭 버튼 + 액션 버튼 — 같은 행 ━━━ */}
            <div className="flex items-center justify-between shrink-0 -mt-2 px-1">
                <div className="flex items-end gap-0">
                    {[
                        { key: 'list',    label: '이력 목록' },
                        { key: 'monthly', label: '월별 비용 정리' },
                    ].map(({ key, label }) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`py-1.5 px-5 text-[13px] font-bold border-b-2 transition-colors ${
                                tab === key
                                    ? 'text-letusBlue border-letusBlue'
                                    : 'text-gray-400 border-transparent hover:text-gray-600'
                            }`}>
                            {label}
                        </button>
                    ))}
                </div>
                {tab === 'list' && (
                    <div className="flex items-center gap-2">
                        <button onClick={() => resetColsRef.current?.()}
                            className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[30px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                            title="칼럼 너비·순서를 기본값으로 초기화">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            칼럼 초기화
                        </button>
                        <div className="relative">
                            <button onClick={() => setIsActionMenuOpen(v => !v)}
                                className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 hover:bg-gray-50 transition-all min-w-[100px] h-[30px]">
                                선택실행
                                <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {isActionMenuOpen && (
                                <>
                                    <div className="fixed inset-0" onClick={() => setIsActionMenuOpen(false)} />
                                    <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">
                                        <button onClick={() => { setIsActionMenuOpen(false); setShowAdd(true); }}
                                            className="w-full text-left px-4 py-2 text-xs font-bold text-letusBlue hover:bg-blue-50 transition-colors flex items-center justify-between">
                                            등록
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ━━━ 탭 콘텐츠 ━━━ */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0 -mt-2">
                {tab === 'list' ? (
                    <Tab1
                        repairs={repairs}
                        forklifts={forklifts}
                        forkliftMap={forkliftMap}
                        onCostSave={handleCostSave}
                        onDelete={handleDelete}
                        onAddManual={() => setShowAdd(true)}
                        userProfile={userProfile}
                        activeCard={activeCard}
                        selYear={selYear}
                        selMonth={selMonth}
                        filterOrg={filterOrg}
                        filterCenter={filterCenter}
                        filterNo={filterNo}
                        filterNoCost={filterNoCost}
                        resetColsRef={resetColsRef}
                    />
                ) : (
                    <Tab2
                        repairs={repairs}
                        forklifts={forklifts}
                        forkliftMap={forkliftMap}
                        selYear={selYear}
                        selMonth={selMonth}
                    />
                )}
            </div>

            {/* 직접 등록 모달 */}
            {showAdd && (
                <ManualAddModal
                    forklifts={activeForklifts}
                    onSave={handleManualAdd}
                    onClose={() => setShowAdd(false)}
                />
            )}
        </div>
    );
};
