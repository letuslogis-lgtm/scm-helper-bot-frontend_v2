import React from 'react';
import { useNavigate } from 'react-router-dom';

const MENU_ITEMS = [
    {
        id: 'register',
        icon: '📦',
        title: '입고 특이사항 등록',
        subtitle: '입고 시 발생한 이슈를 빠르게 등록',
        iconBg: 'bg-blue-50',
        path: '/mobile/register',
    },
    {
        id: 'my-issues',
        icon: '📋',
        title: '내 등록 이력',
        subtitle: '최근 등록한 특이사항 확인',
        iconBg: 'bg-violet-50',
        path: '/mobile/my-issues',
    },
    {
        id: 'notice',
        icon: '📢',
        title: '공지사항',
        subtitle: '팀 공지사항 및 업무 지시 확인',
        iconBg: 'bg-orange-50',
        path: '/mobile/notice',
    },
];

export const MobileMenuScreen = ({ userProfile, handleLogout }) => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <div className="bg-white shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400 to-orange-600" />
                <div className="px-5 pt-6 pb-5">
                    <h1 className="text-2xl font-black text-letusOrange tracking-tighter">LETUS LOGIS</h1>
                    <p className="text-sm text-slate-400 font-medium mt-0.5">통합 물류 관리 시스템</p>
                    {userProfile?.name && (
                        <div className="mt-4 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-letusBlue flex items-center justify-center flex-shrink-0">
                                <span className="text-white text-sm font-black">{userProfile.name.slice(0, 1)}</span>
                            </div>
                            <div>
                                <p className="text-slate-700 text-sm font-bold leading-none">{userProfile.name}님, 안녕하세요</p>
                                <p className="text-slate-400 text-xs mt-0.5">{userProfile.email || userProfile.role || ''}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 메뉴 목록 */}
            <div className="flex-1 px-4 py-5 flex flex-col gap-2.5">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-1">메뉴</p>

                {MENU_ITEMS.map(item => (
                    <button
                        key={item.id}
                        onClick={() => navigate(item.path)}
                        className="w-full bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 active:scale-[0.98] transition-transform text-left hover:shadow-md"
                    >
                        <div className={`w-11 h-11 rounded-xl ${item.iconBg} flex items-center justify-center text-xl flex-shrink-0`}>
                            {item.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-slate-800 font-bold text-[15px]">{item.title}</p>
                            <p className="text-slate-400 text-xs mt-0.5">{item.subtitle}</p>
                        </div>
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                ))}

                {/* 로그아웃 */}
                <div className="mt-3">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2.5">계정</p>
                    <button
                        onClick={handleLogout}
                        className="w-full bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 active:scale-[0.98] transition-transform text-left"
                    >
                        <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center text-xl flex-shrink-0">
                            🚪
                        </div>
                        <div className="flex-1">
                            <p className="text-red-500 font-bold text-[15px]">로그아웃</p>
                            <p className="text-red-300 text-xs mt-0.5">계정에서 안전하게 로그아웃</p>
                        </div>
                    </button>
                </div>
            </div>

            <div className="pb-10 text-center text-[11px] text-slate-300 font-medium">
                © 2026 LETUS. All rights reserved.
            </div>
        </div>
    );
};
