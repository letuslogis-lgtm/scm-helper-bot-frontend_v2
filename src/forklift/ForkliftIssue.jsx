import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient.js';

const CENTER_ORDER = ['양지1','양지2','양지3','안성','평택','음성','대전','대구','부산','광주','전북','전남','울산','창원','기장','제주','이케아'];
const sortCenters = arr => [...arr].sort((a, b) => { const ia = CENTER_ORDER.indexOf(a); const ib = CENTER_ORDER.indexOf(b); if (ia === -1 && ib === -1) return a.localeCompare(b); if (ia === -1) return 1; if (ib === -1) return -1; return ia - ib; });

const EXCLUDE_STATUSES = ['반납', '매각'];

const ISSUE_STATUS = {
    reported:  { label: '고장접수', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
    accepted:  { label: '정비중',   bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
    completed: { label: '정비완료', bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
    approved:  { label: '검수완료', bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
};

const FAULT_TYPES = ['배터리 불량', '유압 이상', '조향 불량', '브레이크 불량', '포크/마스트 이상', '타이어 손상', '전기 계통', '기타'];

// ── 대시보드형 StatCard (카운트업 애니메이션)
const STAT_META = {
    '전체':     { border: 'border-b-gray-400',   icon: 'text-gray-200',   path: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
    '고장접수': { border: 'border-b-red-500',    icon: 'text-red-200',    path: 'M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' },
    '정비중':   { border: 'border-b-orange-400', icon: 'text-orange-200', path: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    '정비완료': { border: 'border-b-blue-500',   icon: 'text-blue-200',   path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
};
const IssueStatCard = ({ label, value, color, active, onClick }) => {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        if (value === 0) { setDisplay(0); return; }
        let step = 0; const steps = 30; const interval = 400 / steps;
        const t = setInterval(() => { step++; setDisplay(Math.round(value * step / steps)); if (step >= steps) clearInterval(t); }, interval);
        return () => clearInterval(t);
    }, [value]);
    const m = STAT_META[label] ?? { border: 'border-b-gray-300', icon: 'text-gray-200', path: '' };
    return (
        <button onClick={onClick}
            className={`relative flex flex-col bg-white rounded-xl border border-gray-200 border-b-4 ${m.border} px-6 pt-5 pb-5 overflow-hidden w-[260px] shrink-0 transition-all ${active ? 'ring-2 ring-letusBlue shadow-md' : 'hover:shadow-sm'}`}>
            {m.path && (
                <svg className={`absolute top-4 right-4 w-10 h-10 ${m.icon}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d={m.path} />
                </svg>
            )}
            <span className="text-sm font-bold text-gray-400">{label}</span>
            <div className="flex items-end gap-1.5 mt-3">
                <span className={`text-5xl font-black leading-none ${color}`}>{display}</span>
                <span className="text-base text-gray-400 mb-1">건</span>
            </div>
        </button>
    );
};

// ── 유틸
const nowDtLocal    = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const fmtDt = (iso) => { if (!iso) return '-'; const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const fmtDate = (iso) => { if (!iso) return '-'; const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; };

// ── 상태 뱃지
const StatusBadge = ({ status }) => {
    const m = ISSUE_STATUS[status];
    if (!m) return null;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${m.bg} ${m.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
            {m.label}
        </span>
    );
};

// ── 장비 검색 선택 컴포넌트
const ForkliftPicker = ({ forklifts, value, onChange }) => {
    const [query,  setQuery]  = useState('');
    const [open,   setOpen]   = useState(false);
    const ref = useRef(null);

    const selected = forklifts.find(f => f.id === value);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = useMemo(() => {
        if (!query.trim()) return forklifts;
        const q = query.toLowerCase();
        return forklifts.filter(f =>
            f.no?.toLowerCase().includes(q) ||
            f.center?.toLowerCase().includes(q) ||
            f.manager_org?.toLowerCase().includes(q) ||
            f.shape?.toLowerCase().includes(q)
        );
    }, [forklifts, query]);

    const handleSelect = (f) => {
        onChange(f.id);
        setQuery('');
        setOpen(false);
    };

    const handleClear = () => { onChange(''); setQuery(''); };

    return (
        <div ref={ref} className="relative">
            {selected ? (
                <div className="flex items-center justify-between px-3 py-2 border border-letusBlue rounded-lg bg-blue-50">
                    <div className="text-sm">
                        <span className="font-bold text-letusBlue">{selected.no}</span>
                        <span className="text-gray-500 ml-2 text-xs">{selected.center} · {selected.manager_org} · {selected.shape}</span>
                    </div>
                    <button onClick={handleClear} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            ) : (
                <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    placeholder="장비번호 · 센터 · 관리주체로 검색"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue"
                />
            )}
            {open && !selected && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-gray-400 text-center">검색 결과가 없습니다</div>
                    ) : filtered.map(f => (
                        <button key={f.id} onClick={() => handleSelect(f)}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                            <span className="text-sm font-bold text-letusBlue">{f.no}</span>
                            <span className="text-xs text-gray-500 ml-2">{f.center} · {f.manager_org}</span>
                            <span className={`text-xs font-bold ml-2 ${f.own_type === '자가' ? 'text-orange-500' : 'text-blue-400'}`}>{f.own_type}</span>
                            <span className="text-xs text-gray-400 ml-1">· {f.shape}</span>
                            {f.status && f.status !== '정상' && (
                                <span className="text-xs font-bold text-red-500 ml-2">[{f.status}]</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── 이슈 등록/수정 모달
const IssueFormModal = ({ forklifts, onSave, onClose, editIssue, userProfile }) => {
    const defaultReporter = userProfile?.name || userProfile?.email || '';
    const [forkliftId, setForkliftId] = useState(editIssue?.forklift_id || '');
    const [faultType,  setFaultType]  = useState(editIssue?.fault_type  || '');
    const [errorCode,  setErrorCode]  = useState(editIssue?.error_code  || '');
    const [faultDesc,  setFaultDesc]  = useState(editIssue?.fault_desc  || '');
    const [reporter,   setReporter]   = useState(editIssue?.reporter   || defaultReporter);
    const [reportedAt, setReportedAt] = useState(editIssue?.reported_at
        ? (() => { const d = new Date(editIssue.reported_at); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()
        : nowDtLocal());

    const isEdit   = !!editIssue;
    const canSave  = forkliftId && faultDesc.trim() && reporter.trim();

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center ${isEdit ? 'bg-amber-100' : 'bg-red-100'}`}>
                            {isEdit ? (
                                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            )}
                        </span>
                        <span className="font-black text-gray-800">{isEdit ? '이슈 수정' : '이슈 등록'}</span>
                        {isEdit && <span className="text-xs text-gray-400">{editIssue.id}</span>}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                    {/* 장비 선택 */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">장비 선택 *</label>
                        <ForkliftPicker forklifts={forklifts} value={forkliftId} onChange={setForkliftId} />
                    </div>

                    {/* 고장 유형 */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">고장 유형</label>
                        <div className="flex flex-wrap gap-2">
                            {FAULT_TYPES.map(t => (
                                <button key={t} onClick={() => setFaultType(t === faultType ? '' : t)}
                                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                                        faultType === t
                                            ? 'border-red-400 bg-red-50 text-red-700 font-bold'
                                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 에러 코드 */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">에러 코드 <span className="font-normal text-gray-400">(선택)</span></label>
                        <input value={errorCode} onChange={e => setErrorCode(e.target.value)}
                            placeholder="예) E-01, F23, ERR_HYD 등"
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                    </div>

                    {/* 고장 내용 */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">고장 내용 *</label>
                        <textarea value={faultDesc} onChange={e => setFaultDesc(e.target.value)}
                            rows={3} placeholder="고장 증상을 자세히 입력해 주세요"
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-letusBlue resize-none" />
                    </div>

                    {/* 신고자 / 신고 일시 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">신고자 *</label>
                            <input value={reporter} onChange={e => setReporter(e.target.value)}
                                placeholder="이름 입력"
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">신고 일시</label>
                            <input type="datetime-local" value={reportedAt} onChange={e => setReportedAt(e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 px-6 pb-5 pt-2">
                    <button onClick={onClose}
                        className="flex-1 py-2.5 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                        취소
                    </button>
                    <button
                        onClick={() => canSave && onSave({ forklift_id: forkliftId, fault_type: faultType, error_code: errorCode, fault_desc: faultDesc, reporter, reported_at: new Date(reportedAt).toISOString() })}
                        disabled={!canSave}
                        className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl transition-colors ${
                            canSave
                                ? isEdit ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-500 hover:bg-red-600'
                                : 'bg-gray-300 cursor-not-allowed'
                        }`}>
                        {isEdit ? '수정 저장' : '이슈 등록'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 정비완료 입력 모달
const CompleteModal = ({ issue, forklift, onSave, onClose }) => {
    const [repairDesc,   setRepairDesc]   = useState(issue.repair_desc   || '');
    const [repairVendor, setRepairVendor] = useState(issue.repair_vendor || '');
    const [completedAt,  setCompletedAt]  = useState(issue.completed_at  || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })());
    const [acceptedBy,   setAcceptedBy]   = useState(issue.repair_completed_by || '');

    const canSave = repairDesc.trim() && repairVendor.trim() && acceptedBy.trim();

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </span>
                        <div>
                            <span className="font-black text-gray-800">정비완료 입력</span>
                            <span className="text-xs text-gray-400 ml-2">{forklift?.no} · {issue.id}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                    <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1">
                        <div className="flex gap-4 text-gray-600">
                            <span><strong className="text-gray-800">고장유형</strong> {issue.fault_type || '-'}</span>
                            <span><strong className="text-gray-800">신고일</strong> {fmtDate(issue.reported_at)}</span>
                        </div>
                        <div className="text-gray-600"><strong className="text-gray-800">고장내용</strong> {issue.fault_desc}</div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">정비 내용 *</label>
                        <textarea value={repairDesc} onChange={e => setRepairDesc(e.target.value)}
                            rows={3} placeholder="수행한 정비 내용을 입력해 주세요"
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-letusBlue resize-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">정비업체 *</label>
                            <input value={repairVendor} onChange={e => setRepairVendor(e.target.value)}
                                placeholder="업체명 입력"
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5">정비완료일 *</label>
                            <input type="date" value={completedAt} onChange={e => setCompletedAt(e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5">정비 담당자 *</label>
                        <input value={acceptedBy} onChange={e => setAcceptedBy(e.target.value)}
                            placeholder="담당자 이름"
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 h-[36px] focus:outline-none focus:border-letusBlue" />
                    </div>

                    <div className="bg-blue-50 rounded-xl px-4 py-3 text-[11px] text-blue-700">
                        정비완료 후 사무실 검수승인을 거쳐 정비·수리 이력이 확정됩니다.<br/>
                        비용(부품비·공임)은 검수승인 단계에서 입력합니다.
                    </div>
                </div>

                <div className="flex gap-2 px-6 pb-5 pt-2">
                    <button onClick={onClose}
                        className="flex-1 py-2.5 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                        취소
                    </button>
                    <button onClick={() => canSave && onSave({ repairDesc, repairVendor, completedAt, acceptedBy })}
                        disabled={!canSave}
                        className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl transition-colors ${canSave ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-300 cursor-not-allowed'}`}>
                        정비완료 저장
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 상세 모달
const DetailModal = ({ issue, forklift, userProfile, onAccept, onClose }) => {
    const [acceptNote, setAcceptNote] = useState('');
    const [showAcceptForm, setShowAcceptForm] = useState(false);
    return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                <div><span className="font-black text-gray-800">이슈 상세</span><span className="text-xs text-gray-400 ml-2">{issue.id}</span></div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
                <StatusBadge status={issue.status} />
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div><span className="text-gray-400 font-bold">장비번호</span><br/><span className="font-bold text-letusBlue">{forklift?.no||'-'}</span></div>
                    <div><span className="text-gray-400 font-bold">센터</span><br/><span>{forklift?.center||'-'}</span></div>
                    <div><span className="text-gray-400 font-bold">관리주체</span><br/><span>{forklift?.manager_org||'-'}</span></div>
                    <div><span className="text-gray-400 font-bold">소유구분</span><br/><span>{forklift?.own_type||'-'}</span></div>
                    <div><span className="text-gray-400 font-bold">고장유형</span><br/><span>{issue.fault_type||'-'}</span></div>
                    <div><span className="text-gray-400 font-bold">신고자</span><br/><span>{issue.reporter}</span></div>
                    <div><span className="text-gray-400 font-bold">신고일시</span><br/><span>{fmtDt(issue.reported_at)}</span></div>
                    {issue.accepted_at && <div><span className="text-gray-400 font-bold">접수일시</span><br/><span>{fmtDt(issue.accepted_at)}</span></div>}
                    {issue.accepted_by && <div><span className="text-gray-400 font-bold">접수자</span><br/><span>{issue.accepted_by}</span></div>}
                    {issue.completed_at && <div><span className="text-gray-400 font-bold">완료일</span><br/><span>{fmtDate(issue.completed_at)}</span></div>}
                    {issue.repair_vendor && <div><span className="text-gray-400 font-bold">정비업체</span><br/><span>{issue.repair_vendor}</span></div>}
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-bold text-gray-500 mb-1">고장 내용</p>
                    <p className="text-xs text-gray-700">{issue.fault_desc}</p>
                </div>
                {issue.accept_note && (
                    <div className="bg-orange-50 rounded-xl p-3">
                        <p className="text-xs font-bold text-orange-600 mb-1">접수 메모</p>
                        <p className="text-xs text-gray-700">{issue.accept_note}</p>
                    </div>
                )}
                {issue.repair_desc && (
                    <div className="bg-blue-50 rounded-xl p-3">
                        <p className="text-xs font-bold text-blue-600 mb-1">정비 내용</p>
                        <p className="text-xs text-gray-700">{issue.repair_desc}</p>
                    </div>
                )}
                {issue.status === 'reported' && !showAcceptForm && (
                    <button onClick={() => setShowAcceptForm(true)}
                        className="w-full py-2.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition-colors">
                        접수 (정비중으로 변경)
                    </button>
                )}
                {issue.status === 'reported' && showAcceptForm && (
                    <div className="space-y-2">
                        <p className="text-xs font-bold text-orange-600">접수 메모 <span className="text-gray-400 font-normal">(선택)</span></p>
                        <textarea
                            value={acceptNote}
                            onChange={e => setAcceptNote(e.target.value)}
                            placeholder="정비 지시사항, 주의사항 등 추가 설명을 입력하세요"
                            rows={3}
                            className="w-full border border-orange-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setShowAcceptForm(false)}
                                className="flex-1 py-2.5 text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                                취소
                            </button>
                            <button onClick={() => onAccept(issue.id, userProfile?.name || userProfile?.email || '관리자', acceptNote)}
                                className="flex-1 py-2.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition-colors">
                                접수 확정
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
    );
};

// ── 검수승인 확인 모달
const ApproveConfirmModal = ({ issue, forklift, onConfirm, onClose }) => (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 pt-6 pb-4 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <p className="font-black text-gray-800 text-base mb-1">검수완료 하시겠습니까?</p>
                <p className="text-xs text-gray-500 mb-1">
                    <span className="font-bold text-letusBlue">{forklift?.no}</span> 장비가 <span className="font-bold text-green-600">정상</span> 상태로 복귀됩니다.
                </p>
                <p className="text-xs text-gray-400">승인 후 이슈 목록에서 제거되며 정비·수리 이력으로 이관됩니다.</p>
            </div>
            <div className="flex gap-2 px-6 pb-5">
                <button onClick={onClose}
                    className="flex-1 py-2.5 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                    취소
                </button>
                <button onClick={onConfirm}
                    className="flex-1 py-2.5 text-sm font-bold text-white bg-green-500 hover:bg-green-600 rounded-xl transition-colors">
                    검수완료
                </button>
            </div>
        </div>
    </div>
);

// ── 메인
export const ForkliftIssue = ({ userProfile }) => {
    const [forklifts,     setForklifts]     = useState([]);
    const [issues,        setIssues]        = useState([]);
    const [isLoading,     setIsLoading]     = useState(false);
    const [filterOrg,       setFilterOrg]       = useState('전체');
    const [filterCenters,   setFilterCenters]   = useState([]);
    const [centerDropOpen,  setCenterDropOpen]  = useState(false);
    const [filterStatus,    setFilterStatus]    = useState('전체');
    const centerDropRef = useRef(null);
    const [excludeApproved, setExcludeApproved] = useState(true);  // 검수완료 제외 (기본 체크)
    const [showForm,      setShowForm]      = useState(false);
    const [editIssue,     setEditIssue]     = useState(null);
    const [detailIssue,   setDetailIssue]   = useState(null);
    const [completeIssue, setCompleteIssue] = useState(null);
    const [approveIssue,  setApproveIssue]  = useState(null);
    const [sortConfig,    setSortConfig]    = useState({ key: 'reported_at', dir: 'desc' });

    // forklifts 로딩
    useEffect(() => {
        const fetch = async () => {
            const { data } = await supabase.from('forklifts').select('*').not('status', 'in', '("반납","매각")').order('no');
            setForklifts(data || []);
        };
        fetch();
    }, []);

    // issues 로딩
    useEffect(() => {
        const fetchIssues = async () => {
            setIsLoading(true);
            const { data } = await supabase.from('forklift_issues').select('*').order('created_at', { ascending: false });
            setIssues(data || []);
            setIsLoading(false);
        };
        fetchIssues();
    }, []);

    useEffect(() => {
        const handler = (e) => { if (centerDropRef.current && !centerDropRef.current.contains(e.target)) setCenterDropOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const activeForklifts = useMemo(() =>
        forklifts.filter(f => !EXCLUDE_STATUSES.includes(f.status)), [forklifts]);

    const ORGS    = useMemo(() => ['전체', ...new Set(forklifts.map(f => f.manager_org).filter(Boolean))], [forklifts]);
    const CENTERS = useMemo(() => ['전체', ...sortCenters([...new Set(forklifts.map(f => f.center).filter(Boolean))])], [forklifts]);
    const filteredCenters = useMemo(() => filterOrg === '전체' ? CENTERS : ['전체', ...sortCenters([...new Set(forklifts.filter(f => f.manager_org === filterOrg).map(f => f.center).filter(Boolean))])], [forklifts, filterOrg, CENTERS]);
    const forkliftMap = useMemo(() => Object.fromEntries(forklifts.map(f => [f.id, f])), [forklifts]);

    // 검수완료 제외 여부에 따라 표시할 이슈 결정
    const activeIssues = useMemo(() =>
        excludeApproved ? issues.filter(i => i.status !== 'approved') : issues,
    [issues, excludeApproved]);

    // 이슈 등록
    const handleSaveIssue = useCallback(async ({ forklift_id, fault_type, error_code, fault_desc, reporter, reported_at }) => {
        const id = `ISS-${Date.now().toString(36).toUpperCase()}`;
        const newIssue = { id, forklift_id, fault_type, error_code, fault_desc, reporter, reported_at, status: 'reported', created_at: new Date().toISOString() };
        const { error } = await supabase.from('forklift_issues').insert(newIssue);
        if (!error) {
            // 지게차 상태 업데이트
            await supabase.from('forklifts').update({ status: '고장' }).eq('id', forklift_id);
            setForklifts(prev => prev.map(f => f.id === forklift_id ? { ...f, status: '고장' } : f));
            setIssues(prev => [newIssue, ...prev]);
        }
        setShowForm(false);
    }, []);

    // 이슈 수정
    const handleEditSave = useCallback(async ({ forklift_id, fault_type, error_code, fault_desc, reporter, reported_at }) => {
        const updates = { forklift_id, fault_type, error_code, fault_desc, reporter, reported_at, updated_at: new Date().toISOString() };
        const { error } = await supabase.from('forklift_issues').update(updates).eq('id', editIssue.id);
        if (!error) {
            setIssues(prev => prev.map(i => i.id !== editIssue.id ? i : { ...i, ...updates }));
        }
        setEditIssue(null);
    }, [editIssue]);

    // 접수
    const handleAccept = useCallback(async (issueId, acceptedBy, acceptNote) => {
        const now = new Date().toISOString();
        const updates = { status: 'accepted', accepted_at: now, accepted_by: acceptedBy, ...(acceptNote?.trim() ? { accept_note: acceptNote.trim() } : {}) };
        await supabase.from('forklift_issues').update(updates).eq('id', issueId);
        setIssues(prev => prev.map(i => i.id !== issueId ? i : { ...i, ...updates }));
        setDetailIssue(null);
    }, []);

    // 정비완료
    const handleComplete = useCallback(async ({ repairDesc, repairVendor, completedAt, acceptedBy }) => {
        if (!completeIssue) return;
        const updates = { status: 'completed', repair_desc: repairDesc, repair_vendor: repairVendor, completed_at: completedAt, repair_completed_by: acceptedBy, completed_recorded_at: new Date().toISOString() };
        await supabase.from('forklift_issues').update(updates).eq('id', completeIssue.id);
        setIssues(prev => prev.map(i => i.id !== completeIssue.id ? i : { ...i, ...updates }));
        setCompleteIssue(null);
    }, [completeIssue]);

    // 검수승인 확정
    const handleApproveConfirm = useCallback(async () => {
        if (!approveIssue) return;
        const now = new Date().toISOString();
        const approvedBy = userProfile?.name || userProfile?.email || '관리자';
        const updates = { status: 'approved', approved_at: now, approved_by: approvedBy };
        await supabase.from('forklift_issues').update(updates).eq('id', approveIssue.id);
        // 검수완료(approved)이면 지게차 상태 정상으로 복원
        const issue = issues.find(i => i.id === approveIssue.id);
        if (issue) {
            await supabase.from('forklifts').update({ status: '정상' }).eq('id', issue.forklift_id);
            setForklifts(prev => prev.map(f => f.id === issue.forklift_id ? { ...f, status: '정상' } : f));
        }
        setIssues(prev => prev.map(i => i.id !== approveIssue.id ? i : { ...i, ...updates }));
        setApproveIssue(null);
    }, [issues, approveIssue, userProfile]);

    // 정렬
    const requestSort = useCallback((key) => {
        setSortConfig(prev => prev.key === key && prev.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' });
    }, []);
    const sortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return <span className="text-letusBlue font-black text-[10px] ml-0.5">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>;
    };

    // 관리주체·센터 필터 기반 (1행 카드 + 리스트 공통)
    const filteredBase = useMemo(() => activeIssues.filter(issue => {
        const f = forkliftMap[issue.forklift_id];
        if (!f) return false;
        if (filterOrg !== '전체' && f.manager_org !== filterOrg) return false;
        if (filterCenters.length > 0 && !filterCenters.includes(f.center)) return false;
        return true;
    }), [activeIssues, forkliftMap, filterOrg, filterCenters]);

    // 요약 — 1행 카드 숫자
    const totalStats = useMemo(() => ({
        reported:  filteredBase.filter(i => i.status === 'reported').length,
        accepted:  filteredBase.filter(i => i.status === 'accepted').length,
        completed: filteredBase.filter(i => i.status === 'completed').length,
    }), [filteredBase]);

    // 상태 필터 + 정렬
    const filtered = useMemo(() => {
        let r = filteredBase.filter(issue =>
            filterStatus === '전체' || issue.status === filterStatus
        );
        const { key, dir } = sortConfig;
        return [...r].sort((a, b) => {
            let av = a[key] ?? '', bv = b[key] ?? '';
            if (av < bv) return dir === 'asc' ? -1 : 1;
            if (av > bv) return dir === 'asc' ?  1 : -1;
            return 0;
        });
    }, [filteredBase, filterStatus, sortConfig]);

    const orgStats = useMemo(() => {
        const orgs = [...new Set(activeForklifts.map(f => f.manager_org).filter(Boolean))].sort();
        return orgs.map(org => {
            const orgForklifts = activeForklifts.filter(f => f.manager_org === org);
            return {
                org,
                total:    orgForklifts.length,
                normal:   orgForklifts.filter(f => f.status === '정상').length,
                inRepair: orgForklifts.filter(f => f.status === '정비중').length,
                broken:   orgForklifts.filter(f => f.status === '고장').length,
            };
        }).filter(s => s.total > 0);
    }, [activeForklifts]);

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* ━━━ 헤더 + 필터 카드 ━━━ */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex flex-col z-30 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <span className="text-base font-black text-gray-800">이슈 등록</span>
                        <span className="text-xs text-gray-400 ml-2">고장 접수 및 정비 처리 현황</span>
                    </div>
                    <button onClick={() => { setEditIssue(null); setShowForm(true); }}
                        className="flex items-center gap-1.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl px-4 h-[34px] transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        이슈 등록
                    </button>
                </div>

                {/* 상태 카드 */}
                <div className="flex gap-2.5">
                    <IssueStatCard label="고장접수" value={totalStats.reported}  color="text-red-600"    active={filterStatus==='reported'}  onClick={() => setFilterStatus(filterStatus==='reported'  ? '전체' : 'reported')}  />
                    <IssueStatCard label="정비중"   value={totalStats.accepted}  color="text-orange-600" active={filterStatus==='accepted'}  onClick={() => setFilterStatus(filterStatus==='accepted'  ? '전체' : 'accepted')}  />
                    <IssueStatCard label="정비완료" value={totalStats.completed} color="text-blue-600"   active={filterStatus==='completed'} onClick={() => setFilterStatus(filterStatus==='completed' ? '전체' : 'completed')} />
                    <IssueStatCard label="전체"     value={totalStats.reported + totalStats.accepted + totalStats.completed} color="text-gray-700" active={filterStatus==='전체'} onClick={() => setFilterStatus('전체')} />
                    <div className="flex-1" />
                </div>

                {/* 관리주체별 현황 */}
                <div className="border-t border-gray-100 pt-2.5 mt-2.5">
                    <div className="flex gap-2.5 overflow-x-auto pb-0.5">
                        {orgStats.map(s => (
                            <div key={s.org} className={`flex-shrink-0 rounded-xl border px-3.5 py-2 min-w-[140px] ${s.broken > 0 ? 'border-red-200 bg-red-50/40' : s.inRepair > 0 ? 'border-orange-200 bg-orange-50/30' : 'border-gray-200 bg-gray-50'}`}>
                                <p className="text-[13px] font-black text-gray-700 mb-1.5">{s.org}</p>
                                <div className="flex gap-2.5 text-[11px]">
                                    <span className="text-green-600 font-bold">정상 {s.normal}</span>
                                    {s.inRepair > 0 && <span className="text-orange-500 font-bold">정비중 {s.inRepair}</span>}
                                    {s.broken   > 0 && <span className="text-red-500 font-bold">고장 {s.broken}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 필터 */}
                <div className="border-t border-gray-100 pt-2.5 mt-2.5 flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-gray-500 whitespace-nowrap">관리주체</span>
                        <select value={filterOrg} onChange={e => { setFilterOrg(e.target.value); setFilterCenters([]); }}
                            className="text-[13px] font-bold text-gray-600 border border-gray-300 rounded px-2.5 h-[29px] bg-white focus:outline-none">
                            {ORGS.map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-1.5 relative" ref={centerDropRef}>
                        <span className="text-[13px] font-bold text-gray-500 whitespace-nowrap">센터</span>
                        <button
                            onClick={() => setCenterDropOpen(v => !v)}
                            className="text-[13px] font-bold text-gray-600 border border-gray-300 rounded px-2.5 h-[29px] bg-white flex items-center gap-1.5 hover:border-gray-400"
                        >
                            {filterCenters.length === 0 ? '전체' : `${filterCenters.length}개 선택`}
                            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        {centerDropOpen && (
                            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-1.5 min-w-[130px] max-h-60 overflow-y-auto">
                                <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                    <input type="checkbox" checked={filterCenters.length === 0}
                                        onChange={() => setFilterCenters([])}
                                        className="w-3.5 h-3.5 accent-letusBlue" />
                                    <span className="text-xs font-bold text-gray-600">전체</span>
                                </label>
                                <div className="border-t border-gray-100 my-1" />
                                {filteredCenters.filter(c => c !== '전체').map(c => (
                                    <label key={c} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                        <input type="checkbox" checked={filterCenters.includes(c)}
                                            onChange={() => setFilterCenters(prev =>
                                                prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                                            )}
                                            className="w-3.5 h-3.5 accent-letusBlue" />
                                        <span className="text-xs text-gray-700">{c}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-gray-500 whitespace-nowrap">상태</span>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                            className="text-[13px] font-bold text-gray-600 border border-gray-300 rounded px-2.5 h-[29px] bg-white focus:outline-none">
                            <option value="전체">전체</option>
                            <option value="reported">고장접수</option>
                            <option value="accepted">정비중</option>
                            <option value="completed">정비완료</option>
                            {!excludeApproved && <option value="approved">검수완료</option>}
                        </select>
                    </div>
                    <div className="w-px h-4 bg-gray-200" />
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={excludeApproved} onChange={e => { setExcludeApproved(e.target.checked); if (!e.target.checked && filterStatus === 'approved') setFilterStatus('전체'); }}
                            className="w-4 h-4 accent-letusBlue cursor-pointer" />
                        <span className="text-[13px] font-bold text-gray-500">검수완료 제외</span>
                    </label>
                    <span className="ml-auto text-[13px] text-gray-400">총 {filtered.length}건</span>
                </div>
            </div>

            {/* ━━━ 테이블 ━━━ */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left text-[13px]">
                        <colgroup>
                            <col style={{width:'130px'}} />
                            <col style={{width:'100px'}} />
                            <col style={{width:'72px'}} />
                            <col style={{width:'100px'}} />
                            <col style={{width:'54px'}} />
                            <col style={{width:'100px'}} />
                            <col style={{width:'90px'}} />
                            <col />
                            <col style={{width:'100px'}} />
                            <col style={{width:'88px'}} />
                            <col style={{width:'80px'}} />
                            <col style={{width:'170px'}} />
                        </colgroup>
                        <thead className="bg-slate-50 border-b border-gray-200 text-slate-500 font-bold sticky top-0 z-10">
                            <tr>
                                {[
                                    { label: '신고일시',  key: 'reported_at' },
                                    { label: '장비번호',  key: null },
                                    { label: '센터',      key: null },
                                    { label: '관리주체',  key: null },
                                    { label: '소유',      key: null },
                                    { label: '고장유형',  key: 'fault_type' },
                                    { label: '에러코드',  key: 'error_code' },
                                    { label: '고장내용',  key: null },
                                    { label: '정비업체',  key: 'repair_vendor' },
                                    { label: '완료일',    key: 'completed_at' },
                                    { label: '상태',      key: 'status', center: true },
                                    { label: '처리',      key: null,     center: true },
                                ].map(({ label, key, center }) => (
                                    <th key={label}
                                        className={`px-3 py-2.5 whitespace-nowrap ${center ? 'text-center' : ''} ${key ? 'cursor-pointer select-none hover:text-letusBlue' : ''}`}
                                        onClick={() => key && requestSort(key)}>
                                        {label}{key && sortIcon(key)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {isLoading && (
                                <tr><td colSpan={12} className="text-center py-12 text-gray-400">불러오는 중...</td></tr>
                            )}
                            {!isLoading && filtered.length === 0 && (
                                <tr><td colSpan={12} className="text-center py-12 text-gray-400">
                                    {activeIssues.length === 0 ? '등록된 이슈가 없습니다.' : '조건에 맞는 이슈가 없습니다.'}
                                </td></tr>
                            )}
                            {filtered.map(issue => {
                                const f = forkliftMap[issue.forklift_id];
                                return (
                                    <tr key={issue.id}
                                        className={`hover:bg-blue-50/30 transition-colors ${
                                            issue.status === 'reported' ? 'bg-red-50/30' :
                                            issue.status === 'accepted' ? 'bg-orange-50/20' : ''
                                        }`}>
                                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDt(issue.reported_at)}</td>
                                        <td className="px-3 py-2 font-bold text-letusBlue whitespace-nowrap">{f?.no||'-'}</td>
                                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{f?.center||'-'}</td>
                                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{f?.manager_org||'-'}</td>
                                        <td className="px-3 py-2">
                                            <span className={`text-xs font-bold ${f?.own_type==='자가'?'text-orange-600':'text-letusBlue'}`}>{f?.own_type||'-'}</span>
                                        </td>
                                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{issue.fault_type||'-'}</td>
                                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap font-mono">{issue.error_code||'-'}</td>
                                        <td className="px-3 py-2 text-gray-600 break-keep">{issue.fault_desc}</td>
                                        <td className="px-3 py-2 text-gray-500">{issue.repair_vendor||'-'}</td>
                                        <td className="px-3 py-2 text-gray-500">{fmtDate(issue.completed_at)}</td>
                                        <td className="px-3 py-2 text-center"><StatusBadge status={issue.status} /></td>
                                        <td className="px-3 py-2 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={() => setDetailIssue(issue)}
                                                    className="text-xs font-bold text-gray-500 border border-gray-200 bg-gray-50 rounded px-2 py-0.5 hover:bg-gray-100">
                                                    상세
                                                </button>
                                                <button onClick={() => setEditIssue(issue)}
                                                    className="text-xs font-bold text-amber-600 border border-amber-200 bg-amber-50 rounded px-2 py-0.5 hover:bg-amber-100">
                                                    수정
                                                </button>
                                                {issue.status === 'accepted' && (
                                                    <button onClick={() => setCompleteIssue(issue)}
                                                        className="text-xs font-bold text-blue-600 border border-blue-200 bg-blue-50 rounded px-2 py-0.5 hover:bg-blue-100">
                                                        완료입력
                                                    </button>
                                                )}
                                                {issue.status === 'completed' && (
                                                    <button onClick={() => setApproveIssue(issue)}
                                                        className="text-xs font-bold text-green-600 border border-green-200 bg-green-50 rounded px-2 py-0.5 hover:bg-green-100">
                                                        검수승인
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

            {/* 이슈 등록 모달 */}
            {showForm && !editIssue && (
                <IssueFormModal forklifts={activeForklifts} onSave={handleSaveIssue} onClose={() => setShowForm(false)} userProfile={userProfile} />
            )}

            {/* 이슈 수정 모달 */}
            {editIssue && (
                <IssueFormModal forklifts={activeForklifts} onSave={handleEditSave} onClose={() => setEditIssue(null)} editIssue={editIssue} userProfile={userProfile} />
            )}

            {/* 상세 모달 */}
            {detailIssue && !completeIssue && (
                <DetailModal issue={detailIssue} forklift={forkliftMap[detailIssue.forklift_id]} userProfile={userProfile} onAccept={handleAccept} onClose={() => setDetailIssue(null)} />
            )}

            {/* 정비완료 모달 */}
            {completeIssue && (
                <CompleteModal issue={completeIssue} forklift={forkliftMap[completeIssue.forklift_id]} onSave={handleComplete} onClose={() => setCompleteIssue(null)} />
            )}

            {/* 검수승인 확인 모달 */}
            {approveIssue && (
                <ApproveConfirmModal issue={approveIssue} forklift={forkliftMap[approveIssue.forklift_id]} onConfirm={handleApproveConfirm} onClose={() => setApproveIssue(null)} />
            )}
        </div>
    );
};
