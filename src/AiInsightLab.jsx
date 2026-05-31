import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon, formatDateTime, SearchButton, DateRangeInput, ImageSlider } from './SharedUI.jsx';

const CATEGORY_DATA = [
    { group: '현장 운영 귀책', codes: ['W-01 피킹 수량 누락', 'W-02 오피킹', 'W-03 PLT 오분배·미분배', 'W-04 오합적', 'W-05 평탄화·이동 누락', 'W-06 작업 중 파손', 'W-07 재고 관리 미흡'] },
    { group: '시공팀 귀책', codes: ['I-01 오상차·미상차', 'I-02 분실', 'I-03 오등록', 'I-04 파손 공유 누락', 'I-05 회수 미진행'] },
    { group: '전산/시스템 오류', codes: ['S-01 WMS 오류', 'S-02 운송 전산 오류', 'S-03 수주·A/S 미등록'] },
    { group: '서류/정보 불일치', codes: ['D-01 일정 변경 미공유', 'D-02 긴급건 미공유', 'D-03 오기재', 'D-04 연기건 미분배'] },
    { group: '공급망 이슈', codes: ['V-01 재고 부족', 'V-02 화주사 입고 지연', 'V-03 생산 지연'] },
    { group: '프로세스 미준수', codes: ['P-01 포장·랩핑 불량', 'P-02 적재 불량', 'P-03 검수 불량·훼손 출고'] },
    { group: '기타', codes: ['E-01 원인 불명', 'E-02 고객 귀책', 'E-03 정상 출고', 'E-04 직출·택배·화주사 직출'] },
];

const CategoryGuideModal = ({ onClose }) => (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-[500px] max-w-full flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-black text-gray-800 text-sm flex items-center gap-2">
                    <span className="text-letusBlue">📌</span> AI 학습을 위한 표준 분류 체계
                </h3>
                <button onClick={onClose} className="p-1 text-gray-400 hover:text-red-500 transition-colors"><CloseIcon /></button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[60vh] text-[12px] text-gray-700 leading-relaxed custom-scrollbar">
                <ul className="space-y-4">
                    <li><strong className="text-slate-800 text-[13px] bg-slate-100 px-1 py-0.5 rounded">【1】현장 운영 귀책</strong><br />W-01(피킹 수량 누락), W-02(오피킹), W-03(PLT 오분배/미분배), W-04(오합적), W-05(평탄화·이동 누락), W-06(파손), W-07(재고 관리 미흡)</li>
                    <li><strong className="text-slate-800 text-[13px] bg-slate-100 px-1 py-0.5 rounded">【2】시공팀 귀책</strong><br />I-01(오상차/미상차), I-02(분실), I-03(오등록), I-04(파손 공유 누락), I-05(회수·확인 미진행)</li>
                    <li><strong className="text-slate-800 text-[13px] bg-slate-100 px-1 py-0.5 rounded">【3】전산/시스템 오류</strong><br />S-01(WMS 오류), S-02(운송 전산 오류), S-03(수주·A/S 미등록)</li>
                    <li><strong className="text-slate-800 text-[13px] bg-slate-100 px-1 py-0.5 rounded">【4】서류/정보 불일치</strong><br />D-01(일정 변경 미공유), D-02(긴급건 미공유), D-03(오기재), D-04(연기건 미분배)</li>
                    <li><strong className="text-slate-800 text-[13px] bg-slate-100 px-1 py-0.5 rounded">【5】공급망 이슈</strong><br />V-01(재고 부족), V-02(화주사 입고 지연), V-03(생산 지연)</li>
                    <li><strong className="text-slate-800 text-[13px] bg-slate-100 px-1 py-0.5 rounded">【6】프로세스 미준수</strong><br />P-01(포장·랩핑 불량), P-02(적재 불량), P-03(검수 불량·훼손 출고)</li>
                    <li><strong className="text-slate-800 text-[13px] bg-slate-100 px-1 py-0.5 rounded">【7】기타</strong><br />E-01(원인 불명/파악 불가), E-02(고객 귀책), E-03(정상 출고), E-04(직출/택배 품목)</li>
                </ul>
            </div>
        </div>
    </div>
);

