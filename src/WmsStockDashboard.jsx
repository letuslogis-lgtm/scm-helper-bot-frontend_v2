import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { supabase } from './supabaseClient.js';
import { DateRangeInput } from './SharedUI.jsx';

const WAREHOUSE_ORDER = ['양지1물류센터', '양지2물류센터', '양지3물류센터', '안성물류센터', '평택물류센터'];
const PIE_COLORS = ['#2563ab', '#38a169', '#d69e2e', '#e53e3e', '#805ad5', '#319795', '#c05621', '#3182ce'];

const CustomBarTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
            <p className="font-bold text-gray-700 mb-1">{label}</p>
            <p className="text-letusBlue font-bold">{(payload[0].value ?? 0).toLocaleString('ko-KR')}원</p>
        </div>
    );
};

const CustomPieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
            <p className="font-bold text-gray-700">{payload[0].name}</p>
            <p className="text-letusBlue font-bold">{(payload[0].value ?? 0).toLocaleString('ko-KR')}원</p>
            {payload[0].percent != null && (
                <p className="text-gray-400">{(payload[0].percent * 100).toFixed(1)}%</p>
            )}
        </div>
    );
};

const fmt = (n) => (n ?? 0).toLocaleString('ko-KR');
const fmtAmt = (n) => {
    if (!n || n === 0) return '0원';
    if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억원`;
    if (n >= 1_0000) return `${(n / 1_0000).toFixed(0)}만원`;
    return `${n.toLocaleString('ko-KR')}원`;
};

const DEFAULT_COLUMNS = [
    { label: '창고명', key: 'warehouse_name', w: 140 },
    { label: '화주 코드', key: 'company_id', w: 110 },
    { label: '화주명', key: 'brand', w: 140 },
    { label: 'SKU 수', key: 'item_count', w: 90 },
    { label: '재고수량', key: 'stock_qty', w: 110 },
    { label: '재고금액', key: 'stock_amount', w: 130 },
    { label: '이상값', key: 'anomaly_count', w: 80 },
];

const DEFAULT_COLUMNS_DETAIL = [
    { label: '창고명', key: 'warehouse_name', w: 140 },
    { label: '품목코드', key: 'item_code', w: 130 },
    { label: '화주명', key: 'brand', w: 140 },
    { label: 'LOCATION', key: 'location', w: 120 },
    { label: '재고수량', key: 'stock_qty', w: 110 },
    { label: '공장도가', key: 'factory_price', w: 120 },
    { label: '재고금액', key: 'stock_amount', w: 130 },
];

export function WmsStockDashboard({ userProfile }) {
    const [snapshots, setSnapshots]           = useState([]);
    const [availableDates, setAvailableDates] = useState([]);
    const [selectedDate, setSelectedDate]     = useState('');
    const [isLoading, setIsLoading]           = useState(true);
    const [error, setError]                   = useState(null);

    // 탭
    const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'detail'

    // 요약 테이블 컬럼
    const [colOrder, setColOrder]       = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths]     = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const [sortKey, setSortKey]         = useState('warehouse_name');
    const [sortAsc, setSortAsc]         = useState(true);
    const resizingRef   = useRef(null);
    const dragSrcRef    = useRef(null);
    const wasDraggedRef = useRef(false);

    // 상세 품목 테이블
    const [detailData, setDetailData]               = useState([]);
    const [isDetailLoading, setIsDetailLoading]     = useState(false);
    const [selectedDetailIds, setSelectedDetailIds] = useState([]);
    const [detailColOrder, setDetailColOrder]       = useState(DEFAULT_COLUMNS_DETAIL.map((_, i) => i));
    const [detailColWidths, setDetailColWidths]     = useState(DEFAULT_COLUMNS_DETAIL.map(c => c.w));
    const [detailDragOverIdx, setDetailDragOverIdx] = useState(null);
    const [detailSortKey, setDetailSortKey]         = useState('warehouse_name');
    const [detailSortAsc, setDetailSortAsc]         = useState(true);
    const detailResizingRef   = useRef(null);
    const detailDragSrcRef    = useRef(null);
    const detailWasDraggedRef = useRef(false);

    // 멀티 필터 (복수 선택)
    const [selectedWarehouses, setSelectedWarehouses] = useState([]);
    const [selectedCompanies, setSelectedCompanies]   = useState([]);

    // 날짜 필터
    const [filterType, setFilterType] = useState('D');
    const getTodayStr = () => {
        const d = new Date();
        const pad = n => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const [customDate, setCustomDate] = useState({ start: getTodayStr(), end: getTodayStr() });

    const getFilterDates = () => {
        const now = new Date();
        const pad = n => n.toString().padStart(2, '0');
        const format = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        if (filterType === 'D') {
            const today = format(now);
            return { startDate: today, endDate: today, label: '당일 기준' };
        } else if (filterType === 'W') {
            const day = now.getDay();
            const monday = new Date(now);
            monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return { startDate: format(monday), endDate: format(sunday), label: '이번 주 기준' };
        } else if (filterType === 'M') {
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { startDate: format(first), endDate: format(last), label: '이번 달 기준' };
        } else {
            return { startDate: customDate.start, endDate: customDate.end, label: '직접 지정' };
        }
    };
    const { startDate, endDate, label: filterLabel } = getFilterDates();

    const LS_KEY        = userProfile?.id ? `letus_wms_stock_col_${userProfile.id}` : null;
    const LS_KEY_DETAIL = userProfile?.id ? `letus_wms_stock_detail_col_${userProfile.id}` : null;

    useEffect(() => {
        if (!LS_KEY) return;
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY));
            if (saved?.order?.length === DEFAULT_COLUMNS.length) setColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS.length) setColWidths(saved.widths);
        } catch {}
    }, [LS_KEY]);
    useEffect(() => {
        if (!LS_KEY) return;
        localStorage.setItem(LS_KEY, JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths, LS_KEY]);

    useEffect(() => {
        if (!LS_KEY_DETAIL) return;
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY_DETAIL));
            if (saved?.order?.length === DEFAULT_COLUMNS_DETAIL.length) setDetailColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS_DETAIL.length) setDetailColWidths(saved.widths);
        } catch {}
    }, [LS_KEY_DETAIL]);
    useEffect(() => {
        if (!LS_KEY_DETAIL) return;
        localStorage.setItem(LS_KEY_DETAIL, JSON.stringify({ order: detailColOrder, widths: detailColWidths }));
    }, [detailColOrder, detailColWidths, LS_KEY_DETAIL]);

    // 날짜 목록 로드
    const loadDates = useCallback(async () => {
        const { data, error: err } = await supabase
            .from('wms_stock_summary')
            .select('snapshot_date')
            .order('snapshot_date', { ascending: false })
            .limit(90);
        if (err) { setError(err.message); setIsLoading(false); return; }
        const dates = [...new Set((data || []).map(r => r.snapshot_date))];
        setAvailableDates(dates);
        setSelectedWarehouses([]);
        setSelectedCompanies([]);
    }, []);

    useEffect(() => { loadDates(); }, [loadDates]);

    const periodDates = React.useMemo(() =>
        availableDates.filter(d => d >= startDate && d <= endDate),
        [availableDates, startDate, endDate]
    );

    useEffect(() => {
        if (periodDates.length > 0) setSelectedDate(periodDates[0]);
        else { setSelectedDate(''); setSnapshots([]); setIsLoading(false); }
    }, [periodDates]);

    useEffect(() => {
        if (!selectedDate) return;
        setIsLoading(true);
        setError(null);
        supabase
            .from('wms_stock_summary')
            .select('*')
            .eq('snapshot_date', selectedDate)
            .order('warehouse_name')
            .then(({ data, error: err }) => {
                if (err) { setError(err.message); setIsLoading(false); return; }
                setSnapshots(data || []);
                setIsLoading(false);
            });
    }, [selectedDate]);

    // 상세 품목 데이터 로드
    useEffect(() => {
        if (activeTab !== 'detail' || !selectedDate) return;
        setIsDetailLoading(true);
        let query = supabase
            .from('wms_stock_snapshots')
            .select('warehouse_name, item_code, brand, location, stock_qty, factory_price, stock_amount')
            .eq('snapshot_date', selectedDate)
            .order('warehouse_name');
        if (selectedWarehouses.length > 0) query = query.in('warehouse_name', selectedWarehouses);
        if (selectedCompanies.length > 0)  query = query.in('brand', selectedCompanies);
        query.then(({ data, error: err }) => {
            setDetailData(err ? [] : (data || []));
            setIsDetailLoading(false);
        });
    }, [activeTab, selectedDate, selectedWarehouses, selectedCompanies]);

    const summary = React.useMemo(() => ({
        totalAmt:       snapshots.reduce((s, r) => s + (r.stock_amount || 0), 0),
        totalQty:       snapshots.reduce((s, r) => s + (r.stock_qty || 0), 0),
        totalSkus:      snapshots.reduce((s, r) => s + (r.item_count || 0), 0),
        totalAnomalies: snapshots.reduce((s, r) => s + (r.anomaly_count || 0), 0),
        totalUnpriced:  snapshots.reduce((s, r) => s + (r.unpriced_count || 0), 0),
        warehouseCnt:   new Set(snapshots.map(r => r.warehouse_id)).size,
        companyCnt:     new Set(snapshots.map(r => r.company_id)).size,
    }), [snapshots]);

    const barData = React.useMemo(() => {
        const wmap = {};
        snapshots.forEach(r => {
            if (!wmap[r.warehouse_name]) wmap[r.warehouse_name] = 0;
            wmap[r.warehouse_name] += r.stock_amount || 0;
        });
        return WAREHOUSE_ORDER.filter(w => wmap[w] !== undefined)
            .map(w => ({ name: w.replace('물류센터', ''), fullName: w, amount: wmap[w] }));
    }, [snapshots]);

    const pieData = React.useMemo(() => {
        const cmap = {};
        snapshots.forEach(r => {
            const key = r.brand || r.company_id;
            if (!cmap[key]) cmap[key] = 0;
            cmap[key] += r.stock_amount || 0;
        });
        const sorted = Object.entries(cmap).sort((a, b) => b[1] - a[1]);
        if (sorted.length <= 8) return sorted.map(([name, value]) => ({ name, value }));
        const top7 = sorted.slice(0, 7).map(([name, value]) => ({ name, value }));
        const etc  = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
        return [...top7, { name: '기타', value: etc }];
    }, [snapshots]);

    const filteredRows = React.useMemo(() => {
        const sorted = [...snapshots].sort((a, b) => {
            const av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
            if (typeof av === 'number') return sortAsc ? av - bv : bv - av;
            return sortAsc ? String(av).localeCompare(String(bv), 'ko') : String(bv).localeCompare(String(av), 'ko');
        });
        return sorted.filter(row => {
            if (selectedWarehouses.length > 0 && !selectedWarehouses.includes(row.warehouse_name)) return false;
            if (selectedCompanies.length > 0 && !selectedCompanies.includes(row.brand || row.company_id)) return false;
            return true;
        });
    }, [snapshots, sortKey, sortAsc, selectedWarehouses, selectedCompanies]);

    const sortedDetail = React.useMemo(() => {
        return [...detailData].sort((a, b) => {
            const av = a[detailSortKey] ?? '', bv = b[detailSortKey] ?? '';
            if (typeof av === 'number') return detailSortAsc ? av - bv : bv - av;
            return detailSortAsc ? String(av).localeCompare(String(bv), 'ko') : String(bv).localeCompare(String(av), 'ko');
        });
    }, [detailData, detailSortKey, detailSortAsc]);

    const requestSort       = (key) => { if (sortKey === key) setSortAsc(p => !p); else { setSortKey(key); setSortAsc(true); } };
    const requestDetailSort = (key) => { if (detailSortKey === key) setDetailSortAsc(p => !p); else { setDetailSortKey(key); setDetailSortAsc(true); } };
    const getSortIcon = (key, sk, sa) => sk !== key ? null : <span className="text-letusBlue font-black ml-0.5">{sa ? '↑' : '↓'}</span>;

    // 멀티 필터 토글
    const toggleWarehouse = (name) => setSelectedWarehouses(prev => prev.includes(name) ? prev.filter(w => w !== name) : [...prev, name]);
    const toggleCompany   = (name) => setSelectedCompanies(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);

    // 요약 테이블 핸들러
    const handleResizeStart = (e, vi) => {
        e.preventDefault(); e.stopPropagation();
        const oi = colOrder[vi];
        resizingRef.current = { oi, startX: e.clientX, startW: colWidths[oi] };
        const onMove = (ev) => { const { oi: o, startX, startW } = resizingRef.current; setColWidths(prev => { const n = [...prev]; n[o] = Math.max(50, startW + (ev.clientX - startX)); return n; }); };
        const onUp = () => { resizingRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    };
    const handleDragStart = (e, vi) => { dragSrcRef.current = vi; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver  = (e, vi) => { e.preventDefault(); setDragOverIdx(vi); };
    const handleDrop      = (e, vi) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === vi) return;
        wasDraggedRef.current = true;
        const no = [...colOrder]; const [m] = no.splice(dragSrcRef.current, 1); no.splice(vi, 0, m);
        setColOrder(no); dragSrcRef.current = null;
    };
    const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };
    const resetColSettings = () => { setColOrder(DEFAULT_COLUMNS.map((_, i) => i)); setColWidths(DEFAULT_COLUMNS.map(c => c.w)); if (LS_KEY) localStorage.removeItem(LS_KEY); };

    // 상세 테이블 핸들러
    const handleDetailResizeStart = (e, vi) => {
        e.preventDefault(); e.stopPropagation();
        const oi = detailColOrder[vi];
        detailResizingRef.current = { oi, startX: e.clientX, startW: detailColWidths[oi] };
        const onMove = (ev) => { const { oi: o, startX, startW } = detailResizingRef.current; setDetailColWidths(prev => { const n = [...prev]; n[o] = Math.max(50, startW + (ev.clientX - startX)); return n; }); };
        const onUp = () => { detailResizingRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    };
    const handleDetailDragStart = (e, vi) => { detailDragSrcRef.current = vi; detailWasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDetailDragOver  = (e, vi) => { e.preventDefault(); setDetailDragOverIdx(vi); };
    const handleDetailDrop      = (e, vi) => {
        e.preventDefault(); setDetailDragOverIdx(null);
        if (detailDragSrcRef.current === null || detailDragSrcRef.current === vi) return;
        detailWasDraggedRef.current = true;
        const no = [...detailColOrder]; const [m] = no.splice(detailDragSrcRef.current, 1); no.splice(vi, 0, m);
        setDetailColOrder(no); detailDragSrcRef.current = null;
    };
    const handleDetailDragEnd = () => { setDetailDragOverIdx(null); setTimeout(() => { detailWasDraggedRef.current = false; }, 50); };
    const resetDetailColSettings = () => { setDetailColOrder(DEFAULT_COLUMNS_DETAIL.map((_, i) => i)); setDetailColWidths(DEFAULT_COLUMNS_DETAIL.map(c => c.w)); if (LS_KEY_DETAIL) localStorage.removeItem(LS_KEY_DETAIL); };

    // 체크박스 (상세)
    const handleSelectAllDetail = () => setSelectedDetailIds(prev => prev.length === sortedDetail.length && sortedDetail.length > 0 ? [] : sortedDetail.map((_, i) => i));
    const handleSelectOneDetail = (i) => setSelectedDetailIds(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);

    const renderCell = (origIdx, row) => {
        const col = DEFAULT_COLUMNS[origIdx];
        const cls = 'border-b border-gray-100 text-center whitespace-nowrap';
        switch (col.key) {
            case 'warehouse_name': return <td key={origIdx} className={`${cls} p-4 font-semibold text-letusBlue`}>{row.warehouse_name}</td>;
            case 'company_id':     return <td key={origIdx} className={`${cls} p-4 text-gray-500`}>{row.company_id}</td>;
            case 'brand':          return <td key={origIdx} className={`${cls} p-4 font-medium`}>{row.brand || row.company_id || '-'}</td>;
            case 'item_count':     return <td key={origIdx} className={`${cls} p-4`}>{fmt(row.item_count)}</td>;
            case 'stock_qty':      return <td key={origIdx} className={`${cls} p-4`}>{fmt(row.stock_qty)}</td>;
            case 'stock_amount':   return <td key={origIdx} className={`${cls} p-4 font-bold text-letusBlue`}>{fmt(row.stock_amount)}원</td>;
            case 'anomaly_count':  return (
                <td key={origIdx} className={`${cls} p-4`}>
                    {row.anomaly_count > 0
                        ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">{row.anomaly_count}건</span>
                        : <span className="text-gray-300">-</span>}
                </td>
            );
            default: return <td key={origIdx} className={cls} />;
        }
    };

    const renderDetailCell = (origIdx, row, i) => {
        const col = DEFAULT_COLUMNS_DETAIL[origIdx];
        const cls = 'border-b border-gray-100 text-center whitespace-nowrap';
        switch (col.key) {
            case 'warehouse_name': return <td key={origIdx} className={`${cls} p-4 font-semibold text-letusBlue`}>{row.warehouse_name}</td>;
            case 'item_code':      return <td key={origIdx} className={`${cls} p-4 font-mono text-xs`}>{row.item_code}</td>;
            case 'brand':          return <td key={origIdx} className={`${cls} p-4 font-medium`}>{row.brand || '-'}</td>;
            case 'location':       return <td key={origIdx} className={`${cls} p-4 text-gray-500`}>{row.location || '-'}</td>;
            case 'stock_qty':      return <td key={origIdx} className={`${cls} p-4`}>{fmt(row.stock_qty)}</td>;
            case 'factory_price':  return <td key={origIdx} className={`${cls} p-4`}>{row.factory_price ? fmt(row.factory_price) + '원' : <span className="text-gray-300">미등록</span>}</td>;
            case 'stock_amount':   return <td key={origIdx} className={`${cls} p-4 font-bold text-letusBlue`}>{fmt(row.stock_amount)}원</td>;
            default: return <td key={origIdx} className={cls} />;
        }
    };

    const hasFilter = selectedWarehouses.length > 0 || selectedCompanies.length > 0;

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="flex-1 overflow-auto p-6 space-y-5">
                {/* 날짜 필터 카드 */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 px-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-wrap">
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-bold text-gray-700">창고별 재고보유현황</span>
                                    <span className="text-xs font-bold text-letusBlue bg-letusBlue/10 px-2 py-0.5 rounded-full">{filterLabel}</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    조회 기간: {startDate} ~ {endDate}
                                    {periodDates.length > 0 ? ` · ${periodDates.length}개 스냅샷` : ' · 수집 데이터 없음'}
                                </p>
                            </div>
                            {periodDates.length > 1 && (
                                <select
                                    value={selectedDate}
                                    onChange={e => { setSelectedDate(e.target.value); setSelectedWarehouses([]); setSelectedCompanies([]); }}
                                    className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-letusBlue/30"
                                >
                                    {periodDates.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            )}
                            {hasFilter && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {selectedWarehouses.map(w => (
                                        <span key={w} className="flex items-center gap-1 text-xs font-bold bg-letusBlue/10 text-letusBlue px-2.5 py-1 rounded-full">
                                            {w} <button onClick={() => toggleWarehouse(w)} className="hover:text-blue-800 leading-none">×</button>
                                        </span>
                                    ))}
                                    {selectedCompanies.map(c => (
                                        <span key={c} className="flex items-center gap-1 text-xs font-bold bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full">
                                            {c} <button onClick={() => toggleCompany(c)} className="hover:text-indigo-800 leading-none">×</button>
                                        </span>
                                    ))}
                                    <button onClick={() => { setSelectedWarehouses([]); setSelectedCompanies([]); }}
                                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors">전체 초기화</button>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {filterType === 'CUSTOM' && (
                                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 shadow-sm">
                                    <DateRangeInput
                                        startDate={customDate.start}
                                        endDate={customDate.end}
                                        onStartChange={v => setCustomDate(prev => ({ ...prev, start: v }))}
                                        onEndChange={v => setCustomDate(prev => ({ ...prev, end: v }))}
                                    />
                                </div>
                            )}
                            <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                {[{ id: 'D', name: '당일' }, { id: 'W', name: '주간' }, { id: 'M', name: '월간' }, { id: 'CUSTOM', name: '직접지정' }].map(btn => (
                                    <button key={btn.id} onClick={() => setFilterType(btn.id)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filterType === btn.id ? 'bg-white text-letusBlue shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}
                                    >{btn.name}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                        데이터 로드 실패: {error}
                    </div>
                )}

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 animate-pulse">
                        <svg className="w-8 h-8 text-letusBlue mb-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <p className="text-gray-500 font-bold text-sm tracking-tight">데이터를 불러오는 중입니다...</p>
                    </div>
                ) : snapshots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <p className="font-bold">수집된 데이터가 없습니다</p>
                        <p className="text-xs mt-1">RPA(wms_stock_report.py)를 실행하여 데이터를 수집하세요</p>
                    </div>
                ) : (
                    <>
                        {/* KPI 카드 */}
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                            {[
                                { label: '총 재고금액', value: fmtAmt(summary.totalAmt), sub: '공장도가 기준', color: 'border-b-letusBlue' },
                                { label: '총 재고수량', value: `${fmt(summary.totalQty)}개`, sub: '이상값 제외', color: 'border-b-green-500' },
                                { label: '총 SKU 수', value: `${fmt(summary.totalSkus)}종`, sub: '이상값 제외', color: 'border-b-indigo-400' },
                                { label: '관리 창고', value: `${summary.warehouseCnt}개`, sub: '물류센터', color: 'border-b-gray-400' },
                                { label: '거래 화주', value: `${summary.companyCnt}개사`, sub: '화주사', color: 'border-b-gray-400' },
                                { label: '이상값', value: `${fmt(summary.totalAnomalies)}건`, sub: '수량 10,000↑', color: summary.totalAnomalies > 0 ? 'border-b-orange-500' : 'border-b-gray-300' },
                                { label: '단가 미등록', value: `${fmt(summary.totalUnpriced)}종`, sub: '금액 0원 처리', color: summary.totalUnpriced > 0 ? 'border-b-yellow-500' : 'border-b-gray-300' },
                            ].map((card, i) => (
                                <div key={i} className={`bg-white rounded-xl p-5 shadow-sm border border-slate-200 border-b-4 ${card.color} hover:shadow-md transition-shadow flex flex-col justify-between`}>
                                    <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                                    <p className="text-lg font-bold text-gray-800 leading-tight">{card.value}</p>
                                    <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                                </div>
                            ))}
                        </div>

                        {/* 차트 영역 */}
                        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                            {/* 창고별 막대 차트 */}
                            <div className="xl:col-span-3 bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                                <h3 className="text-sm font-bold text-gray-600 mb-1">창고별 재고금액 현황</h3>
                                <p className="text-xs text-gray-400 mb-4">클릭하여 창고 필터링 (복수 선택 가능)</p>
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={barData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 100000000).toFixed(0)}억`} />
                                        <Tooltip content={<CustomBarTooltip />} />
                                        <Bar dataKey="amount" radius={[4, 4, 0, 0]} name="재고금액" style={{ cursor: 'pointer' }}
                                            onClick={(data) => toggleWarehouse(data.fullName)}
                                        >
                                            {barData.map((entry, i) => (
                                                <Cell key={i} fill={selectedWarehouses.length === 0 || selectedWarehouses.includes(entry.fullName) ? '#2563ab' : '#cbd5e1'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 화주별 파이 차트 */}
                            <div className="xl:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                                <h3 className="text-sm font-bold text-gray-600 mb-1">화주별 재고금액 비중</h3>
                                <p className="text-xs text-gray-400 mb-4">클릭하여 화주 필터링 (복수 선택 가능)</p>
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={90}
                                            dataKey="value"
                                            paddingAngle={4}
                                            cornerRadius={8}
                                            stroke="none"
                                            style={{ cursor: 'pointer' }}
                                            onClick={(data) => toggleCompany(data.name)}
                                        >
                                            {pieData.map((entry, i) => (
                                                <Cell key={i} fill={selectedCompanies.length === 0 || selectedCompanies.includes(entry.name) ? PIE_COLORS[i % PIE_COLORS.length] : '#e2e8f0'} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomPieTooltip />} />
                                        <Legend formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} wrapperStyle={{ fontSize: '11px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 테이블 영역 */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                    {[{ id: 'summary', label: '창고×화주 상세' }, { id: 'detail', label: '상세 품목 정보' }].map(tab => (
                                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === tab.id ? 'bg-letusBlue text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
                                        >{tab.label}</button>
                                    ))}
                                    <span className="text-xs text-gray-400">
                                        {activeTab === 'summary'
                                            ? `${filteredRows.length}건${hasFilter ? ' · 필터 적용 중' : ''}`
                                            : `${sortedDetail.length}건`}
                                    </span>
                                </div>
                                <button onClick={activeTab === 'summary' ? resetColSettings : resetDetailColSettings}
                                    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                                    title="컬럼 초기화">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    칼럼 초기화
                                </button>
                            </div>

                            {/* 창고×화주 요약 탭 */}
                            {activeTab === 'summary' && (
                                <div className="overflow-auto">
                                    <table className="w-full text-left whitespace-nowrap table-fixed text-sm">
                                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                                            <tr>
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
                                                                {col.label}{col.key && getSortIcon(col.key, sortKey, sortAsc)}
                                                            </div>
                                                            <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                                                onMouseDown={(e) => handleResizeStart(e, visualIdx)} onClick={e => e.stopPropagation()} />
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRows.length === 0
                                                ? <tr><td colSpan={colOrder.length} className="text-center text-gray-400 py-12">데이터가 없습니다</td></tr>
                                                : filteredRows.map((row, i) => (
                                                    <tr key={`${row.warehouse_id}-${row.company_id}-${i}`} className="hover:bg-blue-50/30 transition-colors">
                                                        {colOrder.map(origIdx => renderCell(origIdx, row))}
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* 상세 품목 탭 */}
                            {activeTab === 'detail' && (
                                <div className="overflow-auto">
                                    {isDetailLoading ? (
                                        <div className="flex flex-col items-center justify-center h-48 animate-pulse">
                                            <svg className="w-8 h-8 text-letusBlue mb-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            <p className="text-gray-500 font-bold text-sm">데이터를 불러오는 중입니다...</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-left whitespace-nowrap table-fixed text-sm">
                                            <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                                                <tr>
                                                    <th className="p-4 pl-6 w-10 text-center shrink-0">
                                                        <input type="checkbox"
                                                            checked={selectedDetailIds.length === sortedDetail.length && sortedDetail.length > 0}
                                                            onChange={handleSelectAllDetail}
                                                            className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                                    </th>
                                                    {detailColOrder.map((origIdx, visualIdx) => {
                                                        const col = DEFAULT_COLUMNS_DETAIL[origIdx];
                                                        return (
                                                            <th key={origIdx}
                                                                className={`relative p-4 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${detailDragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                                                                style={{ width: detailColWidths[origIdx] }}
                                                                draggable
                                                                onClick={() => !detailWasDraggedRef.current && col.key && requestDetailSort(col.key)}
                                                                onDragStart={(e) => handleDetailDragStart(e, visualIdx)}
                                                                onDragEnd={handleDetailDragEnd}
                                                                onDragOver={(e) => handleDetailDragOver(e, visualIdx)}
                                                                onDrop={(e) => handleDetailDrop(e, visualIdx)}
                                                                onDragLeave={() => setDetailDragOverIdx(null)}
                                                            >
                                                                <div className="flex items-center justify-center gap-1">
                                                                    {col.label}{col.key && getSortIcon(col.key, detailSortKey, detailSortAsc)}
                                                                </div>
                                                                <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                                                    onMouseDown={(e) => handleDetailResizeStart(e, visualIdx)} onClick={e => e.stopPropagation()} />
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedDetail.length === 0
                                                    ? <tr><td colSpan={detailColOrder.length + 1} className="text-center text-gray-400 py-12">데이터가 없습니다</td></tr>
                                                    : sortedDetail.map((row, i) => (
                                                        <tr key={i}
                                                            className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedDetailIds.includes(i) ? 'bg-blue-50' : ''}`}
                                                            onClick={() => handleSelectOneDetail(i)}>
                                                            <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                                                <input type="checkbox"
                                                                    checked={selectedDetailIds.includes(i)}
                                                                    onChange={() => handleSelectOneDetail(i)}
                                                                    className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                                            </td>
                                                            {detailColOrder.map(origIdx => renderDetailCell(origIdx, row, i))}
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
