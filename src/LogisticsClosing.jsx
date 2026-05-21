import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient.js';
import { loadXLSX } from './utils.js';
import { CloseIcon } from './SharedUI.jsx';
import { processClosingData, generateClosingReport, UPLOAD_TYPES, HARDCODED_TYPES } from './utils/closingUtils.js';

// ─── 업로드 카드 설정 ─────────────────────────────────────────────
const UPLOAD_CARDS = [
    {
        id: 'inbound',
        label: '입고실적',
        source: 'ERP 입고실적등록',
        description: '회사-창고별-입고구분 자료',
        color: 'blue',
    },
    {
        id: 'transfer',
        label: '반출입집계',
        source: 'ERP 사업장별 반출입 일일집계',
        description: '반입집계표 + 반출집계표',
        color: 'indigo',
    },
    {
        id: 'cut_picking',
        label: 'CUT/직송 피킹',
        source: 'WMS 부족컷 CUT LIST (CUT+직송 통합)',
        description: '공장도가 × CUT수량 = 금액',
        color: 'violet',
    },
    {
        id: 'returns',
        label: '반품실적',
        source: 'ERP 반품입고예정정보/실적등록',
        description: '반품금액 자동 계산',
        color: 'rose',
    },
    {
        id: 'parcel',
        label: '택배출고포장',
        source: 'WMS 택배운송계획현황',
        description: '일룸+데스커 총량 취합',
        color: 'orange',
    },
    {
        id: 'outbound_order',
        label: '물류출고금액',
        source: 'ERP 수주내역정보',
        description: '브랜드별 출고금액 집계',
        color: 'amber',
    },
    {
        id: 'wms_wave',
        label: '운송·피킹 실적',
        source: 'WMS ITEM/WAVE별 실적 + PLT 히스토리',
        description: 'WAVE타입별 해당여부 자동 분류',
        color: 'teal',
    },
    {
        id: 'logistics_cost',
        label: '물류비 정산',
        source: '양지3센터 운영 물류비 정산내역',
        description: '시디즈/아코 월 정산 자동 추출',
        color: 'green',
    },
];