export const AiInsightLab = () => {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('accident');
    const [selectedIds, setSelectedIds] = useState([]);
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });
    const [isReAnalyzing, setIsReAnalyzing] = useState(false);

    const [confidenceFilter, setConfidenceFilter] = useState('전체');
    const [reviewFilter, setReviewFilter] = useState('미검토');
    const [searchValue, setSearchValue] = useState('');

    const getLocalYYYYMMDD = (dateObj) => {
        const pad = n => n.toString().padStart(2, '0');
        return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
    };
    const [dateFilter, setDateFilter] = useState(() => {
        const today = new Date();
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);
        return { start: getLocalYYYYMMDD(lastWeek), end: getLocalYYYYMMDD(today) };
    });

    const [activeRow, setActiveRow] = useState(null);
    const [correctedCause, setCorrectedCause] = useState('');
    const [correctedDetail, setCorrectedDetail] = useState('');
    const [correctedDept, setCorrectedDept] = useState('');
    const [correctedActionResult, setCorrectedActionResult] = useState('');
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

    useEffect(() => { fetchLogs(); }, []);

    useEffect(() => {
        setSelectedIds([]);
        setConfidenceFilter('전체');
        setReviewFilter('미검토');
        setSearchValue('');
    }, [activeTab]);

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('ai_analysis_logs')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) {
                console.warn('ai_analysis_logs 조회 실패:', error.message);
                setLogs([]);
            } else {
                setLogs(data || []);
            }
        } catch (err) {
            console.error('AI 로그 조회 중 오류:', err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const tabLogs = useMemo(() =>
        logs.filter(l =>
            activeTab === 'accident'
                ? l.source_menu === 'AccidentManagement'
                : l.source_menu === 'MobileBarcode'
        ), [logs, activeTab]);

    const filteredLogs = useMemo(() => {
        return tabLogs.filter(row => {
            if (confidenceFilter !== '전체' && row.ai_confidence !== confidenceFilter) return false;
            if (reviewFilter === '검토 완료' && !row.is_reviewed) return false;
            if (reviewFilter === '미검토' && row.is_reviewed) return false;
            if (dateFilter.start && row.created_at.slice(0, 10) < dateFilter.start) return false;
            if (dateFilter.end && row.created_at.slice(0, 10) > dateFilter.end) return false;
            if (searchValue) {
                const term = searchValue.toLowerCase();
                const textMatch = row.original_text?.toLowerCase().includes(term);
                const causeMatch = row.ai_analyzed_cause?.toLowerCase().includes(term);
                if (!textMatch && !causeMatch) return false;
            }
            return true;
        });
    }, [tabLogs, confidenceFilter, reviewFilter, searchValue, dateFilter]);

    const sortedLogs = useMemo(() => {
        let items = [...filteredLogs];
        if (sortConfig.key && sortConfig.direction !== 'none') {
            items.sort((a, b) => {
                const aVal = a[sortConfig.key] || '';
                const bVal = b[sortConfig.key] || '';
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [filteredLogs, sortConfig]);

    const handleSelectAll = (e) => setSelectedIds(e.target.checked ? sortedLogs.map(i => i.id) : []);
    const handleSelectOne = (e, id) => {
        if (e?.nativeEvent?.shiftKey && lastSelectedId) {
            const startIdx = sortedLogs.findIndex(i => i.id === lastSelectedId);
            const endIdx = sortedLogs.findIndex(i => i.id === id);
            if (startIdx !== -1 && endIdx !== -1) {
                const min = Math.min(startIdx, endIdx);
                const max = Math.max(startIdx, endIdx);
                const idsInRange = sortedLogs.slice(min, max + 1).map(i => i.id);
                setSelectedIds(prev => Array.from(new Set([...prev, ...idsInRange])));
                return;
            }
        }
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
        setLastSelectedId(id);
    };

    const handleSaveCorrection = async () => {
        if (!correctedCause.trim()) return alert('정답 원인을 입력 또는 선택해주세요.');
        if (activeTab === 'accident' && !correctedDetail.trim()) return alert('소분류 코드를 선택해주세요.');
        try {
            const { error } = await supabase
                .from('ai_analysis_logs')
                .update({
                    is_reviewed: true,
                    reviewed_at: new Date().toISOString(),
                    corrected_cause: correctedCause,
                    corrected_detail: correctedDetail || null,
                    corrected_dept: correctedDept || null,
                    corrected_action_result: correctedActionResult || null,
                })
                .eq('id', activeRow.id);
            if (error) throw error;

            if (activeRow.source_menu === 'AccidentManagement' && activeRow.target_id) {
                await supabase
                    .from('logistics_accidents')
                    .update({
                        ai_analyzed_cause: correctedCause,
                        ai_cause_detail: correctedDetail,
                        ai_confidence: 'human',
                        ...(correctedDept && { responsible_dept: correctedDept }),
                        ...(correctedActionResult && { action_result: correctedActionResult }),
                    })
                    .eq('id', activeRow.target_id);
            }

            alert('보정이 완료되었습니다. 이 데이터는 향후 AI 학습에 반영됩니다!');
            setActiveRow(null);
            fetchLogs();
        } catch (err) {
            alert('저장 실패: ' + err.message);
        }
    };

    const handleBulkReview = async () => {
        if (selectedIds.length === 0) return alert('선택된 항목이 없습니다.');
        if (!window.confirm(`선택한 ${selectedIds.length}건을 AI 분석 결과 그대로 정답으로 인정(일괄 검토 완료) 하시겠습니까?`)) return;
        try {
            const { error } = await supabase
                .from('ai_analysis_logs')
                .update({ is_reviewed: true, reviewed_at: new Date().toISOString() })
                .in('id', selectedIds);
            if (error) throw error;
            alert('일괄 검토가 완료되었습니다.');
            setSelectedIds([]);
            fetchLogs();
        } catch (err) {
            alert('일괄 처리 실패: ' + err.message);
        }
    };

    const handleReAnalyze = async () => {
        const accidentRows = sortedLogs.filter(r => selectedIds.includes(r.id) && r.target_id);
        if (accidentRows.length === 0) return alert('재분석 가능한 항목이 없습니다.');
        if (!window.confirm(`선택한 ${accidentRows.length}건을 AI 재분석하시겠습니까?\n기존 분석 결과가 새 결과로 덮어씌워집니다.`)) return;
        setIsReAnalyzing(true);
        try {
            const { data, error } = await supabase.functions.invoke('analyze-accidents', {
                body: { ids: accidentRows.map(r => r.target_id), forceReanalyze: true }
            });
            if (error) throw error;
            const stats = data?.confidence_stats || {};
            alert(`✨ AI 재분석 완료!\n처리: ${data?.processed_count ?? 0}건\n• 고신뢰: ${stats.high || 0} / 중: ${stats.medium || 0} / 저: ${stats.low || 0}`);
            setSelectedIds([]);
            fetchLogs();
        } catch (err) {
            alert('재분석 실패: ' + err.message);
        } finally {
            setIsReAnalyzing(false);
        }
    };

    const handleExportCSV = () => {
        const exportData = tabLogs.filter(l => l.is_reviewed && l.corrected_cause);
        if (exportData.length === 0) return alert('내보낼 학습 데이터가 없습니다.\n보정 완료된 항목이 있어야 내보낼 수 있습니다.');
        const esc = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
        const headers = ['분석일시', '출처', '원본내용', 'AI_대분류', 'AI_소분류', 'AI_신뢰도', '정답_대분류', '정답_소분류', '검토일시'];
        const rows = exportData.map(l => [
            esc(l.created_at), esc(l.source_menu), esc(l.original_text),
            esc(l.ai_analyzed_cause), esc(l.ai_cause_detail), esc(l.ai_confidence),
            esc(l.corrected_cause), esc(l.corrected_detail), esc(l.reviewed_at),
        ]);
        const csvContent = '﻿' + [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AI학습데이터_${new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getConfidenceBadge = (conf) => {
        if (conf === 'high') return <span className="px-2 py-1 rounded text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">🟢 높음</span>;
        if (conf === 'medium') return <span className="px-2 py-1 rounded text-[10px] font-bold bg-yellow-50 text-yellow-600 border border-yellow-200">🟡 보통</span>;
        if (conf === 'low') return <span className="px-2 py-1 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 animate-pulse">🔴 낮음</span>;
        return <span className="text-gray-400 font-bold">-</span>;
    };

    const handleCauseChange = (val) => { setCorrectedCause(val); setCorrectedDetail(''); };

    const isAccident = activeTab === 'accident';

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* 통계 카드 */}
            <div className="grid grid-cols-4 gap-4 shrink-0">
                <div onClick={() => { setConfidenceFilter('전체'); setReviewFilter('전체'); }} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-blue-400 cursor-pointer">
                    <span className="text-xs font-bold text-blue-500 mb-1">총 누적 분석</span>
                    <span className="text-2xl font-black text-blue-600">{tabLogs.length} <span className="text-sm font-bold text-blue-300 ml-1">건</span></span>
                </div>
                <div onClick={() => { setConfidenceFilter('low'); setReviewFilter('전체'); }} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-red-400 cursor-pointer">
                    <span className="text-xs font-bold text-red-500 mb-1">신뢰도 낮음 (요주의)</span>
                    <span className="text-2xl font-black text-red-600">{tabLogs.filter(l => l.ai_confidence === 'low').length} <span className="text-sm font-bold text-red-300 ml-1">건</span></span>
                </div>
                <div onClick={() => { setConfidenceFilter('전체'); setReviewFilter('검토 완료'); }} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-green-400 cursor-pointer">
                    <span className="text-xs font-bold text-green-500 mb-1">관리자 보정 완료</span>
                    <span className="text-2xl font-black text-green-600">{tabLogs.filter(l => l.is_reviewed).length} <span className="text-sm font-bold text-green-300 ml-1">건</span></span>
                </div>
                <div onClick={() => { setConfidenceFilter('전체'); setReviewFilter('미검토'); }} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-purple-400 cursor-pointer">
                    <span className="text-xs font-bold text-purple-500 mb-1">미검토 건</span>
                    <span className="text-2xl font-black text-purple-600">{tabLogs.filter(l => !l.is_reviewed).length} <span className="text-sm font-bold text-purple-300 ml-1">건</span></span>
                </div>
            </div>

            {/* 탭 + 필터 + 테이블 통합 카드 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">

                {/* 탭 헤더 */}
                <div className="flex border-b border-gray-200 bg-gray-50/50 px-4 pt-4 shrink-0">
                    <button
                        onClick={() => setActiveTab('accident')}
                        className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${isAccident ? 'border-letusBlue text-letusBlue bg-white' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 rounded-t-lg'}`}
                    >
                        📋 사고분석 AI
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${isAccident ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                            {logs.filter(l => l.source_menu === 'AccidentManagement').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('barcode')}
                        className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${!isAccident ? 'border-letusBlue text-letusBlue bg-white' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 rounded-t-lg'}`}
                    >
                        📱 바코드 스캔 AI
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${!isAccident ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                            {logs.filter(l => l.source_menu === 'MobileBarcode').length}
                        </span>
                    </button>
                </div>

                {/* 필터 및 액션 */}
                <div className="px-6 py-3 flex items-center justify-between border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-[11px] font-bold text-gray-600">등록일자</label>
                            <DateRangeInput
                                startDate={dateFilter.start}
                                endDate={dateFilter.end}
                                onChange={(s, e) => setDateFilter({ start: s, end: e })}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-[11px] font-bold text-gray-600">신뢰도</label>
                            <select value={confidenceFilter} onChange={e => setConfidenceFilter(e.target.value)} className="border border-gray-200 rounded text-xs px-2 py-1.5 focus:outline-none cursor-pointer">
                                <option value="전체">전체</option>
                                <option value="high">🟢 높음</option>
                                <option value="medium">🟡 보통</option>
                                <option value="low">🔴 낮음</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-[11px] font-bold text-gray-600">검토 상태</label>
                            <select value={reviewFilter} onChange={e => setReviewFilter(e.target.value)} className="border border-gray-200 rounded text-xs px-2 py-1.5 focus:outline-none cursor-pointer">
                                <option value="전체">전체</option>
                                <option value="미검토">미검토 (리뷰 필요)</option>
                                <option value="검토 완료">검토 완료 (보정됨)</option>
                            </select>
                        </div>
                        <input type="text" value={searchValue} onChange={e => setSearchValue(e.target.value)} placeholder="분석 결과 / 원본 검색" className="border border-gray-200 rounded text-xs px-2.5 py-1.5 w-48 focus:outline-none focus:border-letusBlue" />
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedIds.length > 0 && (
                            <>
                                <button onClick={handleBulkReview} className="bg-green-600 text-white hover:bg-green-700 font-bold px-3 py-1.5 rounded transition-colors text-xs flex items-center shadow-sm gap-1.5 animate-fade-in-up">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    선택 {selectedIds.length}건 검토완료
                                </button>
                                {isAccident && (
                                    <button onClick={handleReAnalyze} disabled={isReAnalyzing} className="bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 font-bold px-3 py-1.5 rounded transition-colors text-xs flex items-center shadow-sm gap-1.5 animate-fade-in-up">
                                        {isReAnalyzing
                                            ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />재분석 중...</>
                                            : <>🤖 AI 재분석 ({selectedIds.length}건)</>}
                                    </button>
                                )}
                            </>
                        )}
                        <button onClick={handleExportCSV} className="bg-slate-700 text-white hover:bg-slate-800 font-bold px-3 py-1.5 rounded transition-colors text-xs flex items-center shadow-sm gap-1.5" title={`보정 완료 데이터 CSV 내보내기 (${tabLogs.filter(l => l.is_reviewed && l.corrected_cause).length}건)`}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            학습 데이터 내보내기
                        </button>
                        <SearchButton onClick={fetchLogs} label="새로고침" />
                    </div>
                </div>

                {/* 테이블 */}
                <div className="overflow-auto flex-1 custom-scrollbar">
                    {isAccident ? (
                        /* ── 사고분석 탭 테이블 ── */
                        <table className="w-full text-left whitespace-nowrap table-fixed min-w-[1050px]">
                            <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4 pl-6 w-10 text-center">
                                        <input type="checkbox" checked={sortedLogs.length > 0 && selectedIds.length === sortedLogs.length} onChange={handleSelectAll} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                    </th>
                                    {[
                                        { label: '분석 요청 일시', w: '160px' },
                                        { label: '원본 내용 (클레임 등)', w: '320px' },
                                        { label: 'AI 분석 원인', w: '220px', hasHelp: true },
                                        { label: '신뢰도', w: '100px' },
                                        { label: '상태', w: '100px' },
                                        { label: '액션', w: '100px' },
                                    ].map((col, idx) => (
                                        <th key={idx} className="p-4 text-center select-none" style={{ width: col.w }}>
                                            <div className="flex items-center justify-center gap-1.5">
                                                {col.label}
                                                {col.hasHelp && (
                                                    <button onClick={() => setIsCategoryModalOpen(true)} className="text-white bg-slate-300 rounded-full w-[14px] h-[14px] flex items-center justify-center text-[9px] font-black hover:bg-slate-500 transition-colors shadow-sm">?</button>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                                {isLoading ? (
                                    <tr><td colSpan="7" className="py-32 text-center"><div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin mx-auto"></div><p className="mt-3 text-gray-500 font-bold text-[13px]">AI 로그를 불러오는 중입니다...</p></td></tr>
                                ) : sortedLogs.length === 0 ? (
                                    <tr><td colSpan="7" className="p-20 text-center text-gray-400 font-bold">저장된 AI 로그가 없습니다.</td></tr>
                                ) : sortedLogs.map((row) => (
                                    <tr key={row.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''}`} onClick={(e) => handleSelectOne(e, row.id)}>
                                        <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={(e) => handleSelectOne(e, row.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                        </td>
                                        <td className="p-4 text-center font-mono text-xs text-gray-500">{formatDateTime(row.created_at)}</td>
                                        <td className="p-4 whitespace-normal text-left max-w-[320px] border-l border-gray-50 bg-gray-50/20">
                                            <div className="flex flex-col gap-1.5">
                                                {row.original_text?.split('|').map((line, i) => (
                                                    <div key={i} className={`text-[11.5px] leading-snug ${i === 0 ? 'text-slate-800 font-bold' : 'text-slate-600'}`}>{line.trim()}</div>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                <span className="px-3 py-0.5 rounded-full font-black text-[11px] bg-purple-100 text-purple-700 border border-purple-200 shadow-sm whitespace-nowrap">{row.ai_analyzed_cause || '-'}</span>
                                                {row.ai_cause_detail && <span className="text-[10px] font-bold text-purple-500 whitespace-nowrap">{row.ai_cause_detail}</span>}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">{getConfidenceBadge(row.ai_confidence)}</td>
                                        <td className="p-4 text-center">
                                            {row.is_reviewed
                                                ? <span className="font-bold text-green-600 text-[11px]">✅ 보정됨</span>
                                                : <span className="font-bold text-gray-400 text-[11px] bg-gray-50 px-2 py-0.5 rounded border border-gray-100">대기</span>}
                                        </td>
                                        <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => { setActiveRow(row); setCorrectedCause(row.corrected_cause || row.ai_analyzed_cause || ''); setCorrectedDetail(row.corrected_detail || row.ai_cause_detail || ''); setCorrectedDept(row.corrected_dept || ''); setCorrectedActionResult(row.corrected_action_result || ''); }}
                                                className={`px-3 py-1.5 border text-xs font-bold rounded shadow-sm transition-colors ${row.is_reviewed ? 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100' : 'border-blue-200 text-letusBlue bg-white hover:bg-blue-50'}`}
                                            >
                                                {row.is_reviewed ? '내역 보기' : '검토/보정'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        /* ── 바코드 스캔 탭 테이블 ── */
                        <table className="w-full text-left whitespace-nowrap table-fixed min-w-[950px]">
                            <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4 pl-6 w-10 text-center">
                                        <input type="checkbox" checked={sortedLogs.length > 0 && selectedIds.length === sortedLogs.length} onChange={handleSelectAll} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                    </th>
                                    {[
                                        { label: '스캔 일시', w: '160px' },
                                        { label: '스캔 원본 (이미지 설명)', w: '340px' },
                                        { label: 'AI 인식 결과 (품목코드)', w: '240px' },
                                        { label: '신뢰도', w: '100px' },
                                        { label: '상태', w: '100px' },
                                        { label: '액션', w: '100px' },
                                    ].map((col, idx) => (
                                        <th key={idx} className="p-4 text-center select-none" style={{ width: col.w }}>{col.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                                {isLoading ? (
                                    <tr><td colSpan="7" className="py-32 text-center"><div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin mx-auto"></div><p className="mt-3 text-gray-500 font-bold text-[13px]">AI 로그를 불러오는 중입니다...</p></td></tr>
                                ) : sortedLogs.length === 0 ? (
                                    <tr><td colSpan="7" className="p-20 text-center text-gray-400 font-bold">바코드 스캔 AI 로그가 없습니다.</td></tr>
                                ) : sortedLogs.map((row) => (
                                    <tr key={row.id} className={`hover:bg-orange-50/30 transition-colors cursor-pointer ${selectedIds.includes(row.id) ? 'bg-orange-50' : ''}`} onClick={(e) => handleSelectOne(e, row.id)}>
                                        <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={(e) => handleSelectOne(e, row.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                        </td>
                                        <td className="p-4 text-center font-mono text-xs text-gray-500">{formatDateTime(row.created_at)}</td>
                                        <td className="p-4 whitespace-normal text-left max-w-[340px] border-l border-gray-50 bg-gray-50/20">
                                            {row.image_url && (
                                                <img src={row.image_url} alt="스캔 이미지" className="w-16 h-16 object-cover rounded border border-gray-200 mb-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                                                    onClick={(e) => { e.stopPropagation(); window.open(row.image_url, '_blank'); }} title="클릭 시 원본 보기" />
                                            )}
                                            <div className="text-[11.5px] leading-snug text-slate-700">{row.original_text || '-'}</div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="px-3 py-0.5 rounded-full font-black text-[11px] bg-orange-100 text-orange-700 border border-orange-200 shadow-sm inline-block">{row.ai_analyzed_cause || '-'}</span>
                                            {row.ai_cause_detail && <div className="text-[10px] font-bold text-orange-400 mt-0.5">{row.ai_cause_detail}</div>}
                                        </td>
                                        <td className="p-4 text-center">{getConfidenceBadge(row.ai_confidence)}</td>
                                        <td className="p-4 text-center">
                                            {row.is_reviewed
                                                ? <span className="font-bold text-green-600 text-[11px]">✅ 보정됨</span>
                                                : <span className="font-bold text-gray-400 text-[11px] bg-gray-50 px-2 py-0.5 rounded border border-gray-100">대기</span>}
                                        </td>
                                        <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => { setActiveRow(row); setCorrectedCause(row.corrected_cause || row.ai_analyzed_cause || ''); setCorrectedDetail(row.corrected_detail || ''); }}
                                                className={`px-3 py-1.5 border text-xs font-bold rounded shadow-sm transition-colors ${row.is_reviewed ? 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100' : 'border-orange-200 text-orange-600 bg-white hover:bg-orange-50'}`}
                                            >
                                                {row.is_reviewed ? '내역 보기' : '검토/보정'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* 검토 및 보정 모달 */}
            {activeRow && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setActiveRow(null)}></div>
                    <div className={`bg-white rounded-xl shadow-2xl z-10 w-full ${isAccident ? 'max-w-lg' : 'max-w-3xl'} slide-up border border-gray-100 overflow-hidden flex flex-col`}>

                        {/* 헤더 */}
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                                <span className="w-1.5 h-3.5 bg-letusOrange rounded-full"></span>
                                AI 분석 결과 검토 및 정답 보정
                            </h3>
                            <button onClick={() => setActiveRow(null)} className="p-1 text-gray-400 hover:text-gray-600"><CloseIcon /></button>
                        </div>

                        {isAccident ? (
                            /* ── 사고분석: 단일 컬럼 (기존 레이아웃 유지) ── */
                            <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh] custom-scrollbar">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">원본 텍스트 (판단 대상)</label>
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed max-h-[120px] overflow-y-auto custom-scrollbar">
                                        {activeRow.original_text}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
                                        <div className="text-[10px] font-bold text-purple-400 mb-1">AI 1차 판별 결과</div>
                                        <div className="font-black text-purple-700 text-sm">{activeRow.ai_analyzed_cause || '-'}</div>
                                    </div>
                                    <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
                                        <div className="text-[10px] font-bold text-purple-400 mb-1">AI 상세</div>
                                        <div className="font-black text-purple-700 text-sm">{activeRow.ai_cause_detail || '-'}</div>
                                    </div>
                                </div>
                                {activeRow.ai_confidence === 'low' && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
                                        <strong className="block mb-1">⚠ AI 불확실 사유:</strong>
                                        <span className="leading-relaxed">{activeRow.low_confidence_reason || activeRow.ai_cause_summary || '사유가 명확하게 제공되지 않았습니다. 원본 데이터를 직접 확인해 주세요.'}</span>
                                    </div>
                                )}
                                {activeRow.ai_confidence !== 'low' && activeRow.ai_cause_summary && (
                                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-[11px]">
                                        <strong className="block mb-1 text-slate-500">🤖 AI 상세 분석 요약:</strong>
                                        <span className="leading-relaxed">{activeRow.ai_cause_summary}</span>
                                    </div>
                                )}
                                <div className="border-t border-gray-200 pt-5">
                                    <h4 className="text-sm font-black text-gray-800 mb-3 flex items-center gap-2">
                                        <span>👤</span> 올바른 정답을 지정해주세요
                                        <button onClick={() => setIsCategoryModalOpen(true)} className="text-white bg-slate-300 rounded-full w-[16px] h-[16px] flex items-center justify-center text-[10px] font-black hover:bg-slate-500 transition-colors shadow-sm ml-1">?</button>
                                    </h4>
                                    <div className="flex flex-col gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-500 mb-1.5">정확한 대분류 <span className="text-letusOrange">*</span></label>
                                            <select value={correctedCause} onChange={e => handleCauseChange(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-letusBlue outline-none bg-white font-bold text-gray-800 cursor-pointer">
                                                <option value="">-- 대분류 선택 --</option>
                                                {CATEGORY_DATA.map(cat => (
                                                    <option key={cat.group} value={cat.group}>{cat.group}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-500 mb-1.5">정확한 소분류 코드 <span className="text-letusOrange">*</span></label>
                                            <select value={correctedDetail} onChange={e => setCorrectedDetail(e.target.value)} disabled={!correctedCause} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-letusBlue outline-none bg-white font-bold text-gray-800 cursor-pointer disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed">
                                                <option value="">{correctedCause ? '-- 소분류 선택 --' : '먼저 대분류를 선택해주세요'}</option>
                                                {CATEGORY_DATA.find(c => c.group === correctedCause)?.codes.map(code => (
                                                    <option key={code} value={code}>{code}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
                                            <div>
                                                <label className="block text-[11px] font-bold text-gray-500 mb-1.5">귀책부서 <span className="text-gray-300 font-normal">(선택)</span></label>
                                                <select value={correctedDept} onChange={e => setCorrectedDept(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-letusBlue outline-none bg-white font-bold text-gray-800 cursor-pointer">
                                                    <option value="">-- 선택 --</option>
                                                    <option value="물류사업1팀">물류사업1팀</option>
                                                    <option value="물류사업2팀">물류사업2팀</option>
                                                    <option value="운송사업팀">운송사업팀</option>
                                                    <option value="컨택센터">컨택센터</option>
                                                    <option value="라스트마일1팀">라스트마일1팀</option>
                                                    <option value="라스트마일2팀">라스트마일2팀</option>
                                                    <option value="구매/생산">구매/생산</option>
                                                    <option value="브랜드/3PL고객사">브랜드/3PL고객사</option>
                                                    <option value="기타">기타</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-gray-500 mb-1.5">확인결과 <span className="text-gray-300 font-normal">(선택)</span></label>
                                                <select value={correctedActionResult} onChange={e => setCorrectedActionResult(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-letusBlue outline-none bg-white font-bold text-gray-800 cursor-pointer">
                                                    <option value="">-- 선택 --</option>
                                                    <option value="정상출고">정상출고</option>
                                                    <option value="출고 없음">출고 없음</option>
                                                    <option value="미출고">미출고</option>
                                                    <option value="오출고">오출고</option>
                                                    <option value="과출고">과출고</option>
                                                    <option value="물류파손">물류파손</option>
                                                    <option value="시공파손">시공파손</option>
                                                    <option value="현장직출">현장직출</option>
                                                    <option value="센터직출">센터직출</option>
                                                    <option value="납기연기(건)">납기연기(건)</option>
                                                    <option value="납기연기(품목)">납기연기(품목)</option>
                                                    <option value="제품분실">제품분실</option>
                                                    <option value="제조/생산 이슈">제조/생산 이슈</option>
                                                    <option value="기타">기타</option>
                                                </select>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-medium leading-tight mt-1">
                                            * 여기서 관리자가 입력한 보정 데이터는, 향후 AI의 판별 정확도를 높이기 위한 Fine-tuning(미세조정) 학습 데이터 셋으로 귀중하게 활용됩니다.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* ── 바코드 스캔: 좌(이미지) + 우(폼) 2열 레이아웃 ── */
                            <div className="flex flex-row max-h-[70vh] overflow-hidden">
                                {/* 좌: 이미지 슬라이더 */}
                                <div className="w-[44%] border-r border-gray-100 p-4 bg-gray-50/40 flex flex-col shrink-0 overflow-hidden">
                                    <label className="block text-xs font-bold text-gray-500 mb-2">📸 스캔 이미지</label>
                                    <ImageSlider imageUrlString={activeRow.image_url} />
                                </div>
                                {/* 우: 분석 결과 + 보정 폼 */}
                                <div className="flex-1 p-5 space-y-4 overflow-y-auto custom-scrollbar min-w-0">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">원본 텍스트 (판단 대상)</label>
                                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed max-h-[120px] overflow-y-auto custom-scrollbar">
                                            {activeRow.original_text}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg">
                                            <div className="text-[10px] font-bold text-orange-400 mb-1">AI 1차 인식 결과</div>
                                            <div className="font-black text-orange-700 text-sm">{activeRow.ai_analyzed_cause || '-'}</div>
                                        </div>
                                        <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg">
                                            <div className="text-[10px] font-bold text-orange-400 mb-1">AI 상세</div>
                                            <div className="font-black text-orange-700 text-sm">{activeRow.ai_cause_detail || '-'}</div>
                                        </div>
                                    </div>
                                    {activeRow.ai_confidence === 'low' && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
                                            <strong className="block mb-1">⚠ AI 불확실 사유:</strong>
                                            <span className="leading-relaxed">{activeRow.low_confidence_reason || activeRow.ai_cause_summary || '사유가 명확하게 제공되지 않았습니다. 원본 데이터를 직접 확인해 주세요.'}</span>
                                        </div>
                                    )}
                                    {activeRow.ai_confidence !== 'low' && activeRow.ai_cause_summary && (
                                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-[11px]">
                                            <strong className="block mb-1 text-slate-500">🤖 AI 상세 분석 요약:</strong>
                                            <span className="leading-relaxed">{activeRow.ai_cause_summary}</span>
                                        </div>
                                    )}
                                    <div className="border-t border-gray-200 pt-4">
                                        <h4 className="text-sm font-black text-gray-800 mb-3 flex items-center gap-2">
                                            <span>👤</span> 올바른 정답을 지정해주세요
                                        </h4>
                                        <div className="flex flex-col gap-3">
                                            <div>
                                                <label className="block text-[11px] font-bold text-gray-500 mb-1.5">올바른 품목코드 <span className="text-letusOrange">*</span></label>
                                                <input
                                                    type="text"
                                                    value={correctedCause}
                                                    onChange={e => setCorrectedCause(e.target.value)}
                                                    placeholder="예: PF8-31001-7"
                                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-orange-400 outline-none font-bold text-gray-800"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-bold text-gray-500 mb-1.5">보정 메모 (선택)</label>
                                                <input
                                                    type="text"
                                                    value={correctedDetail}
                                                    onChange={e => setCorrectedDetail(e.target.value)}
                                                    placeholder="오인식 사유 등 메모"
                                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-orange-400 outline-none text-gray-700"
                                                />
                                            </div>
                                            <p className="text-[10px] text-gray-400 font-medium leading-tight">
                                                * 보정된 품목코드는 향후 바코드 인식 정확도 개선에 활용됩니다.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 푸터 */}
                        <div className="p-4 border-t bg-gray-50 flex justify-between items-center shrink-0">
                            <div>
                                {isAccident ? (
                                    <button onClick={() => {
                                        if (activeRow.target_id) window.open(`/accident_list?target_id=${activeRow.target_id}`, '_blank');
                                        else alert('해당 메뉴의 바로가기는 아직 지원되지 않습니다.');
                                    }} className="px-3 py-2 text-xs font-bold text-letusBlue hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        원본 메뉴에서 열기
                                    </button>
                                ) : (
                                    activeRow.ai_analyzed_cause && activeRow.ai_analyzed_cause !== 'RECOGNITION_FAILED' && (
                                        <button onClick={() => window.open(`/list?item_code=${encodeURIComponent(activeRow.ai_analyzed_cause)}`, '_blank')}
                                            className="px-3 py-2 text-xs font-bold text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors flex items-center gap-1.5">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                            입고특이사항 목록에서 확인
                                        </button>
                                    )
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setActiveRow(null)} className="px-4 py-2 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg shadow-sm hover:bg-gray-50 transition-colors">취소</button>
                                <button onClick={handleSaveCorrection} className="px-5 py-2 bg-letusOrange text-white text-xs font-bold rounded-lg shadow-sm hover:bg-orange-600 transition-colors flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    {activeRow.is_reviewed ? '수정 내역 다시 저장' : '보정 데이터 저장'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isCategoryModalOpen && <CategoryGuideModal onClose={() => setIsCategoryModalOpen(false)} />}
        </div>
    );
};
