import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribePush } from './hooks/usePushNotification.js';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;

export const MobileAdminMenu = ({ userProfile, handleLogout, pendingCount = 0, onLogoClick }) => {
    const navigate = useNavigate();
    const [installPrompt, setInstallPrompt] = useState(null);
    const [installed, setInstalled] = useState(isStandalone);
    const [showGuide, setShowGuide] = useState(false);
    const [showExitToast, setShowExitToast] = useState(false);
    const canExitRef = useRef(false);
    const exitTimerRef = useRef(null);

    useEffect(() => {
        if (userProfile?.name) subscribePush(userProfile.name);
    }, [userProfile?.name]);

    const handlePushTest = async () => {
        if (!userProfile?.name) { alert('❌ name 없음'); return; }
        alert('✅ 1단계: name=' + userProfile.name);
        if (!('Notification' in window)) { alert('❌ 2: Notification API 없음'); return; }
        alert('✅ 2단계: permission=' + Notification.permission);
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) { alert('❌ 3: PushManager 없음'); return; }
        alert('✅ 3단계: PushManager 있음. 권한 요청...');
        const permission = await Notification.requestPermission();
        alert('✅ 4단계: 결과=' + permission);
        if (permission !== 'granted') { alert('❌ 거부됨. 브라우저 설정에서 알림을 허용해주세요.'); return; }
        const success = await subscribePush(userProfile.name);
        alert(success ? '✅ 알림 설정 완료!' : '❌ 구독 등록 실패');
    };

    useEffect(() => {
        window.history.pushState(null, '', window.location.href);
        const handlePopState = () => {
            if (canExitRef.current) {
                window.history.go(-1);
            } else {
                canExitRef.current = true;
                setShowExitToast(true);
                window.history.pushState(null, '', window.location.href);
                clearTimeout(exitTimerRef.current);
                exitTimerRef.current = setTimeout(() => {
                    canExitRef.current = false;
                    setShowExitToast(false);
                }, 2000);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
            clearTimeout(exitTimerRef.current);
        };
    }, []);

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

    const MENU_GROUPS = [
        {
            label: '특이사항 관리',
            items: [
                {
                    id: 'issues',
                    icon: '📋',
                    title: '특이사항 현황',
                    subtitle: '접수·이관·조치 처리',
                    iconBg: 'bg-orange-50',
                    path: '/mobile/admin/issues',
                    badge: pendingCount,
                },
            ],
        },
        {
            label: '개발 · 테스트',
            items: [
                {
                    id: 'barcode-tester',
                    icon: '🔬',
                    title: 'AI 바코드 테스터',
                    subtitle: 'analyze-barcode 응답 확인',
                    iconBg: 'bg-purple-50',
                    path: '/mobile/admin/barcode-tester',
                    badge: 0,
                },
                {
                    id: 'push-test',
                    icon: '🔔',
                    title: 'Push 알림 테스트',
                    subtitle: '구독 등록 · 수신 진단',
                    iconBg: 'bg-blue-50',
                    path: null,
                    badge: 0,
                },
            ],
        },
        {
            label: '공지 · 소통',
            items: [
                {
                    id: 'notice',
                    icon: '📢',
                    title: '공지사항',
                    subtitle: '팀 공지 확인',
                    iconBg: 'bg-blue-50',
                    path: '/mobile/notice',
                    badge: 0,
                },
            ],
        },
    ];

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <div className="bg-white shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-letusBlue to-blue-700" />
                <div className="px-5 pt-6 pb-5">
                    <div className="flex items-start justify-between">
                        {onLogoClick ? (
                            <button onClick={onLogoClick} className="text-left active:opacity-70 transition-opacity">
                                <h1 className="text-2xl font-black text-letusBlue tracking-tighter">LETUS LOGIS</h1>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <p className="text-sm text-slate-400 font-medium">관리자 모바일</p>
                                    <span className="text-[10px] font-black text-white bg-letusBlue px-1.5 py-0.5 rounded-full leading-none">
                                        관리자 모드
                                    </span>
                                </div>
                            </button>
                        ) : (
                            <div>
                                <h1 className="text-2xl font-black text-letusBlue tracking-tighter">LETUS LOGIS</h1>
                                <p className="text-sm text-slate-400 font-medium mt-0.5">관리자 모바일</p>
                            </div>
                        )}
                        <button onClick={() => navigate('/mobile/admin/issues', { state: { initialTab: '조치대기' } })} className="relative p-2 mt-1">
                            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            {pendingCount > 0 && (
                                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                                    {pendingCount > 9 ? '9+' : pendingCount}
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
                                <p className="text-slate-700 text-sm font-bold leading-none">{userProfile.name} 관리자님</p>
                                <p className="text-slate-400 text-xs mt-0.5">{userProfile.email || ''}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 미처리 알림 배너 */}
            {pendingCount > 0 && (
                <button
                    onClick={() => navigate('/mobile/admin/issues', { state: { initialTab: '조치대기' } })}
                    className="mx-4 mt-4 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform text-left"
                >
                    <span className="text-2xl">🔔</span>
                    <div>
                        <p className="text-orange-700 font-black text-sm">미처리 특이사항 {pendingCount}건</p>
                        <p className="text-orange-400 text-xs mt-0.5">탭하여 확인하세요</p>
                    </div>
                    <svg className="w-4 h-4 text-orange-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            )}

            {/* 메뉴 */}
            <div className="flex-1 px-4 py-5 flex flex-col gap-5">
                {MENU_GROUPS.map(group => (
                    <div key={group.label}>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2">{group.label}</p>
                        <div className="grid grid-cols-2 gap-2">
                            {group.items.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => item.id === 'push-test' ? handlePushTest() : navigate(item.path)}
                                    className="relative bg-white rounded-xl shadow-sm border border-slate-100 p-3.5 flex flex-row items-center gap-3 active:scale-[0.97] transition-transform text-left"
                                >
                                    <div className={`w-9 h-9 rounded-xl ${item.iconBg} flex items-center justify-center text-lg flex-shrink-0`}>
                                        {item.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-slate-800 font-bold text-[13px] leading-snug">{item.title}</p>
                                        <p className="text-slate-400 text-[11px] mt-0.5 leading-tight">{item.subtitle}</p>
                                    </div>
                                    {item.badge > 0 && (
                                        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                                            {item.badge > 9 ? '9+' : item.badge}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}

                {/* 계정 */}
                <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2">계정</p>

                    {!installed && (
                        <div className="mb-2">
                            <button onClick={handleInstall}
                                className="w-full bg-white rounded-xl shadow-sm border border-slate-100 p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform text-left">
                                <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-slate-800 font-bold text-[14px]">홈 화면에 추가</p>
                                    <p className="text-slate-400 text-xs mt-0.5">
                                        {installPrompt ? '탭하면 바로 설치됩니다' : '설치 방법을 안내합니다'}
                                    </p>
                                </div>
                                {!installPrompt && (
                                    <svg className={`w-4 h-4 text-slate-300 flex-shrink-0 transition-transform duration-200 ${showGuide ? 'rotate-90' : ''}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                    </svg>
                                )}
                            </button>

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

                    <button onClick={handleLogout}
                        className="w-full bg-white rounded-xl shadow-sm border border-slate-100 p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform text-left">
                        <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-lg flex-shrink-0">
                            🚪
                        </div>
                        <div className="flex-1">
                            <p className="text-red-500 font-bold text-[14px]">로그아웃</p>
                            <p className="text-red-300 text-xs mt-0.5">계정에서 안전하게 로그아웃</p>
                        </div>
                    </button>
                </div>
            </div>

            <div className="pb-10 text-center text-[11px] text-slate-300 font-medium">
                © 2026 LETUS. All rights reserved.
            </div>

            {showExitToast && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-700/90 text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg z-50 whitespace-nowrap">
                    한번 더 뒤로가기를 하면 종료됩니다.
                </div>
            )}
        </div>
    );
};
