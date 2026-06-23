import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';
import Quagga from '@ericblade/quagga2';

const decodeWithQuagga = (src) => new Promise((resolve) => {
    const t0 = Date.now();
    Quagga.decodeSingle({
        src,
        numOfWorkers: 0,
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
    }, (result) => {
        const elapsed = Date.now() - t0;
        if (result?.codeResult?.code) {
            resolve({ code: result.codeResult.code, format: result.codeResult.format, elapsed });
        } else {
            resolve({ code: null, elapsed });
        }
    });
});

const compressImage = async (file, maxWidth = 1024, quality = 0.6) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const W = bitmap.width, H = bitmap.height;
    const ratio = Math.min(maxWidth / W, maxWidth / H, 1);
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
};

export const MobileBarcodeTester = () => {
    const navigate = useNavigate();
    const [photo, setPhoto] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState(null);
    const cameraRef = useRef(null);
    const galleryRef = useRef(null);
    const [showPhotoSheet, setShowPhotoSheet] = useState(false);

    const handlePhotoCapture = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (photo) URL.revokeObjectURL(photo.preview);
        setPhoto({ file, preview: URL.createObjectURL(file) });
        setResult(null);
    };

    const handleAnalyze = async () => {
        if (!photo) return;
        setIsAnalyzing(true);
        setResult(null);
        await new Promise(resolve => setTimeout(resolve, 50));
        try {
            const base64 = await compressImage(photo.file);

            const [quaggaSettled, aiSettled] = await Promise.allSettled([
                decodeWithQuagga(photo.preview),
                (async () => {
                    const t0 = Date.now();
                    const { data, error } = await supabase.functions.invoke('analyze-barcode', {
                        body: { image: base64, mimeType: 'image/jpeg' },
                    });
                    const elapsed = Date.now() - t0;
                    if (error) throw error;
                    return { data, elapsed };
                })(),
            ]);

            setResult({
                quagga: quaggaSettled.status === 'fulfilled' ? quaggaSettled.value : null,
                quaggaError: quaggaSettled.status === 'rejected' ? quaggaSettled.reason?.message : null,
                ai: aiSettled.status === 'fulfilled' ? aiSettled.value : null,
                aiError: aiSettled.status === 'rejected' ? aiSettled.reason?.message : null,
            });
        } catch (err) {
            setResult({ fatalError: err.message });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const Field = ({ label, value, mono = false, highlight }) => (
        <div className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
            <span className="text-[11px] text-slate-400 font-bold w-28 shrink-0 pt-0.5">{label}</span>
            <span className={`text-sm flex-1 break-all ${mono ? 'font-mono' : 'font-medium'} ${highlight === true ? 'text-green-600 font-bold' : highlight === false ? 'text-red-500 font-bold' : 'text-slate-800'}`}>
                {value ?? <span className="text-slate-300">—</span>}
            </span>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-letusBlue to-blue-700" />
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors">
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-slate-800 font-black text-base leading-none">바코드 분석 테스터</h1>
                        <p className="text-slate-400 text-[11px] font-medium mt-0.5">관리자 전용 · Quagga2 vs AI 비교</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 px-4 py-4 space-y-3">
                {/* 사진 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                    <h3 className="text-slate-700 font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-50 rounded-lg flex items-center justify-center">📸</span>
                        바코드 사진
                    </h3>
                    {photo ? (
                        <div className="relative rounded-xl overflow-hidden border border-slate-200 mb-3">
                            <img src={photo.preview} alt="바코드" className="w-full max-h-56 object-contain bg-slate-50" />
                            <button
                                onClick={() => { URL.revokeObjectURL(photo.preview); setPhoto(null); setResult(null); }}
                                className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-black shadow"
                            >✕</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowPhotoSheet(true)}
                            className="w-full h-36 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-400 active:bg-slate-50 mb-3"
                        >
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-sm font-bold">사진 촬영 / 선택</span>
                        </button>
                    )}
                    <input ref={cameraRef}  type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                    <input ref={galleryRef} type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" />

                    <button
                        onClick={handleAnalyze}
                        disabled={!photo || isAnalyzing}
                        className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${!photo || isAnalyzing ? 'bg-slate-100 text-slate-400' : 'bg-letusBlue text-white active:scale-[0.98] shadow-sm'}`}
                    >
                        {isAnalyzing ? (
                            <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>분석 중...</>
                        ) : <>🔍 Quagga2 + AI 동시 분석</>}
                    </button>
                </section>

                {/* 결과 비교 */}
                {result && !result.fatalError && (
                    <>
                        {/* Quagga2 결과 */}
                        <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                            <h3 className="text-slate-700 font-bold text-sm mb-3 flex items-center gap-2">
                                <span className="w-6 h-6 bg-purple-50 rounded-lg flex items-center justify-center">📷</span>
                                Quagga2 (바코드 디코딩)
                                {result.quagga?.elapsed != null && (
                                    <span className="ml-auto text-[11px] text-slate-400 font-medium">{result.quagga.elapsed}ms</span>
                                )}
                            </h3>
                            {result.quaggaError ? (
                                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600 font-bold">❌ 오류: {result.quaggaError}</div>
                            ) : result.quagga?.code ? (
                                <div className="divide-y divide-slate-100">
                                    <Field label="인식 코드" value={result.quagga.code} mono highlight={true} />
                                    <Field label="바코드 형식" value={result.quagga.format} />
                                    <Field label="응답시간" value={`${result.quagga.elapsed}ms`} />
                                </div>
                            ) : (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-700 font-bold">⚠️ 바코드를 인식하지 못했습니다</div>
                            )}
                        </section>

                        {/* AI 결과 */}
                        <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                            <h3 className="text-slate-700 font-bold text-sm mb-3 flex items-center gap-2">
                                <span className="w-6 h-6 bg-green-50 rounded-lg flex items-center justify-center">🤖</span>
                                AI (analyze-barcode)
                                {result.ai?.elapsed != null && (
                                    <span className="ml-auto text-[11px] text-slate-400 font-medium">{result.ai.elapsed}ms</span>
                                )}
                            </h3>
                            {result.aiError ? (
                                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600 font-bold">❌ 오류: {result.aiError}</div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    <Field label="product_code" value={result.ai?.data?.product_code} mono />
                                    <Field label="is_valid" value={result.ai?.data?.is_valid != null ? String(result.ai.data.is_valid) : null} highlight={result.ai?.data?.is_valid === true ? true : result.ai?.data?.is_valid === false ? false : undefined} />
                                    <Field label="has_similar" value={result.ai?.data?.has_similar != null ? String(result.ai.data.has_similar) : null} highlight={result.ai?.data?.has_similar === true ? true : undefined} />
                                    <Field label="similar_codes" value={result.ai?.data?.similar_codes?.length > 0 ? result.ai.data.similar_codes.join(', ') : null} mono />
                                    <Field label="brand" value={result.ai?.data?.brand} />
                                    <Field label="vendor" value={result.ai?.data?.vendor} />
                                    <Field label="barcode_type" value={result.ai?.data?.barcode_type} />
                                    <Field label="description" value={result.ai?.data?.description} />
                                    <Field label="message" value={result.ai?.data?.message} />
                                    <Field label="응답시간" value={result.ai?.elapsed ? `${result.ai.elapsed}ms` : null} />
                                </div>
                            )}
                            {result.ai?.data && (
                                <details className="mt-3">
                                    <summary className="text-[11px] text-slate-400 font-bold cursor-pointer select-none">RAW JSON 보기</summary>
                                    <pre className="mt-2 text-[10px] text-slate-600 bg-slate-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                                        {JSON.stringify(result.ai.data, null, 2)}
                                    </pre>
                                </details>
                            )}
                        </section>
                    </>
                )}

                {result?.fatalError && (
                    <section className="bg-white rounded-xl shadow-sm border border-red-100 p-4">
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600 font-bold">❌ 오류: {result.fatalError}</div>
                    </section>
                )}
            </div>

            {/* 액션시트 */}
            {showPhotoSheet && (
                <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowPhotoSheet(false)}>
                    <div className="w-full bg-white rounded-t-2xl p-4 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
                        <p className="text-sm font-bold text-gray-700 mb-3 text-center">사진 추가 방법</p>
                        <button onClick={() => { cameraRef.current?.click(); setShowPhotoSheet(false); }} className="w-full py-4 flex items-center gap-4 hover:bg-gray-50 rounded-xl px-4">
                            <span className="text-2xl">📷</span>
                            <div className="text-left"><div className="font-bold text-gray-800 text-sm">카메라로 찍기</div></div>
                        </button>
                        <button onClick={() => { galleryRef.current?.click(); setShowPhotoSheet(false); }} className="w-full py-4 flex items-center gap-4 hover:bg-gray-50 rounded-xl px-4">
                            <span className="text-2xl">🖼️</span>
                            <div className="text-left"><div className="font-bold text-gray-800 text-sm">갤러리에서 선택</div></div>
                        </button>
                        <button onClick={() => setShowPhotoSheet(false)} className="w-full py-3 mt-2 text-sm font-bold text-gray-400 hover:bg-gray-50 rounded-xl">취소</button>
                    </div>
                </div>
            )}
        </div>
    );
};
