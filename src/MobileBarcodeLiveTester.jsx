import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Quagga from '@ericblade/quagga2';

export const MobileBarcodeLiveTester = () => {
    const navigate = useNavigate();
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const viewportRef = useRef(null);
    const startTimeRef = useRef(null);
    const quaggaRunning = useRef(false);
    const detectionCountRef = useRef({});
    const CONFIRM_COUNT = 3;

    const stopQuagga = () => {
        if (quaggaRunning.current) {
            Quagga.offDetected();
            Quagga.stop();
            quaggaRunning.current = false;
            if (viewportRef.current) viewportRef.current.innerHTML = '';
        }
    };

    const startScan = () => {
        if (!viewportRef.current) return;
        setResult(null);
        setError('');
        setScanning(true);
        startTimeRef.current = Date.now();

        Quagga.init({
            inputStream: {
                type: 'LiveStream',
                target: viewportRef.current,
                constraints: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
            },
            locate: true,
            decoder: {
                readers: [
                    'code_128_reader',
                    'ean_reader',
                    'ean_8_reader',
                    'code_39_reader',
                    'upc_reader',
                    'upc_e_reader',
                ],
            },
        }, (err) => {
            if (err) {
                setError('카메라 초기화 실패: ' + (err.message || String(err)));
                setScanning(false);
                return;
            }
            Quagga.start();
            quaggaRunning.current = true;
            detectionCountRef.current = {};

            Quagga.onDetected((data) => {
                const code = data.codeResult.code;
                const format = data.codeResult.format;
                const counts = detectionCountRef.current;
                counts[code] = (counts[code] || 0) + 1;

                if (counts[code] >= CONFIRM_COUNT) {
                    const elapsed = Date.now() - startTimeRef.current;
                    stopQuagga();
                    setScanning(false);
                    setResult({ code, format, elapsed });
                }
            });
        });
    };

    useEffect(() => {
        return () => stopQuagga();
    }, []);

    const handleBack = () => {
        stopQuagga();
        navigate(-1);
    };

    const handleRescan = () => {
        setResult(null);
        setError('');
        startScan();
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col">
            <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-letusBlue to-blue-700" />
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 rounded-lg bg-slate-700 active:bg-slate-600 transition-colors">
                        <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-white font-black text-base leading-none">실시간 바코드 스캔</h1>
                        <p className="text-slate-400 text-[11px] font-medium mt-0.5">관리자 전용 · Quagga2 LiveStream 테스트</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 flex flex-col">
                {/* 카메라 뷰파인더 */}
                <div className="relative bg-black" style={{ minHeight: '60vh' }}>
                    <div ref={viewportRef} className="w-full" style={{ minHeight: '60vh' }} />

                    {/* 스캔 가이드 오버레이 */}
                    {scanning && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="relative w-64 h-32">
                                <div className="absolute inset-0 border-2 border-white/20 rounded-lg" />
                                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-letusBlue rounded-tl" />
                                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-letusBlue rounded-tr" />
                                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-letusBlue rounded-bl" />
                                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-letusBlue rounded-br" />
                                <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-letusBlue/60 animate-pulse" />
                            </div>
                        </div>
                    )}

                    {/* 초기 안내 */}
                    {!scanning && !result && !error && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-5xl mb-3">📷</div>
                                <p className="text-slate-400 text-sm font-bold">아래 버튼을 눌러 스캔 시작</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* 결과 / 컨트롤 영역 */}
                <div className="flex-1 bg-slate-800 px-4 py-5 space-y-4">

                    {error && (
                        <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300 font-bold">
                            ❌ {error}
                        </div>
                    )}

                    {result && (
                        <div className="bg-slate-700 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">인식 결과</p>
                                <span className="text-[11px] text-slate-500 font-mono">{result.elapsed}ms</span>
                            </div>
                            <p className="text-2xl font-black text-green-400 font-mono break-all mb-2">{result.code}</p>
                            <p className="text-xs text-slate-400">
                                형식: <span className="text-slate-200 font-bold">{result.format}</span>
                            </p>
                        </div>
                    )}

                    {scanning ? (
                        <button
                            onClick={() => { stopQuagga(); setScanning(false); }}
                            className="w-full py-4 rounded-xl font-black text-base bg-red-500 text-white active:scale-[0.98] transition-all shadow-md"
                        >
                            ⏹ 스캔 중단
                        </button>
                    ) : (
                        <button
                            onClick={result || error ? handleRescan : startScan}
                            className="w-full py-4 rounded-xl font-black text-base bg-letusBlue text-white active:scale-[0.98] transition-all shadow-md shadow-blue-900/40"
                        >
                            {result ? '🔄 다시 스캔' : '▶ 스캔 시작'}
                        </button>
                    )}

                    <p className="text-center text-[11px] text-slate-500">
                        바코드를 가이드 안에 맞춰 가까이 대세요
                    </p>
                </div>
            </div>
        </div>
    );
};
