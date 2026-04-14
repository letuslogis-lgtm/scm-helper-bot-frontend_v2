import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, adminSupabase } from './supabaseClient.js';
import { Header } from './Header.jsx';
import { Sidebar } from './Sidebar.jsx';


// 🔍 핵심: 외부 파일(Sidebar.jsx, Header.jsx)에서 window에 등록한 부품들을 가져옵니다.



const MainLayout = ({
    children,
    currentPage,
    setCurrentPage,
    userProfile,
    handleLogout,
    notifications,
    isNotiOpen,
    setIsNotiOpen,
    isSidebarOpen,
    setIsSidebarOpen,
    favorites,
    toggleFavorite,
    handleNotiClick,
    handleMarkAllAsRead,
    setSelfEditTarget
}) => {
    return (
        /* 전체 화면 고정 (스크롤 방지) */
        <div className="flex h-screen overflow-hidden bg-letusBg text-gray-900 font-sans">

            {/* 1. 사이드바 (Sidebar.jsx) */}
            <Sidebar
                page={currentPage}
                setPage={setCurrentPage}
                userProfile={userProfile}
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
                favorites={favorites}
            />

            {/* 2. 본문 컨테이너 (헤더 + 내용) */}
            <div className="flex-1 flex flex-col w-full bg-slate-100 overflow-hidden relative">

                {/* 3. 상단 헤더 (Header.jsx) */}
                <Header
                    page={currentPage}
                    userProfile={userProfile}
                    onLogout={handleLogout}
                    notifications={notifications}
                    isNotiOpen={isNotiOpen}
                    toggleNoti={() => setIsNotiOpen(!isNotiOpen)}
                    onNotiClick={handleNotiClick}
                    onEditProfile={() => setSelfEditTarget(userProfile)}
                    favorites={favorites}
                    toggleFavorite={toggleFavorite}
                    isSidebarOpen={isSidebarOpen}
                    setIsSidebarOpen={setIsSidebarOpen}
                    onMarkAllRead={handleMarkAllAsRead}
                />

                {/* 4. 본문 영역 (각 메뉴가 렌더링되는 곳)
                    h-[calc(100vh-64px)]를 통해 헤더 제외 높이를 딱 맞추고, 
                    overflow-auto를 줘서 여기 안에서만 스크롤이 생기게 만듭니다. */}
                <main className="flex-1 w-full overflow-auto custom-scrollbar bg-slate-100">
                    {children}
                </main>
            </div>
        </div>
    );
};

// 🌟 다른 파일(App)에서도 이 레이아웃을 쓸 수 있게 전역 등록!
export { MainLayout };
