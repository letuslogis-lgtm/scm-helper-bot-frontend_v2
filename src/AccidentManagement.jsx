import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase, adminSupabase } from './supabaseClient.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line, ComposedChart, Area, AreaChart } from 'recharts';
import { MainLayout } from './MainLayout.jsx';
import { CloseIcon } from './SharedUI.jsx';
import { AccidentModal, AccidentBulkEditModal, AccidentUploadModal } from './AccidentModals.jsx';









// ---------------------------------------------------------
// 📋 메인 컴포넌트들 (파일이 너무 크면 이들도 나중에 쪼갤 수 있습니다)
// ---------------------------------------------------------

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
                                            onClick={(e) => { e.stopPropagation(); if (onDrillDown) onDrillDown({ brands: [brand], statuses: ['원인 파악 중'] }); }}
                                        >
                                            {stats.pending}
                                        </span>
                                    </div>

                                    <div style={{ width: '33.33%' }} className="flex justify-between items-center px-3 sm:px-4 border-r border-gray-200">
                                        <span className="text-gray-400 font-medium whitespace-nowrap text-xs sm:text-sm">등록 완료</span>
                                        <span
                                            className={`font-bold text-base sm:text-lg cursor-pointer hover:underline ${isAllSelected || isSelected ? 'text-green-500' : 'text-gray-400'}`}
                                            onClick={(e) => { e.stopPropagation(); if (onDrillDown) onDrillDown({ brands: [brand], statuses: ['등록 완료'] }); }}
                                        >
                                            {stats.completed}
                                        </span>
                                    </div>

                                    <div style={{ width: '33.33%' }} className="flex justify-between items-center pl-3 sm:pl-4">
                                        <span className="text-gray-400 font-medium whitespace-nowrap text-xs sm:text-sm">납기 지연</span>
                                        <span
                                            className={`font-bold text-base sm:text-lg cursor-pointer hover:underline ${isAllSelected || isSelected ? 'text-orange-500' : 'text-gray-400'}`}
                                            onClick={(e) => { e.stopPropagation(); if (onDrillDown) onDrillDown({ brands: [brand], isDelayed: '지연' }); }}
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

