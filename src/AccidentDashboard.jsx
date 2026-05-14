import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line, ComposedChart, Area, AreaChart } from 'recharts';

const AccidentDashboard = ({ userProfile, onDrillDown }) => {
    const [accidents, setAccidents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // 🔥 1. 특이사항 대시보드와 완벽하게 동일한 날짜 상태 관리
    const [filterType, setFilterType] = useState('M'); // 기본값 월간

    const [selectedBrands, setSelectedBrands] = useState([]);
    const toggleBrand = (brand) => {
        setSelectedBrands(prev => prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]);
    };

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
            return { startDate: today, endDate: today, label: '당일 현황' };
        }
        else if (filterType === 'W') {
            const day = now.getDay();
            const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(now);
            monday.setDate(diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return { startDate: format(monday), endDate: format(sunday), label: '이번 주 현황' };
        }
        else if (filterType === 'M') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { startDate: format(firstDay), endDate: format(lastDay), label: '이번 달 현황' };
        }
        else {
            return { startDate: customDate.start, endDate: customDate.end, label: '사용자 지정 기간' };
        }
    };

    const { startDate, endDate, label } = getFilterDates();

    const fetchDashboardData = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('logistics_accidents')
                .select('*')
                .gte('service_date', startDate)
                .lte('service_date', endDate);

            if (error) throw error;
            setAccidents(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    // startDate나 endDate가 바뀔 때마다 자동으로 갱신
    useEffect(() => { fetchDashboardData(); }, [startDate, endDate]);

    // --- 📈 사고 추이 꺾은선 그래프용 전용 상태 및 데이터 페치 ---
    const [trendType, setTrendType] = useState('daily'); // 'daily' | 'monthly'
    const [trendAccidents, setTrendAccidents] = useState([]);
    const [isTrendLoading, setIsTrendLoading] = useState(false);

    const fetchTrendData = async () => {
        setIsTrendLoading(true);
        try {
            // endDate("YYYY-MM-DD") 파싱 시 UTC 오차 방지를 위해 직접 분해
            const [eYear, eMonth, eDay] = endDate.split('-').map(Number);

            let tStart, tEnd;
            const pad = n => n.toString().padStart(2, '0');
            const format = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

            if (trendType === 'daily') {
                const firstDay = new Date(eYear, eMonth - 1, 1);
                const lastDay = new Date(eYear, eMonth, 0);
                tStart = format(firstDay);
                tEnd = format(lastDay);
            } else {
                const firstDay = new Date(eYear, 0, 1);
                const lastDay = new Date(eYear, 11, 31);
                tStart = format(firstDay);
                tEnd = format(lastDay);
            }

            const { data, error } = await supabase
                .from('logistics_accidents')
                .select('service_date, brand')
                .gte('service_date', tStart)
                .lte('service_date', tEnd);

            if (error) throw error;
            setTrendAccidents(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setIsTrendLoading(false);
        }
    };

    useEffect(() => { fetchTrendData(); }, [endDate, trendType]);

    // 📊 필터 적용 사고 (요약 통계 및 하단 차트용)
    const filteredAccidents = selectedBrands.length > 0
        ? accidents.filter(a => {
            let b = a.brand || '기타';
            if (!['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소'].includes(b)) b = '기타';
            return selectedBrands.includes(b);
        })
        : accidents;

    // 📊 요약 데이터 계산
    const totalCount = filteredAccidents.length;
    const pendingCount = filteredAccidents.filter(a => a.status === '원인 파악 중').length;
    const completedCount = filteredAccidents.filter(a => a.status === '등록 완료').length;
    const delayedCount = filteredAccidents.filter(a => a.is_delayed && a.is_delayed !== '-').length;

    // 📊 귀책 부서별 통계
    const deptStats = filteredAccidents.reduce((acc, curr) => {
        if (curr.status === '등록 완료') {
            const dept = curr.responsible_dept || '미배정';
            acc[dept] = (acc[dept] || 0) + 1;
        }
        return acc;
    }, {});
    const deptData = Object.keys(deptStats).map(name => ({ name, value: deptStats[name] })).sort((a, b) => b.value - a.value).slice(0, 5);

    // 📊 조치결과별 통계 (파이 차트용)
    const resultStats = filteredAccidents.reduce((acc, curr) => {
        const res = curr.action_result || '기타';
        acc[res] = (acc[res] || 0) + 1;
        return acc;
    }, {});
    const resultData = Object.keys(resultStats).map(name => ({ name, value: resultStats[name] })).sort((a, b) => b.value - a.value);

    // 📊 브랜드별 통계 (하단 차트 표시용)
    const brandStats = filteredAccidents.reduce((acc, curr) => {
        const brand = curr.brand || '알수없음';
        acc[brand] = (acc[brand] || 0) + 1;
        return acc;
    }, {});
    const brandData = Object.keys(brandStats).map(name => ({ name, value: brandStats[name] })).sort((a, b) => b.value - a.value).slice(0, 5);

    // 📊 신규: 브랜드별 상태 상세 통계
    const displayBrands = ['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소', '기타'];
    const brandStatsDetails = {};
    displayBrands.forEach(b => brandStatsDetails[b] = { pending: 0, completed: 0, delayed: 0 });

    accidents.forEach(acc => {
        let b = acc.brand || '기타';
        if (!displayBrands.includes(b)) b = '기타';

        if (acc.status === '원인 파악 중') brandStatsDetails[b].pending += 1;
        else if (acc.status === '등록 완료') brandStatsDetails[b].completed += 1;

        if (acc.is_delayed && acc.is_delayed !== '-') brandStatsDetails[b].delayed += 1;
    });

    // 📈 추이 그래프 데이터 매핑 로직
    const trendDataMapped = useMemo(() => {
        if (!trendAccidents.length && !isTrendLoading) return { data: [], brands: [] };
        const targetBrands = selectedBrands.length > 0 ? selectedBrands : displayBrands.filter(b => b !== '기타' && b !== '알로소'); // 너무 많으면 복잡하므로 5개로 제한

        // endDate 파싱 시 UTC 오차 방지를 위해 예외 처리
        const [eYear, eMonth] = endDate.split('-').map(Number);
        const dataList = [];

        if (trendType === 'daily') {
            const lastDate = new Date(eYear, eMonth, 0).getDate(); // 해당 월의 말일 산출
            for (let i = 1; i <= lastDate; i++) {
                const dayStr = i.toString().padStart(2, '0');
                const dateStr = `${eYear}-${eMonth.toString().padStart(2, '0')}-${dayStr}`;
                const dayData = { name: `${i}일` };
                targetBrands.forEach(b => dayData[b] = 0);

                trendAccidents.forEach(acc => {
                    let b = acc.brand || '기타';
                    if (!displayBrands.includes(b)) b = '기타';
                    // 데이터 내의 날짜시간 포맷을 더 강건하게 처리하기 위해 startsWith 사용
                    if (acc.service_date && String(acc.service_date).startsWith(dateStr) && targetBrands.includes(b)) {
                        dayData[b] += 1;
                    }
                });
                dataList.push(dayData);
            }
        } else {
            for (let i = 1; i <= 12; i++) {
                const monthStr = i.toString().padStart(2, '0');
                const prefix = `${eYear}-${monthStr}`;
                const monthData = { name: `${i}월` };
                targetBrands.forEach(b => monthData[b] = 0);

                trendAccidents.forEach(acc => {
                    let b = acc.brand || '기타';
                    if (!displayBrands.includes(b)) b = '기타';
                    // 월 비교 시 2026-04 와 같이 매칭
                    if (acc.service_date && String(acc.service_date).startsWith(prefix) && targetBrands.includes(b)) {
                        monthData[b] += 1;
                    }
                });
                dataList.push(monthData);
            }
        }
        return { data: dataList, brands: targetBrands };
    }, [trendAccidents, selectedBrands, trendType, endDate, isTrendLoading]);

    const PIE_COLORS = ['#3b82f6', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b'];
    const TREND_COLORS = { '퍼시스': '#f97316', '일룸': '#ef4444', '시디즈': '#3b82f6', '데스커': '#10b981', '슬로우베드': '#8b5cf6', '알로소': '#f59e0b', '기타': '#94a3b8' };

    return (
        <div className="p-6 bg-slate-100 min-h-[calc(100vh-64px)] slide-up flex flex-col gap-5">

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 shrink-0 z-10 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-6 gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 font-sans flex items-center gap-2">
                            브랜드별 사고 처리 현황
                            <span className="bg-blue-50 text-letusBlue text-[10px] px-2 py-0.5 rounded border border-blue-100 font-black">{label}</span>
                        </h2>
                        <p className="text-xs text-gray-400 font-medium mt-1.5">조회 기간: {startDate} ~ {endDate}</p>
                    </div>

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

                {/* 브랜드별 통계 카드 (헤더 안으로 통합, 특이사항 대시보드와 동일한 디자인) */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {displayBrands.map(brand => {
                        const stats = brandStatsDetails[brand];
                        const isSelected = selectedBrands.includes(brand);
                        const isAllSelected = selectedBrands.length === 0;

                        return (
                            <div
                                key={brand}
                                onClick={() => toggleBrand(brand)}
                                className={`rounded-xl px-5 py-4 flex items-center border text-sm cursor-pointer transition-all ${isSelected
                                    ? 'bg-orange-50 border-orange-400 shadow-sm ring-1 ring-orange-400/50'
                                    : 'bg-slate-50/60 border-gray-100 hover:border-gray-200 hover:bg-slate-100'
                                    }`}
                            >
                                <div style={{ width: '31%' }} className={`font-bold tracking-tight whitespace-nowrap truncate pr-2 ${isSelected ? 'text-orange-700' : 'text-gray-800'}`}>
                                    {brand}
                                </div>

                                <div className="flex items-center flex-1">
                                    <div style={{ width: '33.33%' }} className="flex justify-between items-center pr-3 sm:pr-4 border-r border-gray-200">
                                        <span className="text-gray-400 font-medium whitespace-nowrap text-xs sm:text-sm">파악 중</span>
                                        <span
                                            className={`font-bold text-base sm:text-lg cursor-pointer hover:underline ${isAllSelected || isSelected ? 'text-red-500' : 'text-gray-400'}`}
                                            onClick={(e) => { e.stopPropagation(); if (onDrillDown) onDrillDown({ brands: [brand], statuses: ['원인 파악 중'], startDate, endDate }); }}
                                        >
                                            {stats.pending}
                                        </span>
                                    </div>

                                    <div style={{ width: '33.33%' }} className="flex justify-between items-center px-3 sm:px-4 border-r border-gray-200">
                                        <span className="text-gray-400 font-medium whitespace-nowrap text-xs sm:text-sm">등록 완료</span>
                                        <span
                                            className={`font-bold text-base sm:text-lg cursor-pointer hover:underline ${isAllSelected || isSelected ? 'text-green-500' : 'text-gray-400'}`}
                                            onClick={(e) => { e.stopPropagation(); if (onDrillDown) onDrillDown({ brands: [brand], statuses: ['등록 완료'], startDate, endDate }); }}
                                        >
                                            {stats.completed}
                                        </span>
                                    </div>

                                    <div style={{ width: '33.33%' }} className="flex justify-between items-center pl-3 sm:pl-4">
                                        <span className="text-gray-400 font-medium whitespace-nowrap text-xs sm:text-sm">납기 지연</span>
                                        <span
                                            className={`font-bold text-base sm:text-lg cursor-pointer hover:underline ${isAllSelected || isSelected ? 'text-orange-500' : 'text-gray-400'}`}
                                            onClick={(e) => { e.stopPropagation(); if (onDrillDown) onDrillDown({ brands: [brand], isDelayed: '지연', startDate, endDate }); }}
                                        >
                                            {stats.delayed}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-500 font-bold text-sm">대시보드 데이터를 분석 중입니다...</p>
                </div>
            ) : (
                <>

                    {/* 요약 카드 영역 (브랜드 필터 하단부로 이동) */}
                    <div className="grid grid-cols-4 gap-4 shrink-0">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg></div>
                            <div className="text-gray-500 text-[13px] font-bold z-10">총 사고 건수</div>
                            <div className="text-3xl font-black text-gray-800 mt-2 z-10">{totalCount}<span className="text-lg font-bold text-gray-500 ml-1">건</span></div>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between border-b-4 border-b-red-400 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" /></svg></div>
                            <div className="text-red-500 text-[13px] font-bold z-10">원인 파악 중</div>
                            <div className="text-3xl font-black text-red-600 mt-2 z-10">{pendingCount}<span className="text-lg font-bold text-red-400 ml-1">건</span></div>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between border-b-4 border-b-green-400 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg></div>
                            <div className="text-green-600 text-[13px] font-bold z-10">등록 완료</div>
                            <div className="text-3xl font-black text-green-600 mt-2 z-10">{completedCount}<span className="text-lg font-bold text-green-400 ml-1">건</span></div>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between border-b-4 border-b-letusOrange relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zM12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z" /></svg></div>
                            <div className="text-letusOrange text-[13px] font-bold z-10">납기 지연 발생</div>
                            <div className="text-3xl font-black text-letusOrange mt-2 z-10">{delayedCount}<span className="text-lg font-bold text-orange-300 ml-1">건</span></div>
                        </div>
                    </div>

                    {/* 차트 영역 */}
                    <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
                        {/* 1. 귀책 부서별 현황 (가로 막대형, Top 5) */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                            <h3 className="font-bold text-gray-700 text-sm mb-4">🏢 귀책 부서별 현황 (Top 5) <span className="text-xs text-gray-400 font-normal ml-1">(등록 완료 기준)</span></h3>

                            {/* 🔥 수정: min-h를 높여서 여유 공간을 주고, Recharts 대신 HTML 커스텀 막대로 변경 */}
                            <div className="flex-1 min-h-[280px] flex flex-col justify-center space-y-5 px-2">
                                {deptData.length > 0 ? (
                                    deptData.map((item) => {
                                        const deptTotal = deptData.reduce((a, b) => a + b.value, 0);
                                        const percent = deptTotal === 0 ? 0 : ((item.value / deptTotal) * 100).toFixed(1);
                                        return (
                                            <div key={item.name} className="flex items-center text-sm group" title={`${item.name}: ${item.value}건 (${percent}%)`}>
                                                <span className="w-24 text-gray-600 font-semibold truncate text-right mr-4">{item.name}</span>
                                                <div className="flex-1 h-5 rounded overflow-hidden bg-gray-100 relative cursor-pointer">
                                                    <div className="h-full rounded-r transition-all duration-1000 ease-out" style={{ width: `${percent}%`, backgroundColor: '#3b82f6' }}></div>
                                                </div>
                                                <span className="w-12 text-right text-xs font-bold text-gray-500 ml-3">{percent}%</span>
                                            </div>
                                        );
                                    })
                                ) : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">데이터가 없습니다.</div>}
                            </div>
                        </div>

                        {/* 2. 조치결과 구분별 현황 (도넛형) */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                            <h3 className="font-bold text-gray-700 text-sm mb-4">🍩 조치결과 구분 비율</h3>

                            {/* 🔥 수정: 차트 높이(min-h-[280px]) 증가 및 중앙 총 발생건 텍스트 추가 */}
                            <div className="flex-1 min-h-[280px] relative">
                                {resultData.length > 0 ? (
                                    <>
                                        <ResponsiveContainer width="100%" height="100%">
                                            {/* cy="45%"로 설정해 범례가 들어갈 하단 공간을 확보합니다 */}
                                            <PieChart>
                                                <Pie data={resultData} cx="50%" cy="45%" innerRadius={65} outerRadius={90} paddingAngle={4} cornerRadius={8} dataKey="value" stroke="none">
                                                    {resultData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }} />
                                            </PieChart>
                                        </ResponsiveContainer>

                                        {/* 도넛 중앙 총 발생건 텍스트 (Legend 공간을 고려해 pb-[10%]로 위로 살짝 올림) */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-[10%]">
                                            <span className="text-[28px] font-black leading-tight text-gray-900">{resultData.reduce((a, b) => a + b.value, 0)}</span>
                                            <span className="text-xs font-semibold text-gray-500 mt-1">총 발생건</span>
                                        </div>
                                    </>
                                ) : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">데이터가 없습니다.</div>}
                            </div>
                        </div>

                        {/* 3. 브랜드별 현황 (가로 막대형으로 변경, Top 5) */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                            <h3 className="font-bold text-gray-700 text-sm mb-4">🏷️ 브랜드별 사고 현황 (Top 5)</h3>

                            {/* 🔥 수정: min-h를 높여서 여유 공간을 주고, Recharts 대신 HTML 커스텀 막대로 변경 */}
                            <div className="flex-1 min-h-[280px] flex flex-col justify-center space-y-5 px-2">
                                {brandData.length > 0 ? (
                                    brandData.map((item) => {
                                        const brandTotal = brandData.reduce((a, b) => a + b.value, 0);
                                        const percent = brandTotal === 0 ? 0 : ((item.value / brandTotal) * 100).toFixed(1);
                                        return (
                                            <div key={item.name} className="flex items-center text-sm group" title={`${item.name}: ${item.value}건 (${percent}%)`}>
                                                <span className="w-24 text-gray-600 font-semibold truncate text-right mr-4">{item.name}</span>
                                                <div className="flex-1 h-5 rounded overflow-hidden bg-gray-100 relative cursor-pointer">
                                                    <div className="h-full rounded-r transition-all duration-1000 ease-out" style={{ width: `${percent}%`, backgroundColor: '#10b981' }}></div>
                                                </div>
                                                <span className="w-12 text-right text-xs font-bold text-gray-500 ml-3">{percent}%</span>
                                            </div>
                                        );
                                    })
                                ) : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">데이터가 없습니다.</div>}
                            </div>
                        </div>

                    </div>

                    {/* --- 📈 추가: 사고 추이 현황 (독립적 꺾은선 차트) --- */}
                    <div className="bg-white p-5 md:p-6 rounded-xl shadow-sm border border-slate-200 mt-4 flex flex-col shrink-0 min-h-[350px]">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex flex-col">
                                <h3 className="font-bold text-gray-800 text-sm md:text-base flex items-center gap-2">
                                    📈 브랜드별 사고 추이
                                    <span className="bg-blue-50 text-letusBlue text-[10px] px-2 py-0.5 rounded border border-blue-100 font-black">{trendType === 'daily' ? '일간 현황' : '월간 현황'}</span>
                                </h3>
                                <p className="text-[11px] text-gray-400 font-medium mt-1">상단의 글로벌 기준의 <span className="font-bold text-gray-500">{trendType === 'daily' ? '최근 월' : '최근 년도'}</span> 데이터만 추출합니다.</p>
                            </div>
                            <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner">
                                <button onClick={() => setTrendType('daily')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${trendType === 'daily' ? 'bg-white text-letusBlue shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}>일간</button>
                                <button onClick={() => setTrendType('monthly')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${trendType === 'monthly' ? 'bg-white text-letusBlue shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}>월간</button>
                            </div>
                        </div>
                        {/* Recharts 렌더링 미스테리를 우회하기 위해 강제 사이즈 및 보호 로직 추가 */}
                        <div style={{ height: '300px', width: '100%', position: 'relative' }}>
                            {isTrendLoading ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
                                    <div className="w-8 h-8 border-4 border-slate-200 border-t-letusBlue rounded-full animate-spin"></div>
                                </div>
                            ) : trendDataMapped.data && trendDataMapped.data.length > 0 ? (
                                <ResponsiveContainer width="99%" height="100%">
                                    <LineChart data={trendDataMapped.data} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '13px' }} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
                                        <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', paddingTop: '15px' }} iconType="circle" />
                                        {trendDataMapped.brands && trendDataMapped.brands.length > 0 ? (
                                            trendDataMapped.brands.map((bName) => (
                                                <Line key={bName} type="monotone" dataKey={bName} stroke={TREND_COLORS[bName] || '#94a3b8'} strokeWidth={3} dot={{ r: 4, strokeWidth: 1 }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} animationDuration={1000} />
                                            ))
                                        ) : (
                                            /* 만약 브랜드 배열이 텅 비는 오류가 날 경우를 대비한 가짜 투명 라인 */
                                            <Line type="monotone" dataKey="none" stroke="transparent" />
                                        )}
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-bold text-sm bg-slate-50/50 rounded-xl">
                                    해당 기간( {trendType === 'daily' ? '일간' : '월간'} )에 해당하는 사고 추이 데이터가 1건도 발견되지 않았습니다.
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export { AccidentDashboard };
