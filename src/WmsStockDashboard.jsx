import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { supabase } from './supabaseClient.js';

const WAREHOUSE_ORDER = ['양지1물류센터', '양지2물류센터', '양지3물류센터', '안성물류센터', '평택물류센터'];
const PIE_COLORS = ['#2563ab', '#38a169', '#d69e2e', '#e53e3e', '#805ad5', '#319795', '#c05621', '#3182ce'];

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
    { label: '화주명', key: 'company_name', w: 140 },
    { label: 'SKU 수', key: 'item_count', w: 90 },
    { label: '재고수량', key: 'stock_qty', w: 110 },
    { label: '재고금액', key: 'stock_amount', w: 130 },
    { label: '이상값', key: 'anomaly_count', w: 80 },
];

export function WmsStockDashboard({ userProfile }) {
    const [snapshots, setSnapshots]         = useState([]);
    const [availableDates, setAvailableDates] = useState([]);
    const [selectedDate, setSelectedDate]   = useState('');
    const [isLoading, setIsLoading]         = useState(true);
    const [error, setError]                 = useState(null);

    // 컬럼 드래그/리사이즈
    const [colOrder, setColOrder]   = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths] = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const [sortKey, setSortKey]     = useState('warehouse_name');
    const [sortAsc, setSortAsc]     = useState(true);
    const resizingRef   = useRef(null);
    const dragSrcRef    = useRef(null);
    const wasDraggedRef = useRef(false);

    const LS_KEY = userProfile?.id ? `letus_wms_stock_col_${userProfile.id}` : null;

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

    // 날짜 목록 로드
    const loadDates = useCallback(async () => {
        const { data, error: err } = await supabase
            .from('wms_stock_snapshots')
            .select('snapshot_date')
            .order('snapshot_date', { ascending: false })
            .limit(30);
        if (err) { setError(err.message); return; }
        const dates = [...new Set((data || []).map(r => r.snapshot_date))];
        setAvailableDates(dates);
        if (dates.length > 0) setSelectedDate(dates[0]);
    }, []);

    useEffect(() => { loadDates(); }, [loadDates]);

    // 선택 날짜 데이터 로드
    useEffect(() => {
        if (!selectedDate) return;
        setIsLoading(true);
        setError(null);
        supabase
            .from('wms_stock_snapshots')
            .select('*')
            .eq('snapshot_date', selectedDate)
            .order('warehouse_name')
            .then(({ data, error: err }) => {
                if (err) { setError(err.message); setIsLoading(false); return; }
                setSnapshots(data || []);
                setIsLoading(false);
            });
    }, [selectedDate]);

    // 요약 카드 계산
    const summary = React.useMemo(() => {
        const normal = snapshots.filter(r => r.anomaly_count === 0 || r.stock_amount > 0);
        return {
            totalAmt:     snapshots.reduce((s, r) => s + (r.stock_amount || 0), 0),
            totalQty:     snapshots.reduce((s, r) => s + (r.stock_qty || 0), 0),
            totalSkus:    snapshots.reduce((s, r) => s + (r.item_count || 0), 0),
            totalAnomalies: snapshots.reduce((s, r) => s + (r.anomaly_count || 0), 0),
            totalUnpriced: snapshots.reduce((s, r) => s + (r.unpriced_count || 0), 0),
            warehouseCnt: new Set(snapshots.map(r => r.warehouse_id)).size,
            companyCnt:   new Set(snapshots.map(r => r.company_id)).size,
        };
    }, [snapshots]);

    // 창고별 막대 차트 데이터
    const barData = React.useMemo(() => {
        const wmap = {};
        snapshots.forEach(r => {
            if (!wmap[r.warehouse_name]) wmap[r.warehouse_name] = 0;
            wmap[r.warehouse_name] += r.stock_amount || 0;
        });
        return WAREHOUSE_ORDER
            .filter(w => wmap[w] !== undefined)
            .map(w => ({ name: w.replace('물류센터', ''), amount: wmap[w] }));
    }, [snapshots]);

    // 회사별 파이 차트 데이터 (상위 7개 + 기타)
    const pieData = React.useMemo(() => {
        const cmap = {};
        snapshots.forEach(r => {
            const key = r.company_name || r.company_id;
            if (!cmap[key]) cmap[key] = 0;
            cmap[key] += r.stock_amount || 0;
        });
        const sorted = Object.entries(cmap).sort((a, b) => b[1] - a[1]);
        if (sorted.length <= 8) return sorted.map(([name, value]) => ({ name, value }));
        const top7 = sorted.slice(0, 7).map(([name, value]) => ({ name, value }));
        const etc  = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
        return [...top7, { name: '기타', value: etc }];
    }, [snapshots]);

    // 정렬된 테이블 행
    const sortedRows = React.useMemo(() => {
        return [...snapshots].sort((a, b) => {
            const av = a[sortKey] ?? '';
            const bv = b[sortKey] ?? '';
            if (typeof av === 'number') return sortAsc ? av - bv : bv - av;
            return sortAsc
                ? String(av).localeCompare(String(bv), 'ko')
                : String(bv).localeCompare(String(av), 'ko');
        });
    }, [snapshots, sortKey, sortAsc]);

    const requestSort = (key) => {
        if (sortKey === key) setSortAsc(prev => !prev);
        else { setSortKey(key); setSortAsc(true); }
    };

    const getSortIcon = (key) => {
        if (sortKey !== key) return <span className="text-gray-300 ml-0.5">↕</span>;
        return <span className="text-letusBlue font-black ml-0.5">{sortAsc ? '↑' : '↓'}</span>;
    };

    // 컬럼 리사이즈
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
    const handleDragStart = (e, vi) => { dragSrcRef.current = vi; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver  = (e, vi) => { e.preventDefault(); setDragOverIdx(vi); };
    const handleDrop      = (e, vi) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === vi) return;
        wasDraggedRef.current = true;
        const newOrder = [...colOrder]; const [m] = newOrder.splice(dragSrcRef.current, 1); newOrder.splice(vi, 0, m);
        setColOrder(newOrder); dragSrcRef.current = null;
    };
    const handleDragEnd   = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };
    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS.map(c => c.w));
        if (LS_KEY) localStorage.removeItem(LS_KEY);
    };

    const renderCell = (origIdx, row) => {
        const col = DEFAULT_COLUMNS[origIdx];
        const cls = 'border-b border-gray-100 text-center whitespace-nowrap';
        switch (col.key) {
            case 'warehouse_name': return <td key={origIdx} className={`${cls} p-3 font-semibold text-letusBlue`}>{row.warehouse_name}</td>;
            case 'company_id':    return <td key={origIdx} className={`${cls} p-3 text-gray-500`}>{row.company_id}</td>;
            case 'company_name':  return <td key={origIdx} className={`${cls} p-3 font-medium`}>{row.company_name}</td>;
            case 'item_count':    return <td key={origIdx} className={`${cls} p-3`}>{fmt(row.item_count)}</td>;
            case 'stock_qty':     return <td key={origIdx} className={`${cls} p-3`}>{fmt(row.stock_qty)}</td>;
            case 'stock_amount':  return <td key={origIdx} className={`${cls} p-3 font-bold text-letusBlue`}>{fmt(row.stock_amount)}원</td>;
            case 'anomaly_count': return (
                <td key={origIdx} className={`${cls} p-3`}>
                    {row.anomaly_count > 0
                        ? <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">{row.anomaly_count}건</span>
                        : <span className="text-gray-300">-</span>}
                </td>
            );
            default: return <td key={origIdx} className={cls} />;
        }
    };

    const CustomBarTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
                <p className="font-bold text-gray-700 mb-1">{label}</p>
                <p className="text-letusBlue font-bold">{fmt(payload[0].value)}원</p>
            </div>
        );
    };

    const CustomPieTooltip = ({ active, payload }) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
                <p className="font-bold text-gray-700">{payload[0].name}</p>
                <p className="text-letusBlue font-bold">{fmt(payload[0].value)}원</p>
                <p className="text-gray-400">{payload[0].payload.percent ? `${(payload[0].payload.percent * 100).toFixed(1)}%` : ''}</p>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* 헤더 */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-lg font-bold text-gray-800">창고별 재고보유현황</h1>
                    <p className="text-xs text-gray-400 mt-0.5">WMS 자동 수집 | 공장도가 기준 재고금액</p>
                </div>
                <div className="flex items-center gap-3">
                    {availableDates.length > 0 && (
                        <select
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-letusBlue/30"
                        >
                            {availableDates.map(d => (
                                <option key={d} value={d}>{d} 기준</option>
                            ))}
                        </select>
                    )}
                    <button
                        onClick={loadDates}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-letusBlue rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        새로고침
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-5">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                        데이터 로드 실패: {error}
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-gray-400 font-bold">데이터 불러오는 중...</div>
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
                        {/* 요약 카드 */}
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
                                <h3 className="text-sm font-bold text-gray-600 mb-4">창고별 재고금액 현황</h3>
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={barData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 100000000).toFixed(0)}억`} />
                                        <Tooltip content={<CustomBarTooltip />} />
                                        <Bar dataKey="amount" fill="#2563ab" radius={[4, 4, 0, 0]} name="재고금액" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 화주별 파이 차트 */}
                            <div className="xl:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                                <h3 className="text-sm font-bold text-gray-600 mb-4">화주별 재고금액 비중</h3>
                                <ResponsiveContainer width="100%" height={240}>
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
                                        >
                                            {pieData.map((_, i) => (
                                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomPieTooltip />} />
                                        <Legend
                                            formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
                                            wrapperStyle={{ fontSize: '11px' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 상세 테이블 */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                                <h3 className="text-sm font-bold text-gray-600">
                                    창고×화주 상세 ({snapshots.length}건)
                                </h3>
                                <button onClick={resetColSettings}
                                    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[30px] hover:bg-gray-50 transition-colors"
                                    title="컬럼 초기화">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    칼럼 초기화
                                </button>
                            </div>
                            <div className="overflow-auto">
                                <table className="w-full text-left whitespace-nowrap table-fixed text-sm">
                                    <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            {colOrder.map((origIdx, visualIdx) => {
                                                const col = DEFAULT_COLUMNS[origIdx];
                                                return (
                                                    <th key={origIdx}
                                                        className={`relative p-4 text-center select-none transition-colors ${col.key ? 'hover:bg-gray-100 cursor-pointer' : ''} ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                                                        style={{ width: colWidths[origIdx] }}
                                                        onClick={() => !wasDraggedRef.current && col.key && requestSort(col.key)}
                                                        onDragOver={(e) => handleDragOver(e, visualIdx)}
                                                        onDrop={(e) => handleDrop(e, visualIdx)}
                                                        onDragLeave={() => setDragOverIdx(null)}
                                                    >
                                                        <div className="flex items-center justify-center gap-1">
                                                            <span
                                                                draggable
                                                                onDragStart={(e) => handleDragStart(e, visualIdx)}
                                                                onDragEnd={handleDragEnd}
                                                                onClick={e => e.stopPropagation()}
                                                                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 text-base leading-none"
                                                                title="드래그로 순서 변경">⠿</span>
                                                            {col.label}
                                                            {col.key && getSortIcon(col.key)}
                                                        </div>
                                                        <div
                                                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                                            onMouseDown={(e) => handleResizeStart(e, visualIdx)}
                                                            onClick={e => e.stopPropagation()}
                                                        />
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={colOrder.length} className="text-center text-gray-400 py-12">
                                                    데이터가 없습니다
                                                </td>
                                            </tr>
                                        ) : sortedRows.map((row, i) => (
                                            <tr key={`${row.warehouse_id}-${row.company_id}-${i}`}
                                                className="hover:bg-blue-50/30 transition-colors">
                                                {colOrder.map(origIdx => renderCell(origIdx, row))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