const COLOR_MAP = {
    blue:   { border: 'border-blue-200',   bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-400',   icon: 'text-blue-400' },
    indigo: { border: 'border-indigo-200', bg: 'bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-400', icon: 'text-indigo-400' },
    violet: { border: 'border-violet-200', bg: 'bg-violet-50', badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-400', icon: 'text-violet-400' },
    purple: { border: 'border-purple-200', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400', icon: 'text-purple-400' },
    rose:   { border: 'border-rose-200',   bg: 'bg-rose-50',   badge: 'bg-rose-100 text-rose-700',   dot: 'bg-rose-400',   icon: 'text-rose-400' },
    orange: { border: 'border-orange-200', bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400', icon: 'text-orange-400' },
    amber:  { border: 'border-amber-200',  bg: 'bg-amber-50',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-400',  icon: 'text-amber-400' },
    teal:   { border: 'border-teal-200',   bg: 'bg-teal-50',   badge: 'bg-teal-100 text-teal-700',   dot: 'bg-teal-400',   icon: 'text-teal-400' },
    green:  { border: 'border-green-200',  bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700',  dot: 'bg-green-400',  icon: 'text-green-400' },
};

// ─── 유틸 ─────────────────────────────────────────────────────────
const fmtDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const fmtNumber = (n) => (n == null ? '-' : Number(n).toLocaleString());

const today = () => new Date().toISOString().split('T')[0];

// ─── 컬럼 매핑 모달 ────────────────────────────────────────────────
const ColumnMappingModal = ({ uploadType, headers, existingMapping, onSave, onClose }) => {
    const card = UPLOAD_CARDS.find(c => c.id === uploadType);
    const fields = UPLOAD_TYPES[uploadType]?.fields ?? [];
    const [mapping, setMapping] = useState(() => {
        const init = {};
        fields.forEach(f => { init[f.key] = existingMapping?.[f.key] ?? ''; });
        return init;
    });

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-lg flex flex-col max-h-[80vh]">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-bold text-gray-900">컬럼 매핑 설정</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{card?.label} — 엑셀 열 이름을 선택해 주세요</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
                </div>
                <div className="overflow-y-auto flex-1 p-5 space-y-3">
                    {fields.map(f => (
                        <div key={f.key} className="flex items-center gap-3">
                            <label className="w-32 shrink-0 text-xs font-bold text-gray-700">
                                {f.label}
                                {f.required && <span className="text-red-500 ml-0.5">*</span>}
                            </label>
                            <select
                                value={mapping[f.key] ?? ''}
                                onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white"
                            >
                                <option value="">— 선택 안 함 —</option>
                                {headers.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">취소</button>
                    <button
                        onClick={() => onSave(mapping)}
                        className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                        저장 후 처리
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── 업로드 카드 ───────────────────────────────────────────────────
const UploadCard = ({ card, closingDate, uploadState, onFileSelect }) => {
    const c = COLOR_MAP[card.color];
    const state = uploadState[card.id];
    const fileRef = useRef();

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) onFileSelect(card.id, file);
    };

    const statusIcon = () => {
        if (state?.status === 'processing') return (
            <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
        );
        if (state?.status === 'completed') return (
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
        );
        if (state?.status === 'error') return (
            <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        );
        return null;
    };

    return (
        <div
            className={`relative border-2 ${c.border} rounded-xl bg-white overflow-hidden transition-shadow hover:shadow-md`}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
        >
            {/* 상단 컬러 바 */}
            <div className={`h-1 w-full ${c.dot}`} />

            <div className="p-4">
                {/* 헤더 */}
                <div className="flex items-start justify-between mb-2">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                            <span className="text-sm font-bold text-gray-900">{card.label}</span>
                            {statusIcon()}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 ml-4">{card.source}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
                        {state?.status === 'completed' ? `${fmtNumber(state.rowCount)}행` : 'RPA'}
                    </span>
                </div>

                {/* 설명 */}
                <p className="text-[11px] text-gray-500 mb-3 ml-4">{card.description}</p>

                {/* 상태 메시지 */}
                {state?.status === 'processing' && (
                    <p className="text-xs text-blue-600 font-bold mb-2 ml-4">처리 중...</p>
                )}
                {state?.status === 'completed' && (
                    <p className="text-xs text-green-600 font-bold mb-2 ml-4">
                        완료 · {fmtDate(state.uploadedAt)} · {fmtNumber(state.rowCount)}행
                    </p>
                )}
                {state?.status === 'error' && (
                    <p className="text-xs text-red-500 font-bold mb-2 ml-4 truncate" title={state.error}>
                        오류: {state.error}
                    </p>
                )}

                {/* 업로드 드롭존 */}
                <button
                    onClick={() => fileRef.current?.click()}
                    disabled={!closingDate || state?.status === 'processing'}
                    className={`w-full border-2 border-dashed rounded-lg py-3 text-xs font-bold transition-colors
                        ${!closingDate ? 'border-gray-200 text-gray-300 cursor-not-allowed' :
                          state?.status === 'completed' ? 'border-green-200 text-green-500 hover:bg-green-50' :
                          `${c.border} ${c.icon} hover:${c.bg}`}`}
                >
                    {state?.status === 'completed' ? '재업로드' : '엑셀 파일 선택 / 드래그'}
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={e => { if (e.target.files[0]) onFileSelect(card.id, e.target.files[0]); e.target.value = ''; }}
                />
            </div>
        </div>
    );
};

// ─── 집계 테이블 ───────────────────────────────────────────────────
const SummaryTable = ({ summaryData, isLoading }) => {
    if (isLoading) return (
        <div className="flex items-center justify-center py-12">
            <svg className="w-6 h-6 animate-spin text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm text-gray-500">집계 데이터 조회 중...</span>
        </div>
    );

    if (!summaryData.length) return (
        <div className="text-center py-12 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-bold">집계 데이터가 없습니다</p>
            <p className="text-xs mt-1">날짜를 선택하고 엑셀 파일을 업로드해 주세요</p>
        </div>
    );

    // 항목별 그룹핑
    const grouped = summaryData.reduce((acc, row) => {
        const key = row.summary_type;
        if (!acc[key]) acc[key] = { rows: [], totalQty: 0, totalAmt: 0 };
        acc[key].rows.push(row);
        acc[key].totalQty += row.quantity ?? 0;
        acc[key].totalAmt += Number(row.amount ?? 0);
        return acc;
    }, {});

    const TYPE_LABELS = {
        inbound: '입고실적', transfer: '반출입집계', cut_picking: 'CUT 피킹',
        direct_cut: '직송 CUT', returns: '반품실적', parcel: '택배출고',
        outbound_order: '물류출고금액', wms_wave: '운송·피킹 실적',
        logistics_cost: '물류비 정산',
    };

    return (
        <div className="space-y-4">
            {Object.entries(grouped).map(([type, group]) => (
                <div key={type} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-900">{TYPE_LABELS[type] ?? type}</span>
                        <div className="flex gap-4 text-xs text-gray-500">
                            <span>수량 합계: <strong className="text-gray-900">{fmtNumber(group.totalQty)}</strong></span>
                            <span>금액 합계: <strong className="text-gray-900">₩{fmtNumber(group.totalAmt)}</strong></span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50">
                                <tr>
                                    {['브랜드', '회사', '창고', '입고구분/WAVE타입', '수량', '금액(₩)'].map(h => (
                                        <th key={h} className="px-3 py-2 text-left font-bold text-gray-600 border-b">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {group.rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-gray-50 border-b border-gray-100">
                                        <td className="px-3 py-2 font-medium text-gray-900">{row.brand ?? '-'}</td>
                                        <td className="px-3 py-2 text-gray-600">{row.company ?? '-'}</td>
                                        <td className="px-3 py-2 text-gray-600">{row.warehouse ?? '-'}</td>
                                        <td className="px-3 py-2 text-gray-600">{row.inbound_type ?? row.wave_type ?? '-'}</td>
                                        <td className="px-3 py-2 text-right font-medium">{fmtNumber(row.quantity)}</td>
                                        <td className="px-3 py-2 text-right font-medium text-blue-700">{fmtNumber(row.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
};

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────
export const LogisticsClosing = () => {
    const [tab, setTab] = useState('daily');           // 'daily' | 'monthly'
    const [closingDate, setClosingDate] = useState(today());
    const [closingMonth, setClosingMonth] = useState(today().slice(0, 7)); // YYYY-MM
    const [uploadState, setUploadState] = useState({});
    const [summaryData, setSummaryData] = useState([]);
    const [isSummaryLoading, setIsSummaryLoading] = useState(false);

    // 컬럼 매핑 모달
    const [mappingModal, setMappingModal] = useState(null); // { uploadType, file, headers }
    const [savedMappings, setSavedMappings] = useState({});  // uploadType → mapping obj

    // 날짜 변경 시 집계 재조회
    const effectiveDate = tab === 'daily' ? closingDate : (closingMonth + '-01');
    const periodType = tab === 'daily' ? 'daily' : 'monthly';

    const fetchSummary = useCallback(async () => {
        if (!effectiveDate) return;
        setIsSummaryLoading(true);
        try {
            const { data, error } = await supabase
                .from('closing_summary')
                .select('*')
                .eq('period_type', periodType)
                .eq('period_date', effectiveDate)
                .order('summary_type');
            if (error) throw error;
            setSummaryData(data ?? []);
        } catch (err) {
            console.error('집계 조회 오류:', err);
        } finally {
            setIsSummaryLoading(false);
        }
    }, [effectiveDate, periodType]);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);

    // 업로드 이력 조회
    const fetchUploadState = useCallback(async () => {
        if (!closingDate) return;
        try {
            const { data } = await supabase
                .from('closing_uploads')
                .select('upload_type, status, row_count, created_at, error_message')
                .eq('closing_date', closingDate)
                .order('created_at', { ascending: false });
            if (!data) return;
            const stateMap = {};
            data.forEach(u => {
                if (!stateMap[u.upload_type]) {
                    stateMap[u.upload_type] = {
                        status: u.status,
                        rowCount: u.row_count,
                        uploadedAt: u.created_at,
                        error: u.error_message,
                    };
                }
            });
            setUploadState(stateMap);
        } catch (err) {
            console.error('업로드 이력 조회 오류:', err);
        }
    }, [closingDate]);

    useEffect(() => { fetchUploadState(); }, [fetchUploadState]);

    // 컬럼 매핑 DB 조회
    const fetchMappings = useCallback(async () => {
        try {
            const { data } = await supabase
                .from('closing_config')
                .select('upload_type, config_value')
                .eq('config_type', 'column_mapping');
            if (!data) return;
            const m = {};
            data.forEach(r => { m[r.upload_type] = r.config_value; });
            setSavedMappings(m);
        } catch (err) {
            console.error('매핑 조회 오류:', err);
        }
    }, []);

    useEffect(() => { fetchMappings(); }, [fetchMappings]);

    // ── 파일 선택 처리 ──
    const handleFileSelect = async (uploadType, file) => {
        const buffer = await file.arrayBuffer();
        const XLSX = await loadXLSX();
        const wb = XLSX.read(buffer, { type: 'array' });

        if (HARDCODED_TYPES.has(uploadType)) {
            // 자동 파싱 타입: 컬럼 매핑 모달 없이 바로 처리
            await processUpload(uploadType, file, null, null, wb);
        } else {
            // 수동 매핑 타입 (transfer, parcel)
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });
            if (!rawData.length) return alert('파일에 데이터가 없습니다.');
            const headers = Object.keys(rawData[0]);
            if (savedMappings[uploadType]) {
                await processUpload(uploadType, file, rawData, savedMappings[uploadType], null);
            } else {
                setMappingModal({ uploadType, file, rawData, headers });
            }
        }
    };

    // ── 매핑 저장 후 처리 ──
    const handleMappingSave = async (mapping) => {
        const { uploadType, rawData } = mappingModal;
        setMappingModal(null);
        try {
            await supabase.from('closing_config').upsert({
                config_type: 'column_mapping', upload_type: uploadType,
                company: null, warehouse: null, config_key: 'default',
                config_value: mapping, description: `${uploadType} 컬럼 매핑`,
            }, { onConflict: 'config_type,upload_type,company,warehouse,config_key' });
            setSavedMappings(prev => ({ ...prev, [uploadType]: mapping }));
        } catch (err) { console.error('매핑 저장 오류:', err); }
        await processUpload(uploadType, mappingModal.file, rawData, mapping, null);
    };

    // ── 실제 업로드 및 처리 ──
    const processUpload = async (uploadType, file, rawData, mapping, workbook) => {
        setUploadState(prev => ({ ...prev, [uploadType]: { status: 'processing' } }));

        const effectiveDate = tab === 'daily' ? closingDate : (closingMonth + '-01');

        // 1. uploads 레코드 생성 (row_count는 처리 후 갱신)
        let uploadId;
        try {
            const { data: uploadRow, error } = await supabase
                .from('closing_uploads')
                .insert({
                    upload_type: uploadType,
                    file_name: file.name,
                    closing_date: effectiveDate,
                    status: 'processing',
                    row_count: 0,
                })
                .select('id')
                .single();
            if (error) throw error;
            uploadId = uploadRow.id;
        } catch (err) {
            setUploadState(prev => ({ ...prev, [uploadType]: { status: 'error', error: err.message } }));
            return;
        }

        // 2. 데이터 가공
        try {
            const processed = await processClosingData({
                uploadType,
                workbook,
                rawData,
                mapping,
                closingDate: effectiveDate,
                uploadId,
                supabase,
            });

            // 3. raw_data 저장 (청크)
            const CHUNK = 500;
            for (let i = 0; i < processed.rawRows.length; i += CHUNK) {
                const { error } = await supabase.from('closing_raw_data').insert(processed.rawRows.slice(i, i + CHUNK));
                if (error) throw error;
            }

            // 4. summary UPSERT
            if (processed.summaryRows.length) {
                for (let i = 0; i < processed.summaryRows.length; i += CHUNK) {
                    const { error } = await supabase.from('closing_summary').upsert(
                        processed.summaryRows.slice(i, i + CHUNK),
                        { onConflict: 'period_type,period_date,summary_type,company,warehouse,brand,inbound_type,wave_type' }
                    );
                    if (error) throw error;
                }
            }

            // 5. 완료 처리
            const totalRows = processed.rawRows.length;
            await supabase.from('closing_uploads').update({ status: 'completed', row_count: totalRows }).eq('id', uploadId);

            const completedState = { status: 'completed', rowCount: totalRows, uploadedAt: new Date().toISOString() };
            setUploadState(prev => {
                const next = { ...prev, [uploadType]: completedState };
                // cut_picking은 direct_cut 카드도 함께 완료 표시
                if (uploadType === 'cut_picking') {
                    const directRows = processed.rawRows.filter(r => r.upload_type === 'direct_cut').length;
                    next.direct_cut = { status: 'completed', rowCount: directRows, uploadedAt: new Date().toISOString() };
                }
                return next;
            });
            fetchSummary();
        } catch (err) {
            await supabase.from('closing_uploads').update({ status: 'error', error_message: err.message }).eq('id', uploadId);
            setUploadState(prev => ({ ...prev, [uploadType]: { status: 'error', error: err.message } }));
        }
    };

    // ── 보고서 엑셀 다운로드 ──
    const handleDownloadReport = async () => {
        try {
            await generateClosingReport({
                periodType,
                periodDate: effectiveDate,
                summaryData,
                supabase,
            });
        } catch (err) {
            alert('보고서 생성 오류: ' + err.message);
        }
    };

    const completedCount = UPLOAD_CARDS.filter(c => uploadState[c.id]?.status === 'completed').length;

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            {/* 페이지 헤더 */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">물류 마감 자동화</h1>
                    <p className="text-sm text-gray-500 mt-0.5">RPA 엑셀 업로드 → 자동 집계 · 분류 → 보고서 생성</p>
                </div>
                <button
                    onClick={handleDownloadReport}
                    disabled={!summaryData.length}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    보고서 엑셀 다운로드
                </button>
            </div>

            {/* 탭 + 날짜 선택 */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap items-center gap-4">
                {/* 탭 */}
                <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                    {[['daily', '일마감'], ['monthly', '월마감']].map(([v, l]) => (
                        <button
                            key={v}
                            onClick={() => setTab(v)}
                            className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${tab === v ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {l}
                        </button>
                    ))}
                </div>

                {/* 날짜 선택 */}
                {tab === 'daily' ? (
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-600">마감일자</label>
                        <input
                            type="date"
                            value={closingDate}
                            onChange={e => setClosingDate(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                        />
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-600">마감월</label>
                        <input
                            type="month"
                            value={closingMonth}
                            onChange={e => setClosingMonth(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                        />
                    </div>
                )}

                {/* 진행 현황 */}
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex gap-1">
                        {UPLOAD_CARDS.map(c => (
                            <div
                                key={c.id}
                                title={c.label}
                                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                                    uploadState[c.id]?.status === 'completed' ? 'bg-green-400' :
                                    uploadState[c.id]?.status === 'processing' ? 'bg-blue-400 animate-pulse' :
                                    uploadState[c.id]?.status === 'error' ? 'bg-red-400' :
                                    'bg-gray-200'
                                }`}
                            />
                        ))}
                    </div>
                    <span className="text-xs text-gray-500 font-medium">
                        {completedCount}/{UPLOAD_CARDS.length} 완료
                    </span>
                </div>
            </div>

            {/* 업로드 카드 그리드 */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                {UPLOAD_CARDS.map(card => (
                    <UploadCard
                        key={card.id}
                        card={card}
                        closingDate={tab === 'daily' ? closingDate : closingMonth}
                        uploadState={uploadState}
                        onFileSelect={handleFileSelect}
                    />
                ))}
            </div>

            {/* 집계 결과 */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-sm">집계 결과</span>
                    <button
                        onClick={fetchSummary}
                        className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        새로고침
                    </button>
                </div>
                <div className="p-4">
                    <SummaryTable summaryData={summaryData} isLoading={isSummaryLoading} />
                </div>
            </div>

            {/* 컬럼 매핑 모달 */}
            {mappingModal && (
                <ColumnMappingModal
                    uploadType={mappingModal.uploadType}
                    headers={mappingModal.headers}
                    existingMapping={savedMappings[mappingModal.uploadType]}
                    onSave={handleMappingSave}
                    onClose={() => setMappingModal(null)}
                />
            )}
        </div>
    );
};
