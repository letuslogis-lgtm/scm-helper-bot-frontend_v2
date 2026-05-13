import React from 'react';
import { useNavigate } from 'react-router-dom';

const MENU_ITEMS = [
    {
        id: 'register',
        icon: '📦',
        title: '입고 특이사항 등록',
        subtitle: '입고 시 발생한 이슈를 빠르게 등록',
        gradient: 'from-blue-500 to-cyan-400',
        shadow: 'shadow-blue-500/30',
        path: '/mobile/register',
    },
    {
        id: 'my-issues',
        icon: '📋',
        title: '내 등록 이력',
        subtitle: '최근 등록한 특이사항 확인',
        gradient: 'from-violet-500 to-purple-400',
        shadow: 'shadow-violet-500/30',
        path: '/mobile/my-issues',
    },
    {
        id: 'notice',
        icon: '📢',
        title: '공지사항',
        subtitle: '팀 공지사항 및 업무 지시 확인',
        gradient: 'from-orange-500 to-amber-400',
        shadow: 'shadow-orange-500/30',
        path: '/mobile/notice',
    },
];

export const MobileMenuScreen = ({ userProfile, handleLogout }) => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
            {/* 헤더 */}
            <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-5 py-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <span className="text-white font-black text-base">L</span>
                        </div>
                        <div>
                            <p className="text-white font-black text-base tracking-tight leading-none">LETUS LOGIS</p>
                            <p className="text-blue-300/80 text-xs font-medium mt-0.5">통합 물류 관리</p>
                        </div>
                    </div>
                    {userProfile?.name && (
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-cyan-300 flex items-center justify-center">
                                <span className="text-white text-[9px] font-black">{userProfile.name.slice(0, 1)}</span>
                            </div>
                            <span className="text-white/80 text-xs font-bold">{userProfile.name}</span>
                        </div>
                    )}
                </div>
            </header>

            {/* 메뉴 목록 */}
            <div className="flex-1 px-5 py-6 flex flex-col gap-3">
                <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-1 ml-1">메뉴</p>

                {MENU_ITEMS.map(item => (
                    <button
                        key={item.id}
                        onClick={() => navigate(item.path)}
                        className="w-full bg-white/5 hover:bg-white/8 active:scale-[0.98] border border-white/10 rounded-2xl p-5 flex items-center gap-4 transition-all text-left"
                    >
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-2xl shadow-lg ${item.shadow} flex-shrink-0`}>
                            {item.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-[15px] leading-snug">{item.title}</p>
                            <p className="text-blue-300/60 text-xs mt-0.5">{item.subtitle}</p>
                        </div>
                        <svg className="w-5 h-5 text-white/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                ))}

                {/* 로그아웃 */}
                <div className="mt-2">
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3 ml-1">계정</p>
                    <button
                        onClick={handleLogout}
                        className="w-full bg-red-500/8 hover:bg-red-500/15 active:scale-[0.98] border border-red-500/20 rounded-2xl p-5 flex items-center gap-4 transition-all text-left"
                    >
                        <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center text-2xl flex-shrink-0">
                            🚪
                        </div>
                        <div className="flex-1">
                            <p className="text-red-400 font-bold text-[15px]">로그아웃</p>
                            <p className="text-red-400/50 text-xs mt-0.5">계정에서 안전하게 로그아웃</p>
                        </div>
                    </button>
                </div>
            </div>

            <div className="pb-10 text-center text-[11px] text-white/15 font-medium">
                © 2026 LETUS. All rights reserved.
            </div>
        </div>
    );
};
