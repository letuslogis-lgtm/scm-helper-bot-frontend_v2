import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { TableSkeleton, CATEGORY_COLORS, BRAND_COLORS, StatusBadge, CategoryBadge } from './SharedUI.jsx';



// SharedUI에서 가져옴

// --- 대시보드 (Dashboard) ---
const Dashboard = ({ onNavigateToList, onDrillDown, issues = [], isLoading = false, onReload }) => {
    const [selectedBrands, setSelectedBrands] = useState([]);
    const [shortageData, setShortageData] = useState([]);

    // 🔥 1. 날짜 필터 상태 (기본값: 'W' 주간)
    const [filterType, setFilterType] = useState('W'); // 'D', 'W', 'M', 'CUSTOM'

    // 🔥 2. 오늘 날짜 구하기 (YYYY-MM-DD 폼)
    const getTodayStr = () => {
        const d = new Date();
        const pad = n => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    const [customDate, setCustomDate] = useState({ start: getTodayStr(), end: getTodayStr() });

    // 🔥 3. 버튼에 따른 날짜 계산 로직
    const getFilterDates = () => {
        const now = new Date();
        const pad = n => n.toString().padStart(2, '0');
        const format = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        if (filterType === 'D') {
            // 당일
            const today = format(now);
            return { startDate: today, endDate: today, label: '당일 기준' };
        }
        else if (filterType === 'W') {
            // 해당 주 (월요일 ~ 일요일)
            const day = now.getDay();
            const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1); // 일요일(0)이면 -6일, 아니면 월요일로 맞춤
            const monday = new Date(now);
            monday.setDate(diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return { startDate: format(monday), endDate: format(sunday), label: '이번 주 기준' };
        }
        else if (filterType === 'M') {
            // 해당 월 (1일 ~ 말일)
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0); // 다음 달의 0번째 날 = 이번 달 말일
            return { startDate: format(firstDay), endDate: format(lastDay), label: '이번 달 기준' };
        }
        else {
            // 사용자 지정
            return { startDate: customDate.start, endDate: customDate.end, label: '사용자 지정 기간' };
        }
    };

    const { startDate, endDate, label } = getFilterDates();

    useEffect(() => {
        const fetchShortage = async () => {
            const { data } = await supabase
                .from('wms_shortage_list')
                .select('item_code, brand, vendor, shortage_qty')
                .gte('upload_date', startDate)
                .lte('upload_date', endDate);
            setShortageData(data || []);
        };
        fetchShortage();
    }, [startDate, endDate]);

    // 결품 KPI 계산
    const shortageKpi = useMemo(() => {
        const itemSet = new Set(shortageData.map(r => r.item_code).filter(Boolean));
        const totalQty = shortageData.reduce((s, r) => s + (Number(r.shortage_qty) || 0), 0);

        const brandQty = {};
        const vendorQty = {};
        shortageData.forEach(r => {
            if (r.brand) brandQty[r.brand] = (brandQty[r.brand] || 0) + (Number(r.shortage_qty) || 0);
            if (r.vendor) vendorQty[r.vendor] = (vendorQty[r.vendor] || 0) + (Number(r.shortage_qty) || 0);
        });
        const topBrand = Object.entries(brandQty).sort((a, b) => b[1] - a[1])[0];
        const topVendor = Object.entries(vendorQty).sort((a, b) => b[1] - a[1])[0];

        return {
            itemCount: itemSet.size,
            totalQty,
            topBrand: topBrand ? topBrand[0] : '-',
            topBrandQty: topBrand ? topBrand[1] : 0,
            topVendor: topVendor ? topVendor[0] : '-',
            topVendorQty: topVendor ? topVendor[1] : 0,
        };
    }, [shortageData]);

    const toggleBrand = (brand) => {
        if (selectedBrands.includes(brand)) {
            setSelectedBrands(selectedBrands.filter(b => b !== brand));
        } else {
            if (selectedBrands.length >= 6) return;
            setSelectedBrands([...selectedBrands, brand]);
        }
    };

    // 🔥 선택된 기간으로 전체 데이터 필터링 (글로벌 필터 적용)
    const dashboardIssues = issues.filter(issue => {
        if (!issue.created_at) return false;
        const issueDate = issue.created_at.split('T')[0];
        return issueDate >= startDate && issueDate <= endDate;
    });

    const displayBrands = ['퍼시스', '일룸', '시디즈', '슬로우베드', '알로소', '데스커'];

    // 브랜드별 결품 총수량
    const brandShortageQty = useMemo(() => {
        const map = {};
        shortageData.forEach(r => {
            if (r.brand) map[r.brand] = (map[r.brand] || 0) + (Number(r.shortage_qty) || 0);
        });
        return map;
    }, [shortageData]);

    const brandStatsDetails = displayBrands.reduce((acc, brand) => {
        acc[brand] = { pending: 0, processing: 0, completed: 0 };
        return acc;
    }, {});

    dashboardIssues.forEach(issue => {
        if (brandStatsDetails[issue.brand]) {
            if (issue.status === '조치대기') brandStatsDetails[issue.brand].pending += 1;
            if (issue.status === '처리 중') brandStatsDetails[issue.brand].processing += 1;
            if (issue.status === '조치완료') brandStatsDetails[issue.brand].completed += 1;
        }
    });

    const targetIssues = selectedBrands.length > 0
        ? dashboardIssues.filter(issue => selectedBrands.includes(issue.brand))
        : dashboardIssues;

    // 파이 차트 (특이사항 유형)
    const chartStats = {};
    targetIssues.forEach(issue => {
        const type = issue.issue_type || '기타';
        chartStats[type] = (chartStats[type] || 0) + 1;
    });

    const totalIssues = Object.values(chartStats).reduce((a, b) => a + b, 0);
    const pieData = totalIssues === 0
        ? [{ name: '데이터 없음', value: 1, isEmpty: true }]
        : Object.entries(chartStats).map(([k, v]) => ({ name: k, value: v }));

    // 바 차트 (공급업체)
    const supplierStats = {};
    targetIssues.forEach(issue => {
        const vendor = issue.vendor || issue.brand || '미상';
        supplierStats[vendor] = (supplierStats[vendor] || 0) + 1;
    });

    const supplierTotal = Object.values(supplierStats).reduce((a, b) => a + b, 0);
    const sortedSuppliers = Object.entries(supplierStats).sort((a, b) => b[1] - a[1]);

    return (
        <div className="p-6 space-y-6 slide-up">

            {/* ── D-2 결품 KPI 카드 ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: '결품 품목 수', value: shortageKpi.itemCount.toLocaleString(), unit: '종', color: 'text-letusBlue' },
                    { label: '결품 총수량',  value: shortageKpi.totalQty.toLocaleString(),  unit: '개', color: 'text-letusOrange' },
                    { label: 'Top 브랜드',   value: shortageKpi.topBrand,  sub: shortageKpi.topBrandQty > 0 ? `${shortageKpi.topBrandQty.toLocaleString()}개` : null, color: 'text-gray-800' },
                    { label: 'Top 공급업체', value: shortageKpi.topVendor, sub: shortageKpi.topVendorQty > 0 ? `${shortageKpi.topVendorQty.toLocaleString()}개` : null, color: 'text-gray-800' },
                ].map(card => (
                    <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4 hover:shadow-md transition-shadow">
                        <p className="text-[11px] font-bold text-gray-400 mb-1.5">D-2 결품 · {card.label}</p>
                        <div className="flex items-end gap-1.5">
                            <span className={`text-2xl font-black leading-none ${card.color}`}>{card.value || '-'}</span>
                            {card.unit && <span className="text-xs text-gray-400 font-semibold mb-0.5">{card.unit}</span>}
                            {card.sub && <span className="text-xs text-gray-400 font-semibold mb-0.5 ml-1">({card.sub})</span>}
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 px-5 hover:shadow-md transition-shadow shrink-0">
                {/* 🔥 마스터 날짜 필터 컨트롤러 영역 */}
                <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-3 gap-3">
                    <div>
                        <h3 className="text-base font-bold text-gray-900 font-sans flex items-center gap-2">
                            브랜드별 특이사항 처리 현황
                            <span className="bg-blue-50 text-letusBlue text-[10px] px-2 py-0.5 rounded border border-blue-100 font-black">{label}</span>
                        </h3>
                        <p className="text-xs text-gray-400 font-medium mt-1.5">조회 기간: {startDate} ~ {endDate}</p>
                    </div>

                    {/* 글로벌 날짜 토글 버튼 */}
                    <div className="flex items-center gap-2">
                        {/* 사용자 지정 시 나타나는 달력 폼 */}
                        {filterType === 'CUSTOM' && (
                            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 animate-fade-in shadow-sm">
                                <input type="date" value={customDate.start} onChange={e => setCustomDate({ ...customDate, start: e.target.value })} className="bg-transparent text-xs text-gray-700 font-bold focus:outline-none cursor-pointer px-1 w-[110px]" />
                                <span className="text-gray-400 text-xs mx-1">~</span>
                                <input type="date" value={customDate.end} onChange={e => setCustomDate({ ...customDate, end: e.target.value })} className="bg-transparent text-xs text-gray-700 font-bold focus:outline-none cursor-pointer px-1 w-[110px]" />
                            </div>
                        )}

                        {/* D, W, M, 사용자지정 세그먼트 컨트롤 */}
                        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner">
                            {[
                                { id: 'D', name: '당일' },
                                { id: 'W', name: '주간' },
                                { id: 'M', name: '월간' },
                                { id: 'CUSTOM', name: '직접지정' }
                            ].map(btn => (
                                <button
                                    key={btn.id}
                                    onClick={() => setFilterType(btn.id)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filterType === btn.id ? 'bg-white text-letusBlue shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    {btn.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {displayBrands.map(brand => {
                        const stats = brandStatsDetails[brand];
                        const isSelected = selectedBrands.includes(brand);
                        return (
                            <div
                                key={brand}
                                onClick={() => toggleBrand(brand)}
                                className={`rounded-xl border text-sm cursor-pointer transition-all overflow-hidden flex items-stretch ${isSelected
                                    ? 'border-orange-400 shadow-sm ring-1 ring-orange-400/50'
                                    : 'border-gray-100 hover:border-gray-200'
                                    }`}
                            >
                                {/* 브랜드명 */}
                                <div className={`px-4 py-2.5 flex items-center font-bold tracking-tight whitespace-nowrap truncate ${isSelected ? 'bg-orange-50 text-orange-700' : 'bg-gray-50/60 text-gray-800'}`} style={{ width: '22%' }}>
                                    {brand}
                                </div>

                                {/* 특이사항 현황 */}
                                <div className="flex items-center flex-1 border-l border-gray-200 bg-white">
                                    <div className="flex justify-between items-center px-3 py-2.5 border-r border-gray-100 flex-1">
                                        <span className="text-gray-400 font-medium whitespace-nowrap text-xs">조치대기</span>
                                        <span className="text-red-500 font-bold text-sm cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); onDrillDown({ brand, status: '조치대기', startDate, endDate }); }}>{stats.pending}</span>
                                    </div>
                                    <div className="flex justify-between items-center px-3 py-2.5 border-r border-gray-100 flex-1">
                                        <span className="text-gray-400 font-medium whitespace-nowrap text-xs">처리 중</span>
                                        <span className="text-yellow-500 font-bold text-sm cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); onDrillDown({ brand, status: '처리 중', startDate, endDate }); }}>{stats.processing}</span>
                                    </div>
                                    <div className="flex justify-between items-center px-3 py-2.5 flex-1">
                                        <span className="text-gray-400 font-medium whitespace-nowrap text-xs">조치완료</span>
                                        <span className="text-green-500 font-bold text-sm cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); onDrillDown({ brand, status: '조치완료', startDate, endDate }); }}>{stats.completed}</span>
                                    </div>
                                </div>

                                {/* D-2 결품수량 — 오렌지 구분 영역 */}
                                <div className="flex flex-col items-center justify-center px-4 py-2 bg-orange-50 border-l-2 border-orange-200 min-w-[80px] shrink-0">
                                    <span className="text-[10px] font-bold text-orange-300 whitespace-nowrap">D-2 결품</span>
                                    <span className="text-letusOrange font-black text-base leading-tight">
                                        {(brandShortageQty[brand] || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col hover:shadow-md transition-shadow">
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-gray-900 font-sans">특이사항 유형</h3>
                    </div>
                    <div className="flex-1 flex items-center justify-center gap-8 xl:gap-14 w-full h-[220px] mt-2">
                        <div className="relative w-56 h-56 flex items-center justify-center">
                            {PieChart ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={65}
                                            outerRadius={95}
                                            paddingAngle={totalIssues === 0 ? 0 : 4}
                                            cornerRadius={totalIssues === 0 ? 0 : 8}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.isEmpty ? '#e5e7eb' : (CATEGORY_COLORS[entry.name] || '#aaaaaa')} />
                                            ))}
                                        </Pie>
                                        {totalIssues > 0 && (
                                            <Tooltip
                                                contentStyle={{ borderRadius: '8px', border: '1px solid #f3f4f6', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '13px' }}
                                                itemStyle={{ color: '#1f2937', fontWeight: 'bold' }}
                                            />
                                        )}
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="text-[11px] font-bold text-red-500 bg-red-50 rounded-full w-40 h-40 flex items-center justify-center shadow-inner border border-red-200 text-center leading-relaxed">
                                    Chart Module<br />Loading Failed
                                </div>
                            )}

                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className={`text-[28px] font-black leading-tight ${totalIssues === 0 ? 'text-gray-300' : 'text-gray-900'}`}>{totalIssues}</span>
                                <span className="text-xs font-semibold text-gray-500">총 발생건</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {totalIssues === 0 ? (
                                <div className="text-sm text-gray-400 font-bold ml-4">해당 기간 데이터가 없습니다.</div>
                            ) : (
                                Object.entries(chartStats).map(([k, v]) => (
                                    <div key={k} className="flex justify-between items-center w-48 text-sm">
                                        <div className="flex items-center text-gray-600 font-medium whitespace-nowrap">
                                            <span className="w-2.5 h-2.5 rounded-full mr-3" style={{ backgroundColor: CATEGORY_COLORS[k] || '#d1d5db' }}></span>{k}
                                        </div>
                                        <div className="font-bold text-gray-900">{v}<span className="text-xs text-gray-400 font-normal ml-0.5">건</span></div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col hover:shadow-md transition-shadow">
                    <div className="mb-6">
                        <h3 className="text-lg font-bold text-gray-900 font-sans">공급업체별 이슈 비율 (Top 5)</h3>
                    </div>
                    <div className="flex-1 flex flex-col justify-center space-y-6 px-4">
                        {supplierTotal === 0 ? (
                            <div className="text-center text-sm text-gray-400 font-bold py-10">해당 기간 등록된 이슈가 없습니다.</div>
                        ) : (
                            sortedSuppliers.slice(0, 5).map(([vendor, count], idx) => {
                                const percent = ((count / supplierTotal) * 100).toFixed(1);
                                return (
                                    <div key={vendor} className="flex items-center text-sm group" title={`${vendor}: ${count}건 (${percent}%)`}>
                                        <span className="w-24 text-gray-600 font-semibold truncate text-right mr-4">{vendor}</span>
                                        <div className="flex-1 h-5 rounded overflow-hidden bg-gray-100 relative cursor-pointer">
                                            <div className="h-full rounded-r transition-all duration-1000 ease-out" style={{ width: `${percent}%`, backgroundColor: BRAND_COLORS[idx % BRAND_COLORS.length] }}></div>
                                        </div>
                                        <span className="w-12 text-right text-xs font-bold text-gray-500 ml-3">{percent}%</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center">
                        <svg className="w-5 h-5 text-gray-700 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <h3 className="text-lg font-bold text-gray-900">해당 기간 특이사항 리스트</h3>
                    </div>
                    <button onClick={onNavigateToList} className="text-sm font-semibold text-letusBlue hover:text-blue-700 transition-colors flex items-center">
                        전체보기 <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-white border-b border-gray-200 text-xs font-bold text-gray-500">
                            <tr>
                                <th className="p-4 pl-6">입고번호</th>
                                <th className="p-4">발생시간</th>
                                <th className="p-4">공급사</th>
                                <th className="p-4">품목정보</th>
                                <th className="p-4">특이유형</th>
                                <th className="p-4 text-center">처리상태</th>
                                <th className="p-4 text-center">관리</th>
                            </tr>
                        </thead>
                        {isLoading ? (
                            <TableSkeleton rowCount={5} colCount={7} />
                        ) : (
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {dashboardIssues.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="p-8 text-center text-gray-400 font-bold text-xs">
                                            해당 기간에 발생한 특이사항이 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    [...dashboardIssues]
                                        .sort((a, b) => {
                                            if (a.status === '조치대기' && b.status !== '조치대기') return -1;
                                            if (a.status !== '조치대기' && b.status === '조치대기') return 1;
                                            return 0;
                                        })
                                        .slice(0, 6)
                                        .map((row, idx) => (
                                            <tr key={row.reception_no || idx} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4 pl-6 text-gray-800 font-semibold">{row.reception_no}</td>
                                                <td className="p-4 text-gray-500 font-mono">{row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'}</td>
                                                <td className="p-4 font-semibold text-gray-700">{row.vendor || '-'}</td>
                                                <td className="p-4 text-gray-600 truncate max-w-xs">{row.product_code}</td>
                                                <td className="p-4"><CategoryBadge category={row.issue_type} /></td>
                                                <td className="p-4 text-center"><StatusBadge status={row.status} category={row.issue_type} /></td>
                                                <td className="p-4 text-center">
                                                    <button onClick={() => onDrillDown({ brand: row.brand, status: '전체', startDate, endDate })} className="border border-gray-300 text-gray-600 bg-white px-3 py-1 rounded text-xs font-semibold hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm">
                                                        상세보기
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                )}
                            </tbody>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}

export { Dashboard };