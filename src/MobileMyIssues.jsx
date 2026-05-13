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

export const MobileMyIssues = () => {
    const navigate = useNavigate();
    const [issues, setIssues] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchIssues = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('logistics_issues')
                .select('id, reception_no, brand, issue_type, status, created_at, request_content')
                .eq('reporter', '모바일 작업자')
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

    useEffect(() => { fetchIssues(); }, []);

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm">
                <button
                    onClick={() => navigate('/mobile')}
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
                            <div key={issue.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
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
                                    {issue.request_content}
                                </p>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                                    <p className="text-slate-300 text-[11px] font-mono">{issue.reception_no}</p>
                                    <p className="text-slate-400 text-xs">{formatDate(issue.created_at)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
