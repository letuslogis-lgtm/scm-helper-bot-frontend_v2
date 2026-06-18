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

// ── 요약 카드 (대시보드 StatCard 스타일)
const REPAIR_STAT_META = {
    '전체 건수':    { border: 'border-b-gray-300',   icon: 'text-gray-200',   path: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
    '비용 미입력':  { border: 'border-b-orange-400', icon: 'text-orange-200', path: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' },
    '이번달 건수':  { border: 'border-b-letusBlue',  icon: 'text-blue-200',   path: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    '이번달 총비용':{ border: 'border-b-green-500',  icon: 'text-green-200',  path: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    '건수':        { border: 'border-b-gray-300',   icon: 'text-gray-200',   path: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
    '부품비 합계':  { border: 'border-b-letusBlue',  icon: 'text-blue-200',   path: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M9 17h6' },
    '공임 합계':    { border: 'border-b-orange-400', icon: 'text-orange-200', path: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    '총비용':       { border: 'border-b-green-500',  icon: 'text-green-200',  path: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
};

const SummaryCard = ({ label, value, unit, sub, color }) => {
    const m = REPAIR_STAT_META[label] ?? { border: 'border-b-gray-200', icon: 'text-gray-200', path: null };
    const isNum = typeof value === 'number';
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        if (!isNum) return;
        if (value === 0) { setDisplay(0); return; }
        const steps = 40;
        const interval = 500 / steps;
        let step = 0;
        const timer = setInterval(() => {
            step++;
            setDisplay(Math.round(value * (step / steps)));
            if (step >= steps) clearInterval(timer);
        }, interval);
        return () => clearInterval(timer);
    }, [value, isNum]);
    const formatted = !isNum ? value : unit === '원' ? display.toLocaleString() : display;
    return (
        <div className={`relative flex flex-col bg-white rounded-xl border border-gray-200 border-b-4 ${m.border} px-4 pt-3 pb-3 overflow-hidden w-[170px] shrink-0`}>
            {m.path && (
                <svg className={`absolute top-3 right-3 w-7 h-7 ${m.icon}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d={m.path} />
                </svg>
            )}
            <span className="text-xs font-bold text-gray-400">{label}</span>
            <div className="flex items-end gap-1 mt-2">
                <span className={`text-xl font-black leading-none ${color || 'text-gray-800'}`}>{formatted}</span>
                {unit && <span className="text-sm text-gray-400 mb-0.5">{unit}</span>}
            </div>
            {sub && <span className="text-[10px] text-gray-400 mt-1">{sub}</span>}
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
            reported_at:   reportedAt ? new Date(reportedAt).toISOString() : null,
            completed_at:  completedAt,
            parts_cost:    partsCost !== '' ? Number(partsCost) : null,
            labor_cost:    laborCost !== '' ? Number(laborCost) : null,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-letusBlue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                        </span>
                        <span className="font-black text-gray-800">정비이력 직접 등록</span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">장비 선택 *</label>
                        <ForkliftPicker forklifts={forklifts} value={forkliftId} onChange={setForkliftId} />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">고장유형</label>
                        <div className="flex flex-wrap gap-2">
                            {FAULT_TYPES.map(t => (
                                <button key={t} onClick={() => setFaultType(t === faultType ? '' : t)}
                                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                                        faultType === t
                                            ? 'border-letusBlue bg-blue-50 text-letusBlue font-bold'
                                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">고장내용</label>
                        <textarea value={faultDesc} onChange={e => setFaultDesc(e.target.value)}
                            rows={2} placeholder="고장 증상 입력"
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-letusBlue resize-none" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">정비업체</label>
                        <input value={repairVendor} onChange={e => setRepairVendor(e.target.value)}
                            placeholder="업체명 입력"
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">정비내용</label>
                        <textarea value={repairDesc} onChange={e => setRepairDesc(e.target.value)}
                            rows={2} placeholder="수행한 정비 내용 입력"
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-letusBlue resize-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">신고일 <span className="font-normal text-gray-400">(선택)</span></label>
                            <input type="datetime-local" value={reportedAt} onChange={e => setReportedAt(e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">완료일 *</label>
                            <input type="date" value={completedAt} onChange={e => setCompletedAt(e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">부품비 <span className="font-normal text-gray-400">(원, 선택)</span></label>
                            <input type="number" value={partsCost} onChange={e => setPartsCost(e.target.value)}
                                placeholder="0"
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">공임 <span className="font-normal text-gray-400">(원, 선택)</span></label>
                            <input type="number" value={laborCost} onChange={e => setLaborCost(e.target.value)}
                                placeholder="0"
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 px-6 pb-5 pt-2">
                    <button onClick={onClose}
                        className="flex-1 py-2.5 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                        취소
                    </button>
                    <button onClick={handleSave} disabled={!canSave}
                        className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl transition-colors ${
                            canSave ? 'bg-letusBlue hover:opacity-90' : 'bg-gray-300 cursor-not-allowed'
                        }`}>
                        등록
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 탭1: 이력 목록
const Tab1 = ({ repairs, forklifts, forkliftMap, onCostSave, onDelete, onAddManual }) => {
    const [filterCenter, setFilterCenter] = useState('전체');
    const [filterOrg,    setFilterOrg]    = useState('전체');
    const [filterNoCost, setFilterNoCost] = useState(false);
    const [filterNo,     setFilterNo]     = useState('');
    const [costTarget,   setCostTarget]   = useState(null);
    const today = new Date();
    const [selYear,  setSelYear]  = useState(today.getFullYear());
    const [selMonth, setSelMonth] = useState(today.getMonth());

    const prevMonth = () => { if (selMonth === 0) { setSelYear(y => y-1); setSelMonth(11); } else setSelMonth(m => m-1); };
    const nextMonth = () => { if (selMonth === 11) { setSelYear(y => y+1); setSelMonth(0); } else setSelMonth(m => m+1); };
    const isCurrentMonth = selYear === today.getFullYear() && selMonth === today.getMonth();

    const CENTERS = useMemo(() => ['전체', ...sortCenters([...new Set(forklifts.map(f => f.center).filter(Boolean))])], [forklifts]);
    const ORGS    = useMemo(() => ['전체', ...([...new Set(forklifts.map(f => f.manager_org).filter(Boolean))].sort())], [forklifts]);

    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();

    const noCostCount  = repairs.filter(r => r.parts_cost == null && r.labor_cost == null && !r.cost_free).length;
    const thisMonthAll = repairs.filter(r => isSameMonth(r.completed_at, thisYear, thisMonth));
    const thisMonthCnt = thisMonthAll.length;
    const thisMonthCost = thisMonthAll.reduce((s, r) => s + (r.parts_cost || 0) + (r.labor_cost || 0), 0);

    const filtered = useMemo(() => {
        const noQ = filterNo.trim().toLowerCase();
        return repairs.filter(r => {
            if (!isSameMonth(r.completed_at, selYear, selMonth)) return false;
            const f = forkliftMap[r.forklift_id];
            if (filterCenter !== '전체' && f?.center !== filterCenter) return false;
            if (filterOrg    !== '전체' && f?.manager_org !== filterOrg) return false;
            if (filterNoCost && !(r.parts_cost == null && r.labor_cost == null && !r.cost_free)) return false;
            if (noQ && !(f?.no?.toLowerCase().includes(noQ))) return false;
            return true;
        });
    }, [repairs, forkliftMap, filterCenter, filterOrg, filterNoCost, filterNo, selYear, selMonth]);

    const handleCostSave = useCallback((data) => {
        onCostSave(costTarget.id, data);
        setCostTarget(null);
    }, [costTarget, onCostSave]);

    return (
        <div className="flex flex-col h-full">
            {/* 요약 카드 */}
            <div className="flex gap-3 px-6 py-4 shrink-0">
                <SummaryCard label="전체 건수"    value={repairs.length}  unit="건"  color="text-gray-800" />
                <SummaryCard label="비용 미입력"   value={noCostCount}     unit="건"  color={noCostCount > 0 ? 'text-orange-500' : 'text-gray-800'} />
                <SummaryCard label="이번달 건수"   value={thisMonthCnt}    unit="건"  color="text-letusBlue" />
                <SummaryCard label="이번달 총비용" value={thisMonthCost} unit="원" color="text-green-600" />
            </div>

            {/* 월 네비게이션 + 필터 + 직접등록 버튼 */}
            <div className="px-6 pb-3 shrink-0 flex items-center gap-3 flex-wrap">
                {/* 월 네비게이션 */}
                <div className="flex items-center gap-1.5">
                    <button onClick={prevMonth} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <span className="text-[14px] font-black text-gray-700 w-[90px] text-center">{selYear}년 {selMonth + 1}월</span>
                    <button onClick={nextMonth} disabled={isCurrentMonth} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
                <div className="w-px h-4 bg-gray-200" />
                {/* 장비번호 검색 */}
                <div className="relative flex items-center">
                    <svg className="absolute left-2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
                    <input value={filterNo} onChange={e => setFilterNo(e.target.value)}
                        placeholder="장비번호 검색"
                        className="text-[13px] pl-7 pr-3 h-[29px] border border-gray-300 rounded bg-white focus:outline-none focus:border-letusBlue w-[130px]" />
                    {filterNo && (
                        <button onClick={() => setFilterNo('')} className="absolute right-2 text-gray-400 hover:text-gray-600">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-gray-500">센터</span>
                    <select value={filterCenter} onChange={e => setFilterCenter(e.target.value)}
                        className="text-[13px] font-bold text-gray-600 border border-gray-300 rounded px-2.5 h-[29px] bg-white focus:outline-none">
                        {CENTERS.map(c => <option key={c}>{c}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-gray-500">관리주체</span>
                    <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)}
                        className="text-[13px] font-bold text-gray-600 border border-gray-300 rounded px-2.5 h-[29px] bg-white focus:outline-none">
                        {ORGS.map(o => <option key={o}>{o}</option>)}
                    </select>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={filterNoCost} onChange={e => setFilterNoCost(e.target.checked)}
                        className="w-4 h-4 accent-letusBlue cursor-pointer" />
                    <span className="text-[13px] font-bold text-gray-500">비용미입력만</span>
                </label>
                <span className="text-[13px] text-gray-400">총 {filtered.length}건</span>
                <button onClick={onAddManual}
                    className="ml-auto flex items-center gap-1.5 text-sm font-bold text-white bg-letusBlue hover:opacity-90 rounded-xl px-4 h-[34px] transition-opacity">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    직접 등록
                </button>
            </div>

            {/* 테이블 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left text-[13px]">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs font-bold uppercase sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2.5 whitespace-nowrap">출처</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">장비번호</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">센터</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">관리주체</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">소유</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">고장유형</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">정비업체</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">신고일</th>
                                <th className="px-3 py-2.5 whitespace-nowrap">완료일</th>
                                <th className="px-3 py-2.5 whitespace-nowrap text-center">소요일수</th>
                                <th className="px-3 py-2.5 whitespace-nowrap text-right">부품비</th>
                                <th className="px-3 py-2.5 whitespace-nowrap text-right">공임</th>
                                <th className="px-3 py-2.5 whitespace-nowrap text-right">합계</th>
                                <th className="px-3 py-2.5 whitespace-nowrap text-center">액션</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.length === 0 && (
                                <tr><td colSpan={14} className="text-center py-12 text-gray-400">
                                    {repairs.length === 0 ? '정비이력이 없습니다.' : '조건에 맞는 이력이 없습니다.'}
                                </td></tr>
                            )}
                            {filtered.map(r => {
                                const f = forkliftMap[r.forklift_id];
                                const days = diffDays(r.reported_at, r.completed_at);
                                const isPending = r.parts_cost == null && r.labor_cost == null && !r.cost_free;
                                const total = (r.parts_cost || 0) + (r.labor_cost || 0);
                                return (
                                    <tr key={r.id} className="hover:bg-blue-50/20 transition-colors">
                                        <td className="px-3 py-2">
                                            {r.source === 'issue'
                                                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">이슈</span>
                                                : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">직접</span>
                                            }
                                        </td>
                                        <td className="px-3 py-2 font-bold text-letusBlue whitespace-nowrap">{f?.no || '-'}</td>
                                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{f?.center || '-'}</td>
                                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{f?.manager_org || '-'}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {f?.own_type ? <span className={`text-xs font-bold ${f.own_type === '자가' ? 'text-orange-500' : 'text-blue-400'}`}>{f.own_type}</span> : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.fault_type || '-'}</td>
                                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.repair_vendor || '-'}</td>
                                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(r.reported_at)}</td>
                                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(r.completed_at)}</td>
                                        <td className="px-3 py-2 text-center text-gray-500">{days != null ? `${days}일` : '-'}</td>
                                        <td className="px-3 py-2 text-right text-gray-600">
                                            {r.cost_free ? <span className="text-green-600 font-bold text-xs">무상</span> : r.parts_cost != null ? r.parts_cost.toLocaleString() : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-600">
                                            {r.cost_free ? <span className="text-green-600 font-bold text-xs">무상</span> : r.labor_cost != null ? r.labor_cost.toLocaleString() : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-bold text-gray-700">
                                            {r.cost_free ? <span className="text-green-600 text-xs">비용없음</span> : isPending ? '-' : total.toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-center">
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
                                    </tr>
                                );
                            })}
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
                                <td className="px-3 py-2 text-right text-gray-700">{row.count}</td>
                                <td className="px-3 py-2 text-right text-gray-700">{row.parts > 0 ? row.parts.toLocaleString() : '-'}</td>
                                <td className="px-3 py-2 text-right text-gray-700">{row.labor > 0 ? row.labor.toLocaleString() : '-'}</td>
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
const Tab2 = ({ repairs, forklifts, forkliftMap }) => {
    const today = new Date();
    const [selYear,  setSelYear]  = useState(today.getFullYear());
    const [selMonth, setSelMonth] = useState(today.getMonth()); // 0-indexed

    const prevMonth = () => {
        if (selMonth === 0) { setSelYear(y => y - 1); setSelMonth(11); }
        else setSelMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (selMonth === 11) { setSelYear(y => y + 1); setSelMonth(0); }
        else setSelMonth(m => m + 1);
    };

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
            {/* 월 선택 */}
            <div className="flex items-center gap-3 mb-4">
                <button onClick={prevMonth}
                    className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50">
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <span className="text-base font-black text-gray-800 min-w-[110px] text-center">
                    {selYear}년 {selMonth + 1}월
                </span>
                <button onClick={nextMonth}
                    className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50">
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {/* 첫 번째 행: 요약 카드 + 연간 수리비용 그래프 */}
            <div className="flex gap-4 mb-5 items-stretch">
                {/* 요약 카드 */}
                <div className="flex gap-3 shrink-0">
                    <SummaryCard label="건수"      value={totalCnt}    unit="건"  color="text-gray-800" />
                    <SummaryCard label="부품비 합계" value={totalParts}  unit="원" color="text-blue-600" />
                    <SummaryCard label="공임 합계"  value={totalLabor} unit="원" color="text-orange-500" />
                    <SummaryCard label="총비용"     value={totalCost}  unit="원" color="text-letusBlue" />
                </div>
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
                                                <td className="px-3 py-2 font-bold text-letusBlue whitespace-nowrap overflow-hidden text-ellipsis">{f?.no || '-'}</td>
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
            {/* 헤더 카드 */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 z-30 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <span className="text-base font-black text-gray-800">정비·수리 이력</span>
                        <span className="text-xs text-gray-400 ml-2">검수완료 이력 및 직접 등록 관리</span>
                    </div>
                </div>
                {/* 탭 */}
                <div className="flex gap-6">
                    {[
                        { key: 'list',    label: '이력 목록' },
                        { key: 'monthly', label: '월별 비용 정리' },
                    ].map(({ key, label }) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`pb-2.5 text-sm font-bold border-b-2 transition-colors ${
                                tab === key
                                    ? 'text-letusBlue border-letusBlue'
                                    : 'text-gray-400 border-transparent hover:text-gray-600'
                            }`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 탭 콘텐츠 */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {tab === 'list' ? (
                    <Tab1
                        repairs={repairs}
                        forklifts={forklifts}
                        forkliftMap={forkliftMap}
                        onCostSave={handleCostSave}
                        onDelete={handleDelete}
                        onAddManual={() => setShowAdd(true)}
                    />
                ) : (
                    <Tab2
                        repairs={repairs}
                        forklifts={forklifts}
                        forkliftMap={forkliftMap}
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
