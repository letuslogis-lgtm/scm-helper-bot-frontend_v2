import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { loadXLSX } from './utils.js';
import { supabase } from './supabaseClient.js';

const COLS = [
    { key: 'upload_date',  label: '일자',    w: '100px' },
    { key: 'brand',        label: '브랜드',  w: '90px'  },
    { key: 'vendor',       label: '공급업체', w: '120px' },
    { key: 'item_code',     label: '품목코드',  w: '160px' },
    { key: 'action_status', label: '조치 확인', w: '80px'  },
    { key: 'shortage_qty',  label: '결품수량',  w: '90px'  },
    { key: 'jeju',         label: '제주',    w: '60px'  },
    { key: 'jibang',       label: '지방',    w: '60px'  },
    { key: 'hyunjang',     label: '현장',    w: '60px'  },
    { key: 'gyeongin',     label: '경인',    w: '60px'  },
];

const ACTION_TYPES = ['', '정상 출고', '납기 연기', '당일 출고', '현장 직출', '센터 직출'];

function getWaveCategory(wt, wn) {
    if (!wt) return '';
    if (wt.includes('지방')) return (wn || '').includes('제주') ? '제주' : '지방';
    if (wt.includes('현장')) return '현장';
    if (wt.includes('경인')) return '경인';
    return '';
}

const EXCEL_TO_DB = {
    'WAVE명':      'wave_name',
    'WAVE 타입':   'wave_type',
    '오더번호':    'order_no',
    '오더건명':    'order_name',
    'OWNER':       'brand',
    '유통채널':    'channel',
    '품목ID':      'item_code',
    '제품구분':    'item_category',
    '공급업체명':  'vendor',
    'CUT수량':     'shortage_qty',
    '구분':        'category',
    '피킹여부':    'is_picked',
    '미출여부':    'is_unshipped',
    '조치사항':    'action_note',
    '매출여부':    'is_sales',
    '취소대상여부':'is_cancel',
    '최초 등록자': 'wms_registered_by',
    '최초 등록 일시': 'wms_registered_at',
    '최종 변경자': 'wms_updated_by',
    '최종 변경 일시': 'wms_updated_at',
};

function weekAgo() {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
}
function todayStr() { return new Date().toISOString().split('T')[0]; }

const BRANDS = ['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소'];

const initFilter = () => ({ startDate: weekAgo(), endDate: todayStr(), brands: '전체', searchType: 'item_code', searchValue: '' });

