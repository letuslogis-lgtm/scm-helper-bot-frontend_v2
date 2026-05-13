import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient.js';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;

export const MobileLoginView = () => {
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [installPrompt, setInstallPrompt] = useState(null);
    const [installed, setInstalled] = useState(isStandalone);
    const [showIOSGuide, setShowIOSGuide] = useState(false);

    useEffect(() => {
        // index.html에서 이미 캡처된 경우 바로 사용
        if (window.deferredPrompt) {
            setInstallPrompt(window.deferredPrompt);
        }

        const handler = (e) => {
            e.preventDefault();
            window.deferredPrompt = e;
            setInstallPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', () => {
            setInstalled(true);
            window.deferredPrompt = null;
        });
        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    const handleInstall = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
            setInstallPrompt(null);
            setInstalled(true);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            const targetEmail = loginId.includes('@') ? loginId : `${loginId}@letus.com`;
            const { error } = await supabase.auth.signInWithPassword({ email: targetEmail, password });
            if (error) throw error;
        } catch {
            setError('이메일 또는 비밀번호를 확인해주세요.');
        } finally {
            setIsLoading(false);
        }
    };

    const showInstallBanner = !installed && (isIOS || !!installPrompt);

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <div className="bg-white shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400 to-orange-600" />
                <div className="px-5 pt-6 pb-5">
                    <h1 className="text-2xl font-black text-letusOrange tracking-tighter">LETUS LOGIS</h1>
                    <p className="text-sm text-slate-400 font-medium mt-0.5">통합 물류 관리 시스템</p>
                </div>
            </div>

            <div className="flex-1 px-4 py-6 flex flex-col gap-3">
                {/* 앱 설치 배너 */}
                {showInstallBanner && (
                    <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-letusOrange/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-xl">📲</span>
                            </div>
                            <div>
                                <p className="text-slate-800 font-bold text-sm">앱으로 설치하기</p>
                                <p className="text-slate-400 text-xs mt-0.5">홈 화면에 추가하면 앱처럼 사용할 수 있어요</p>
                            </div>
                        </div>

                        {isIOS ? (
                            <>
                                <button
                                    onClick={() => setShowIOSGuide(v => !v)}
                                    className="w-full bg-slate-100 active:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-lg text-sm transition-colors"
                                >
                                    {showIOSGuide ? '닫기' : '설치 방법 보기 →'}
                                </button>
                                {showIOSGuide && (
                                    <div className="mt-3 bg-slate-50 rounded-lg p-3 space-y-1.5">
                                        <p className="text-xs text-slate-600">① 하단 <span className="font-bold text-slate-700">공유 버튼</span> (□↑) 탭</p>
                                        <p className="text-xs text-slate-600">② <span className="font-bold text-slate-700">"홈 화면에 추가"</span> 선택</p>
                                        <p className="text-xs text-slate-600">③ 오른쪽 상단 <span className="font-bold text-slate-700">"추가"</span> 탭</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            <button
                                onClick={handleInstall}
                                className="w-full bg-letusOrange active:bg-orange-600 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
                            >
                                홈 화면에 추가
                            </button>
                        )}
                    </div>
                )}

                {/* 로그인 카드 */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                    <p className="text-slate-800 font-black text-base mb-4">로그인</p>
                    <form onSubmit={handleLogin} className="flex flex-col gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1.5 block">아이디 (ID)</label>
                            <input
                                type="text"
                                value={loginId}
                                onChange={e => setLoginId(e.target.value)}
                                placeholder="아이디를 입력하세요"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue"
                                required
                                autoComplete="username"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1.5 block">비밀번호</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="비밀번호를 입력하세요"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue"
                                required
                                autoComplete="current-password"
                            />
                        </div>
                        {error && (
                            <p className="text-red-500 text-xs font-bold bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                                {error}
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-letusOrange hover:bg-orange-500 active:bg-orange-600 disabled:opacity-50 text-white font-bold py-3 rounded-lg text-sm mt-1 transition-colors"
                        >
                            {isLoading ? '로그인 중...' : '로그인'}
                        </button>
                    </form>
                </div>
            </div>

            <div className="pb-10 text-center text-[11px] text-slate-300 font-medium">
                © 2026 LETUS. All rights reserved.
            </div>
        </div>
    );
};
