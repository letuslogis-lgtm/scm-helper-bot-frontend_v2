import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, adminSupabase } from './supabaseClient.js';



const Sidebar = ({ page, setPage, userProfile, isSidebarOpen, setIsSidebarOpen, favorites }) => {
    const [openMenu, setOpenMenu] = useState('home_menu'); // (초기값)
    const [activeTab, setActiveTab] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const menuData = [
        {
            id: 'home_menu', label: '나의 워크스페이스',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
            children: [
                { id: 'home', label: 'MY DASHBOARD' }
            ]
        },
        {
            id: 'master', label: '마스터 정보관리',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
            children: [
                { id: 'user_management', label: '사용자 관리' },
                { id: 'worker_management', label: '근무자 관리' },
                // 🚩 밑에 있던 시스템 데이터 맵을 여기로 쏙 올렸습니다!
                { id: 'db_map', label: '시스템 데이터 맵' },
                { id: 'product_manager', label: 'ITEM DB 수동 업데이트' }
            ]
        },
        {
            id: 'closing_management', label: '물류 마감 관리',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
            children: [
                { id: 'attendance', label: '근무자 근태 관리' },
                { id: 'productivity', label: '생산성 관리 (예정)' },
                { id: 'profitability', label: '채산 관리 (예정)' }
            ]
        },
        {
            id: 'logistics', label: '입고 특이사항',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>,
            children: [
                { id: 'dashboard', label: '대시보드' },
                { id: 'list', label: '특이사항 LIST' }
            ]
        },
        {
            id: 'loading_issues', label: '상차 특이사항',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
            children: [
                { id: 'accident_dashboard', label: '사고분석 대시보드' },
                { id: 'accident_list', label: '사고분석 LIST' },
                { id: 'accident_report', label: '사고분석 레포트' }
            ]
        },
        {
            id: 'support_menu', label: '고객 지원',
            icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
            children: [{ id: 'support', label: '지원센터' }]
        }
    ];

    useEffect(() => {
        if (searchTerm) setOpenMenu('all_open');
        else setOpenMenu('home_menu');
    }, [searchTerm]);

    const toggleMenu = (menuId) => {
        if (!isSidebarOpen) setIsSidebarOpen(true);
        setOpenMenu(openMenu === menuId ? null : menuId);
    };

    return (
        <div className={`${isSidebarOpen ? 'w-64' : 'w-[72px]'} bg-letusSidebar text-white flex flex-col h-full flex-shrink-0 transition-all duration-300 relative select-none z-50`}>
            <div className={`border-b border-gray-700/50 flex items-center min-h-[64px] ${isSidebarOpen ? 'p-5 justify-between' : 'justify-center py-5'}`}>
                {isSidebarOpen ? (
                    <h1 className="text-2xl cursor-pointer truncate w-full text-left" onClick={() => setPage('home')}>
                        <span className="font-extrabold tracking-tight">LETUS</span>
                        <span className="font-extrabold text-letusOrange tracking-tight ml-1">LOGIS</span>
                    </h1>
                ) : (
                    <h1 className="text-[26px] leading-none cursor-pointer font-black tracking-tighter" onClick={() => setPage('home')}>
                        <span className="text-white">L</span><span className="text-letusOrange">L</span>
                    </h1>
                )}
            </div>

            {isSidebarOpen && (
                <div className="px-4 py-4 space-y-3 border-b border-gray-700/50 animate-fade-in">
                    <div className="relative">
                        <input type="text" placeholder="메뉴 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-800 text-sm text-white placeholder-gray-500 rounded px-3 py-2 pl-9 focus:outline-none focus:ring-1 focus:ring-letusBlue transition-all" />
                        <svg className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <div className="flex bg-gray-800 p-1 rounded">
                        <button onClick={() => setActiveTab('all')} className={`flex-1 text-[11px] font-bold py-1.5 rounded transition-colors ${activeTab === 'all' ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>전체메뉴</button>
                        <button onClick={() => setActiveTab('favorites')} className={`flex-1 text-[11px] font-bold py-1.5 rounded transition-colors ${activeTab === 'favorites' ? 'bg-yellow-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>⭐ 즐겨찾기</button>
                    </div>
                </div>
            )}

            <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto custom-scrollbar cursor-default">
                {activeTab === 'favorites' && isSidebarOpen && (
                    <div className="animate-fade-in">
                        {favorites.length === 0 ? (
                            <p className="text-xs text-gray-500 text-center py-6 cursor-default">별(⭐)을 눌러<br />자주 쓰는 메뉴를 등록하세요.</p>
                        ) : (
                            favorites.map(favId => {
                                const foundMenu = menuData.flatMap(m => m.children).find(c => c.id === favId);
                                if (!foundMenu) return null;
                                return (
                                    <div key={favId} className="px-4 py-1 flex items-center cursor-default">
                                        <span onClick={() => setPage(favId)} className={`cursor-pointer px-2.5 py-1.5 text-[13px] font-bold transition-colors rounded-md flex items-center ${page === favId ? 'bg-letusBlue text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-gray-800'}`}>
                                            <span className="text-[12px] mr-2">⭐</span> {foundMenu.label}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {(activeTab === 'all' || !isSidebarOpen) && menuData.map((menu) => {
                    const isAdmin = userProfile?.role === '관리자';
                    const userMenus = userProfile?.accessible_menus ? userProfile.accessible_menus.split(',') : [];

                    const allowedChildren = menu.children.filter(child => isAdmin || userMenus.includes(child.id));

                    if (allowedChildren.length === 0) return null;

                    const filteredChildren = allowedChildren.filter(child => child.label.toLowerCase().includes(searchTerm.toLowerCase()));

                    if (searchTerm && filteredChildren.length === 0 && !menu.label.toLowerCase().includes(searchTerm.toLowerCase())) return null;
                    const isMenuOpen = openMenu === menu.id || openMenu === 'all_open';

                    return (
                        <div key={menu.id} className="mb-1">
                            <div className={`py-2 flex items-center text-gray-400 transition-colors ${isSidebarOpen ? 'px-3 justify-between' : 'justify-center'} cursor-default`}>
                                <div onClick={() => toggleMenu(menu.id)} className="flex items-center cursor-pointer hover:text-white" title={!isSidebarOpen ? menu.label : ''}>
                                    <span className={`${isSidebarOpen ? 'mr-3' : ''} flex justify-center w-5`}>{menu.icon}</span>
                                    {isSidebarOpen && <span className="text-sm font-semibold">{menu.label}</span>}
                                </div>

                                {isSidebarOpen && (
                                    <div onClick={() => toggleMenu(menu.id)} className="cursor-pointer hover:text-white p-1">
                                        <svg className={`w-3.5 h-3.5 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                )}
                            </div>

                            {isSidebarOpen && isMenuOpen && (
                                <div className="mt-0.5 space-y-0.5 slide-up">
                                    {(searchTerm ? filteredChildren : allowedChildren).map(child => (
                                        <div key={child.id} className="pl-[38px] pr-4 py-1 flex items-center cursor-default">
                                            <span
                                                onClick={() => setPage(child.id)}
                                                className={`cursor-pointer px-3 py-1.5 text-[12px] font-medium transition-colors rounded-md ${page === child.id ? 'bg-letusBlue text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`}
                                            >
                                                {searchTerm ? (
                                                    <span dangerouslySetInnerHTML={{ __html: child.label.replace(new RegExp(searchTerm, 'gi'), match => `<span class="text-letusOrange font-bold">${match}</span>`) }} />
                                                ) : (
                                                    child.label
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {isSidebarOpen && (
                <div className="p-4 text-xs text-gray-600 font-medium border-t border-gray-800 mt-auto truncate text-center">
                    <p>© 2026 LETUS LOGIS.</p>
                </div>
            )}
        </div>
    );
};

export { Sidebar };