const MultiSelect = ({ label, options, selected, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const toggleOption = (opt) => {
        if (opt === '전체') {
            onChange('전체');
        } else {
            const currentArr = Array.isArray(selected) ? selected : (selected === '전체' ? [] : [selected]);
            const next = currentArr.includes(opt) ? currentArr.filter(s => s !== opt) : [...currentArr, opt];
            onChange(next.length === 0 ? '전체' : next);
        }
    };
    const currentArr = Array.isArray(selected) ? selected : (selected === '전체' ? [] : [selected]);
    return (
        <div className="flex items-center shrink-0">
            <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">{label}</label>
            <div className="relative">
                <div onClick={() => setIsOpen(!isOpen)} className="border border-gray-200 rounded-[3px] bg-white px-2.5 h-[30px] w-32 flex items-center justify-between cursor-pointer hover:border-letusBlue transition-all text-xs">
                    <span className="truncate text-gray-700 font-medium">
                        {currentArr.length === 0 ? '전체' : `${currentArr[0]}${currentArr.length > 1 ? ` 외 ${currentArr.length - 1}` : ''}`}
                    </span>
                    <svg className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                        <div className="absolute top-[105%] left-0 w-40 bg-white border border-gray-200 rounded shadow-xl z-50 py-1.5 max-h-60 overflow-y-auto">
                            <div onClick={() => { toggleOption('전체'); setIsOpen(false); }} className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${currentArr.length === 0 ? 'text-letusBlue font-bold' : 'text-gray-600'}`}>
                                <input type="checkbox" readOnly checked={currentArr.length === 0} className="w-3.5 h-3.5 accent-letusBlue" /> 전체
                            </div>
                            <div className="h-px bg-gray-100 my-1"></div>
                            {options.map(opt => (
                                <div key={opt} onClick={() => toggleOption(opt)} className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${currentArr.includes(opt) ? 'text-letusBlue font-bold bg-blue-50/30' : 'text-gray-600'}`}>
                                    <input type="checkbox" readOnly checked={currentArr.includes(opt)} className="w-3.5 h-3.5 accent-letusBlue" /> {opt}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

function excelDateToStr(val) {
    if (!val) return '';
    if (typeof val === 'string') return val.split('T')[0].slice(0, 10);
    if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return d.toISOString().split('T')[0];
    }
    return '';
}

function excelValToDb(excelKey, val) {
    if (excelKey === 'CUT수량') return val ? parseInt(val, 10) || null : null;
    if (excelKey === '최초 등록 일시' || excelKey === '최종 변경 일시') {
        if (!val) return null;
        if (typeof val === 'number') {
            return new Date(Math.round((val - 25569) * 86400 * 1000)).toISOString();
        }
        return val;
    }
    return val ? String(val) : null;
}

// ── 조치 변경 이력 모달 ───────────────────────────────────────
const ActionLogModal = ({ row, onClose }) => {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const { data, error } = await supabase
                    .from('wms_action_logs')
                    .select('*')
                    .eq('shortage_id', row.id)
                    .order('updated_at', { ascending: false });
                if (error) throw error;
                setLogs(data || []);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLogs();
    }, [row.id]);

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-2xl flex flex-col max-h-[65vh] border border-gray-100 overflow-hidden slide-up">

                {/* 헤더 */}
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full"></span>
                        <h3 className="font-bold text-sm text-gray-800">변경 이력</h3>
                        <span className="text-xs text-gray-400 font-mono">{row.order_no}</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 본문 */}
                <div className="overflow-auto flex-1 custom-scrollbar">
                    {isLoading ? (
                        <div className="py-16 text-center">
                            <div className="w-7 h-7 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin mx-auto"></div>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="py-16 text-center text-gray-400 text-sm font-bold">변경 이력이 없습니다.</div>
                    ) : (
                        <table className="w-full text-[12px] text-left">
                            <thead className="bg-slate-50 border-b text-xs text-slate-500 font-bold sticky top-0">
                                <tr>
                                    <th className="p-3 text-center w-44">수정일시</th>
                                    <th className="p-3 text-center w-24">수정자</th>
                                    <th className="p-3 text-center w-28">조치유형</th>
                                    <th className="p-3 text-center">조치내용</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700">
                                {logs.map((log, i) => (
                                    <tr key={log.id} className={i === 0 ? 'bg-blue-50/40' : 'hover:bg-gray-50/50'}>
                                        <td className="p-3 text-center font-mono text-[11px] text-gray-500">
                                            {log.updated_at ? String(log.updated_at).slice(0, 16).replace('T', ' ') : '-'}
                                        </td>
                                        <td className="p-3 text-center font-bold text-gray-700">{log.updated_by || '-'}</td>
                                        <td className="p-3 text-center">
                                            {log.action_type
                                                ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold">{log.action_type}</span>
                                                : <span className="text-gray-300">-</span>}
                                        </td>
                                        <td className="p-3 text-gray-600">{log.action_detail || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="p-3 border-t bg-gray-50 flex justify-end shrink-0">
                    <button onClick={onClose}
                        className="px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 shadow-sm">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── 조치사항 모달 ──────────────────────────────────────────────
const ActionModal = ({ aggRow, rawRows, userProfile, onClose, onSaved }) => {
    const [localRows, setLocalRows] = useState(() =>
        rawRows.map(r => ({
            id: r.id,
            order_no: r.order_no,
            order_name: r.order_name,
            wave_type: r.wave_type || '',
            wave_name: r.wave_name || '',
            shortage_qty: r.shortage_qty,
            action_type: r.action_type || '',
            action_detail: r.action_detail || '',
            action_updated_by: r.action_updated_by || '',
            action_updated_at: r.action_updated_at || '',
        }))
    );
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkType, setBulkType] = useState('');
    const [bulkDetail, setBulkDetail] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [modalSort, setModalSort] = useState({ key: null, direction: 'none' });
    const [logModal, setLogModal] = useState(null); // row object

    const requestModalSort = (key) => {
        setModalSort(prev => {
            if (prev.key !== key) return { key, direction: 'asc' };
            if (prev.direction === 'asc') return { key, direction: 'desc' };
            return { key: null, direction: 'none' };
        });
    };

    const displayRows = useMemo(() => {
        if (!modalSort.key) return localRows;
        return [...localRows].sort((a, b) => {
            let av = modalSort.key === 'wave_category'
                ? getWaveCategory(a.wave_type, a.wave_name)
                : (a[modalSort.key] ?? '');
            let bv = modalSort.key === 'wave_category'
                ? getWaveCategory(b.wave_type, b.wave_name)
                : (b[modalSort.key] ?? '');
            if (av < bv) return modalSort.direction === 'asc' ? -1 : 1;
            if (av > bv) return modalSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [localRows, modalSort]);

    const handleSelectAll = (e) => {
        setSelectedIds(e.target.checked ? new Set(localRows.map(r => r.id)) : new Set());
    };
    const handleSelectOne = (id) => {
        setSelectedIds(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    };

    const handleBulkApply = () => {
        if (selectedIds.size === 0) return alert('적용할 행을 선택하세요.');
        setLocalRows(prev => prev.map(r =>
            selectedIds.has(r.id) ? { ...r, action_type: bulkType, action_detail: bulkDetail } : r
        ));
    };

    const updateRow = (id, field, value) => {
        setLocalRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const now = new Date().toISOString();
            const userName = userProfile?.name || '';

            // 1) wms_shortage_list 업데이트
            for (const row of localRows) {
                const hasAction = !!(row.action_type || row.action_detail);
                const { error } = await supabase
                    .from('wms_shortage_list')
                    .update({
                        action_type:       row.action_type || null,
                        action_detail:     row.action_detail || null,
                        action_updated_by: hasAction ? userName : null,
                        action_updated_at: hasAction ? now : null,
                    })
                    .eq('id', row.id);
                if (error) throw error;
            }

            // 2) 변경 이력 INSERT (action_type 또는 action_detail이 있는 행만)
            const logRecords = localRows
                .filter(row => row.action_type || row.action_detail)
                .map(row => ({
                    shortage_id:   row.id,
                    action_type:   row.action_type || null,
                    action_detail: row.action_detail || null,
                    updated_by:    userName,
                    updated_at:    now,
                }));
            if (logRecords.length > 0) {
                const { error: logError } = await supabase
                    .from('wms_action_logs')
                    .insert(logRecords);
                if (logError) throw logError;
            }

            alert('저장되었습니다.');
            onSaved();
            onClose();
        } catch (e) {
            console.error(e);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full flex flex-col max-h-[85vh] border border-gray-100 overflow-hidden slide-up" style={{ maxWidth: '77rem' }}>

                {/* 헤더 */}
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full"></span>
                        <h3 className="font-bold text-sm text-gray-800">
                            조치사항 — <span className="text-letusBlue font-mono">{aggRow.item_code}</span>
                        </h3>
                        <span className="text-gray-400 text-xs font-medium">{aggRow.vendor ? `${aggRow.vendor} |` : ''} {aggRow.upload_date}</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 일괄입력 바 */}
                <div className="px-4 py-2.5 border-b bg-blue-50/40 flex items-center gap-3 shrink-0">
                    <span className="text-[11px] font-bold text-gray-600 shrink-0">선택 행 일괄입력</span>
                    <select value={bulkType} onChange={e => setBulkType(e.target.value)}
                        className="border border-gray-200 rounded text-xs px-2 h-7 bg-white text-gray-700 focus:outline-none focus:border-letusBlue cursor-pointer">
                        {ACTION_TYPES.map(t => <option key={t} value={t}>{t || '(미처리)'}</option>)}
                    </select>
                    <input value={bulkDetail} onChange={e => setBulkDetail(e.target.value)}
                        placeholder="조치내용 입력"
                        className="border border-gray-200 rounded text-xs px-2.5 h-7 flex-1 min-w-0 focus:outline-none focus:border-letusBlue" />
                    <button onClick={handleBulkApply}
                        className="bg-letusBlue text-white text-xs font-bold px-3 h-7 rounded hover:bg-blue-700 transition-colors shrink-0">
                        일괄적용
                    </button>
                    {selectedIds.size > 0 && (
                        <span className="text-[11px] text-letusBlue font-bold shrink-0">{selectedIds.size}행 선택됨</span>
                    )}
                </div>

                {/* 테이블 */}
                <div className="overflow-auto flex-1 custom-scrollbar">
                    <table className="w-full text-left text-[12px]">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0">
                            <tr>
                                <th className="p-3 pl-4 w-10 text-center">
                                    <input type="checkbox"
                                        checked={localRows.length > 0 && selectedIds.size === localRows.length}
                                        onChange={handleSelectAll}
                                        className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                                </th>
                                {[
                                    { key: 'order_no',          label: '수주번호', w: '9rem'   },
                                    { key: 'order_name',        label: '수주건명'               },  // flex
                                    { key: 'wave_category',     label: 'WAVE',    w: '6rem'   },
                                    { key: 'shortage_qty',      label: '결품수량', w: '6rem'   },
                                    { key: 'action_type',       label: '조치유형', w: '8rem'   },
                                    { key: 'action_detail',     label: '조치내용', w: '17.6rem'  },
                                    { key: 'action_updated_by', label: '최종수정', w: '7.7rem' },
                                ].map(col => (
                                    <th key={col.key}
                                        className={`p-3 cursor-pointer hover:bg-gray-100 select-none transition-colors text-center ${col.cls ?? ''}`}
                                        style={col.w ? { width: col.w, minWidth: col.w } : {}}
                                        onClick={() => requestModalSort(col.key)}>
                                        <span className="flex items-center gap-1 justify-center">
                                            {col.label}
                                            {modalSort.key === col.key && (
                                                <span className="text-letusBlue font-black">
                                                    {modalSort.direction === 'asc' ? '↑' : '↓'}
                                                </span>
                                            )}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-700">
                            {displayRows.map(row => {
                                const waveLabel = getWaveCategory(row.wave_type, row.wave_name);
                                const waveColor = {
                                    '제주': 'bg-cyan-50 text-cyan-700 border-cyan-200',
                                    '지방': 'bg-purple-50 text-purple-700 border-purple-200',
                                    '현장': 'bg-orange-50 text-orange-700 border-orange-200',
                                    '경인': 'bg-blue-50 text-blue-700 border-blue-200',
                                }[waveLabel] || 'bg-gray-50 text-gray-400 border-gray-200';
                                return (
                                    <tr key={row.id} className={`transition-colors ${selectedIds.has(row.id) ? 'bg-blue-50' : 'hover:bg-gray-50/50'}`}>
                                        <td className="p-3 pl-4 text-center">
                                            <input type="checkbox"
                                                checked={selectedIds.has(row.id)}
                                                onChange={() => handleSelectOne(row.id)}
                                                className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                                        </td>
                                        <td className="p-3 font-mono text-[11px] text-gray-600" style={{ width: '9rem', minWidth: '9rem' }}>{row.order_no || '-'}</td>
                                        <td className="p-3 text-[11px] text-gray-700 truncate" title={row.order_name || ''}>{row.order_name || '-'}</td>
                                        <td className="p-3 text-center" style={{ width: '6rem', minWidth: '6rem' }}>
                                            {waveLabel
                                                ? <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${waveColor}`}>{waveLabel}</span>
                                                : <span className="text-gray-300 text-[10px]">-</span>}
                                        </td>
                                        <td className="p-3 text-right pr-4 font-bold text-letusOrange" style={{ width: '6rem', minWidth: '6rem' }}>{row.shortage_qty ?? '-'}</td>
                                        <td className="p-3" style={{ width: '8rem', minWidth: '8rem' }}>
                                            <select value={row.action_type}
                                                onChange={e => updateRow(row.id, 'action_type', e.target.value)}
                                                className="border border-gray-200 rounded text-[11px] px-1.5 h-6 w-full bg-white text-gray-700 focus:outline-none focus:border-letusBlue cursor-pointer">
                                                {ACTION_TYPES.map(t => <option key={t} value={t}>{t || '(미처리)'}</option>)}
                                            </select>
                                        </td>
                                        <td className="p-3" style={{ width: '17.6rem', minWidth: '17.6rem' }}>
                                            <input value={row.action_detail}
                                                onChange={e => updateRow(row.id, 'action_detail', e.target.value)}
                                                className="border border-gray-200 rounded text-[11px] px-2 h-6 w-full focus:outline-none focus:border-letusBlue"
                                                placeholder="내용 입력" />
                                        </td>
                                        <td className="p-3 text-center" style={{ width: '7.7rem', minWidth: '7.7rem' }}>
                                            {row.action_updated_by ? (
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <span className="text-[11px] font-bold text-gray-700">{row.action_updated_by}</span>
                                                    <button
                                                        onClick={() => setLogModal(row)}
                                                        className="text-gray-400 hover:text-letusBlue transition-colors"
                                                        title="변경 이력 보기">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ) : <span className="text-gray-300 text-[10px]">-</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* 푸터 */}
                <div className="p-3 border-t bg-gray-50 flex justify-between items-center shrink-0">
                    <span className="text-[11px] text-gray-500">총 {localRows.length}건</span>
                    <div className="flex gap-2">
                        <button onClick={onClose}
                            className="px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                            닫기
                        </button>
                        <button onClick={handleSave} disabled={isSaving}
                            className="px-5 py-1.5 bg-letusBlue text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
                            {isSaving ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </div>
            </div>

            {/* 변경 이력 모달 */}
            {logModal && (
                <ActionLogModal row={logModal} onClose={() => setLogModal(null)} />
            )}
        </div>
    );
};

// ── 메인 컴포넌트 ──────────────────────────────────────────────
export const WmsShortageList = ({ userProfile }) => {
    const isAdmin = userProfile?.role === '관리자';

    const [rows, setRows]                   = useState([]);
    const [isLoading, setIsLoading]         = useState(false);
    const [isUploading, setIsUploading]     = useState(false);
    const [draft, setDraft]                 = useState(initFilter());
    const [applied, setApplied]             = useState(initFilter());
    const [sortConfig, setSortConfig]       = useState({ key: null, direction: 'none' });
    const [selectedIds, setSelectedIds]     = useState(new Set());
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [actionModal, setActionModal]     = useState(null); // aggRow
    const fileInputRef = useRef(null);

    const setD = (k, v) => setDraft(p => ({ ...p, [k]: v }));

    const fetchData = useCallback(async (filter) => {
        setIsLoading(true);
        try {
            let q = supabase.from('wms_shortage_list').select('*').order('wms_registered_at', { ascending: false });
            if (filter.startDate) q = q.gte('upload_date', filter.startDate);
            if (filter.endDate)   q = q.lte('upload_date', filter.endDate);
            if (filter.brands && filter.brands !== '전체') {
                const arr = Array.isArray(filter.brands) ? filter.brands : [filter.brands];
                q = q.in('brand', arr);
            }
            if (filter.searchValue) {
                q = q.ilike(filter.searchType, `%${filter.searchValue}%`);
            }
            const { data, error } = await q;
            if (error) throw error;
            setRows((data || []).map((r) => ({ ...r, _rowId: r.id })));
        } catch (e) { console.error(e); alert('데이터 조회 중 오류가 발생했습니다.'); }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchData(applied); }, []);

    const handleSearch = () => {
        const next = { ...draft };
        setApplied(next);
        setSelectedIds(new Set());
        fetchData(next);
    };
    const handleReset = () => {
        const next = initFilter();
        setDraft(next);
        setApplied(next);
        setSelectedIds(new Set());
        fetchData(next);
    };

    const parseFile = async (file) => {
        if (!file) return;
        setIsUploading(true);
        try {
            const XLSX = await loadXLSX();
            const jsonData = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const wb = XLSX.read(e.target.result, { type: 'binary' });
                    resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
                };
                reader.readAsBinaryString(file);
            });

            if (jsonData.length === 0) return alert('데이터가 없습니다.');

            const upload_id = crypto.randomUUID();
            const upload_date = todayStr();
            const uploaded_by = userProfile?.name || '';

            const records = jsonData.map(row => {
                const rec = { upload_id, upload_date, uploaded_by, upload_file: file.name };
                for (const [excelKey, dbKey] of Object.entries(EXCEL_TO_DB)) {
                    rec[dbKey] = excelValToDb(excelKey, row[excelKey]);
                }
                return rec;
            });

            // products 테이블에서 vendor 매칭
            const splitItemCode = (raw) => {
                if (!raw) return { code: '', color: '' };
                const idx = raw.lastIndexOf('-');
                if (idx === -1) return { code: raw, color: '' };
                return { code: raw.slice(0, idx), color: raw.slice(idx + 1) };
            };

            const uniquePairs = [...new Set(records.map(r => {
                const { code, color } = splitItemCode(r.item_code);
                return `${code}||${color}`;
            }))];

            const vendorMap = new Map();
            const PCHUNK = 200;
            for (let i = 0; i < uniquePairs.length; i += PCHUNK) {
                const chunk = uniquePairs.slice(i, i + PCHUNK);
                const codes = [...new Set(chunk.map(p => p.split('||')[0]).filter(Boolean))];
                if (codes.length === 0) continue;
                const { data: products } = await supabase
                    .from('products')
                    .select('item_code, item_color, display_vendor')
                    .in('item_code', codes);
                (products || []).forEach(p => {
                    const resolved = (p.display_vendor || '').trim();
                    if (resolved) vendorMap.set(`${p.item_code}||${(p.item_color || '').trim()}`, resolved);
                });
            }

            records.forEach(r => {
                const { code, color } = splitItemCode(r.item_code);
                const matched = vendorMap.get(`${code}||${color.trim()}`);
                if (matched) r.vendor = matched;
            });

            const CHUNK = 500;
            for (let i = 0; i < records.length; i += CHUNK) {
                const { error } = await supabase.from('wms_shortage_list').insert(records.slice(i, i + CHUNK));
                if (error) throw error;
            }

            alert(`${records.length}건이 업로드되었습니다.`);
            const next = initFilter();
            setDraft(next);
            setApplied(next);
            setSelectedIds(new Set());
            setSortConfig({ key: null, direction: 'none' });
            fetchData(next);
        } catch (e) {
            console.error(e);
            alert('업로드 중 오류가 발생했습니다: ' + (e.message || ''));
        } finally {
            setIsUploading(false);
        }
    };

    const handleFile = (e) => { parseFile(e.target.files[0]); e.target.value = ''; };
    const handleDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f); };

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key) {
            if (sortConfig.direction === 'asc') direction = 'desc';
            else if (sortConfig.direction === 'desc') direction = 'none';
        }
        setSortConfig({ key: direction === 'none' ? null : key, direction });
        setSelectedIds(new Set());
    };

    // 집계: 품목코드 + 업로드 날짜 기준, 제주/지방/현장/경인 qty 합산
    const aggregated = useMemo(() => {
        const map = new Map();
        for (const row of rows) {
            const key = `${row.item_code || '(미등록)'}|${row.upload_date || ''}`;
            if (!map.has(key)) {
                map.set(key, {
                    _rowId:        key,
                    _ids:          [],
                    item_code:     row.item_code,
                    brand:         row.brand,
                    vendor:        row.vendor,
                    upload_date:   row.upload_date,
                    shortage_qty:  0,
                    action_total:  0,
                    action_done:   0,
                    action_status: 'none',
                    jeju:          0,
                    jibang:        0,
                    hyunjang:      0,
                    gyeongin:      0,
                });
            }
            const agg = map.get(key);
            agg._ids.push(row.id);
            const qty = Number(row.shortage_qty) || 0;
            agg.shortage_qty += qty;
            agg.action_total += 1;
            if (row.action_type) agg.action_done += 1;

            const wt = row.wave_type || '';
            const wn = row.wave_name || '';
            if (wt.includes('지방')) {
                // 지방(권역), 지방(센터), 지방(현장), AS(지방) 모두 포함
                if (wn.includes('제주')) agg.jeju += qty;
                else                     agg.jibang += qty;
            } else if (wt.includes('현장')) {
                // 지방(현장)은 위에서 처리됐으므로 여기서는 경인(현장)만 해당
                agg.hyunjang += qty;
            } else if (wt.includes('경인')) {
                // 경인(소액), 경인(센터), 경인(권역), AS(경인)
                agg.gyeongin += qty;
            }
        }
        const result = Array.from(map.values());
        result.forEach(agg => {
            if (agg.action_total > 0 && agg.action_done === agg.action_total) agg.action_status = 'done';
            else if (agg.action_done > 0)                                      agg.action_status = 'partial';
            else                                                                agg.action_status = 'none';
        });
        return result;
    }, [rows]);

    const sorted = useMemo(() => {
        if (!sortConfig.key) return aggregated;
        return [...aggregated].sort((a, b) => {
            const av = a[sortConfig.key] ?? '';
            const bv = b[sortConfig.key] ?? '';
            if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
            if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [aggregated, sortConfig]);

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc'
            ? <span className="ml-1 text-letusBlue font-black">↑</span>
            : <span className="ml-1 text-letusBlue font-black">↓</span>;
    };

    const totalCut = useMemo(() => sorted.reduce((s, r) => s + (Number(r.shortage_qty) || 0), 0), [sorted]);

    const handleSelectAll = (e) => {
        setSelectedIds(e.target.checked ? new Set(sorted.map(r => r._rowId)) : new Set());
        setLastSelectedId(null);
    };
    const handleSelectOne = (e, id, idx) => {
        if (e.nativeEvent.shiftKey && lastSelectedId !== null) {
            const lastIdx = sorted.findIndex(r => r._rowId === lastSelectedId);
            const min = Math.min(lastIdx, idx);
            const max = Math.max(lastIdx, idx);
            setSelectedIds(prev => {
                const s = new Set(prev);
                sorted.slice(min, max + 1).forEach(r => s.add(r._rowId));
                return s;
            });
        } else {
            setSelectedIds(prev => {
                const s = new Set(prev);
                s.has(id) ? s.delete(id) : s.add(id);
                return s;
            });
            setLastSelectedId(id);
        }
    };

    const handleExportExcel = async () => {
        if (selectedIds.size === 0) return alert('항목을 체크해 주세요.');
        const XLSX = await loadXLSX();
        const target = sorted.filter(r => selectedIds.has(r._rowId));
        const excelData = target.map(r => ({
            '일자':    r.upload_date || '',
            '브랜드':  r.brand || '',
            '공급업체': r.vendor || '',
            '품목코드': r.item_code || '',
            '결품수량': r.shortage_qty ?? '',
            '제주':    r.jeju || 0,
            '지방':    r.jibang || 0,
            '현장':    r.hyunjang || 0,
            '경인':    r.gyeongin || 0,
        }));
        const ws = XLSX.utils.json_to_sheet(excelData);
        ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'D-2결품리스트');
        XLSX.writeFile(wb, `D-2결품리스트_${todayStr()}.xlsx`);
    };

    const handleDeleteSelected = async () => {
        if (!isAdmin) return alert('삭제 권한이 없습니다. 관리자에게 문의하세요.');
        if (selectedIds.size === 0) return alert('항목을 체크해 주세요.');
        const dbIds = sorted
            .filter(r => selectedIds.has(r._rowId))
            .flatMap(r => r._ids);
        if (!window.confirm(`선택한 ${selectedIds.size}개 품목(총 ${dbIds.length}건)을 삭제하시겠습니까?\n이 작업은 복구할 수 없습니다.`)) return;
        try {
            const CHUNK = 200;
            for (let i = 0; i < dbIds.length; i += CHUNK) {
                const { error } = await supabase.from('wms_shortage_list').delete().in('id', dbIds.slice(i, i + CHUNK));
                if (error) throw error;
            }
            alert(`${selectedIds.size}개 품목(${dbIds.length}건)이 삭제되었습니다.`);
            setSelectedIds(new Set());
            fetchData(applied);
        } catch (e) {
            console.error(e);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    // 더블클릭 → 조치사항 모달
    const handleRowDoubleClick = (aggRow) => {
        setActionModal(aggRow);
    };

    // 모달에 전달할 raw rows
    const modalRawRows = useMemo(() => {
        if (!actionModal) return [];
        return rows.filter(r =>
            r.item_code === actionModal.item_code &&
            r.upload_date === actionModal.upload_date
        );
    }, [actionModal, rows]);

    const renderCell = (col, row) => {
        if (col.key === 'action_status') {
            if (row.action_status === 'done') {
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">
                        ✓ 완료
                    </span>
                );
            }
            if (row.action_status === 'partial') {
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-50 text-yellow-700 border border-yellow-300">
                        {row.action_done}/{row.action_total}
                    </span>
                );
            }
            return <span className="text-gray-300 text-[11px]">-</span>;
        }
        if (col.key === 'shortage_qty') {
            return <span className="font-bold text-letusOrange">{row[col.key] ?? '-'}</span>;
        }
        if (['jeju', 'jibang', 'hyunjang', 'gyeongin'].includes(col.key)) {
            const v = row[col.key];
            return v ? <span className="font-semibold text-gray-700">{v}</span> : <span className="text-gray-300">-</span>;
        }
        return <span>{row[col.key] ?? '-'}</span>;
    };

    return (
        <div
            className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
        >
            {/* ── 검색 구역 ── */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex items-center z-30 shrink-0">
                <div className="flex items-center gap-5 w-full flex-wrap">

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">조회 기간</label>
                        <div className="flex items-center">
                            <input type="date" value={draft.startDate} onChange={e => setD('startDate', e.target.value)}
                                className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] w-[110px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700" />
                            <span className="mx-1 text-gray-400 text-xs font-bold">~</span>
                            <input type="date" value={draft.endDate} onChange={e => setD('endDate', e.target.value)}
                                className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] w-[110px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700" />
                        </div>
                    </div>

                    <MultiSelect label="브랜드" options={BRANDS} selected={draft.brands} onChange={v => setD('brands', v)} />

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">검색어</label>
                        <div className="flex gap-0 h-[30px]">
                            <select value={draft.searchType} onChange={e => setD('searchType', e.target.value)}
                                className="border border-gray-200 border-r-0 rounded-l-[3px] text-xs px-2 text-gray-700 bg-gray-50 focus:outline-none cursor-pointer h-full">
                                <option value="item_code">품목코드</option>
                                <option value="vendor">공급업체</option>
                            </select>
                            <input type="text" value={draft.searchValue} onChange={e => setD('searchValue', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                placeholder="검색어 입력"
                                className="border border-gray-200 rounded-r-[3px] text-xs px-2.5 w-40 focus:outline-none focus:border-letusOrange h-full" />
                        </div>
                    </div>

                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button onClick={handleReset}
                            className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] text-xs transition-colors">
                            초기화
                        </button>
                        <button onClick={handleSearch}
                            className="bg-letusOrange text-white hover:bg-orange-600 font-bold px-6 h-[30px] rounded-[3px] transition-colors text-xs flex items-center gap-1.5 shadow-sm">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            조회하기
                        </button>
                    </div>
                </div>
            </div>

            {/* ── 액션 바 ── */}
            <div className="flex justify-between w-full px-2 z-30 -mt-1 mb-1 shrink-0">
                <p className="text-[11px] text-gray-400 self-center">
                    💡 행을 <b>더블클릭</b>하면 조치사항을 입력할 수 있습니다
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="bg-white border border-green-600 text-green-600 px-4 py-[7px] rounded-[3px] text-[11px] font-bold flex items-center cursor-pointer hover:bg-green-50 transition-colors shadow-sm h-[32px] disabled:opacity-50 disabled:cursor-not-allowed">
                        <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M21.17 3.25q.33 0 .59.25q.24.26.24.59v15.82q0 .33-.24.59q-.26.25-.59.25H2.83q-.33 0-.59-.25q-.24-.26-.24-.59V4.09q0-.33.24-.59q.26-.25.59-.25h18.34zm-8.25 10.9l3.52 4.67h2.7l-4.9-6.07 4.65-5.94h-2.65l-3.23 4.48-3.32-4.48H7.07l4.76 5.94-5 6.07h2.72l3.37-4.67z" />
                        </svg>
                        {isUploading ? '업로드 중...' : 'WMS 파일 업로드 (Excel)'}
                    </button>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />

                    <div className="relative z-50">
                        <button onClick={() => setIsActionMenuOpen(v => !v)}
                            className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[90px] h-[32px]">
                            선택실행 {selectedIds.size > 0 && `(${selectedIds.size})`}
                            <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {isActionMenuOpen && (
                            <>
                                <div className="fixed inset-0" onClick={() => setIsActionMenuOpen(false)}></div>
                                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">
                                    <button
                                        onClick={() => { setIsActionMenuOpen(false); handleExportExcel(); }}
                                        className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors flex items-center justify-between ${selectedIds.size > 0 ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 cursor-not-allowed'}`}
                                    >
                                        엑셀 추출
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                    </button>
                                    <div className="h-px bg-gray-100 my-1"></div>
                                    <button
                                        onClick={() => { setIsActionMenuOpen(false); handleDeleteSelected(); }}
                                        className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex justify-between items-center ${selectedIds.size > 0 && isAdmin ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}
                                    >
                                        삭제
                                        {selectedIds.size > 0 && isAdmin && <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── 테이블 ── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left whitespace-nowrap text-[13px]">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-6 w-10 text-center">
                                    <input type="checkbox"
                                        checked={sorted.length > 0 && selectedIds.size === sorted.length}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                </th>
                                {COLS.map(c => (
                                    <th key={c.key} style={{ width: c.w, minWidth: c.w }}
                                        className="px-3 py-3 text-center cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                        onClick={() => requestSort(c.key)}>
                                        <div className="flex items-center justify-center">
                                            {c.label}{getSortIcon(c.key)}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-700">
                            {isLoading ? (
                                <tr><td colSpan={COLS.length + 1} className="py-32 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div>
                                        <p className="text-gray-500 font-bold text-[13px]">데이터 조회 중...</p>
                                    </div>
                                </td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={COLS.length + 1} className="py-32 text-center">
                                    <div className="flex flex-col items-center gap-3 text-gray-400">
                                        <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <p className="font-bold text-gray-400">데이터가 없습니다</p>
                                        <p className="text-xs">우측 상단 <span className="text-green-600 font-bold">WMS 파일 업로드</span> 버튼으로 파일을 업로드하세요</p>
                                    </div>
                                </td></tr>
                            ) : (
                                sorted.map((row, i) => {
                                    const checked = selectedIds.has(row._rowId);
                                    return (
                                        <tr
                                            key={row._rowId}
                                            className={`transition-colors cursor-pointer ${checked ? 'bg-blue-50' : 'hover:bg-blue-50/40'}`}
                                            onDoubleClick={() => handleRowDoubleClick(row)}
                                        >
                                            <td className="p-4 pl-6 text-center">
                                                <input type="checkbox" checked={checked}
                                                    onChange={(e) => handleSelectOne(e, row._rowId, i)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                            </td>
                                            {COLS.map(c => (
                                                <td key={c.key} className="px-3 py-2.5 text-center" style={{ width: c.w }}>
                                                    {renderCell(c, row)}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* 하단 요약 */}
                {!isLoading && rows.length > 0 && (
                    <div className="border-t border-gray-100 px-6 py-2 flex items-center gap-4 text-xs text-gray-500 shrink-0">
                        <span>품목 <b className="text-gray-700">{sorted.length.toLocaleString()}</b>종</span>
                        <span>결품합계 <b className="text-letusOrange">{totalCut.toLocaleString()}</b></span>
                    </div>
                )}
            </div>

            {/* ── 조치사항 모달 ── */}
            {actionModal && (
                <ActionModal
                    aggRow={actionModal}
                    rawRows={modalRawRows}
                    userProfile={userProfile}
                    onClose={() => setActionModal(null)}
                    onSaved={() => fetchData(applied)}
                />
            )}
        </div>
    );
};
