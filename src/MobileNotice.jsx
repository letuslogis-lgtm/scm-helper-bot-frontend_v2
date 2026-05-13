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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-5 py-4 flex items-center gap-3">
                <button
                    onClick={() => navigate('/mobile')}
                    className="p-2 rounded-xl bg-white/5 active:bg-white/10 transition-colors"
                >
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="flex-1">
                    <p className="text-white font-black text-base">공지사항</p>
                    <p className="text-blue-300/70 text-xs">팀 공지 및 업무 지시</p>
                </div>
            </header>

            {/* 목록 */}
            <div className="flex-1 px-5 py-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <div className="w-8 h-8 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                        <p className="text-blue-300 text-sm font-bold mt-3">불러오는 중...</p>
                    </div>
                ) : notices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <span className="text-6xl mb-4">📢</span>
                        <p className="text-white font-bold text-base">공지사항이 없습니다</p>
                        <p className="text-white/40 text-sm mt-1">새로운 공지가 등록되면<br />여기에 표시됩니다.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {notices.map(notice => (
                            <div
                                key={notice.id}
                                className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden active:bg-white/8 transition-colors"
                                onClick={() => setExpandedId(expandedId === notice.id ? null : notice.id)}
                            >
                                <div className="p-4 flex items-start gap-3">
                                    {notice.is_important && (
                                        <span className="mt-0.5 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[11px] font-bold border border-orange-500/30 flex-shrink-0">
                                            중요
                                        </span>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-bold text-sm leading-snug">{notice.title}</p>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <p className="text-white/35 text-xs">{notice.author_name}</p>
                                            <span className="text-white/20 text-xs">·</span>
                                            <p className="text-white/35 text-xs">{formatDate(notice.created_at)}</p>
                                        </div>
                                    </div>
                                    <svg
                                        className={`w-4 h-4 text-white/25 flex-shrink-0 mt-0.5 transition-transform duration-200 ${expandedId === notice.id ? 'rotate-180' : ''}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                                {expandedId === notice.id && (
                                    <div className="px-4 pb-5 border-t border-white/8 pt-3">
                                        <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">
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
