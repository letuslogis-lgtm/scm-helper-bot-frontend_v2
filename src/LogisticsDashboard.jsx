import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { TableSkeleton, CATEGORY_COLORS, BRAND_COLORS, StatusBadge, CategoryBadge } from './SharedUI.jsx';



// SharedUI에서 가져옴

// --- 대시보드 (Dashboard) ---
const Dashboard = ({ onNavigateToList, onDrillDown, issues = [], isLoading = false, onReload }) => {
    const [selectedBrands, setSelectedBrands] = useState([]);
    const [shortageData, setShortageData] = useState([]);
    const [barToggles, setBarToggles] = useState({ issue: true, shortage: true });
    const [trendType, setTrendType] = useState('daily');
    const [trendIssues, setTrendIssues] = useState([]);
    const [trendShortages, setTrendShortages] = useState([]);
    const [isTrendLoading, setIsTrendLoading] = useState(false);

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
                .select('item_code, brand, vendor, shortage_qty, upload_date')
                .gte('upload_date', startDate)
                .lte('upload_date', endDate);
            setShortageData(data || []);
        };
        fetchShortage();
    }, [startDate, endDate]);

    useEffect(() => {
        const fetchTrend = async () => {
            setIsTrendLoading(true);
            const [eYear, eMonth] = endDate.split('-').map(Number);
            const pad = n => n.toString().padStart(2, '0');
            let tStart, tEnd;
            if (trendType === 'daily') {
                const lastDay = new Date(eYear, eMonth, 0).getDate();
                tStart = `${eYear}-${pad(eMonth)}-01`;
                tEnd   = `${eYear}-${pad(eMonth)}-${pad(lastDay)}`;
            } else {
                tStart = `${eYear}-01-01`;
                tEnd   = `${eYear}-12-31`;
            }
            const [{ data: issues }, { data: shortages }] = await Promise.all([
                supabase.from('logistics_issues').select('created_at, brand, vendor').gte('created_at', tStart).lte('created_at', tEnd + 'T23:59:59'),
                supabase.from('wms_shortage_list').select('upload_date, brand, vendor, shortage_qty').gte('upload_date', tStart).lte('upload_date', tEnd),
            ]);
            setTrendIssues(issues || []);
            setTrendShortages(shortages || []);
            setIsTrendLoading(false);
        };
        fetchTrend();
    }, [trendType, endDate]);

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

    const targetShortageData = selectedBrands.length > 0
        ? shortageData.filter(r => selectedBrands.includes(r.brand))
        : shortageData;

    const TREND_BRANDS = ['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소'];
    const TREND_COLORS = { '퍼시스': '#22c55e', '일룸': '#14b8a6', '슬로우베드': '#3b82f6', '데스커': '#8b5cf6', '시디즈': '#f97316', '알로소': '#ef4444' };

    const trendData = useMemo(() => {
        const pad = n => n.toString().padStart(2, '0');
        const [eYear, eMonth] = endDate.split('-').map(Number);
        const activeBrands = selectedBrands.length > 0 ? selectedBrands : TREND_BRANDS;
        const fi = trendIssues.filter(i => activeBrands.includes(i.brand));
        const fs = trendShortages.filter(r => activeBrands.includes(r.brand));

        const buildRow = (dateLabel, prefix) => {
            const row = { date: dateLabel };
            activeBrands.forEach(b => {
                row[`issue_${b}`] = fi.filter(i => i.created_at?.startsWith(prefix) && i.brand === b).length;
                row[`shortage_${b}`] = fs.filter(r => String(r.upload_date).startsWith(prefix) && r.brand === b)
                    .reduce((s, r) => s + (Number(r.shortage_qty) || 0), 0);
            });
            return row;
        };

        if (trendType === 'monthly') {
            return Array.from({ length: 12 }, (_, i) => {
                const m = i + 1;
                return buildRow(`${m}월`, `${eYear}-${pad(m)}`);
            });
        } else {
            const lastDay = new Date(eYear, eMonth, 0).getDate();
            return Array.from({ length: lastDay }, (_, i) => {
                const d = i + 1;
                return buildRow(`${d}일`, `${eYear}-${pad(eMonth)}-${pad(d)}`);
            });
        }
    }, [trendIssues, trendShortages, selectedBrands, trendType, endDate]);

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

    // 결품 차트 데이터
    const shortageChartData = useMemo(() => {
        const byItem = {};
        const byVendor = {};
        targetShortageData.forEach(r => {
            if (r.item_code) byItem[r.item_code] = (byItem[r.item_code] || 0) + (Number(r.shortage_qty) || 0);
            if (r.vendor)    byVendor[r.vendor]   = (byVendor[r.vendor]   || 0) + (Number(r.shortage_qty) || 0);
        });
        const itemEntries   = Object.entries(byItem).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const vendorEntries = Object.entries(byVendor).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const itemTotal     = itemEntries.reduce((s, [, v]) => s + v, 0);
        const vendorTotal   = vendorEntries.reduce((s, [, v]) => s + v, 0);
        return { itemEntries, vendorEntries, itemTotal, vendorTotal };
    }, [targetShortageData]);

    const SHORTAGE_COLORS = ['#3b82f6','#6366f1','#8b5cf6','#a78bfa','#c4b5fd'];

    // 공급업체별 통합 데이터 (이슈 + 결품)
    const combinedVendorData = useMemo(() => {
        const map = {};
        targetIssues.forEach(issue => {
            const v = issue.vendor || issue.brand || '미상';
            if (!map[v]) map[v] = { issueCount: 0, shortageQty: 0 };
            map[v].issueCount += 1;
        });
        targetShortageData.forEach(r => {
            if (!r.vendor) return;
            if (!map[r.vendor]) map[r.vendor] = { issueCount: 0, shortageQty: 0 };
            map[r.vendor].shortageQty += Number(r.shortage_qty) || 0;
        });
        const score = (d) => {
            if (barToggles.issue && barToggles.shortage) return d.issueCount + d.shortageQty;
            if (barToggles.issue) return d.issueCount;
            return d.shortageQty;
        };
        return Object.entries(map)
            .map(([vendor, d]) => ({ vendor, ...d }))
            .filter(d => score(d) > 0)
            .sort((a, b) => score(b) - score(a))
            .slice(0, 5);
    }, [targetIssues, targetShortageData, barToggles]);

    const cvIssueTotal    = combinedVendorData.reduce((s, d) => s + d.issueCount, 0);
    const cvShortageTotal = combinedVendorData.reduce((s, d) => s + d.shortageQty, 0);

    return (
        <div className="p-6 space-y-6 slide-up">

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 px-5 hover:shadow-md transition-shadow shrink-0">
                {/* 🔥 마스터 날짜 필터 컨트롤러 영역 */}
                <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-3 gap-3">
                    <div>
                        <h3 className="text-base font-bold text-gray-900 font-sans flex items-center gap-2">
                            브랜드별 현황
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

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
                    {displayBrands.map(brand => {
                        const stats = brandStatsDetails[brand];
                        const isSelected = selectedBrands.includes(brand);
                        return (
                            <div
                                key={brand}
                                onClick={() => toggleBrand(brand)}
                                className={`rounded-xl flex items-center border text-sm cursor-pointer transition-all ${isSelected
                                    ? 'bg-orange-50 border-orange-400 shadow-sm ring-1 ring-orange-400/50'
                                    : 'bg-gray-50/60 border-gray-100 hover:border-gray-200 hover:bg-gray-100'
                                    }`}
                            >
                                <div style={{ width: '28%' }} className={`px-4 py-2.5 font-bold tracking-tight whitespace-nowrap truncate ${isSelected ? 'text-orange-700' : 'text-gray-800'}`}>
                                    {brand}
                                </div>
                                <div style={{ width: '18%' }} className="flex justify-between items-center px-3 py-2.5">
                                    <span className="text-gray-400 font-medium whitespace-nowrap text-xs">조치대기</span>
                                    <span className="text-red-500 font-bold text-sm cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); onDrillDown({ brand, status: '조치대기', startDate, endDate }); }}>{stats.pending}</span>
                                </div>
                                <div style={{ width: '18%' }} className="flex justify-between items-center px-3 py-2.5">
                                    <span className="text-gray-400 font-medium whitespace-nowrap text-xs">처리 중</span>
                                    <span className="text-yellow-500 font-bold text-sm cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); onDrillDown({ brand, status: '처리 중', startDate, endDate }); }}>{stats.processing}</span>
                                </div>
                                <div style={{ width: '18%' }} className="flex justify-between items-center px-3 py-2.5">
                                    <span className="text-gray-400 font-medium whitespace-nowrap text-xs">조치완료</span>
                                    <span className="text-green-500 font-bold text-sm cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); onDrillDown({ brand, status: '조치완료', startDate, endDate }); }}>{stats.completed}</span>
                                </div>
                                <div style={{ width: '18%' }} className="flex justify-between items-center px-3 py-2.5">
                                    <span className="text-gray-400 font-medium whitespace-nowrap text-xs">D-2 결품</span>
                                    <span className="text-gray-700 font-bold text-sm">{(brandShortageQty[brand] || 0).toLocaleString()}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">

                {/* 특이사항 유형 도넛 */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-gray-900">특이사항 유형</h3>
                    </div>
                    <div className="flex items-center justify-center gap-6 w-full h-[220px]">
                        <div className="relative w-40 h-40 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                                        paddingAngle={totalIssues === 0 ? 0 : 4} cornerRadius={totalIssues === 0 ? 0 : 6}
                                        dataKey="value" stroke="none">
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.isEmpty ? '#e5e7eb' : (CATEGORY_COLORS[entry.name] || '#aaaaaa')} />
                                        ))}
                                    </Pie>
                                    {totalIssues > 0 && <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} itemStyle={{ fontWeight: 'bold' }} position={{ y: 0 }} allowEscapeViewBox={{ x: false, y: true }} />}
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className={`text-xl font-black ${totalIssues === 0 ? 'text-gray-300' : 'text-gray-900'}`}>{totalIssues}</span>
                                <span className="text-[10px] font-semibold text-gray-400">총 발생건</span>
                            </div>
                        </div>
                        <div className="space-y-2 min-w-0">
                            {totalIssues === 0 ? <p className="text-xs text-gray-400 font-bold">데이터 없음</p> :
                                Object.entries(chartStats).map(([k, v]) => (
                                    <div key={k} className="flex justify-between items-center gap-3 text-xs">
                                        <div className="flex items-center text-gray-600 font-medium whitespace-nowrap">
                                            <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: CATEGORY_COLORS[k] || '#d1d5db' }}></span>{k}
                                        </div>
                                        <span className="font-bold text-gray-900">{v}<span className="text-gray-400 font-normal ml-0.5">건</span></span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>

                {/* D-2 결품 품목코드별 도넛 */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-gray-900">D-2 결품 품목코드별 비율 (Top 5)</h3>
                    </div>
                    <div className="flex items-center justify-center gap-6 w-full h-[220px]">
                        <div className="relative w-40 h-40 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={shortageChartData.itemTotal === 0 ? [{ name: '데이터 없음', value: 1, isEmpty: true }] : shortageChartData.itemEntries.map(([k, v]) => ({ name: k, value: v }))}
                                        cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                                        paddingAngle={shortageChartData.itemTotal === 0 ? 0 : 4} cornerRadius={shortageChartData.itemTotal === 0 ? 0 : 6}
                                        dataKey="value" stroke="none">
                                        {(shortageChartData.itemTotal === 0 ? [{ isEmpty: true }] : shortageChartData.itemEntries).map((entry, index) => (
                                            <Cell key={`sc-${index}`} fill={entry.isEmpty ? '#e5e7eb' : SHORTAGE_COLORS[index % SHORTAGE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    {shortageChartData.itemTotal > 0 && <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} itemStyle={{ fontWeight: 'bold' }} position={{ y: 0 }} allowEscapeViewBox={{ x: false, y: true }} />}
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className={`text-xl font-black ${shortageChartData.itemTotal === 0 ? 'text-gray-300' : 'text-gray-900'}`}>{shortageChartData.itemTotal.toLocaleString()}</span>
                                <span className="text-[10px] font-semibold text-gray-400">총 결품수량</span>
                            </div>
                        </div>
                        <div className="space-y-2 min-w-0">
                            {shortageChartData.itemTotal === 0 ? <p className="text-xs text-gray-400 font-bold">데이터 없음</p> :
                                shortageChartData.itemEntries.map(([k, v], idx) => (
                                    <div key={k} className="flex justify-between items-center gap-3 text-xs">
                                        <div className="flex items-center text-gray-600 font-medium truncate max-w-[120px]">
                                            <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: SHORTAGE_COLORS[idx % SHORTAGE_COLORS.length] }}></span>
                                            <span className="truncate">{k}</span>
                                        </div>
                                        <span className="font-bold text-gray-900 shrink-0">{v.toLocaleString()}</span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>

                {/* 공급업체별 현황 통합 바차트 (토글) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-gray-900">공급업체별 현황 (Top 5)</h3>
                        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner">
                            {[
                                { id: 'issue', name: '특이사항' },
                                { id: 'shortage', name: '결품' },
                            ].map(btn => (
                                <button
                                    key={btn.id}
                                    onClick={() => setBarToggles(p => ({ ...p, [btn.id]: !p[btn.id] }))}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${barToggles[btn.id] ? 'bg-white text-letusBlue shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}
                                >{btn.name}</button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-3 flex-1 justify-center px-2">
                        {combinedVendorData.length === 0
                            ? <p className="text-xs text-gray-300 font-bold">데이터 없음</p>
                            : combinedVendorData.map((d, idx) => (
                                <div key={d.vendor} className="flex items-start gap-2 text-xs">
                                    <span className="w-20 text-gray-600 font-semibold truncate text-right shrink-0 pt-0.5">{d.vendor}</span>
                                    <div className="flex-1 flex flex-col gap-1">
                                        {barToggles.issue && cvIssueTotal > 0 && (
                                            <div className="flex items-center gap-1">
                                                <div className="flex-1 h-3.5 rounded overflow-hidden bg-gray-100">
                                                    <div className="h-full rounded-r transition-all duration-700"
                                                        style={{ width: `${(d.issueCount / cvIssueTotal * 100).toFixed(1)}%`, backgroundColor: BRAND_COLORS[idx % BRAND_COLORS.length] }}></div>
                                                </div>
                                                <span className="w-10 text-right font-bold text-gray-500 shrink-0">{(d.issueCount / cvIssueTotal * 100).toFixed(1)}%</span>
                                            </div>
                                        )}
                                        {barToggles.shortage && cvShortageTotal > 0 && (
                                            <div className="flex items-center gap-1">
                                                <div className="flex-1 h-3.5 rounded overflow-hidden bg-gray-100">
                                                    <div className="h-full rounded-r transition-all duration-700"
                                                        style={{ width: `${(d.shortageQty / cvShortageTotal * 100).toFixed(1)}%`, backgroundColor: '#f97316' }}></div>
                                                </div>
                                                <span className="w-10 text-right font-bold text-gray-500 shrink-0">{d.shortageQty.toLocaleString()}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>

            </div>

            {/* 특이사항 · 결품 추이 */}
            <div className="bg-white p-5 md:p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col shrink-0 min-h-[350px]">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex flex-col">
                        <h3 className="font-bold text-gray-800 text-sm md:text-base flex items-center gap-2">
                            특이사항 · 결품 추이
                            <span className="bg-blue-50 text-letusBlue text-[10px] px-2 py-0.5 rounded border border-blue-100 font-black">{trendType === 'daily' ? '일간 현황' : '월간 현황'}</span>
                        </h3>
                        <p className="text-[11px] text-gray-400 font-medium mt-1">상단 조회 기준의 <span className="font-bold text-gray-500">{trendType === 'daily' ? '해당 월' : '해당 연도'}</span> 데이터를 표시합니다.</p>
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner">
                        <button onClick={() => setTrendType('daily')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${trendType === 'daily' ? 'bg-white text-letusBlue shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}>일간</button>
                        <button onClick={() => setTrendType('monthly')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${trendType === 'monthly' ? 'bg-white text-letusBlue shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}>월간</button>
                    </div>
                </div>
                <div style={{ height: '300px', width: '100%', position: 'relative' }}>
                    {isTrendLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
                            <div className="w-8 h-8 border-4 border-slate-200 border-t-letusBlue rounded-full animate-spin"></div>
                        </div>
                    ) : trendData.length > 0 ? (
                        <ResponsiveContainer width="99%" height="100%">
                            <ComposedChart data={trendData} margin={{ top: 20, right: 50, left: 0, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    const issues = payload.filter(p => p.name?.startsWith('[특이사항]'));
                                    const shortages = payload.filter(p => p.name?.startsWith('[결품]'));
                                    return (
                                        <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '10px 14px', fontSize: 12 }}>
                                            <p style={{ fontWeight: 'bold', color: '#374151', marginBottom: 8 }}>{label}</p>
                                            <div style={{ display: 'flex', gap: 20 }}>
                                                <div>
                                                    <p style={{ fontWeight: 'bold', color: '#6b7280', marginBottom: 4, fontSize: 11 }}>특이사항 (건)</p>
                                                    {issues.map(p => (
                                                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                                                            <span style={{ color: '#374151' }}>{p.name.replace('[특이사항] ', '')}</span>
                                                            <span style={{ fontWeight: 'bold', marginLeft: 'auto', paddingLeft: 8 }}>{p.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: 20 }}>
                                                    <p style={{ fontWeight: 'bold', color: '#6b7280', marginBottom: 4, fontSize: 11 }}>결품 (수량)</p>
                                                    {shortages.map(p => (
                                                        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                                                            <span style={{ color: '#374151' }}>{p.name.replace('[결품] ', '')}</span>
                                                            <span style={{ fontWeight: 'bold', marginLeft: 'auto', paddingLeft: 8 }}>{p.value?.toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }} />
                                <Legend content={({ payload }) => {
                                    if (!payload?.length) return null;
                                    const issues = payload.filter(p => p.value?.startsWith('[특이사항]'));
                                    const shortages = payload.filter(p => p.value?.startsWith('[결품]'));
                                    const Item = ({ p }) => (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 12, fontSize: 12, fontWeight: 'bold', color: '#475569' }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
                                            {p.value.replace('[특이사항] ', '').replace('[결품] ', '')}
                                        </span>
                                    );
                                    return (
                                        <div style={{ paddingTop: 15, display: 'flex', justifyContent: 'center', gap: 32 }}>
                                            <div>
                                                <p style={{ fontSize: 11, fontWeight: 'bold', color: '#9ca3af', marginBottom: 6 }}>특이사항</p>
                                                <div>{issues.map(p => <Item key={p.value} p={p} />)}</div>
                                            </div>
                                            <div style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: 32 }}>
                                                <p style={{ fontSize: 11, fontWeight: 'bold', color: '#9ca3af', marginBottom: 6 }}>결품</p>
                                                <div>{shortages.map(p => <Item key={p.value} p={p} />)}</div>
                                            </div>
                                        </div>
                                    );
                                }} />
                                {(selectedBrands.length > 0 ? selectedBrands : TREND_BRANDS).map((b, idx, arr) => (
                                    <Bar key={`bar_${b}`} yAxisId="left" dataKey={`issue_${b}`} name={`[특이사항] ${b}`}
                                        stackId="issues" fill={TREND_COLORS[b]}
                                        radius={idx === arr.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                        maxBarSize={40} animationDuration={1000} />
                                ))}
                                {(selectedBrands.length > 0 ? selectedBrands : TREND_BRANDS).map(b => (
                                    <Line key={`line_${b}`} yAxisId="right" type="monotone" dataKey={`shortage_${b}`}
                                        name={`[결품] ${b}`} stroke={TREND_COLORS[b]} strokeWidth={3}
                                        dot={{ r: 4, strokeWidth: 1 }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                                        animationDuration={1000} />
                                ))}
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-bold text-sm bg-slate-50/50 rounded-xl">
                            해당 기간({trendType === 'daily' ? '일간' : '월간'})에 해당하는 데이터가 없습니다.
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}

export { Dashboard };