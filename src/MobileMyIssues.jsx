import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

const STATUS_STYLE = {
    '조치대기': 'bg-yellow-50 text-yellow-600 border-yellow-200',
    '처리 중':  'bg-blue-50 text-blue-600 border-blue-200',
    '조치완료': 'bg-green-50 text-green-600 border-green-200',
};

const formatDate = (dt) => {
    const d = new Date(dt);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const IssueDetailSheet = ({ issue, onClose }) => {
    if (!issue) return null;
    return (
        <>
            {/* 배경 딤 */}
            <div
                className="fixed inset-0 bg-black/40 z-40"
                onClick={onClose}
            />
            {/* 바텀 시트 */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
                {/* 핸들 */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>

                <div className="px-5 pb-10 pt-3 space-y-4">
                    {/* 상태 + 접수번호 */}
                    <div className="flex items-center justify-between">
                        <p className="text-slate-400 text-xs font-mono">{issue.reception_no}</p>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_STYLE[issue.status] || 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            {issue.status}
                        </span>
                    </div>

                    {/* 브랜드 + 이슈 유형 */}
                    <div className="flex gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-full bg-letusBlue/10 text-letusBlue text-xs font-bold border border-letusBlue/20">
                            {issue.brand}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
                            {issue.issue_type}
                        </span>
                    </div>

                    <div className="h-px bg-slate-100" />

                    {/* 접수 내용 */}
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">접수 내용</p>
                        <p className="text-slate-700 text-sm leading-relaxed">
                            {issue.request_content || '(내용 없음)'}
                        </p>
                    </div>

                    {/* 조치 내용 */}
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
                                        {issue.resolved_at && (
                                            <span>{formatDate(issue.resolved_at)}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* 처리 중인 경우 안내 */}
                    {issue.status === '처리 중' && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                                <p className="text-blue-600 text-sm font-bold">담당자가 처리 중입니다</p>
                                <p className="text-blue-400 text-xs mt-0.5">조치가 완료되면 알림을 보내드립니다.</p>
                            </div>
                        </>
                    )}

                    {/* 접수 일시 */}
                    <div className="text-right">
                        <p className="text-xs text-slate-300">접수: {formatDate(issue.created_at)}</p>
                    </div>

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

    const fetchIssues = async () => {
        if (!userProfile?.name) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('logistics_issues')
                .select('id, reception_no, brand, issue_type, status, created_at, request_content, action_content, final_handler, resolved_at')
                .eq('reporter', userProfile.name)
                .order('created_at', { ascending: false })
                .limit(50);
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

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                >
                    <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="flex-1">
                    <p className="text-slate-800 font-black text-base">내 등록 이력</p>
                </div>
                <button
                    onClick={fetchIssues}
                    className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                >
                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </header>

            {/* 목록 */}
            <div className="flex-1 px-4 py-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-letusOrange rounded-full animate-spin" />
                        <p className="text-slate-500 text-sm font-bold mt-3">불러오는 중...</p>
                    </div>
                ) : issues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mb-4">
                            <span className="text-3xl">📋</span>
                        </div>
                        <p className="text-slate-700 font-bold text-base">등록 이력이 없습니다</p>
                        <p className="text-slate-400 text-sm mt-1">입고 특이사항을 등록하면<br />여기에 표시됩니다.</p>
                        <button
                            onClick={() => navigate('/mobile/register')}
                            className="mt-6 bg-letusOrange hover:bg-orange-500 active:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm shadow-sm"
                        >
                            지금 등록하기
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1">
                            최근 {issues.length}건
                        </p>
                        {issues.map(issue => (
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
                                <p className="text-slate-700 text-sm leading-snug line-clamp-2">
                                    {issue.request_content || '(내용 없음)'}
                                </p>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                                    <p className="text-slate-300 text-[11px] font-mono">{issue.reception_no}</p>
                                    <p className="text-slate-400 text-xs">{formatDate(issue.created_at)}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <IssueDetailSheet issue={selectedIssue} onClose={() => setSelectedIssue(null)} />
        </div>
    );
};
