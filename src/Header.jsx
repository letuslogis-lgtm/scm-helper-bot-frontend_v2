import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { ALL_MENUS } from './menuConfig.jsx';

const Header = ({ page, userProfile, onLogout, notifications = [], isNotiOpen, toggleNoti, onNotiClick, onEditProfile, favorites, toggleFavorite, isSidebarOpen, setIsSidebarOpen, onMarkAllRead }) => {
    const [notiStatus, setNotiStatus] = useState(Notification.permission);

    const handleRequestNotification = () => {
        if (notiStatus === 'denied') {
            alert('🔕 알림이 차단되어 있습니다!\n\n브라우저 상단 주소창 왼쪽의 [자물쇠(🔒) 아이콘]을 클릭한 후, [알림] 권한을 "허용"으로 변경하고 새로고침해 주세요.');
            return;
        }
        if (notiStatus === 'default') {
            Notification.requestPermission().then(permission => {
                setNotiStatus(permission);
                if (permission === 'granted') alert('🔔 이제부터 특이사항 발생 시 바탕화면 팝업 알림이 전송됩니다!');
            });
        }
    };

    // 🌟 ALL_MENUS를 사용하여 페이지 제목 동적 조회
    let pageTitle = '특이사항 LIST'; // 기본값

    ALL_MENUS.forEach(menu => {
        if (menu.children) {
            const matchedChild = menu.children.find(child => child.id === page);
            if (matchedChild) {
                pageTitle = matchedChild.label;
            }
        }
    });

    const isFavorite = favorites?.includes(page);

    // 안 읽은 알림 개수 계산
    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <header className="h-16 min-h-[64px] flex-shrink-0 bg-gradient-to-r from-blue-50/70 to-white border-b border-gray-200 flex justify-between items-center px-4 sm:px-6 sticky top-0 z-50">
            <div className="flex items-center text-gray-800 gap-3">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 mr-1 text-gray-400 hover:text-letusBlue hover:bg-blue-50 rounded transition-colors focus:outline-none" title="사이드바 열기/접기">
                    <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>

                <h2 className="text-[19px] font-extrabold tracking-tight flex items-center gap-1.5">
                    <button onClick={() => toggleFavorite(page)} className="focus:outline-none transition-transform hover:scale-110 active:scale-90 flex items-center" title="즐겨찾기 추가/해제">
                        {isFavorite ? (
                            <svg className="w-6 h-6 text-yellow-400 drop-shadow-sm" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                        ) : (
                            <svg className="w-6 h-6 text-gray-300 hover:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                        )}
                    </button>
                    {pageTitle}
                </h2>
            </div>

            <div className="flex items-center gap-4 sm:gap-5">
                <button onClick={() => window.location.reload()} className="text-gray-400 hover:text-letusBlue transition-colors focus:outline-none" title="새로고침">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>

                <div className="relative flex items-center">
                    <button onClick={toggleNoti} className="text-gray-400 hover:text-letusOrange transition-colors focus:outline-none relative" title="알림 확인">
                        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {unreadCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[17px] text-center border-2 border-white shadow-sm">
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {isNotiOpen && (
                        <div className="absolute right-0 top-full mt-4 w-72 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-[100] slide-up flex flex-col">
                            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100 flex justify-between items-center shrink-0">
                                <h4 className="text-xs font-bold text-gray-700">최근 알림</h4>
                                <button onClick={handleRequestNotification} className={`flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded border transition-colors shadow-sm ${notiStatus === 'granted' ? 'bg-green-50 text-green-700 border-green-200' : notiStatus === 'denied' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-orange-50 text-orange-600 border-orange-200 animate-pulse'}`}>
                                    {notiStatus === 'granted' ? 'PC 알림 ON' : notiStatus === 'denied' ? '알림 차단됨' : '알림 켜기'}
                                </button>
                            </div>

                            <div className="max-h-64 overflow-y-auto custom-scrollbar flex-1">
                                {notifications && notifications.length > 0 ? (
                                    notifications.map(noti => (
                                        <div key={noti.id} onClick={() => onNotiClick(noti.id, noti.filterObj)} className={`px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${noti.read ? 'opacity-50' : 'bg-blue-50/20'}`}>
                                            <p className="text-xs font-bold text-letusBlue mb-1 flex items-center gap-1">
                                                {!noti.read && <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>}
                                                {noti.title}
                                            </p>
                                            <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed">{noti.message}</p>
                                            <p className="text-[9px] text-gray-400 mt-1.5 font-mono">{noti.date}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-8 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
                                        <svg className="w-6 h-6 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                        새로운 알림이 없습니다.
                                    </div>
                                )}
                            </div>

                            {/* 🔥 안 읽은 개수 상관없이, 알림 내역이 1개라도 있으면 무조건 버튼 노출! */}
                            {notifications.length > 0 && (
                                <div className="border-t border-gray-100 bg-gray-50 p-2 text-center shrink-0 hover:bg-gray-100 transition-colors cursor-pointer" onClick={onMarkAllRead}>
                                    <button className="text-[11px] font-bold text-gray-500 hover:text-letusBlue transition-colors w-full flex items-center justify-center gap-1.5">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        모두 읽음 처리
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="h-7 w-px bg-gray-200 mx-1 hidden sm:block"></div>

                <div className="text-right flex flex-col justify-center hidden sm:flex">
                    <p className="text-[15px] font-bold text-gray-800 cursor-pointer hover:text-letusBlue transition-colors leading-tight" onClick={onEditProfile}>{userProfile?.name || '대기중'}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{userProfile?.brands || 'LETUS'} • {userProfile?.role || '사용자'}</p>
                </div>

                <button onClick={onLogout} className="p-2 ml-1 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 hover:bg-red-50 rounded-lg" title="로그아웃">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </button>
            </div>
        </header>
    );
};

export { Header };