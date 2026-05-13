import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

const formatDate = (dt) => {
    const d = new Date(dt);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export const MobileNotice = () => {
    const navigate = useNavigate();
    const [notices, setNotices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);

    useEffect(() => {
        const fetchNotices = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('notices')
                    .select('id, title, content, author_name, is_important, created_at')
                    .order('is_important', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(30);
                if (error) throw error;
                setNotices(data || []);
            } catch (err) {
                console.error('공지 조회 실패:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchNotices();
    }, []);

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
                    <p className="text-slate-800 font-black text-base">공지사항</p>
                </div>
            </header>

            {/* 목록 */}
            <div className="flex-1 px-4 py-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-letusOrange rounded-full animate-spin" />
                        <p className="text-slate-500 text-sm font-bold mt-3">불러오는 중...</p>
                    </div>
                ) : notices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mb-4">
                            <span className="text-3xl">📢</span>
                        </div>
                        <p className="text-slate-700 font-bold text-base">공지사항이 없습니다</p>
                        <p className="text-slate-400 text-sm mt-1">새 공지가 등록되면 여기에 표시됩니다.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {notices.map(notice => (
                            <div
                                key={notice.id}
                                className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden"
                                onClick={() => setExpandedId(expandedId === notice.id ? null : notice.id)}
                            >
                                <div className="p-4 flex items-start gap-3">
                                    {notice.is_important && (
                                        <span className="mt-0.5 px-2 py-0.5 rounded-full bg-letusOrange/10 text-letusOrange text-[11px] font-bold border border-letusOrange/20 flex-shrink-0">
                                            중요
                                        </span>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-slate-800 font-bold text-sm leading-snug">{notice.title}</p>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <p className="text-slate-400 text-xs">{notice.author_name}</p>
                                            <span className="text-slate-300 text-xs">·</span>
                                            <p className="text-slate-400 text-xs">{formatDate(notice.created_at)}</p>
                                        </div>
                                    </div>
                                    <svg
                                        className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5 transition-transform duration-200 ${expandedId === notice.id ? 'rotate-180' : ''}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                                {expandedId === notice.id && (
                                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 bg-slate-50">
                                        <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                                            {notice.content}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