const AccidentList = ({ userProfile, initialFilter }) => {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeRow, setActiveRow] = useState(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [isAiView, setIsAiView] = useState(false); // AI 분석 뷰 토글 상태

    // 🔥 신규: 누락되었던 모달 오픈용 상태값 추가
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);

    const today = new Date().toISOString().split('T')[0];

    const initialFiltersMap = {
        brands: [], centers: [], serviceTypes: [], statuses: [], depts: [], actionResults: [],
        startDate: today, endDate: today, searchType: '수주건명', searchValue: '', excludeNormal: false, isDelayed: '전체',
        // 🚩 여기 추가! (드릴다운용 숨겨진 필터들)
        workers: [], zones: [], aiCauses: []
    };

    const [draftFilters, setDraftFilters] = useState(initialFiltersMap);
    const [appliedFilters, setAppliedFilters] = useState(initialFiltersMap);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });

    useEffect(() => {
        if (initialFilter) {
            const newF = { ...initialFiltersMap, ...initialFilter };
            setDraftFilters(newF); setAppliedFilters(newF);
        }
    }, [initialFilter]);

    const fetchAccidents = async () => {
        setIsLoading(true);
        try {
            let query = supabase.from('logistics_accidents').select('*').gte('service_date', appliedFilters.startDate).lte('service_date', appliedFilters.endDate).order('created_at', { ascending: false });
            const { data, error } = await query;
            if (error) throw error;
            let filtered = data || [];

            if (appliedFilters.brands.length > 0) filtered = filtered.filter(i => appliedFilters.brands.includes(i.brand));
            if (appliedFilters.centers.length > 0) filtered = filtered.filter(i => appliedFilters.centers.includes(i.service_center));
            if (appliedFilters.serviceTypes.length > 0) filtered = filtered.filter(i => appliedFilters.serviceTypes.includes(i.service_type));
            if (appliedFilters.statuses.length > 0) filtered = filtered.filter(i => appliedFilters.statuses.includes(i.status));
            if (appliedFilters.depts.length > 0) filtered = filtered.filter(i => appliedFilters.depts.includes(i.responsible_dept));
            if (appliedFilters.actionResults.length > 0) filtered = filtered.filter(i => appliedFilters.actionResults.includes(i.action_result));
            if (appliedFilters.workers?.length > 0) {
                filtered = filtered.filter(i => {
                    const w = i.worker_name ? String(i.worker_name).trim() : '';
                    return appliedFilters.workers.includes(w);
                });
            }

            // 2️⃣ ZONE 구역 필터 ('미분류' 통역 장착!)
            if (appliedFilters.zones?.length > 0) {
                filtered = filtered.filter(i => {
                    let z = i.zone ? String(i.zone).trim() : '';
                    if (!z || z === '-') z = '미분류'; // DB의 빈칸이나 하이픈을 '미분류'로 번역
                    return appliedFilters.zones.includes(z);
                });
            }

            // 3️⃣ AI 분석 원인 필터 ('분석 대기/미분류' 통역 장착!)
            if (appliedFilters.aiCauses?.length > 0) {
                filtered = filtered.filter(i => {
                    let c = i.ai_analyzed_cause ? String(i.ai_analyzed_cause).trim() : '';
                    if (!c || c === '-') c = '분석 대기/미분류'; // DB의 빈칸을 번역
                    return appliedFilters.aiCauses.includes(c);
                });
            }

            if (appliedFilters.searchValue) {
                const val = appliedFilters.searchValue.toLowerCase();
                if (appliedFilters.searchType === '수주건명') filtered = filtered.filter(i => (i.order_no || '').toLowerCase().includes(val));
                if (appliedFilters.searchType === '수주번호') filtered = filtered.filter(i => (i.order_name || '').toLowerCase().includes(val));
                if (appliedFilters.searchType === '품목코드') filtered = filtered.filter(i => (i.item_code || '').toLowerCase().includes(val));
            }

            if (appliedFilters.excludeNormal) { filtered = filtered.filter(i => i.action_result !== '정상출고'); }

            if (appliedFilters.isDelayed !== '전체') {
                if (appliedFilters.isDelayed === '지연') filtered = filtered.filter(i => i.is_delayed !== '-');
                else if (appliedFilters.isDelayed === '정상') filtered = filtered.filter(i => i.is_delayed === '-');
            }
            setItems(filtered);
        } catch (err) { console.error(err); } finally { setIsLoading(false); }
    };

    useEffect(() => { fetchAccidents(); }, [appliedFilters]);

    const handleSearchClick = () => {
        window.getSelection()?.removeAllRanges(); // 🔥 브라우저 텍스트 선택(드래그) 강제 해제!
        setAppliedFilters({ ...draftFilters });
        setSelectedIds([]);
    };
    const handleResetClick = () => { setDraftFilters(initialFiltersMap); setAppliedFilters(initialFiltersMap); setSelectedIds([]); };

    const sortedItems = useMemo(() => {
        let sortableItems = [...items];
        if (sortConfig.key && sortConfig.direction !== 'none') {
            sortableItems.sort((a, b) => {
                const aVal = a[sortConfig.key] || ''; const bVal = b[sortConfig.key] || '';
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [items, sortConfig]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key) {
            if (sortConfig.direction === 'asc') direction = 'desc';
            else if (sortConfig.direction === 'desc') direction = 'none';
        }
        setSortConfig({ key: direction === 'none' ? null : key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? <span className="ml-1 text-letusBlue">↑</span> : <span className="ml-1 text-letusBlue">↓</span>;
    };

    const handleSelectAll = (e) => setSelectedIds(e.target.checked ? sortedItems.map(i => i.id) : []);
    const handleSelectOne = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    // 🔥 신규 추가: 일괄 삭제 기능 (청크 처리 완료)
    const handleDeleteSelected = async () => {
        if (userProfile?.role !== '관리자') return alert('🚨 삭제 권한이 없습니다. 관리자에게 문의하세요.');
        if (selectedIds.length === 0) return alert('삭제할 항목을 체크해 주세요.');

        if (!window.confirm(`선택하신 ${selectedIds.length}건의 데이터를 정말 삭제하시겠습니까?\n이 작업은 영구적이며 복구할 수 없습니다.`)) return;

        try {
            const CHUNK_SIZE = 200;
            for (let i = 0; i < selectedIds.length; i += CHUNK_SIZE) {
                const chunk = selectedIds.slice(i, i + CHUNK_SIZE);
                const { error } = await supabase.from('logistics_accidents').delete().in('id', chunk);
                if (error) throw error;
            }
            alert(`🗑️ ${selectedIds.length}건의 데이터가 깔끔하게 삭제되었습니다.`);
            setSelectedIds([]);
            fetchAccidents();
        } catch (err) {
            alert('삭제 중 오류 발생: ' + err.message);
        }
    };

    const handleAiAnalysis = async () => {
        if (selectedIds.length === 0) return alert('분석할 항목을 먼저 체크박스로 선택해 주세요.');

        // 1. 선택된 데이터 중 '이미 분석된 항목'이 몇 개인지 스마트하게 자동 카운트
        const targetItems = sortedItems.filter(item => selectedIds.includes(item.id));
        const alreadyAnalyzedCount = targetItems.filter(item => item.ai_cause_detail).length;

        let forceReanalyze = false;

        // 2. 50건 초과 확인
        if (selectedIds.length > 50) {
            if (!window.confirm(`⚠️ 선택하신 건수가 ${selectedIds.length}건입니다.\nAI 분석은 1회 최대 50건까지 진행되며, 초과분은 다음에 다시 실행해 주세요.\n계속하시겠습니까?`)) return;
        }

        // 3. 스마트 분기: 이미 분석된 데이터가 1건이라도 포함되어 있다면?
        if (alreadyAnalyzedCount > 0) {
            const wantOverwrite = window.confirm(
                `선택하신 ${selectedIds.length}건 중 이미 분석이 완료된 데이터가 ${alreadyAnalyzedCount}건 포함되어 있습니다.\n\n기존 분석 결과를 무시하고 모두 '덮어쓰기' 하시겠습니까?\n(취소를 누르면 아직 분석되지 않은 항목만 골라서 진행합니다.)`
            );
            forceReanalyze = wantOverwrite;

            // 만약 전체가 싹 다 이미 분석된 건인데 사용자가 '취소(미분석건만 진행)'를 눌렀다면 중단
            if (!wantOverwrite && alreadyAnalyzedCount === selectedIds.length) {
                return alert('새로 분석할 대기 데이터가 없습니다. 취소되었습니다.');
            }
        } else {
            // 미분석 데이터만 깔끔하게 골랐을 때는 평범하게 진행 여부만 확인
            if (!window.confirm(`선택하신 ${selectedIds.length}건에 대해 AI 사고 원인 분석을 실행하시겠습니까?`)) return;
        }

        setIsLoading(true);
        setIsActionMenuOpen(false);

        try {
            const { data, error } = await supabase.functions.invoke('analyze-accidents', {
                body: { ids: selectedIds, forceReanalyze }
            });

            if (error) throw error;

            const stats = data?.confidence_stats || {};
            const statsMsg = Object.keys(stats).length > 0 ? `\n• 고신뢰: ${stats.high || 0}건 / 중: ${stats.medium || 0}건 / 저: ${stats.low || 0}건` : '';
            const truncMsg = data?.truncated ? '\n\n⚠️ 일부만 처리되었습니다. 나머지는 다시 실행해 주세요.' : '';

            let failMsg = '';
            if (data?.failed_count > 0 && data?.failure_reasons) {
                failMsg = '\n\n🚨 [실패 상세 내역]';
                Object.entries(data.failure_reasons).forEach(([reason, count]) => {
                    // 백엔드에서 넘어온 원시 에러 메시지를 사용자가 읽기 쉽게 번역
                    let readableReason = reason;
                    if (reason.includes('API_ERROR_429')) readableReason = 'AI 서버 요청 한도 초과 (잠시 후 다시 시도)';
                    else if (reason.includes('API_ERROR_503')) readableReason = 'AI 서버 일시적 응답 지연';
                    else if (reason.includes('parse_array_fail')) readableReason = 'AI 응답 형식 오류 (다시 시도)';
                    else if (reason.includes('ai_missed_record')) readableReason = 'AI가 해당 데이터를 분석 누락함';

                    failMsg += `\n- ${readableReason}: ${count}건`;
                });
            }

            alert(`✨ AI 분석이 완료되었습니다!\n처리: ${data?.processed_count ?? 0}건${statsMsg}${failMsg}${truncMsg}`);
            fetchAccidents();
            setSelectedIds([]);
        } catch (err) {
            console.error('AI 분석 호출 에러:', err);
            alert('AI 분석 중 오류가 발생했습니다.\n' + (err.message || ''));
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportExcel = () => {
        if (selectedIds.length === 0) return alert('다운로드할 항목을 선택해 주세요.');
        const targetItems = sortedItems.filter(item => selectedIds.includes(item.id));

        const headersMap = {
            service_date: '서비스예약일', brand: '브랜드', service_center: '서비스센터', service_type: '시공/AS',
            order_no: '수주번호', order_name: '수주건명', item_code: '품목코드', issue_qty: '이슈수량',
            action_result: '조치결과구분', is_delayed: '납기지연판별', zone: 'ZONE', worker_name: '작업자',
            shift_type: '주/야', status: '처리상태', responsible_dept: '귀책부서', cause_detail: '발생원인 상세',
            handler_name: '최종처리자',
            // 🤖 AI 분석 결과 4종 추가
            ai_analyzed_cause: 'AI 대분류',
            ai_cause_detail: 'AI 소분류',
            ai_cause_summary: 'AI 상세원인',
            ai_confidence: 'AI 신뢰도',
            created_at: '등록일시', updated_at: '수정일시'
        };

        // 엑셀 시트에 들어갈 JSON 데이터 배열 생성
        const excelData = targetItems.map(row => {
            const rowData = {};
            Object.keys(headersMap).forEach(key => {
                rowData[headersMap[key]] = row[key] || '';
            });
            return rowData;
        });

        const ws = XLSX.utils.json_to_sheet(excelData);
        // 열 너비 자동 조절 (선택사항)
        ws['!cols'] = Object.keys(headersMap).map(() => ({ wch: 15 }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "사고분석_데이터");
        XLSX.writeFile(wb, `사고분석_데이터_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const MultiSelect = ({ label, options, selected, onChange, width = 'w-32' }) => {
        const [isOpen, setIsOpen] = useState(false);
        const toggleOption = (opt) => {
            if (opt === '전체') onChange([]);
            else onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
        };
        return (
            <div className="flex items-center shrink-0">
                <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">{label}</label>
                <div className="relative">
                    <div onClick={() => setIsOpen(!isOpen)} className={`border border-gray-200 rounded-[3px] bg-white px-2.5 h-[30px] ${width} flex items-center justify-between cursor-pointer hover:border-letusBlue transition-all text-xs`}>
                        <span className="truncate text-gray-700 font-medium">{selected.length === 0 ? '전체' : `${selected[0]}${selected.length > 1 ? ` 외 ${selected.length - 1}` : ''}`}</span>
                        <svg className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                    {isOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                            <div className="absolute top-[105%] left-0 w-48 bg-white border border-gray-200 rounded shadow-xl z-50 py-1.5 max-h-60 overflow-y-auto custom-scrollbar slide-up">
                                <div onClick={() => { toggleOption('전체'); setIsOpen(false); }} className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${selected.length === 0 ? 'text-letusBlue font-bold' : 'text-gray-600'}`}><input type="checkbox" readOnly checked={selected.length === 0} className="w-3.5 h-3.5 accent-letusBlue" /> 전체</div>
                                <div className="h-px bg-gray-100 my-1"></div>
                                {options.map(opt => (<div key={opt} onClick={() => toggleOption(opt)} className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${selected.includes(opt) ? 'text-letusBlue font-bold bg-blue-50/30' : 'text-gray-600'}`}><input type="checkbox" readOnly checked={selected.includes(opt)} className="w-3.5 h-3.5 accent-letusBlue" /> {opt}</div>))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    const handleFileUpload = async (filesObj) => {
        setIsLoading(true); setIsUploadModalOpen(false);
        const applyFilters = filesObj.applyFilters;

        const readExcel = (file) => new Promise(res => {
            if (!file) return res([]);
            const reader = new FileReader();
            reader.onload = e => { const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true }); res(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, dateNF: 'yyyy-mm-dd' })); };
            reader.readAsBinaryString(file);
        });

        try {
            const rawAcc = filesObj.acc ? await readExcel(filesObj.acc) : [];
            const rawSch = filesObj.sch ? await readExcel(filesObj.sch) : [];
            let rawWms = [];
            if (filesObj.wms && filesObj.wms.length > 0) {
                const wmsPromises = filesObj.wms.map(f => readExcel(f));
                const wmsResults = await Promise.all(wmsPromises);
                rawWms = wmsResults.flat();
            }

            const findCol = (row, names) => { for (const n of names) { if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return row[n]; } return ''; };
            const cleanId = (v) => { if (!v) return ""; let s = String(v).trim().toUpperCase(); if (s.endsWith('.0')) s = s.slice(0, -2); return s; };
            const cleanTxt = (v) => v ? String(v).trim().replace(/\.0$/, '') : "";

            const normalizeDate = (d) => {
                if (!d) return 0;
                if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                let s = String(d).replace(/\./g, '-').replace(/\//g, '-').trim().split(' ')[0];
                if (/^\d{8}$/.test(s)) s = `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
                const parsed = new Date(s);
                if (!isNaN(parsed.getTime())) return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
                return 0;
            };

            const schMap = {};
            if (rawSch.length > 0) {
                rawSch.forEach(r => {
                    const id = cleanId(findCol(r, ['수주번호', '오더번호']));
                    if (!id) return;
                    if (!schMap[id]) schMap[id] = [];
                    const dVal = findCol(r, ['시공예정일', '서비스예약일', '예약일']);
                    const reworkFlag = findCol(r, ['재시공']);
                    schMap[id].push({ date: dVal, rework: reworkFlag ? String(reworkFlag).trim().toUpperCase() : '' });
                });
            }

            if (rawWms.length > 0 && rawAcc.length === 0) {
                const wmsByOrder = {};
                rawWms.forEach(r => {
                    const oId = cleanId(findCol(r, ['오더번호', '수주번호', '출고번호']));
                    if (!oId) return;
                    if (!wmsByOrder[oId]) wmsByOrder[oId] = [];
                    wmsByOrder[oId].push({
                        item: cleanTxt(findCol(r, ['ITEM ID', '단품코드', '품목코드'])), loc: findCol(r, ['LOCATION', '로케이션', '존', 'ZONE']), worker: findCol(r, ['작업자', '작업자명', '피커']), time: findCol(r, ['작업일시', '출고일시', '작업시간'])
                    });
                });

                const orderNos = Object.keys(wmsByOrder);
                if (orderNos.length === 0) { alert('WMS 데이터에서 유효한 오더번호를 찾지 못했습니다.'); setIsLoading(false); return; }

                let existingData = []; const FETCH_CHUNK = 200;
                for (let i = 0; i < orderNos.length; i += FETCH_CHUNK) {
                    const chunkOrders = orderNos.slice(i, i + FETCH_CHUNK);
                    const { data, error } = await supabase.from('logistics_accidents').select('id, order_no, item_code, zone, worker_name, shift_type').in('order_no', chunkOrders);
                    if (!error && data) existingData = [...existingData, ...data];
                }

                if (existingData.length === 0) { alert('DB에 등록된 사고 데이터 중 WMS 오더번호와 일치하는 건이 없습니다.\n(상차이슈를 먼저 업로드해 주세요!)'); setIsLoading(false); return; }

                const toUpdateMap = new Map();
                existingData.forEach(row => {
                    const wmsCandidates = wmsByOrder[row.order_no] || [];
                    if (wmsCandidates.length === 0) return;
                    let matchedWms = {};
                    if (wmsCandidates.length === 1) matchedWms = wmsCandidates[0];
                    else matchedWms = wmsCandidates.find(w => w.item.includes(row.item_code) || row.item_code.includes(w.item)) || wmsCandidates[0];
                    const loc = matchedWms.loc; const newZone = loc ? String(loc)[0].toUpperCase() : '';
                    let newShift = '-';
                    if (matchedWms.time) {
                        let h; if (matchedWms.time instanceof Date) h = matchedWms.time.getHours();
                        else { const d = new Date(matchedWms.time); if (!isNaN(d.getTime())) h = d.getHours(); }
                        if (h !== undefined) newShift = (h >= 9 && h < 18) ? '주간' : '야간';
                    }
                    if (row.zone !== newZone || row.worker_name !== matchedWms.worker || row.shift_type !== newShift) {
                        toUpdateMap.set(row.id, { id: row.id, zone: newZone || row.zone, worker_name: matchedWms.worker || row.worker_name, shift_type: newShift !== '-' ? newShift : row.shift_type, updated_at: new Date().toISOString() });
                    }
                });

                const finalToUpdate = Array.from(toUpdateMap.values());
                if (finalToUpdate.length === 0) { alert('✅ WMS 정보가 이미 최신 상태로 모두 반영되어 있습니다.'); setIsLoading(false); return; }

                const CHUNK_SIZE = 500;
                for (let i = 0; i < finalToUpdate.length; i += CHUNK_SIZE) {
                    const chunk = finalToUpdate.slice(i, i + CHUNK_SIZE);
                    const { error } = await supabase.from('logistics_accidents').upsert(chunk, { onConflict: 'id' });
                    if (error) throw error;
                }
                alert(`🎉 WMS 정보 반영 완료!\n- ${finalToUpdate.length}건의 데이터에 [ZONE/작업자/주야] 정보가 업데이트 되었습니다.`);
            }
            else if (rawAcc.length > 0) {
                const wmsByOrder = {};
                rawWms.forEach(r => {
                    const oId = cleanId(findCol(r, ['오더번호', '수주번호', '출고번호']));
                    if (!oId) return;
                    if (!wmsByOrder[oId]) wmsByOrder[oId] = [];
                    wmsByOrder[oId].push({
                        item: cleanTxt(findCol(r, ['ITEM ID', '단품코드', '품목코드'])), loc: findCol(r, ['LOCATION', '로케이션', '존', 'ZONE']), worker: findCol(r, ['작업자', '작업자명', '피커']), time: findCol(r, ['작업일시', '출고일시', '작업시간'])
                    });
                });

                const validTypes = ['정상출고', '미출고', '오출고', '과출고', '물류파손', '시공파손', '현장직출', '센터직출', '납기연기(건)', '납기연기(품목)', '제품분실'];
                const processed = [];

                rawAcc.forEach(row => {
                    const brandStr = cleanTxt(row['브랜드']);
                    const issueStr = cleanTxt(row['이슈내용']);
                    if (applyFilters) {
                        if (brandStr.includes('이케아')) return;
                        if (issueStr.includes('[SCM팀 부족량 CUT 조치결과]')) return;
                    }
                    let type = cleanTxt(row['조치결과구분']);
                    if (!validTypes.includes(type)) {
                        if (type === '') type = '미확인';
                        else return;
                    }
                    const orderId = cleanId(findCol(row, ['수주번호']));
                    if (!orderId) return;

                    const accDate = findCol(row, ['서비스예약일', '예약일', '시공예정일']);

                    let delayCount = 0;
                    if (schMap[orderId]) {
                        const hasDelay = schMap[orderId].some(item => item.rework === 'R');
                        if (hasDelay) delayCount = 1;
                    }
                    const isDelayed = delayCount > 0 ? "재일정(지연)" : "-";

                    const item = cleanTxt(findCol(row, ['단품코드', '품목코드']));
                    const color = cleanTxt(row['색상']);
                    let finalItemCode = item;
                    if (color && !item.includes(color) && !item.includes('-')) { finalItemCode = `${item}-${color}`; }
                    const wmsCandidates = wmsByOrder[orderId] || [];
                    let matchedWms = {};
                    if (wmsCandidates.length === 1) matchedWms = wmsCandidates[0];
                    else if (wmsCandidates.length > 1) matchedWms = wmsCandidates.find(w => w.item.includes(item) || item.includes(w.item)) || wmsCandidates[0];
                    const loc = matchedWms.loc;
                    const zone = loc ? String(loc)[0].toUpperCase() : '';
                    let shift = '-';
                    if (matchedWms.time) {
                        let h; if (matchedWms.time instanceof Date) h = matchedWms.time.getHours();
                        else { const d = new Date(matchedWms.time); if (!isNaN(d.getTime())) h = d.getHours(); }
                        if (h !== undefined) shift = (h >= 9 && h < 18) ? '주간' : '야간';
                    }
                    processed.push({
                        service_date: accDate && String(accDate).trim() !== '' ? accDate : null, brand: brandStr || '알수없음', service_center: row['서비스센터'] || '', service_type: row['시공/AS'] || '',
                        order_no: orderId, order_name: row['수주건명'] || '', item_code: finalItemCode, issue_qty: parseInt(row['이슈수량']) || 0,
                        action_result: type, is_delayed: isDelayed, zone: zone, worker_name: matchedWms.worker || '', shift_type: shift, status: '원인 파악 중'
                    });
                });

                if (processed.length === 0) { alert('분석 결과 저장할 데이터가 없습니다.'); setIsLoading(false); return; }
                const orderNos = [...new Set(processed.map(p => p.order_no))];

                let existingData = []; const FETCH_CHUNK = 200;
                for (let i = 0; i < orderNos.length; i += FETCH_CHUNK) {
                    const chunkOrders = orderNos.slice(i, i + FETCH_CHUNK);
                    const { data, error } = await supabase.from('logistics_accidents').select('id, order_no, item_code, is_delayed, zone, worker_name, shift_type').in('order_no', chunkOrders);
                    if (!error && data) existingData = [...existingData, ...data];
                }

                const existingMap = new Map();
                (existingData || []).forEach(d => { existingMap.set(`${d.order_no}_${d.item_code}`, d); });
                const toInsert = []; const toUpdate = [];
                processed.forEach(p => {
                    const key = `${p.order_no}_${p.item_code}`;
                    const existingRow = existingMap.get(key);
                    if (!existingRow) { toInsert.push(p); }
                    else {
                        let finalDelayed = existingRow.is_delayed;
                        if (p.is_delayed === '재일정(지연)') finalDelayed = '재일정(지연)';
                        let finalZone = existingRow.zone; let finalWorker = existingRow.worker_name; let finalShift = existingRow.shift_type;
                        if (p.worker_name) { finalZone = p.zone; finalWorker = p.worker_name; finalShift = p.shift_type; }
                        toUpdate.push({
                            id: existingRow.id, service_date: p.service_date, brand: p.brand, service_center: p.service_center, service_type: p.service_type,
                            order_no: p.order_no, order_name: p.order_name, item_code: p.item_code, issue_qty: p.issue_qty, action_result: p.action_result,
                            is_delayed: finalDelayed, zone: finalZone, worker_name: finalWorker, shift_type: finalShift, updated_at: new Date().toISOString()
                        });
                    }
                });

                // 🔥 중복 제거 로직
                const uniqueUpdateMap = new Map();
                toUpdate.forEach(item => uniqueUpdateMap.set(item.id, item));
                const finalToUpdate = Array.from(uniqueUpdateMap.values());

                const uniqueInsertMap = new Map();
                toInsert.forEach(item => uniqueInsertMap.set(`${item.order_no}_${item.item_code}`, item));
                const finalToInsert = Array.from(uniqueInsertMap.values());

                if (finalToInsert.length === 0 && finalToUpdate.length === 0) { alert(`✅ 이미 최신 상태입니다.`); setIsLoading(false); return; }

                const CHUNK_SIZE = 500;
                if (finalToInsert.length > 0) {
                    for (let i = 0; i < finalToInsert.length; i += CHUNK_SIZE) {
                        const chunk = finalToInsert.slice(i, i + CHUNK_SIZE);
                        const { error } = await supabase.from('logistics_accidents').insert(chunk);
                        if (error) throw error;
                    }
                }
                if (finalToUpdate.length > 0) {
                    for (let i = 0; i < finalToUpdate.length; i += CHUNK_SIZE) {
                        const chunk = finalToUpdate.slice(i, i + CHUNK_SIZE);
                        const { error } = await supabase.from('logistics_accidents').upsert(chunk, { onConflict: 'id' });
                        if (error) throw error;
                    }
                }
                alert(`🎉 업데이트 완료!\n- 신규: ${finalToInsert.length}건\n- 수정: ${finalToUpdate.length}건\n(중복 제외됨)`);
            }
            else if (rawSch.length > 0) {
                const orderNos = Object.keys(schMap);
                let existingData = []; const FETCH_CHUNK = 200;
                for (let i = 0; i < orderNos.length; i += FETCH_CHUNK) {
                    const chunkOrders = orderNos.slice(i, i + FETCH_CHUNK);
                    const { data, error } = await supabase.from('logistics_accidents').select('id, order_no, service_date, is_delayed').in('order_no', chunkOrders);
                    if (!error && data) existingData = [...existingData, ...data];
                }

                const toUpdate = [];
                existingData.forEach(row => {
                    let isDelayedNow = false;
                    if (schMap[row.order_no]) { isDelayedNow = schMap[row.order_no].some(item => item.rework === 'R'); }
                    if (isDelayedNow && row.is_delayed !== '재일정(지연)') {
                        toUpdate.push({ id: row.id, is_delayed: '재일정(지연)', updated_at: new Date().toISOString() });
                    }
                });

                if (toUpdate.length > 0) {
                    const UPDATE_CHUNK = 500;
                    for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
                        const chunk = toUpdate.slice(i, i + UPDATE_CHUNK);
                        const { error } = await supabase.from('logistics_accidents').upsert(chunk, { onConflict: 'id' });
                        if (error) throw error;
                    }
                    alert(`✅ 지연 업데이트 완료 (${toUpdate.length}건)`);
                } else { alert('✅ 새롭게 지연된 건이 없습니다.'); }
            }
            fetchAccidents();
        } catch (error) {
            console.error('❌ 업로드 에러 전문:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
                full: error
            });
            alert(`오류: ${error.message}\n상세: ${error.details || '-'}\n힌트: ${error.hint || '-'}\n코드: ${error.code || '-'}`);
            setIsLoading(false);
        }
    };

    return (
        // 🚩 [수정 완료] 맨 위에 두 겹으로 겹쳐있던 div를 완벽한 템플릿 하나로 합쳤습니다!
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* 1. 검색 박스 구역 (사용자 관리 스타일로 통일) */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex flex-col gap-3 z-30 shrink-0 transition-all duration-300">
                <div className="flex items-center gap-5 w-full flex-wrap">
                    <MultiSelect label="브랜드" options={['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소']} selected={draftFilters.brands} onChange={(val) => setDraftFilters({ ...draftFilters, brands: val })} />

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">서비스예약일</label>
                        <div className="flex items-center">
                            <input type="date" value={draftFilters.startDate} onChange={e => setDraftFilters({ ...draftFilters, startDate: e.target.value })} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] w-[110px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700" />
                            <span className="mx-1 text-gray-400 text-xs font-bold">~</span>
                            <input type="date" value={draftFilters.endDate} onChange={e => setDraftFilters({ ...draftFilters, endDate: e.target.value })} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] w-[110px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700" />
                        </div>
                    </div>

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">검색어</label>
                        <div className="flex gap-0 h-[30px]">
                            <select value={draftFilters.searchType} onChange={e => setDraftFilters({ ...draftFilters, searchType: e.target.value })} className="border border-gray-200 border-r-0 rounded-l-[3px] text-xs px-2 text-gray-700 bg-gray-50 focus:outline-none cursor-pointer h-full">
                                <option>수주건명</option>
                                <option>수주번호</option>
                                <option>품목코드</option>
                            </select>
                            <input type="text" value={draftFilters.searchValue} onChange={e => setDraftFilters({ ...draftFilters, searchValue: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleSearchClick()} className="border border-gray-200 rounded-r-[3px] text-xs px-2.5 w-36 focus:outline-none focus:border-letusOrange h-full" placeholder="검색어 입력" />
                        </div>
                    </div>

                    <div className="flex items-center shrink-0 bg-blue-50/50 px-3 h-[30px] rounded-[3px] border border-blue-100">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-letusBlue h-full">
                            <input type="checkbox" checked={draftFilters.excludeNormal} onChange={e => setDraftFilters({ ...draftFilters, excludeNormal: e.target.checked })} className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                            '정상출고' 제외
                        </label>
                    </div>

                    <div className="ml-auto shrink-0 flex items-center gap-2">
                        <button onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className={`text-[11px] font-bold border px-3 h-[30px] rounded-[3px] transition-colors flex items-center gap-1 shadow-sm ${isAdvancedOpen ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                            <svg className={`w-3.5 h-3.5 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            상세 조회
                        </button>
                        <div className="w-px h-4 bg-gray-200 mx-1"></div>
                        <button onClick={handleResetClick} className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] transition-colors text-xs">초기화</button>
                        <button onClick={handleSearchClick} className="bg-letusOrange text-white hover:bg-orange-600 font-bold px-6 h-[30px] rounded-[3px] transition-colors text-xs flex items-center justify-center shadow-sm gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> 조회하기
                        </button>
                    </div>
                </div>

                {isAdvancedOpen && (
                    <div className="flex flex-col gap-3 pt-3 mt-1 border-t border-gray-100 slide-up">
                        <div className="flex items-center gap-6 w-full flex-wrap">
                            <MultiSelect label="서비스센터" options={['양지센터', '대전센터', '대구센터', '광주센터', '전북센터', '전남센터', '부산센터', '울산센터', '창원센터', '제주센터']} selected={draftFilters.centers} onChange={(val) => setDraftFilters({ ...draftFilters, centers: val })} width="w-40" />
                            <MultiSelect label="시공/AS" options={['시공', 'AS']} selected={draftFilters.serviceTypes} onChange={(val) => setDraftFilters({ ...draftFilters, serviceTypes: val })} width="w-24" />
                            <MultiSelect label="처리상태" options={['원인 파악 중', '등록 완료']} selected={draftFilters.statuses} onChange={(val) => setDraftFilters({ ...draftFilters, statuses: val })} width="w-32" />
                            <MultiSelect label="귀책부서" options={['물류사업1팀', '물류사업2팀', '운송사업팀', '컨택센터', '라스트마일1팀', '라스트마일2팀', '기타']} selected={draftFilters.depts} onChange={(val) => setDraftFilters({ ...draftFilters, depts: val })} width="w-40" />

                            {/* 🚩 라벨명 수정: 조치결과 -> 확인 결과 */}
                            <MultiSelect label="확인 결과" options={['정상출고', '미출고', '오출고', '과출고', '물류파손', '시공파손', '현장직출', '센터직출', '납기연기(건)', '납기연기(품목)', '제품분실']} selected={draftFilters.actionResults} onChange={(val) => setDraftFilters({ ...draftFilters, actionResults: val })} width="w-40" />

                            <div className="flex items-center shrink-0">
                                <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">지연판별</label>
                                <select value={draftFilters.isDelayed} onChange={e => setDraftFilters({ ...draftFilters, isDelayed: e.target.value })} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange cursor-pointer bg-white text-gray-700 w-32 font-medium">
                                    <option value="전체">전체 (All)</option>
                                    <option value="지연">재일정(지연)</option>
                                    <option value="정상">정상(지연없음)</option>
                                </select>
                            </div>

                            {/* 🚩 AI 분석 뷰 토글 스위치 (관리자 전용, 가장 우측 배치) */}
                            {userProfile?.role === '관리자' && (
                                <div className="flex items-center ml-auto pl-4 border-l border-gray-200 shrink-0">
                                    <button
                                        onClick={() => setIsAiView(!isAiView)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-[4px] text-xs font-black transition-all border ${isAiView
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                            : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'
                                            }`}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        {isAiView ? 'AI 분석 뷰 ON' : 'AI 분석 뷰 OFF'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 2. 선택실행 (드롭다운) 구역 (사용자 관리 스타일로 통일) */}
            <div className="flex justify-end w-full px-2 z-30 -mt-1 mb-1 shrink-0 gap-3">

                {userProfile?.role === '관리자' && (
                    <button onClick={() => setIsUploadModalOpen(true)} className="bg-white border border-green-600 text-green-600 px-4 py-[7px] rounded-[3px] text-[11px] font-bold flex items-center cursor-pointer hover:bg-green-50 transition-colors shadow-sm h-[32px]">
                        <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21.17 3.25q.33 0 .59.25q.24.26.24.59v15.82q0 .33-.24.59q-.26.25-.59.25H2.83q-.33 0-.59-.25q-.24-.26-.24-.59V4.09q0-.33.24-.59q.26-.25.59-.25h18.34zm-8.25 10.9l3.52 4.67h2.7l-4.9-6.07 4.65-5.94h-2.65l-3.23 4.48-3.32-4.48H7.07l4.76 5.94-5 6.07h2.72l3.37-4.67z" /></svg> 데이터 통합 업로드 (Excel)
                    </button>
                )}

                <div className="relative z-50">
                    <button
                        onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                        className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[90px] h-[32px]"
                    >
                        선택실행 {selectedIds.length > 0 && `(${selectedIds.length})`}
                        <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {isActionMenuOpen && (
                        <>
                            <div className="fixed inset-0" onClick={() => setIsActionMenuOpen(false)}></div>
                            <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">

                                {/* 🚩 🤖 단일화된 AI 분석 실행 버튼 */}
                                <button
                                    onClick={handleAiAnalysis}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-purple-600 hover:bg-purple-50 transition-colors flex items-center justify-between"
                                >
                                    AI 원인 분석 실행
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </button>

                                <div className="h-px bg-gray-100 my-1"></div>

                                <button
                                    onClick={() => { setIsActionMenuOpen(false); if (selectedIds.length === 0) return alert('항목을 체크해 주세요.'); setIsBulkEditModalOpen(true); }}
                                    className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors ${selectedIds.length > 0 ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
                                >
                                    일괄 마감 (수정)
                                </button>

                                <div className="h-px bg-gray-100 my-1"></div>

                                <button
                                    onClick={() => { setIsActionMenuOpen(false); handleExportExcel(); }}
                                    className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors flex items-center justify-between ${selectedIds.length > 0 ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 cursor-not-allowed'}`}
                                >
                                    엑셀 추출
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                </button>

                                {userProfile?.role === '관리자' && (
                                    <>
                                        <div className="h-px bg-gray-100 my-1"></div>
                                        <button
                                            onClick={() => { setIsActionMenuOpen(false); handleDeleteSelected(); }}
                                            className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex justify-between items-center ${selectedIds.length > 0 ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}
                                        >
                                            삭제
                                            {selectedIds.length > 0 && <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 🚩 문제 1 해결: 표 컨테이너에 flex-1 을 주어 남은 공간을 꽉 채우도록 만듦! */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar">
                    {/* 🚩 1. table-fixed와 min-w-[1420px] 제거 (사용자 관리 메뉴와 동일한 뼈대로 복원) */}
                    <table className="w-full text-left whitespace-nowrap text-[13px]">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                {/* 🚩 2. 사용자 관리와 토씨 하나 안 틀린 동일한 클래스 적용 + 절대 너비 60px 고정! */}
                                <th className="p-4 pl-6 text-center" style={{ width: '60px' }}>
                                    <input
                                        type="checkbox"
                                        checked={sortedItems.length > 0 && selectedIds.length === sortedItems.length}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 cursor-pointer accent-letusBlue"
                                    />
                                </th>
                                {[
                                    { label: '서비스예약일', key: 'service_date', w: '110px' },
                                    { label: '브랜드', key: 'brand', w: '90px' },
                                    { label: '서비스센터', key: 'service_center', w: '90px' },
                                    { label: '시공/AS', key: 'service_type', w: '80px' },
                                    { label: '수주번호', key: 'order_no', w: '150px' },
                                    { label: '수주건명', key: 'order_name', w: '300px' },
                                    { label: '품목코드', key: 'item_code', w: '180px' },
                                    { label: '수량', key: 'issue_qty', w: '70px' },
                                    { label: '처리상태', key: 'status', w: '120px' },
                                    { label: '귀책부서', key: 'responsible_dept', w: '120px' },
                                    ...(isAiView
                                        ? [
                                            { label: '🤖 AI 사고 원인 분석', key: 'ai_analyzed_cause', w: '240px' },
                                            { label: '', key: null, w: '0px' } // 👻 1. 유령 컬럼 투입! (칸 개수 맞추기용)
                                        ]
                                        : [
                                            { label: '확인 결과', key: 'action_result', w: '130px' },
                                            { label: '납기지연판별', key: 'is_delayed', w: '110px' }
                                        ]
                                    )
                                ].map((col, idx) => (
                                    <th
                                        key={idx}
                                        className={`${col.w === '0px' ? 'p-0 border-none' : 'p-4'} text-center select-none ${col.key ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}`}
                                        style={{ width: col.w }}
                                        onClick={() => col.key && requestSort(col.key)}
                                    >
                                        <div className="flex items-center justify-center gap-1">
                                            {col.label} {col.key && getSortIcon(col.key)}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                            {isLoading ? (
                                <tr><td colSpan="13" className="py-32 text-center"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div><p className="text-gray-500 font-bold">데이터 로딩 중...</p></div></td></tr>
                            ) : sortedItems.length === 0 ? (
                                <tr><td colSpan="13" className="p-20 text-center text-gray-400 font-bold">조회 결과가 없습니다.</td></tr>
                            ) : (
                                <>
                                    {sortedItems.slice(0, 300).map(row => (
                                        <tr
                                            key={row.id}
                                            onDoubleClick={() => { window.getSelection()?.removeAllRanges(); setActiveRow(row); }}
                                            className={`cursor-pointer transition-colors ${selectedIds.includes(row.id) ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-blue-50/30'}`}
                                        >
                                            {/* 🚩 바디 셀에서도 w-10 제거 (헤더의 60px을 그대로 따라가며 완벽한 칼각 유지) */}
                                            <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(row.id)}
                                                    onChange={() => handleSelectOne(row.id)}
                                                    className="w-4 h-4 cursor-pointer accent-letusBlue"
                                                />
                                            </td>
                                            <td className="p-4 text-center text-gray-700">{row.service_date}</td>
                                            <td className="p-4 text-center font-semibold">{row.brand}</td>
                                            <td className="p-4 text-center text-gray-600">{row.service_center}</td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.service_type === '시공' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                                                    {row.service_type}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center font-mono text-gray-500">{row.order_no}</td>
                                            <td className="p-4 font-bold text-gray-800 text-sm tracking-tight truncate max-w-[300px]" title={row.order_name}>
                                                {row.order_name}
                                            </td>
                                            <td className="p-4 font-bold text-gray-600 truncate">{row.item_code}</td>
                                            <td className="p-4 text-center font-bold">{row.issue_qty}</td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 rounded text-[11px] font-bold ${row.status === '등록 완료' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-100 animate-pulse'}`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center font-bold text-letusBlue">{row.responsible_dept || '-'}</td>
                                            {!isAiView ? (
                                                <>
                                                    <td className="p-4 text-center text-gray-600">{row.action_result}</td>
                                                    <td className={`p-4 font-black text-center ${row.is_delayed !== '-' ? 'text-red-500' : 'text-gray-400'}`}>
                                                        {row.is_delayed}
                                                    </td>
                                                </>
                                            ) : (
                                                // 🚩 React 에러 방지: 두 개의 td를 묶어주는 투명 보따리(<>) 추가!
                                                <>
                                                    <td className="py-3 px-4 text-center bg-purple-50/20">
                                                        {row.ai_analyzed_cause ? (
                                                            <div className="flex flex-col items-center gap-0.5 group relative">
                                                                {/* 🔄 대분류 + 소분류를 가로로 배치 */}
                                                                <div className="flex items-center gap-1.5">
                                                                    {/* 대분류 배지 */}
                                                                    <span className="px-3 py-0.5 rounded-full font-black text-[11px] bg-purple-100 text-purple-700 border border-purple-200 shadow-sm inline-block">
                                                                        {row.ai_analyzed_cause}
                                                                    </span>

                                                                    {/* 소분류 (대분류 오른쪽에 표시) */}
                                                                    {row.ai_cause_detail && (
                                                                        <span className="text-[10px] font-bold text-purple-500 tracking-tight whitespace-nowrap">
                                                                            {row.ai_cause_detail}
                                                                            {row.ai_confidence === 'low' && (
                                                                                <span className="ml-1 text-amber-500" title="신뢰도 낮음 — 재분석 권장">⚠</span>
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* 상세 서술 툴팁 (hover 시 노출) */}
                                                                {row.ai_cause_summary && (
                                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-64 p-3 bg-slate-800 text-white text-[11px] rounded-lg shadow-xl pointer-events-none">
                                                                        <div className="font-bold text-purple-200 mb-1">🤖 AI 상세 분석</div>
                                                                        <div className="text-white mb-2">{row.ai_cause_summary}</div>
                                                                        {row.ai_keywords && row.ai_keywords.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                                                {row.ai_keywords.map((kw, i) => (
                                                                                    <span key={i} className="px-1.5 py-0.5 bg-purple-500/30 rounded text-[10px]">
                                                                                        #{kw}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        <div className="mt-1.5 pt-1.5 border-t border-slate-600 text-[10px] text-slate-300">
                                                                            신뢰도: {row.ai_confidence === 'high' ? '🟢 높음' : row.ai_confidence === 'medium' ? '🟡 보통' : '🔴 낮음'}
                                                                        </div>
                                                                        {/* 툴팁 꼬리 */}
                                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-slate-800"></div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[11px] font-bold text-slate-400 italic">대기중...</span>
                                                        )}
                                                    </td>
                                                    {/* 👻 3. 유령 컬럼 투입 (에러 없이 작동!) */}
                                                    <td className="p-0 border-none w-0"></td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {activeRow && <AccidentModal row={activeRow} onClose={() => setActiveRow(null)} onReload={fetchAccidents} userProfile={userProfile} />}
            {isUploadModalOpen && <AccidentUploadModal onClose={() => setIsUploadModalOpen(false)} onFileUpload={handleFileUpload} />}

            {/* 🔥 일괄 수정 모달 컴포넌트 추가 */}
            {isBulkEditModalOpen && <AccidentBulkEditModal selectedIds={selectedIds} onClose={() => { setIsBulkEditModalOpen(false); setSelectedIds([]); }} onReload={fetchAccidents} userProfile={userProfile} />}
        </div>
    );
};

// 🌟 전역 등록 (MainLayout과 App에서 찾아쓸 수 있게)
export { AccidentModal };
export { AccidentBulkEditModal };
export { AccidentUploadModal };
export { AccidentDashboard };
export { AccidentList };
