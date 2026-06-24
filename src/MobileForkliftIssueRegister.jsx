import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

const FAULT_TYPES = [
    '배터리 불량',
    '유압 이상',
    '조향 불량',
    '브레이크 불량',
    '포크/마스트 이상',
    '타이어 손상',
    '전기 계통',
    '기타',
];

const generateIssueId = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `ISS-${date}-${time}`;
};

export const MobileForkliftIssueRegister = ({ userProfile }) => {
    const navigate = useNavigate();

    // NFC
    const [nfcStatus, setNfcStatus] = useState('checking');
    const abortRef = useRef(null);

    // 폼
    const [forkliftNo, setForkliftNo] = useState('');
    const [faultType, setFaultType] = useState('');
    const [errorCode, setErrorCode] = useState('');
    const [faultDesc, setFaultDesc] = useState('');

    // 장비 목록
    const [forkliftList, setForkliftList] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);

    // 제출 상태
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [doneId, setDoneId] = useState('');

    // ── NFC
    const doScan = async () => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const reader = new window.NDEFReader();
            await reader.scan({ signal: controller.signal });
            reader.onreading = (e) => {
                const rec = e.message.records[0];
                if (!rec) return;
                const text = new TextDecoder(rec.encoding || 'utf-8').decode(rec.data).trim();
                setForkliftNo(text);
                setNfcStatus('success');
                controller.abort();
            };
            reader.onerror = () => setNfcStatus('error');
        } catch (err) {
            if (err.name !== 'AbortError') setNfcStatus('error');
        }
    };

    useEffect(() => {
        if (!('NDEFReader' in window)) { setNfcStatus('unsupported'); return; }
        setNfcStatus('auto-scanning');
        doScan();
        return () => abortRef.current?.abort();
    }, []);

    useEffect(() => {
        supabase.from('forklifts').select('no').order('no')
            .then(({ data }) => { if (data) setForkliftList(data.map(f => f.no)); });
    }, []);

    const filtered = forkliftNo.trim()
        ? forkliftList.filter(no => no.toLowerCase().includes(forkliftNo.toLowerCase()))
        : forkliftList;

    const renderHighlight = (text, query) => {
        if (!query) return text;
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return text;
        return <>{text.slice(0, idx)}<span className="text-blue-600 font-black">{text.slice(idx, idx + query.length)}</span>{text.slice(idx + query.length)}</>;
    };

    const handleRescan = () => { setForkliftNo(''); setNfcStatus('scanning'); doScan(); };

    const isScanning = nfcStatus === 'auto-scanning' || nfcStatus === 'scanning';
    const nfcVisible = nfcStatus !== 'unsupported' && nfcStatus !== 'checking';

    // ── 제출
    const handleSubmit = async () => {
        if (!forkliftNo.trim()) { setSubmitError('지게차 관리번호를 입력해 주세요.'); return; }
        if (!faultType)         { setSubmitError('고장 유형을 선택해 주세요.'); return; }
        if (!faultDesc.trim())  { setSubmitError('고장 내용을 입력해 주세요.'); return; }

        setSubmitting(true);
        setSubmitError('');
        try {
            // 지게차 ID 조회
            const { data: forklift } = await supabase
                .from('forklifts')
                .select('id')
                .eq('no', forkliftNo.trim())
                .maybeSingle();

            if (!forklift) {
                setSubmitError('등록되지 않은 지게차 번호입니다. 관리자에게 문의하세요.');
                return;
            }

            const issueId = generateIssueId();
            const today = new Date().toISOString().split('T')[0];

            const { error } = await supabase.from('forklift_issues').insert({
                id: issueId,
                forklift_id: forklift.id,
                fault_type: faultType,
                error_code: errorCode.trim() || null,
                fault_desc: faultDesc.trim(),
                reporter: userProfile?.name || '',
                reported_at: today,
                status: 'reported',
            });

            if (error) throw error;
            setDoneId(issueId);
        } catch {
            setSubmitError('등록 중 오류가 발생했습니다. 다시 시도해 주세요.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleReset = () => {
        setForkliftNo('');
        setFaultType('');
        setErrorCode('');
        setFaultDesc('');
        setSubmitError('');
        setDoneId('');
    };

    // ── 완료 화면
    if (doneId) {
        return (
            <div className="min-h-screen bg-slate-100 flex flex-col">
                <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 to-yellow-600" />
                    <div className="px-4 py-3 flex items-center gap-3">
                        <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors">
                            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <h1 className="text-slate-800 font-black text-base">지게차 이슈 등록</h1>
                    </div>
                </header>

                <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-6">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-4xl">✅</div>
                    <div className="text-center">
                        <h2 className="text-xl font-black text-slate-800 mb-2">등록 완료</h2>
                        <p className="text-sm text-slate-500 mb-1">이슈가 정상적으로 등록됐습니다.</p>
                        <p className="text-xs text-slate-400">담당자가 확인 후 처리할 예정입니다.</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 w-full max-w-sm text-center shadow-sm">
                        <p className="text-xs text-slate-400 mb-1">이슈 번호</p>
                        <p className="text-base font-black text-letusBlue tracking-wide">{doneId}</p>
                    </div>
                    <div className="w-full max-w-sm space-y-2">
                        <button
                            onClick={handleReset}
                            className="w-full py-4 rounded-xl font-black text-base bg-letusBlue text-white shadow-md active:scale-[0.98] transition-all"
                        >
                            + 추가 이슈 등록
                        </button>
                        <button
                            onClick={() => navigate(-1)}
                            className="w-full py-3.5 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 active:bg-slate-50 transition-colors"
                        >
                            메뉴로 돌아가기
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── 등록 폼
    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 to-yellow-600" />
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors">
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-slate-800 font-black text-base leading-none">지게차 이슈 등록</h1>
                        <p className="text-slate-400 text-[11px] mt-0.5">고장·이상 발생 시 즉시 등록해 주세요</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">

                {/* ① 관리번호 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 rounded-t-2xl">
                        <p className="text-xs font-black text-slate-500">① 지게차 관리번호 <span className="text-red-400">*</span></p>
                    </div>
                    <div className="p-4 space-y-3">
                        {/* NFC 영역 */}
                        {nfcVisible && (
                            <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                                <div className={`relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                    nfcStatus === 'success' ? 'bg-green-100' :
                                    nfcStatus === 'error'   ? 'bg-red-100' : 'bg-blue-100'
                                }`}>
                                    {isScanning && (
                                        <span className="absolute inset-0 rounded-full border-2 border-blue-300 animate-ping opacity-50" />
                                    )}
                                    <span className="text-lg select-none">
                                        {nfcStatus === 'success' ? '✅' : nfcStatus === 'error' ? '❌' : '📶'}
                                    </span>
                                </div>
                                <div className="flex-1">
                                    {nfcStatus === 'auto-scanning' && <p className="text-xs font-bold text-slate-600">NFC 자동 인식 대기 중</p>}
                                    {nfcStatus === 'scanning'      && <p className="text-xs font-bold text-slate-600">스캔 중...</p>}
                                    {nfcStatus === 'success'       && <p className="text-xs font-bold text-green-600">인식 완료!</p>}
                                    {nfcStatus === 'error'         && <p className="text-xs font-bold text-red-500">인식 실패</p>}
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                        {isScanning ? '지게차 NFC 스티커에 기기를 가져다 대세요' : '아래에 직접 입력하거나 다시 스캔하세요'}
                                    </p>
                                </div>
                                {(nfcStatus === 'success' || nfcStatus === 'error') && (
                                    <button onClick={handleRescan} className="text-xs font-bold text-slate-500 bg-slate-200 rounded-lg px-3 py-1.5 active:bg-slate-300 shrink-0">
                                        재스캔
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="relative">
                            <input
                                type="text"
                                value={forkliftNo}
                                onChange={e => { setForkliftNo(e.target.value); setShowDropdown(true); }}
                                onFocus={() => setShowDropdown(true)}
                                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                                placeholder="예: 양지-001"
                                className={`w-full rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none transition-all border ${
                                    nfcStatus === 'success'
                                        ? 'bg-green-50 border-green-300 focus:border-green-400'
                                        : 'bg-slate-50 border-slate-200 focus:border-letusBlue focus:ring-1 focus:ring-letusBlue'
                                }`}
                            />
                            {showDropdown && filtered.length > 0 && (
                                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-blue-300 rounded-2xl shadow-lg overflow-y-auto max-h-[240px]">
                                    {filtered.map(no => (
                                        <button
                                            key={no}
                                            onClick={() => { setForkliftNo(no); setShowDropdown(false); }}
                                            className="w-full flex items-center px-4 py-3.5 text-left border-b border-slate-100 last:border-0 active:bg-blue-50 transition-colors"
                                        >
                                            <span className="text-sm font-bold text-slate-800">{renderHighlight(no, forkliftNo)}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ② 고장 유형 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-xs font-black text-slate-500">② 고장 유형 <span className="text-red-400">*</span></p>
                    </div>
                    <div className="p-4">
                        <div className="grid grid-cols-2 gap-2">
                            {FAULT_TYPES.map(type => (
                                <button
                                    key={type}
                                    onClick={() => setFaultType(type)}
                                    className={`py-2.5 px-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] ${
                                        faultType === type
                                            ? 'bg-letusBlue text-white shadow-sm'
                                            : 'bg-slate-50 border border-slate-200 text-slate-600'
                                    }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ③ 에러 코드 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-xs font-black text-slate-500">③ 에러 코드 <span className="text-slate-300 font-normal">(선택)</span></p>
                    </div>
                    <div className="p-4">
                        <input
                            type="text"
                            value={errorCode}
                            onChange={e => setErrorCode(e.target.value)}
                            placeholder="계기판 에러 코드 (예: E-01)"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue transition-all"
                        />
                    </div>
                </div>

                {/* ④ 고장 내용 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-xs font-black text-slate-500">④ 고장 내용 <span className="text-red-400">*</span></p>
                    </div>
                    <div className="p-4">
                        <textarea
                            value={faultDesc}
                            onChange={e => setFaultDesc(e.target.value)}
                            placeholder="고장 증상을 구체적으로 입력해 주세요&#10;(예: 주행 중 갑자기 브레이크가 밀리는 현상 발생)"
                            rows={4}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue transition-all resize-none placeholder-slate-300"
                        />
                        <p className="text-[11px] text-slate-300 text-right mt-1">{faultDesc.length}자</p>
                    </div>
                </div>

                {/* 오류 메시지 */}
                {submitError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <p className="text-sm text-red-600 font-bold">{submitError}</p>
                    </div>
                )}

                {/* 제출 버튼 */}
                <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className={`w-full py-4 rounded-xl font-black text-base transition-all shadow-md mb-6 ${
                        submitting
                            ? 'bg-slate-200 text-slate-400'
                            : 'bg-letusBlue text-white active:scale-[0.98] shadow-blue-200'
                    }`}
                >
                    {submitting ? '등록 중...' : '🔧 이슈 등록하기'}
                </button>
            </div>
        </div>
    );
};
