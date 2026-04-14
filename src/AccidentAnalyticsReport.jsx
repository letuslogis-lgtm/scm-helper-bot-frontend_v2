import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, adminSupabase } from './supabaseClient.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line, ComposedChart, Area, AreaChart } from 'recharts';





const AccidentAnalyticsReport = ({ userProfile, onDrillDown }) => {
    const [accidents, setAccidents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterType, setFilterType] = useState('M');

    // 🚩 AI 분석을 위한 상태 추가
    const [aiReport, setAiReport] = useState(null);
    const [isAiLoading, setIsAiLoading] = useState(false);

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
        } else if (filterType === 'W') {
            const day = now.getDay();
            const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(now);
            monday.setDate(diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return { startDate: format(monday), endDate: format(sunday), label: '이번 주 현황' };
        } else if (filterType === 'M') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { startDate: format(firstDay), endDate: format(lastDay), label: '이번 달 현황' };
        } else {
            return { startDate: customDate.start, endDate: customDate.end, label: '사용자 지정 기간' };
        }
    };

    const { startDate, endDate, label } = getFilterDates();

    const fetchAnalyticsData = async () => {
        setIsLoading(true);
        // 🚩 기간이 바뀌면 기존 AI 리포트 리셋!
        setAiReport(null);

        try {
            const { data, error } = await window.supabase
                .from('logistics_accidents')
                .select('*')
                .gte('service_date', startDate)
                .lte('service_date', endDate)
                .neq('action_result', '정상출고'); // 🚩 정상출고 제외

            if (error) throw error;
            setAccidents(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchAnalyticsData(); }, [startDate, endDate]);

    // 🧠 1. 요주의 품목 (Bad Actor SKU) Top 8
    const skuData = useMemo(() => {
        const stats = accidents.reduce((acc, curr) => {
            const item = curr.item_code || '품목없음';
            if (item !== '품목없음') acc[item] = (acc[item] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(stats).map(name => ({ name, value: stats[name] })).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [accidents]);

    // 🧠 2. 사고 발생 ZONE 핫스팟 (데이터 클렌징 완벽 적용)
    const zoneData = useMemo(() => {
        const stats = accidents.reduce((acc, curr) => {
            let rawZone = curr.zone ? String(curr.zone).trim() : '';
            const zone = (!rawZone || rawZone === '-') ? '미분류' : rawZone;
            acc[zone] = (acc[zone] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(stats).map(name => ({ name: name === '미분류' ? '미분류' : `${name} 구역`, value: stats[name] })).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [accidents]);

    // 🧠 3. 요주의 작업자 (Quality Index) Top 8
    const workerData = useMemo(() => {
        const stats = accidents.reduce((acc, curr) => {
            let rawWorker = curr.worker_name ? String(curr.worker_name).trim() : '';
            if (rawWorker !== '' && rawWorker !== '-') {
                acc[rawWorker] = (acc[rawWorker] || 0) + 1;
            }
            return acc;
        }, {});
        return Object.keys(stats).map(name => ({ name, value: stats[name] })).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [accidents]);

    // 🧠 4. AI 분석 근본 원인 (Root Cause)
    const aiCauseData = useMemo(() => {
        const stats = accidents.reduce((acc, curr) => {
            const cause = curr.ai_analyzed_cause || '분석 대기/미분류';
            acc[cause] = (acc[cause] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(stats).map(name => ({ name, value: stats[name] })).sort((a, b) => b.value - a.value).slice(0, 8);
    }, [accidents]);


    // 🤖 AI 리포트 생성 함수 (트리거)
    const handleGenerateAiReport = () => {
        if (accidents.length === 0) {
            alert('분석할 데이터가 없습니다.');
            return;
        }

        setIsAiLoading(true);

        // 💡 실제로는 여기서 OpenAI나 Gemini API로 데이터를 쏴서 받아와야 합니다!
        // 지금은 기훈님이 API를 연결하시기 전까지 테스트하실 수 있도록, 
        // 현재 화면의 데이터를 바탕으로 "가상의 AI"가 그럴싸하게 분석해주는 로직을 넣었습니다.
        setTimeout(() => {
            const topSku = skuData[0] ? `${skuData[0].name}(${skuData[0].value}건)` : '특정 품목';
            const topZone = zoneData[0] ? `${zoneData[0].name}(${zoneData[0].value}건)` : '특정 구역';
            const topCause = aiCauseData[0] ? aiCauseData[0].name : '특정 원인';

            const generatedText = `현재 조회하신 기간(${startDate} ~ ${endDate}) 동안 총 **${accidents.length}건**의 물류 사고가 발생했습니다. AI 데이터 패턴 분석 결과, 아래의 핵심 개선점을 제안합니다.

1. **${topZone} 집중 관리 필요**: 전체 에러 발생의 가장 큰 비중을 차지하고 있습니다. 해당 구역의 동선 혼잡도, 바코드 스캐너(PDA) 통신 상태, 또는 조명 및 작업 환경에 대한 물리적 점검을 강력히 권장합니다.
2. **요주의 품목 [${topSku}] 패키징 재검토**: 해당 품목에서 지속적인 에러가 탐지되었습니다. 제품 외관의 바코드 위치가 인식하기 어렵거나, 합포장 시 파손 위험이 높은 구조인지 포장(패키징) 프로세스를 재검토해야 합니다.
3. **근본 원인 [${topCause}] 개선 방안**: 가장 빈번한 사고 원인이 '${topCause}'로 지목되었습니다. 이는 개별 작업자의 실수가 아닌 시스템/프로세스의 구조적 문제일 확률이 높습니다. 관련 부서(시공/전산 등)와의 크로스 체크 미팅을 제안합니다.`;

            setAiReport(generatedText);
            setIsAiLoading(false);
        }, 1500); // 1.5초 로딩 연출
    };


    const PIE_COLORS = ['#3b82f6', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899'];

    return (
        <div className="p-6 bg-slate-100 min-h-[calc(100vh-64px)] slide-up flex flex-col gap-5 w-full mx-auto pb-20">

            {/* 🎯 상단 헤더 및 필터 구역 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 shrink-0 z-10 flex flex-col md:flex-row md:justify-between md:items-end gap-4 hover:shadow-md transition-shadow">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 font-sans flex items-center gap-2">
                        🕵️‍♂️ 물류 심층 분석 리포트
                        <span className="bg-purple-50 text-purple-600 text-[10px] px-2 py-0.5 rounded border border-purple-100 font-black tracking-wide">ADMIN</span>
                    </h2>
                    <p className="text-xs text-gray-400 font-medium mt-1.5">조회 기간: {startDate} ~ {endDate}</p>
                </div>

                <div className="flex items-center gap-2">
                    {filterType === 'CUSTOM' && (
                        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 animate-fade-in shadow-sm">
                            <input type="date" value={customDate.start} onChange={e => setCustomDate({ ...customDate, start: e.target.value })} className="bg-transparent text-xs text-gray-700 font-bold focus:outline-none cursor-pointer px-1 w-[110px]" />
                            <span className="text-gray-400 text-xs mx-1">~</span>
                            <input type="date" value={customDate.end} onChange={e => setCustomDate({ ...customDate, end: e.target.value })} className="bg-transparent text-xs text-gray-700 font-bold focus:outline-none cursor-pointer px-1 w-[110px]" />
                        </div>
                    )}
                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner">
                        {[{ id: 'D', name: '당일' }, { id: 'W', name: '주간' }, { id: 'M', name: '월간' }, { id: 'CUSTOM', name: '직접지정' }].map(btn => (
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

            {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                    <div className="w-10 h-10 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-500 font-bold text-sm">심층 데이터를 분석 중입니다...</p>
                </div>
            ) : accidents.length === 0 ? (
                <div className="flex-1 flex items-center justify-center bg-white rounded-xl border border-slate-200 min-h-[400px]">
                    <p className="text-gray-400 font-bold text-xs">해당 기간에 분석할 데이터가 없습니다.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1">

                    {/* 📦 1. 요주의 품목 (Bad Actor SKU) */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                        <div className="mb-4">
                            <h3 className="font-bold text-gray-700 text-sm flex items-center gap-1.5">🚨 요주의 품목 (Bad Actor SKU) Top 8</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">이슈가 가장 빈번하게 발생하는 품목코드 현황입니다.</p>
                        </div>
                        <div className="flex-1 min-h-[250px] flex flex-col justify-center space-y-4 px-2">
                            {skuData.length > 0 ? skuData.map((item, index) => {
                                const total = skuData.reduce((a, b) => a + b.value, 0);
                                const percent = ((item.value / total) * 100).toFixed(1);
                                return (
                                    <div
                                        key={item.name}
                                        className="flex items-center text-sm group cursor-pointer hover:bg-slate-50 p-1 -mx-1 rounded transition-colors"
                                        title={`${item.name} 상세 보기`}
                                        onClick={() => onDrillDown && onDrillDown({ searchType: '품목코드', searchValue: item.name, startDate, endDate, excludeNormal: true })}
                                    >
                                        <span className="w-32 shrink-0 text-gray-600 font-semibold truncate text-right mr-4 text-xs">{item.name}</span>
                                        <div className="flex-1 h-5 rounded overflow-hidden bg-gray-100 relative">
                                            <div className="h-full rounded-r transition-all duration-1000 ease-out" style={{ width: `${percent}%`, backgroundColor: '#ef4444' }}></div>
                                        </div>
                                        <span className="w-14 text-right text-xs font-bold text-gray-500 ml-3">{item.value}건</span>
                                    </div>
                                );
                            }) : <div className="text-center text-gray-400 font-bold text-xs">데이터가 없습니다.</div>}
                        </div>
                    </div>

                    {/* 👤 2. 작업자 품질 지수 (Worker Quality Index) */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                        <div className="mb-4">
                            <h3 className="font-bold text-gray-700 text-sm flex items-center gap-1.5">👤 요주의 작업자 품질 지수 Top 8</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">오작업 및 파손 빈도가 높은 작업자/업체 지표입니다.</p>
                        </div>
                        <div className="flex-1 min-h-[250px] flex flex-col justify-center space-y-4 px-2">
                            {workerData.length > 0 ? workerData.map((item, index) => {
                                const total = workerData.reduce((a, b) => a + b.value, 0);
                                const percent = ((item.value / total) * 100).toFixed(1);
                                return (
                                    <div
                                        key={item.name}
                                        className="flex items-center text-sm group cursor-pointer hover:bg-slate-50 p-1 -mx-1 rounded transition-colors"
                                        title={`${item.name} 상세 보기`}
                                        onClick={() => onDrillDown && onDrillDown({ workers: [item.name], startDate, endDate, excludeNormal: true })}
                                    >
                                        <span className="w-32 shrink-0 text-gray-600 font-semibold truncate text-right mr-4 text-xs">{item.name}</span>
                                        <div className="flex-1 h-5 rounded overflow-hidden bg-gray-100 relative">
                                            <div className="h-full rounded-r transition-all duration-1000 ease-out" style={{ width: `${percent}%`, backgroundColor: '#f97316' }}></div>
                                        </div>
                                        <span className="w-14 text-right text-xs font-bold text-gray-500 ml-3">{item.value}건</span>
                                    </div>
                                );
                            }) : <div className="text-center text-gray-400 font-bold text-xs">데이터가 없습니다.</div>}
                        </div>
                    </div>

                    {/* 🗺️ 3. 사고 발생 ZONE 핫스팟 */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                        <div className="mb-2">
                            <h3 className="font-bold text-gray-700 text-sm flex items-center gap-1.5">🗺️ 에러 핫스팟 (ZONE별 비율)</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">물류센터 내 구역(ZONE)별 사고 발생 집중도입니다.</p>
                        </div>
                        <div className="flex-1 min-h-[280px] relative">
                            {zoneData.length > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={zoneData} cx="50%" cy="45%" innerRadius={65} outerRadius={90} paddingAngle={4} cornerRadius={8} dataKey="value" stroke="none"
                                                onClick={(data) => onDrillDown && onDrillDown({ zones: [data.name.replace(' 구역', '')], startDate, endDate, excludeNormal: true })}
                                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                            >
                                                {zoneData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute top-[43%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-[28px] font-black leading-none text-gray-900 mb-1">
                                            {zoneData.reduce((a, b) => a + b.value, 0)}
                                        </span>
                                        <span className="text-xs font-semibold leading-none text-gray-500">
                                            총 발생건
                                        </span>
                                    </div>
                                </>
                            ) : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">데이터가 없습니다.</div>}
                        </div>
                    </div>

                    {/* 🤖 4. AI 분석 근본 원인 파악 */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                        <div className="mb-4">
                            <h3 className="font-bold text-gray-700 text-sm flex items-center gap-1.5">🤖 AI 원인 분석 (Root Cause)</h3>
                            <p className="text-[11px] text-gray-400 mt-0.5">AI가 사고 상세 내용을 분석하여 도출한 근본 원인 현황입니다.</p>
                        </div>
                        <div className="flex-1 min-h-[250px] flex flex-col justify-center space-y-4 px-2">
                            {aiCauseData.length > 0 ? aiCauseData.map((item, index) => {
                                const total = aiCauseData.reduce((a, b) => a + b.value, 0);
                                const percent = ((item.value / total) * 100).toFixed(1);
                                return (
                                    <div
                                        key={item.name}
                                        className="flex items-center text-sm group cursor-pointer hover:bg-slate-50 p-1 -mx-1 rounded transition-colors"
                                        title={`${item.name} 상세 보기`}
                                        onClick={() => onDrillDown && onDrillDown({ aiCauses: [item.name], startDate, endDate, excludeNormal: true })}
                                    >
                                        <span className="w-32 shrink-0 text-gray-600 font-semibold truncate text-right mr-4 text-xs">{item.name}</span>
                                        <div className="flex-1 h-5 rounded overflow-hidden bg-gray-100 relative">
                                            <div className="h-full rounded-r transition-all duration-1000 ease-out" style={{ width: `${percent}%`, backgroundColor: '#8b5cf6' }}></div>
                                        </div>
                                        <span className="w-14 text-right text-xs font-bold text-gray-500 ml-3">{percent}%</span>
                                    </div>
                                );
                            }) : <div className="text-center text-gray-400 font-bold text-xs">데이터가 없습니다.</div>}
                        </div>
                    </div>

                    {/* ✨ 5. AI 인사이트 도출 영역 (Full Width) */}
                    <div className="lg:col-span-2 bg-gradient-to-br from-purple-50 to-indigo-50 p-6 rounded-xl shadow-sm border border-purple-100 flex flex-col relative overflow-hidden transition-all">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                            <div>
                                <h3 className="font-bold text-purple-900 text-base flex items-center gap-2">
                                    <span className="text-xl">✨</span> AI 인사이트 솔루션 도출
                                </h3>
                                <p className="text-xs text-purple-600/70 mt-1 font-medium">현재 조회된 기간의 사고 데이터를 종합하여 AI가 근본 원인과 개선 방향을 제안합니다.</p>
                            </div>

                            {!aiReport && (
                                <button
                                    onClick={handleGenerateAiReport}
                                    disabled={isAiLoading}
                                    className={`shrink-0 px-5 py-2.5 rounded-lg text-sm font-bold text-white shadow-sm transition-all flex items-center gap-2 
                                        ${isAiLoading ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 hover:shadow-md hover:-translate-y-0.5'}`}
                                >
                                    {isAiLoading ? (
                                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 분석 중...</>
                                    ) : (
                                        <>🪄 AI 분석 실행하기</>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* AI 분석 결과 출력창 */}
                        {aiReport && (
                            <div className="bg-white/70 backdrop-blur-sm rounded-lg p-5 border border-purple-100 shadow-inner mt-2 animate-fade-in text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                                {aiReport}
                            </div>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
};

export { AccidentAnalyticsReport };