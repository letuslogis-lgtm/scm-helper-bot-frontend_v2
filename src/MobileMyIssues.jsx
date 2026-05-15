import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

const STATUS_STYLE = {
    '조치대기': 'bg-yellow-50 text-yellow-600 border-yellow-200',
    '처리 중':  'bg-blue-50 text-blue-600 border-blue-200',
    '조치완료': 'bg-green-50 text-green-600 border-green-200',
};

const TABS = ['전체', '조치대기', '처리 중', '조치완료'];

const formatDate = (dt) => {
    const d = new Date(dt);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};

const DateFilterSheet = ({ dateRange, onApply, onClose }) => {
    const [start, setStart] = useState(dateRange.start);
    const [end, setEnd] = useState(dateRange.end);
    const endDateRef = useRef(null);

    const handleStartChange = (e) => {
        setStart(e.target.value);
        setTimeout(() => endDateRef.current?.focus(), 100);
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>
                <div className="px-5 pb-10 pt-3 space-y-4">
                    <p className="text-slate-800 font-black text-base">조회 기간 설정</p>

                    <div className="flex gap-3 items-center">
                        <div className="flex-1">
                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">시작일</label>
                            <input
                                type="date"
                                value={start}
                                max={end || today()}
                                onChange={handleStartChange}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue"
                            />
                        </div>
                        <span className="text-slate-300 font-bold mt-5">~</span>
                        <div className="flex-1">
                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">종료일</label>
                            <input
                                ref={endDateRef}
                                type="date"
                                value={end}
                                min={start}
                                max={today()}
                                onChange={e => setEnd(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue"
                            />
                        </div>
                    </div>

                    {/* 빠른 선택 */}
                    <div className="flex gap-2">
                        {[
                            { label: '오늘',    s: today(),      e: today() },
                            { label: '3일',     s: daysAgo(3),   e: today() },
                            { label: '이번 달', s: (() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; })(), e: today() },
                            { label: '한 달',   s: daysAgo(30),  e: today() },
                        ].map(({ label, s, e }) => (
                            <button
                                key={label}
                                onClick={() => { setStart(s); setEnd(e); }}
                                className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold active:bg-slate-200 transition-colors"
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-2.5">
                        <button
                            onClick={() => onApply({ start: '', end: '' })}
                            className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm active:bg-slate-200 transition-colors"
                        >
                            전체 기간
                        </button>
                        <button
                            onClick={() => onApply({ start, end })}
                            disabled={!start || !end}
                            className="flex-[2] py-3.5 rounded-xl bg-letusOrange text-white font-bold text-sm active:bg-orange-600 transition-colors disabled:bg-slate-200 disabled:text-slate-400"
                        >
                            조회
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

const IssueDetailSheet = ({ issue, onClose }) => {
    if (!issue) return null;
    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>
                <div className="px-5 pb-10 pt-3 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-slate-400 text-xs font-mono">{issue.reception_no}</p>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_STYLE[issue.status] || 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            {issue.status}
                        </span>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-full bg-letusBlue/10 text-letusBlue text-xs font-bold border border-letusBlue/20">
                            {issue.brand}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
                            {issue.issue_type}
                        </span>
                    </div>

                    {issue.product_code && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-400">품목코드</span>
                            <span className="text-sm font-mono font-bold text-slate-700">{issue.product_code}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>등록자</span>
                        <span className="font-bold text-slate-600">{issue.reporter}</span>
                        <span className="text-slate-300">·</span>
                        <span>{formatDate(issue.created_at)}</span>
                    </div>

                    <div className="h-px bg-slate-100" />

                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">접수 내용</p>
                        <p className="text-slate-700 text-sm leading-relaxed">
                            {issue.request_content || '(내용 없음)'}
                        </p>
                    </div>

                    {issue.status === '조치완료' && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div>
                                <p className="text-[11px] font-bold text-green-500 uppercase tracking-widest mb-1.5">조치 내용</p>
                                <p className="text-slate-700 text-sm leading-relaxed">
                                    {issue.action_content || '(내용 없음)'}
                                </p>
                                {(issue.final_handler || issue.resolved_at) && (
                                    <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-400">
                                        {issue.final_handler && (
                                            <span>담당자: <span className="font-bold text-slate-500">{issue.final_handler}</span></span>
                                        )}
                                        {issue.resolved_at && <span>{formatDate(issue.resolved_at)}</span>}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {issue.status === '처리 중' && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                                <p className="text-blue-600 text-sm font-bold">담당자가 처리 중입니다</p>
                                <p className="text-blue-400 text-xs mt-0.5">조치가 완료되면 알림을 보내드립니다.</p>
                            </div>
                        </>
                    )}

                    <button
                        onClick={onClose}
                        className="w-full py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:bg-slate-200 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </>
    );
};

export const MobileMyIssues = ({ userProfile, onNotificationsRead }) => {
    const navigate = useNavigate();
    const [issues, setIssues] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIssue, setSelectedIssue] = useState(null);
    const [activeTab, setActiveTab] = useState('전체');
    const [dateRange, setDateRange] = useState({ start: daysAgo(3), end: today() });
    const [showDateSheet, setShowDateSheet] = useState(false);

    const fetchIssues = async (range = dateRange) => {
        if (!userProfile?.name) return;
        setIsLoading(true);
        try {
            let reporterNames = [userProfile.name];
            if (userProfile.team) {
                const { data: teammates } = await supabase
                    .from('profiles')
                    .select('name')
                    .eq('team', userProfile.team)
                    .eq('status', '재직');
                if (teammates?.length) reporterNames = teammates.map(p => p.name);
            }

            let query = supabase
                .from('logistics_issues')
                .select('id, reception_no, brand, issue_type, status, created_at, request_content, product_code, reporter, action_content, final_handler, resolved_at')
                .in('reporter', reporterNames)
                .order('created_at', { ascending: false })
                .limit(200);

            if (range.start) query = query.gte('created_at', range.start);
            if (range.end)   query = query.lte('created_at', range.end + 'T23:59:59');

            const { data, error } = await query;
            if (error) throw error;
            setIssues(data || []);
        } catch (err) {
            console.error('이력 조회 실패:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (userProfile?.name) {
            fetchIssues();
            onNotificationsRead?.();
        }
    }, [userProfile]);

    const handleDateApply = (range) => {
        setDateRange(range);
        setShowDateSheet(false);
        fetchIssues(range);
    };

    const filteredIssues = activeTab === '전체'
        ? issues
        : issues.filter(i => i.status === activeTab);

    const countByStatus = (status) => issues.filter(i => i.status === status).length;
    const hasDateFilter = dateRange.start && dateRange.end;

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1">
                        <p className="text-slate-800 font-black text-base leading-none">입고 특이사항 리스트 조회</p>
                        {userProfile?.team && (
                            <p className="text-slate-400 text-xs mt-0.5">{userProfile.team}</p>
                        )}
                    </div>
                    {/* 날짜 필터 버튼 */}
                    <button
                        onClick={() => setShowDateSheet(true)}
                        className="relative p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                    >
                        <svg className={`w-5 h-5 ${hasDateFilter ? 'text-letusOrange' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {hasDateFilter && (
                            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-letusOrange" />
                        )}
                    </button>
                    {/* 새로고침 버튼 */}
                    <button
                        onClick={() => fetchIssues()}
                        className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* 날짜 필터 표시 */}
                {hasDateFilter && (
                    <div className="px-4 pb-2 flex items-center gap-2">
                        <span className="text-xs text-letusOrange font-bold">
                            {dateRange.start} ~ {dateRange.end}
                        </span>
                        <button
                            onClick={() => handleDateApply({ start: '', end: '' })}
                            className="text-[11px] text-slate-400 font-bold underline"
                        >
                            해제
                        </button>
                    </div>
                )}

                {/* 상태 탭 */}
                <div className="flex border-t border-slate-100">
                    {TABS.map(tab => {
                        const count = tab === '전체' ? issues.length : countByStatus(tab);
                        const isActive = activeTab === tab;
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-2.5 text-xs font-bold transition-colors relative ${isActive ? 'text-letusOrange' : 'text-slate-400'}`}
                            >
                                {tab}
                                {count > 0 && (
                                    <span className={`ml-1 text-[10px] font-black ${isActive ? 'text-letusOrange' : 'text-slate-300'}`}>
                                        {count}
                                    </span>
                                )}
                                {isActive && (
                                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-letusOrange rounded-t-full" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </header>

            {/* 목록 */}
            <div className="flex-1 px-4 py-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-letusOrange rounded-full animate-spin" />
                        <p className="text-slate-500 text-sm font-bold mt-3">불러오는 중...</p>
                    </div>
                ) : filteredIssues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mb-4">
                            <span className="text-3xl">📋</span>
                        </div>
                        <p className="text-slate-700 font-bold text-base">
                            {activeTab === '전체' ? '등록 이력이 없습니다' : `${activeTab} 항목이 없습니다`}
                        </p>
                        {activeTab === '전체' && !hasDateFilter && (
                            <>
                                <p className="text-slate-400 text-sm mt-1">입고 특이사항을 등록하면<br />여기에 표시됩니다.</p>
                                <button
                                    onClick={() => navigate('/mobile/register')}
                                    className="mt-6 bg-letusOrange hover:bg-orange-500 active:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm shadow-sm"
                                >
                                    지금 등록하기
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {filteredIssues.map(issue => (
                            <button
                                key={issue.id}
                                onClick={() => setSelectedIssue(issue)}
                                className="w-full bg-white rounded-xl shadow-sm border border-slate-100 p-4 text-left active:scale-[0.99] transition-transform"
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex gap-1.5 flex-wrap">
                                        <span className="px-2 py-0.5 rounded-full bg-letusBlue/10 text-letusBlue text-xs font-bold border border-letusBlue/20">
                                            {issue.brand}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
                                            {issue.issue_type}
                                        </span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border flex-shrink-0 ${STATUS_STYLE[issue.status] || 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                                        {issue.status}
                                    </span>
                                </div>
                                {issue.product_code && (
                                    <p className="text-xs text-slate-400 font-mono mb-1">{issue.product_code}</p>
                                )}
                                <p className="text-slate-700 text-sm leading-snug line-clamp-2">
                                    {issue.request_content || '(내용 없음)'}
                                </p>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <p className="text-slate-300 text-[11px] font-mono">{issue.reception_no}</p>
                                        {issue.reporter !== userProfile?.name && (
                                            <span className="text-[11px] text-slate-400 font-bold">{issue.reporter}</span>
                                        )}
                                    </div>
                                    <p className="text-slate-400 text-xs">{formatDate(issue.created_at)}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {showDateSheet && (
                <DateFilterSheet
                    dateRange={dateRange}
                    onApply={handleDateApply}
                    onClose={() => setShowDateSheet(false)}
                />
            )}
            <IssueDetailSheet issue={selectedIssue} onClose={() => setSelectedIssue(null)} />
        </div>
    );
};
