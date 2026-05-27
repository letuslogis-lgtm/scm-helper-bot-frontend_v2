import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { supabase } from './supabaseClient.js';

const FORMATS_LABEL = 'Code128 / Code39 / EAN-13 / QR / DataMatrix 등';

export const MobileBarcodeTest = () => {
    const navigate = useNavigate();
    const [photo, setPhoto] = useState(null);   // { file, preview }
    const [isScanning, setIsScanning] = useState(false);
    const [results, setResults] = useState(null); // [{ method, raw, format, dbResult, error }]
    const cameraRef = useRef(null);
    const galleryRef = useRef(null);
    const [showPhotoSheet, setShowPhotoSheet] = useState(false);

    const handlePhotoCapture = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (photo) URL.revokeObjectURL(photo.preview);
        setPhoto({ file, preview: URL.createObjectURL(file) });
        setResults(null);
    };

    const lookupProduct = async (code) => {
        if (!code) return null;
        // 정확히 일치
        const { data: exact } = await supabase
            .from('products')
            .select('item_code, item_color, brand, item_name')
            .eq('item_code', code)
            .maybeSingle();
        if (exact) return { found: true, ...exact };

        // '-' 없는 경우: 코드만으로 조회
        const base = code.includes('-') ? code.split('-')[0] : code;
        const { data: base2 } = await supabase
            .from('products')
            .select('item_code, item_color, brand, item_name')
            .eq('item_code', base)
            .maybeSingle();
        if (base2) return { found: true, ...base2, note: '색상 suffix 없이 매칭' };

        return { found: false };
    };

    const handleScan = async () => {
        if (!photo) return;
        setIsScanning(true);
        setResults(null);
        const list = [];

        const hints = new Map([[DecodeHintType.TRY_HARDER, true]]);
        const reader = new BrowserMultiFormatReader(hints);

        // ── 1-A. ZXing: 원본 파일 직접 (압축 없음) ──
        try {
            const origUrl = URL.createObjectURL(photo.file);
            let raw = null, fmt = null;
            try {
                const result = await reader.decodeFromImageUrl(origUrl);
                raw = result.getText();
                fmt = result.getBarcodeFormat?.() ?? '—';
            } catch (e) {
                console.warn('ZXing 원본 실패:', e.message);
            } finally {
                URL.revokeObjectURL(origUrl);
            }
            const dbResult = raw ? await lookupProduct(raw) : null;
            list.push({
                method: 'ZXing — 원본',
                raw, format: typeof fmt === 'number' ? fmtName(fmt) : String(fmt),
                dbResult, error: raw ? null : '바코드를 찾지 못했습니다',
            });
        } catch (err) {
            list.push({ method: 'ZXing — 원본', raw: null, error: err.message });
        }

        // ── 1-B. ZXing: EXIF 보정 + PNG 무손실 ──
        try {
            const bitmap = await createImageBitmap(photo.file, { imageOrientation: 'from-image' });
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0);
            bitmap.close();
            const pngUrl = canvas.toDataURL('image/png'); // 무손실

            let raw = null, fmt = null;
            try {
                const result = await reader.decodeFromImageUrl(pngUrl);
                raw = result.getText();
                fmt = result.getBarcodeFormat?.() ?? '—';
            } catch (e) {
                console.warn('ZXing PNG 실패:', e.message);
            }
            const dbResult = raw ? await lookupProduct(raw) : null;
            list.push({
                method: 'ZXing — EXIF보정+PNG',
                raw, format: typeof fmt === 'number' ? fmtName(fmt) : String(fmt),
                dbResult, error: raw ? null : '바코드를 찾지 못했습니다',
            });
        } catch (err) {
            list.push({ method: 'ZXing — EXIF보정+PNG', raw: null, error: err.message });
        }

        // ── 2. Native BarcodeDetector (지원 여부 체크) ──
        if ('BarcodeDetector' in window) {
            try {
                const detector = new window.BarcodeDetector({
                    formats: ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8',
                              'upc_a', 'upc_e', 'itf', 'pdf417', 'qr_code', 'data_matrix', 'codabar'],
                });
                const bitmap = await createImageBitmap(photo.file);
                const barcodes = await detector.detect(bitmap);
                bitmap.close();

                if (barcodes.length > 0) {
                    for (const bc of barcodes) {
                        const dbResult = await lookupProduct(bc.rawValue);
                        list.push({ method: `Native BarcodeDetector`, raw: bc.rawValue, format: bc.format, dbResult });
                    }
                } else {
                    list.push({ method: 'Native BarcodeDetector', raw: null, error: '바코드를 찾지 못했습니다' });
                }
            } catch (err) {
                list.push({ method: 'Native BarcodeDetector', raw: null, error: err.message });
            }
        } else {
            list.push({ method: 'Native BarcodeDetector', raw: null, error: '이 브라우저는 미지원' });
        }

        setResults(list);
        setIsScanning(false);
    };

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-letusBlue to-blue-700" />
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors">
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-slate-800 font-black text-base leading-none">바코드 인식 테스트</h1>
                        <p className="text-slate-400 text-[11px] font-medium mt-0.5">관리자 전용 · 개발용</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 px-4 py-4 space-y-3">

                {/* 사진 영역 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                    <h3 className="text-slate-700 font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-50 rounded-lg flex items-center justify-center">📸</span>
                        바코드 사진
                    </h3>

                    {photo ? (
                        <div className="relative rounded-xl overflow-hidden border border-slate-200 mb-3">
                            <img src={photo.preview} alt="바코드" className="w-full max-h-56 object-contain bg-slate-50" />
                            <button
                                onClick={() => { URL.revokeObjectURL(photo.preview); setPhoto(null); setResults(null); }}
                                className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-black shadow"
                            >✕</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowPhotoSheet(true)}
                            className="w-full h-36 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-400 active:bg-slate-50 transition-colors mb-3"
                        >
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="text-sm font-bold">사진 촬영 / 선택</span>
                        </button>
                    )}

                    <input ref={cameraRef}  type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                    <input ref={galleryRef} type="file" accept="image/*"                       onChange={handlePhotoCapture} className="hidden" />

                    <p className="text-[11px] text-slate-400 text-center mb-3">{FORMATS_LABEL}</p>

                    <button
                        onClick={handleScan}
                        disabled={!photo || isScanning}
                        className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                            !photo || isScanning
                                ? 'bg-slate-100 text-slate-400'
                                : 'bg-letusBlue text-white active:scale-[0.98] shadow-sm'
                        }`}
                    >
                        {isScanning ? (
                            <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>스캔 중...</>
                        ) : <>🔍 바코드 스캔</>}
                    </button>
                </section>

                {/* 결과 */}
                {results && (
                    <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-4">
                        <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                            <span className="w-6 h-6 bg-green-50 rounded-lg flex items-center justify-center">📊</span>
                            인식 결과
                        </h3>

                        {results.map((r, i) => (
                            <div key={i} className="border border-slate-100 rounded-xl overflow-hidden">
                                {/* 메서드 헤더 */}
                                <div className={`px-3 py-2 flex items-center gap-2 ${r.raw ? 'bg-blue-50' : 'bg-slate-50'}`}>
                                    <span className="text-xs font-black text-slate-600">{r.method}</span>
                                    {r.format && r.format !== '—' && (
                                        <span className="text-[10px] bg-blue-100 text-blue-600 font-bold px-1.5 py-0.5 rounded-full">{r.format}</span>
                                    )}
                                </div>

                                <div className="px-3 py-3 space-y-2">
                                    {/* Raw 값 */}
                                    {r.raw ? (
                                        <div>
                                            <p className="text-[10px] text-slate-400 font-bold mb-0.5">RAW 값</p>
                                            <p className="text-sm font-mono font-bold text-slate-800 bg-slate-50 rounded-lg px-3 py-2 break-all">{r.raw}</p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-red-500 font-bold">⚠️ {r.error || '인식 실패'}</p>
                                    )}

                                    {/* DB 조회 결과 */}
                                    {r.dbResult && (
                                        <div>
                                            <p className="text-[10px] text-slate-400 font-bold mb-0.5">products 테이블 조회</p>
                                            {r.dbResult.found ? (
                                                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                                    <p className="text-xs font-black text-green-700">✅ 매칭 성공</p>
                                                    <p className="text-sm font-bold text-slate-800 mt-1">{r.dbResult.item_code}{r.dbResult.item_color ? `-${r.dbResult.item_color}` : ''}</p>
                                                    {r.dbResult.item_name && <p className="text-xs text-slate-500 mt-0.5">{r.dbResult.item_name}</p>}
                                                    {r.dbResult.brand && <p className="text-xs text-slate-400">{r.dbResult.brand}</p>}
                                                    {r.dbResult.note && <p className="text-[10px] text-green-600 mt-1">※ {r.dbResult.note}</p>}
                                                </div>
                                            ) : (
                                                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                                    <p className="text-xs font-black text-red-500">❌ DB 미매칭</p>
                                                    <p className="text-[11px] text-red-400 mt-0.5">products 테이블에 해당 코드 없음</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </section>
                )}
            </div>

            {/* 사진 액션시트 */}
            {showPhotoSheet && (
                <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowPhotoSheet(false)}>
                    <div className="w-full bg-white rounded-t-2xl p-4 pb-10 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
                        <p className="text-sm font-bold text-gray-700 mb-3 text-center">사진 추가 방법 선택</p>
                        <button onClick={() => { cameraRef.current?.click(); setShowPhotoSheet(false); }}
                            className="w-full py-4 flex items-center gap-4 hover:bg-gray-50 rounded-xl px-4 transition-colors">
                            <span className="text-2xl">📷</span>
                            <div className="text-left">
                                <div className="font-bold text-gray-800 text-sm">카메라로 찍기</div>
                                <div className="text-xs text-gray-400 mt-0.5">바코드를 직접 촬영합니다</div>
                            </div>
                        </button>
                        <button onClick={() => { galleryRef.current?.click(); setShowPhotoSheet(false); }}
                            className="w-full py-4 flex items-center gap-4 hover:bg-gray-50 rounded-xl px-4 transition-colors">
                            <span className="text-2xl">🖼️</span>
                            <div className="text-left">
                                <div className="font-bold text-gray-800 text-sm">갤러리에서 선택</div>
                                <div className="text-xs text-gray-400 mt-0.5">저장된 바코드 사진을 선택합니다</div>
                            </div>
                        </button>
                        <button onClick={() => setShowPhotoSheet(false)}
                            className="w-full py-3 mt-2 text-sm font-bold text-gray-400 hover:bg-gray-50 rounded-xl transition-colors">
                            취소
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ZXing BarcodeFormat enum → 이름 변환
function fmtName(n) {
    const map = { 0: 'AZTEC', 1: 'CODABAR', 2: 'CODE_39', 3: 'CODE_93', 4: 'CODE_128', 5: 'DATA_MATRIX', 6: 'EAN_8', 7: 'EAN_13', 8: 'ITF', 9: 'MAXICODE', 10: 'PDF_417', 11: 'QR_CODE', 12: 'RSS_14', 13: 'RSS_EXPANDED', 14: 'UPC_A', 15: 'UPC_E', 16: 'UPC_EAN_EXTENSION' };
    return map[n] ?? String(n);
}
