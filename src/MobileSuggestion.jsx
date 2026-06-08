import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

const SUG_TYPES = ['기능 개선 (UI/UX)', '신규 기능 추가 요청', '오류 및 버그 신고', '기타'];

const STATUS_STYLE = {
    '대기중':   'bg-slate-100 text-slate-500 border-slate-200',
    '검토중':   'bg-blue-50 text-blue-600 border-blue-200',
    '반영완료': 'bg-green-50 text-green-600 border-green-200',
    '반려':     'bg-red-50 text-red-500 border-red-200',
};

const formatDate = (dt) => {
    const d = new Date(dt);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

/* ── 상세 바텀 시트 ── */
const DetailSheet = ({ item, onClose }) => {
    if (!item) return null;
    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[80svh] overflow-y-auto overscroll-contain">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>
                <div className="px-5 pb-10 pt-3 space-y-4">
                    {/* 헤더 */}
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                            {item.request_type}
                        </span>
                        <span className={`text-[11px] font-bold border px-2.5 py-1 rounded-full ${STATUS_STYLE[item.status] || STATUS_STYLE['대기중']}`}>
                            {item.status || '대기중'}
                        </span>
                    </div>

                    <p className="text-slate-800 font-black text-base leading-snug">{item.title}</p>
                    <p className="text-slate-400 text-xs">{formatDate(item.created_at)}</p>

                    <div className="h-px bg-slate-100" />

                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">건의 내용</p>
                        <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{item.content}</p>
                    </div>

                    {item.answer ? (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div>
                                <p className="text-[11px] font-bold text-letusBlue uppercase tracking-widest mb-1.5">관리자 답변</p>
                                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                                    <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{item.answer}</p>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-center">
                            <p className="text-slate-400 text-xs">아직 답변이 등록되지 않았습니다.</p>
                        </div>
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

/* ── 메인 컴포넌트 ── */
export const MobileSuggestion = ({ userProfile }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('write'); // 'write' | 'history'

    // 건의하기 폼
    const [sugType, setSugType] = useState(SUG_TYPES[0]);
    const [title, setTitle]     = useState('');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 내 건의 내역
    const [myList, setMyList]     = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeItem, setActiveItem] = useState(null);

    const fetchMyList = async () => {
        if (!userProfile?.name) return;
        setIsLoading(true);
        try {
            const { data } = await supabase
                .from('suggestions')
                .select('*')
                .eq('user_name', userProfile.name)
                .order('created_at', { ascending: false });
            setMyList(data || []);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history') fetchMyList();
    }, [activeTab, userProfile?.name]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return alert('제목과 내용을 모두 입력해주세요.');
        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('suggestions').insert([{
                user_name:    userProfile?.name || '알수없음',
                request_type: sugType,
                title:        title.trim(),
                content:      content.trim(),
            }]);
            if (error) throw error;
            alert('건의사항이 접수되었습니다.\n"내 건의 내역"에서 답변을 확인할 수 있습니다.');
            setTitle('');
            setContent('');
            setSugType(SUG_TYPES[0]);
        } catch {
            alert('등록 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col">
            {/* 헤더 */}
            <div className="px-5 pt-12 pb-4 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700 transition-colors"
                >
                    <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <div>
                    <h1 className="text-white font-black text-lg leading-none">건의사항</h1>
                    <p className="text-slate-400 text-xs mt-0.5">개선 아이디어·오류 신고</p>
                </div>
            </div>

            {/* 탭 */}
            <div className="mx-5 flex bg-slate-800 rounded-xl p-1 mb-4">
                {[
                    { id: 'write',   label: '💬 건의하기' },
                    { id: 'history', label: '📋 내 건의 내역' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                            activeTab === tab.id
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-400 active:text-slate-200'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 컨텐츠 */}
            <div className="flex-1 mx-5 mb-8">

                {/* ── 건의하기 탭 ── */}
                {activeTab === 'write' && (
                    <form onSubmit={handleSubmit} className="bg-slate-800 rounded-2xl p-5 space-y-5">
                        {/* 유형 선택 */}
                        <div>
                            <p className="text-slate-400 text-xs font-bold mb-2.5">건의 유형</p>
                            <div className="flex flex-wrap gap-2">
                                {SUG_TYPES.map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setSugType(t)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                            sugType === t
                                                ? 'bg-letusBlue border-letusBlue text-white'
                                                : 'bg-slate-700 border-slate-600 text-slate-300 active:bg-slate-600'
                                        }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 제목 */}
                        <div>
                            <p className="text-slate-400 text-xs font-bold mb-2">제목 <span className="text-red-400">*</span></p>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="건의사항 제목을 입력하세요."
                                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-letusBlue placeholder-slate-500"
                            />
                        </div>

                        {/* 내용 */}
                        <div>
                            <p className="text-slate-400 text-xs font-bold mb-2">내용 <span className="text-red-400">*</span></p>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder="개선이 필요한 부분이나 아이디어를 자세히 적어주세요."
                                rows={5}
                                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-letusBlue placeholder-slate-500 resize-none"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3.5 rounded-xl bg-letusBlue text-white font-bold text-sm active:bg-blue-600 disabled:opacity-50 transition-colors"
                        >
                            {isSubmitting ? '전송 중...' : '건의사항 등록'}
                        </button>
                    </form>
                )}

                {/* ── 내 건의 내역 탭 ── */}
                {activeTab === 'history' && (
                    <div className="space-y-3">
                        {isLoading ? (
                            <div className="text-center text-slate-500 text-sm py-16">불러오는 중...</div>
                        ) : myList.length === 0 ? (
                            <div className="text-center py-16">
                                <p className="text-3xl mb-3">💬</p>
                                <p className="text-slate-400 text-sm">아직 등록한 건의사항이 없습니다.</p>
                            </div>
                        ) : myList.map(item => (
                            <button
                                key={item.id}
                                onClick={() => setActiveItem(item)}
                                className="w-full bg-slate-800 rounded-2xl p-4 text-left active:bg-slate-700 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-[10px] font-bold bg-slate-700 text-slate-400 px-2 py-0.5 rounded shrink-0">
                                                {item.request_type}
                                            </span>
                                        </div>
                                        <p className="text-white font-bold text-sm leading-snug line-clamp-2">{item.title}</p>
                                        <p className="text-slate-500 text-xs mt-1.5">{formatDate(item.created_at)}</p>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-2">
                                        <span className={`text-[11px] font-bold border px-2.5 py-1 rounded-full ${STATUS_STYLE[item.status] || STATUS_STYLE['대기중']}`}>
                                            {item.status || '대기중'}
                                        </span>
                                        {item.answer && (
                                            <span className="text-[10px] font-bold text-letusBlue">답변 있음 →</span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 상세 시트 */}
            {activeItem && (
                <DetailSheet item={activeItem} onClose={() => setActiveItem(null)} />
            )}
        </div>
    );
};
