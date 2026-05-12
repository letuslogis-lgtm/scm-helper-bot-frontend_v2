import React, { useState, useRef } from 'react';
import { supabase, invokeFunction } from './supabaseClient.js';

const BRANDS = ['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소'];
const ISSUE_TYPES = [
    { label: '파손 및 불량', icon: '💥' },
    { label: '바코드 불량', icon: '📛' },
    { label: '수량부족', icon: '📉' },
    { label: '계획 미생성', icon: '📋' },
    { label: '계획 부족(실물 과다)', icon: '📦' },
    { label: '계획 과다(실물 부족)', icon: '🔻' },
    { label: '기타 특이사항', icon: '📌' },
];

const generateReceptionNo = () => {
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const rand = Math.floor(Math.random() * 900 + 100);
    return `M${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${rand}`;
};

export const MobileIssueRegister = () => {
    // 폼 상태
    const [brand, setBrand] = useState('');
    const [issueType, setIssueType] = useState('');
    const [productCode, setProductCode] = useState('');
    const [vendor, setVendor] = useState('');
    const [detail, setDetail] = useState('');

    // 사진 상태
    const [photos, setPhotos] = useState([]); // { file, preview }[]
    const fileRef = useRef(null);

    // AI 바코드 분석
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState(null);

    // 제출
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // 사진 촬영/선택 핸들러
    const handlePhotoCapture = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newPhotos = files.map(file => ({
            file,
            preview: URL.createObjectURL(file)
        }));
        setPhotos(prev => [...prev, ...newPhotos].slice(0, 5)); // 최대 5장
    };

    const removePhoto = (idx) => {
        setPhotos(prev => {
            const updated = [...prev];
            URL.revokeObjectURL(updated[idx].preview);
            updated.splice(idx, 1);
            return updated;
        });
        setAiResult(null);
    };

    // 📐 이미지 압축 (폰 원본 5~10MB → ~100KB로 축소하여 전송 속도 대폭 향상)
    const compressImage = (file, maxWidth = 1024, quality = 0.6) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Base64에서 data:image/jpeg;base64, 접두사 제거
                const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
                resolve(base64);
            };
            img.src = URL.createObjectURL(file);
        });
    };

    // AI 바코드 인식 (Render 파이썬 서버 — 기존 카카오봇과 동일한 Gemini 분석)
    const handleAiBarcode = async () => {
        if (photos.length === 0) return alert('사진을 먼저 촬영해주세요.');
        setIsAnalyzing(true);
        setAiResult(null);

        try {
            // 이미지 압축 후 Base64 변환 (원본 대비 ~95% 용량 감소)
            const base64 = await compressImage(photos[0].file);

            const response = await fetch('https://scm-helper-bot.onrender.com/api/barcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64 })
            });

            const data = await response.json();

            if (data?.product_code) {
                setProductCode(data.product_code);
                // AI가 브랜드/공급사도 찾아주면 자동 입력
                if (data.brand) setBrand(data.brand);
                if (data.vendor) setVendor(data.vendor);
                setAiResult({ success: true, code: data.product_code, description: data.description || '' });
            } else {
                setAiResult({ success: false, message: data?.message || '바코드를 인식하지 못했습니다.' });
            }
        } catch (err) {
            console.error('AI 바코드 분석 실패:', err);
            setAiResult({ success: false, message: '분석 중 오류가 발생했습니다.' });
        } finally {
            setIsAnalyzing(false);
        }
    };

    // 등록 — 사진 압축본 + 폼 데이터를 Edge Function(submit-mobile-issue)에 한 번에 전송.
    // 서버 측에서 검증 → Storage 업로드 → logistics_issues INSERT 까지 처리됨.
    const handleSubmit = async () => {
        if (!brand) return alert('브랜드를 선택해주세요.');
        if (!issueType) return alert('이슈 유형을 선택해주세요.');
        if (!detail.trim()) return alert('상세 내용을 입력해주세요.');

        setIsSubmitting(true);
        try {
            // 사진들을 1024px JPEG 압축본 + base64 로 변환해서 함께 전송
            const photoPayload = await Promise.all(
                photos.map(async (p) => ({
                    base64: await compressImage(p.file),
                    mimeType: 'image/jpeg',
                }))
            );

            await invokeFunction('submit-mobile-issue', {
                brand,
                issue_type: issueType,
                product_code: productCode || null,
                vendor: vendor || null,
                detail,
                photos: photoPayload,
            });

            setSubmitted(true);
        } catch (err) {
            alert('등록 실패: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // 등록 완료 화면
    if (submitted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
                    <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-2xl font-black text-white mb-2">등록 완료!</h2>
                <p className="text-blue-200 text-sm mb-8">특이사항이 성공적으로 접수되었습니다.<br/>담당자가 확인 후 조치합니다.</p>
                <button
                    onClick={() => {
                        setBrand(''); setIssueType(''); setProductCode(''); setVendor(''); setDetail('');
                        setPhotos([]); setAiResult(null); setSubmitted(false);
                    }}
                    className="bg-white text-slate-900 font-bold text-base px-8 py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
                >
                    + 새로운 특이사항 등록
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </div>
                    <div>
                        <h1 className="text-white font-black text-base tracking-tight">입고 특이사항</h1>
                        <p className="text-blue-300/70 text-[10px] font-bold">LETUS LOGIS · Mobile</p>
                    </div>
                </div>
            </header>

            {/* 메인 폼 */}
            <div className="flex-1 overflow-y-auto px-5 pt-5 pb-28 space-y-5">

                {/* 1. 사진 촬영 */}
                <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
                    <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-500/30 rounded-lg flex items-center justify-center text-xs">📸</span>
                        현장 사진
                    </h3>

                    {/* 촬영 버튼 */}
                    <div className="grid grid-cols-3 gap-3">
                        {photos.map((p, idx) => (
                            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border-2 border-white/20">
                                <img src={p.preview} alt={`사진${idx + 1}`} className="w-full h-full object-cover" />
                                <button
                                    onClick={() => removePhoto(idx)}
                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-lg"
                                >✕</button>
                            </div>
                        ))}
                        {photos.length < 5 && (
                            <button
                                onClick={() => fileRef.current?.click()}
                                className="aspect-square rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-1 text-white/50 active:bg-white/10 transition-colors"
                            >
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                <span className="text-[10px] font-bold">촬영/선택</span>
                            </button>
                        )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture} className="hidden" />

                    {/* AI 바코드 인식 버튼 */}
                    {photos.length > 0 && (
                        <button
                            onClick={handleAiBarcode}
                            disabled={isAnalyzing}
                            className={`w-full mt-4 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${isAnalyzing ? 'bg-purple-800/50 text-purple-300' : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white active:scale-[0.98]'}`}
                        >
                            {isAnalyzing ? (
                                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> AI 분석 중...</>
                            ) : (
                                <>🤖 AI 바코드 인식</>
                            )}
                        </button>
                    )}

                    {/* AI 분석 결과 */}
                    {aiResult && (
                        <div className={`mt-3 p-3 rounded-xl text-sm font-bold ${aiResult.success ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                            {aiResult.success ? (
                                <>✅ 인식 완료: <span className="text-white">{aiResult.code}</span>{aiResult.description && <p className="text-[11px] text-green-200/70 mt-1 font-medium">{aiResult.description}</p>}</>
                            ) : (
                                <>⚠️ {aiResult.message}</>
                            )}
                        </div>
                    )}
                </section>

                {/* 2. 브랜드 선택 */}
                <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
                    <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-orange-500/30 rounded-lg flex items-center justify-center text-xs">🏷️</span>
                        브랜드 <span className="text-red-400">*</span>
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                        {BRANDS.map(b => (
                            <button
                                key={b}
                                onClick={() => setBrand(b)}
                                className={`py-3 rounded-xl text-sm font-bold transition-all ${brand === b ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-[1.02]' : 'bg-white/10 text-white/70 active:bg-white/20'}`}
                            >{b}</button>
                        ))}
                    </div>
                </section>

                {/* 3. 이슈 유형 */}
                <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
                    <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-red-500/30 rounded-lg flex items-center justify-center text-xs">⚡</span>
                        이슈 유형 <span className="text-red-400">*</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                        {ISSUE_TYPES.map(t => (
                            <button
                                key={t.label}
                                onClick={() => setIssueType(t.label)}
                                className={`py-3 px-3 rounded-xl text-[13px] font-bold flex items-center gap-2 transition-all ${issueType === t.label ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-[1.02]' : 'bg-white/10 text-white/70 active:bg-white/20'}`}
                            >
                                <span>{t.icon}</span> {t.label}
                            </button>
                        ))}
                    </div>
                </section>

                {/* 4. 상세 입력 */}
                <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-4">
                    <h3 className="text-white font-bold text-sm flex items-center gap-2">
                        <span className="w-6 h-6 bg-cyan-500/30 rounded-lg flex items-center justify-center text-xs">📝</span>
                        상세 정보
                    </h3>

                    <div>
                        <label className="text-white/60 text-xs font-bold mb-1.5 block">품목코드</label>
                        <input
                            type="text"
                            value={productCode}
                            onChange={e => setProductCode(e.target.value)}
                            placeholder="AI 인식 또는 직접 입력"
                            className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:bg-white/15 transition-all"
                        />
                    </div>

                    <div>
                        <label className="text-white/60 text-xs font-bold mb-1.5 block">공급업체</label>
                        <input
                            type="text"
                            value={vendor}
                            onChange={e => setVendor(e.target.value)}
                            placeholder="공급업체명"
                            className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:bg-white/15 transition-all"
                        />
                    </div>

                    <div>
                        <label className="text-white/60 text-xs font-bold mb-1.5 block">상세 내용 <span className="text-red-400">*</span></label>
                        <textarea
                            value={detail}
                            onChange={e => setDetail(e.target.value)}
                            placeholder="특이사항 상세 내용을 입력해주세요"
                            rows={4}
                            className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:bg-white/15 transition-all resize-none"
                        />
                    </div>
                </section>
            </div>

            {/* 하단 고정 등록 버튼 */}
            <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent pt-10">
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className={`w-full py-4.5 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-2xl transition-all ${isSubmitting ? 'bg-blue-800/50 text-blue-300' : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white active:scale-[0.98] shadow-blue-500/40'}`}
                    style={{ paddingTop: '18px', paddingBottom: '18px' }}
                >
                    {isSubmitting ? (
                        <><svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> 등록 중...</>
                    ) : (
                        <>📋 특이사항 등록하기</>
                    )}
                </button>
            </div>
        </div>
    );
};
