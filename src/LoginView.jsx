import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, adminSupabase } from './supabaseClient.js';



// 로그인 화면
const LoginView = () => {
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        if (!loginId || !password) {
            setErrorMsg('아이디와 비밀번호를 입력해주세요.');
            return;
        }

        setLoading(true);
        const targetEmail = loginId.includes('@') ? loginId : `${loginId}@letus.com`;

        const { error } = await supabase.auth.signInWithPassword({
            email: targetEmail,
            password: password,
        });

        if (error) {
            setErrorMsg(`[Dev] 로그인 실패: ${error.message}`);
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 slide-up">
            <div className="max-w-[400px] w-full bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 p-8 sm:p-10 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-400 to-orange-600"></div>

                <div className="text-center mb-10 pt-2">
                    <h1 className="text-3xl font-black text-letusOrange tracking-tighter mb-2">LETUS LOGIS</h1>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">통합 물류 관리 시스템</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">아이디 (ID)</label>
                        <input
                            type="text"
                            value={loginId}
                            onChange={(e) => setLoginId(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-letusOrange focus:ring-1 focus:ring-letusOrange transition-all text-gray-800 bg-slate-50 focus:bg-white"
                            placeholder="admin"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">비밀번호</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-letusOrange focus:ring-1 focus:ring-letusOrange transition-all text-gray-800 bg-slate-50 focus:bg-white"
                            placeholder="••••••••"
                        />
                    </div>

                    {errorMsg && (
                        <div className="text-red-500 text-xs font-bold text-center bg-red-50 py-2.5 rounded-lg border border-red-100 flex items-center justify-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {errorMsg}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-letusOrange hover:bg-orange-500 active:bg-orange-600 text-white font-bold py-3.5 px-4 rounded-lg transition-colors mt-2 flex items-center justify-center shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w0.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : null}
                        {loading ? '로그인 처리 중...' : '로그인'}
                    </button>
                </form>

                <div className="mt-10 pt-6 border-t border-slate-100 text-center text-[11px] text-slate-400 font-medium">
                    <p>© 2026 LETUS. All rights reserved.</p>
                </div>
            </div>
        </div>
    );
};

export { LoginView };