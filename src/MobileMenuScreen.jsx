import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribePush } from './hooks/usePushNotification.js';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;

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

export const MobileMenuScreen = ({ userProfile, handleLogout, completedNotiCount = 0 }) => {
    const navigate = useNavigate();
    const [installPrompt, setInstallPrompt] = useState(null);
    const [installed, setInstalled] = useState(isStandalone);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        if (userProfile?.name) subscribePush(userProfile.name)
    }, [userProfile?.name])

    useEffect(() => {
        if (window.deferredPrompt) setInstallPrompt(window.deferredPrompt);
        const handler = (e) => {
            e.preventDefault();
            window.deferredPrompt = e;
            setInstallPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', () => {
            setInstalled(true);
            window.deferredPrompt = null;
            setInstallPrompt(null);
        });
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (installPrompt) {
            installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;
            if (outcome === 'accepted') {
                setInstallPrompt(null);
                setInstalled(true);
            }
        } else {
            setShowGuide(v => !v);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <div className="bg-white shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400 to-orange-600" />
                <div className="px-5 pt-6 pb-5">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-black text-letusOrange tracking-tighter">LETUS LOGIS</h1>
                            <p className="text-sm text-slate-400 font-medium mt-0.5">통합 물류 관리 시스템</p>
                        </div>
                        <button
                            onClick={() => navigate('/mobile/my-issues')}
                            className="relative p-2 mt-1"
                        >
                            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            {completedNotiCount > 0 && (
                                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                                    {completedNotiCount > 9 ? '9+' : completedNotiCount}
                                </span>
                            )}
                        </button>
                    </div>
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
                        {item.id === 'my-issues' && completedNotiCount > 0 && (
                            <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center flex-shrink-0">
                                {completedNotiCount > 9 ? '9+' : completedNotiCount}
                            </span>
                        )}
                        <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                ))}

                {/* 계정 */}
                <div className="mt-3">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2.5">계정</p>

                    {/* 홈 화면 바로가기 추가 */}
                    {!installed && (
                        <div className="mb-2.5">
                            <button
                                onClick={handleInstall}
                                className="w-full bg-white rounded-xl shadow-sm border border-slate-100 p-4 flex items-center gap-4 active:scale-[0.98] transition-transform text-left"
                            >
                                <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-slate-800 font-bold text-[15px]">홈 화면에 추가</p>
                                    <p className="text-slate-400 text-xs mt-0.5">
                                        {installPrompt ? '탭하면 바로 설치됩니다' : '설치 방법을 안내합니다'}
                                    </p>
                                </div>
                                {!installPrompt && (
                                    <svg
                                        className={`w-4 h-4 text-slate-300 flex-shrink-0 transition-transform duration-200 ${showGuide ? 'rotate-90' : ''}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                    </svg>
                                )}
                            </button>

                            {/* 수동 설치 안내 */}
                            {showGuide && !installPrompt && (
                                <div className="mt-1.5 bg-slate-50 border border-slate-200 rounded-xl p-4">
                                    {isIOS ? (
                                        <div className="space-y-2">
                                            <p className="text-xs font-bold text-slate-600 mb-2">Safari에서 설치하는 방법</p>
                                            <p className="text-xs text-slate-500">① 하단 <span className="font-bold text-slate-700">공유 버튼</span> (□↑) 탭</p>
                                            <p className="text-xs text-slate-500">② <span className="font-bold text-slate-700">"홈 화면에 추가"</span> 선택</p>
                                            <p className="text-xs text-slate-500">③ 오른쪽 상단 <span className="font-bold text-slate-700">"추가"</span> 탭</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <p className="text-xs font-bold text-slate-600 mb-2">브라우저에서 설치하는 방법</p>
                                            <p className="text-xs text-slate-500">① 브라우저 우측 상단 <span className="font-bold text-slate-700">메뉴(⋮ 또는 ≡)</span> 탭</p>
                                            <p className="text-xs text-slate-500">② <span className="font-bold text-slate-700">"홈 화면에 추가"</span> 선택</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 로그아웃 */}
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
