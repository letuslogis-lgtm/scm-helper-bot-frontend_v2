import React, { useState, useEffect } from 'react';
// 🌟 SSOT(단일 진실 공급원) 적용: 이제 메뉴 정보는 여기서 가져옵니다!
import { ALL_MENUS } from './menuConfig.jsx';

const Sidebar = ({ page, setPage, userProfile, isSidebarOpen, setIsSidebarOpen, favorites }) => {
    const [openMenu, setOpenMenu] = useState('home_menu');
    const [activeTab, setActiveTab] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

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
                                // 🌟 MENU_DATA 대신 ALL_MENUS 사용
                                const foundMenu = ALL_MENUS.flatMap(m => m.children).find(c => c.id === favId);
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

                {/* 🌟 MENU_DATA 대신 ALL_MENUS 사용 */}
                {(activeTab === 'all' || !isSidebarOpen) && ALL_MENUS.map((menu) => {
                    const isAdmin = userProfile?.role === '관리자';
                    const userMenus = userProfile?.accessible_menus ? userProfile.accessible_menus.split(',') : [];

                    // 권한 있는 소메뉴만 필터링
                    const allowedChildren = menu.children.filter(child => isAdmin || userMenus.includes(child.id));

                    // 권한 있는 소메뉴가 하나도 없으면 대메뉴 자체를 숨김
                    if (allowedChildren.length === 0) return null;

                    const filteredChildren = allowedChildren.filter(child => child.label.toLowerCase().includes(searchTerm.toLowerCase()));

                    // 검색어가 있는데 매칭되는 소메뉴가 없고, 대메뉴 이름도 매칭 안되면 숨김
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
                                                    <span dangerouslySetInnerHTML={{ __html: child.label.replace(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), match => `<span class="text-letusOrange font-bold">${match}</span>`) }} />
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