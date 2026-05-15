import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

export const MobileReturnsRegister = ({ userProfile }) => {
    const navigate = useNavigate();
    const fileRef = useRef(null);

    useEffect(() => {
        if (userProfile?.workplace) setIncidentCenter(userProfile.workplace);
    }, [userProfile?.workplace]);

    const [photos, setPhotos]           = useState([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiResult, setAiResult]       = useState(null);

    const [itemCode, setItemCode]         = useState('');
    const [brand, setBrand]               = useState('');
    const [color, setColor]               = useState('');
    const [quantity, setQuantity]               = useState('');
    const [incidentDate, setIncidentDate]       = useState(new Date().toISOString().split('T')[0]);
    const [incidentCenter, setIncidentCenter]   = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted]       = useState(false);

    /* ── 이미지 압축 ── */
    const compressImage = (file, maxWidth = 1024, quality = 0.6) =>
        new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
                canvas.width  = img.width  * ratio;
                canvas.height = img.height * ratio;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
            };
            img.src = URL.createObjectURL(file);
        });

    /* ── 사진 추가/삭제 ── */
    const handlePhotoCapture = (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const newPhotos = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
        setPhotos(prev => [...prev, ...newPhotos].slice(0, 5));
    };

    const removePhoto = (idx) => {
        setPhotos(prev => {
            const next = [...prev];
            URL.revokeObjectURL(next[idx].preview);
            next.splice(idx, 1);
            return next;
        });
        setAiResult(null);
    };

    /* ── DB 품목 조회 (코드로 색상 추가 보완) ── */
    const lookupFromDB = async (code) => {
        const { data } = await supabase
            .from('products')
            .select('brand_category, item_color')
            .eq('item_code', code)
            .single();
        if (data) {
            if (data.brand_category) setBrand(data.brand_category);
            if (data.item_color)     setColor(data.item_color);
        }
    };

    /* ── AI 바코드 인식 ── */
    const handleAiBarcode = async () => {
        if (!photos.length) return alert('사진을 먼저 촬영해주세요.');
        setIsAnalyzing(true);
        setAiResult(null);
        try {
            const base64 = await compressImage(photos[0].file);
            const { data, error } = await supabase.functions.invoke('analyze-barcode', {
                body: { image: base64, mimeType: 'image/jpeg' },
            });
            if (error) throw error;
            if (data?.product_code) {
                const fullCode = data.product_code;
                const hyphenIdx = fullCode.indexOf('-');
                const codePart  = hyphenIdx !== -1 ? fullCode.substring(0, hyphenIdx) : fullCode;
                const colorPart = hyphenIdx !== -1 ? fullCode.substring(hyphenIdx + 1) : '';
                setItemCode(codePart);
                if (colorPart) setColor(colorPart);
                if (data.brand) setBrand(data.brand);
                setAiResult({ success: true, code: fullCode });
                await lookupFromDB(codePart);
            } else {
                setAiResult({ success: false, message: data?.message || '바코드를 인식하지 못했습니다.' });
            }
        } catch {
            setAiResult({ success: false, message: '분석 중 오류가 발생했습니다.' });
        } finally {
            setIsAnalyzing(false);
        }
    };

    /* ── 등록 ── */
    const handleSubmit = async () => {
        if (!itemCode.trim()) return alert('품목코드를 입력해주세요.');
        if (!quantity)        return alert('수량을 입력해주세요.');
        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('logistics_returns').insert([{
                type:            '회수품',
                incident_date:   incidentDate,
                incident_center: incidentCenter,
                writer:          userProfile?.name || '',
                brand:           brand    || null,
                item_code:       itemCode.trim(),
                color:           color    || null,
                quantity:        parseInt(quantity, 10),
            }]);
            if (error) throw error;
            setSubmitted(true);
        } catch (e) {
            alert('등록 실패: ' + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const reset = () => {
        setPhotos([]); setAiResult(null);
        setItemCode(''); setBrand(''); setColor(''); setQuantity('');
        setIncidentDate(new Date().toISOString().split('T')[0]);
        setIncidentCenter(userProfile?.workplace || '');
        setSubmitted(false);
    };

    /* ── 등록 완료 화면 ── */
    if (submitted) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">등록 완료!</h2>
                <p className="text-slate-500 text-sm mb-8">
                    회수 건이 성공적으로 접수되었습니다.<br />담당자가 확인 후 처리합니다.
                </p>
                <button onClick={reset}
                    className="bg-letusOrange hover:bg-orange-500 active:bg-orange-600 text-white font-bold text-base px-8 py-4 rounded-xl shadow-md active:scale-95 transition-all">
                    + 새로운 회수 건 등록
                </button>
                <button onClick={() => navigate('/mobile')}
                    className="mt-3 text-slate-400 text-sm font-medium py-2 px-4">
                    메뉴로 돌아가기
                </button>
            </div>
        );
    }

    const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue transition-all';

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-green-600" />
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => navigate(-1)}
                        className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors">
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-slate-800 font-black text-base leading-none">회수품 등록</h1>
                        <p className="text-slate-400 text-[11px] font-medium mt-0.5">LETUS LOGIS · Mobile</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-3">

                {/* 1. 바코드 촬영 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                    <h3 className="text-slate-700 font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-50 rounded-lg flex items-center justify-center text-sm">📸</span>
                        바코드 촬영
                    </h3>

                    <div className="grid grid-cols-3 gap-2.5">
                        {photos.map((p, idx) => (
                            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200">
                                <img src={p.preview} alt={`사진${idx + 1}`} className="w-full h-full object-cover" />
                                <button onClick={() => removePhoto(idx)}
                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow">
                                    ✕
                                </button>
                            </div>
                        ))}
                        {photos.length < 5 && (
                            <button onClick={() => fileRef.current?.click()}
                                className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-400 active:bg-slate-50 transition-colors">
                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="text-[10px] font-bold">촬영/선택</span>
                            </button>
                        )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple
                        onChange={handlePhotoCapture} className="hidden" />

                    {photos.length > 0 && (
                        <button onClick={handleAiBarcode} disabled={isAnalyzing}
                            className={`w-full mt-3 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm
                                ${isAnalyzing ? 'bg-slate-100 text-slate-400' : 'bg-letusBlue hover:bg-blue-800 active:scale-[0.98] text-white'}`}>
                            {isAnalyzing ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    AI 분석 중...
                                </>
                            ) : <>🤖 AI 바코드 인식</>}
                        </button>
                    )}

                    {aiResult && (
                        <div className={`mt-3 p-3 rounded-xl text-sm font-bold border
                            ${aiResult.success ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                            {aiResult.success
                                ? <>✅ 인식 완료: <span className="text-slate-800">{aiResult.code}</span></>
                                : <>⚠️ {aiResult.message}</>
                            }
                        </div>
                    )}
                </section>

                {/* 2. 품목 정보 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-3.5">
                    <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                        <span className="w-6 h-6 bg-violet-50 rounded-lg flex items-center justify-center text-sm">📦</span>
                        품목 정보
                    </h3>

                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">
                            품목코드 <span className="text-red-400">*</span>
                        </label>
                        <input type="text" value={itemCode}
                            onChange={e => setItemCode(e.target.value)}
                            placeholder="AI 인식 또는 직접 입력"
                            className={inputCls} />
                    </div>

                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">브랜드</label>
                        <input type="text" value={brand}
                            onChange={e => setBrand(e.target.value)}
                            placeholder="AI 인식 또는 직접 입력"
                            className={inputCls} />
                    </div>

                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">색상</label>
                        <input type="text" value={color}
                            onChange={e => setColor(e.target.value)}
                            placeholder="AI 인식 또는 직접 입력"
                            className={inputCls} />
                    </div>

                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">
                            수량 <span className="text-red-400">*</span>
                        </label>
                        <input type="number" value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                            placeholder="수량 입력"
                            inputMode="numeric"
                            className={inputCls} />
                    </div>
                </section>

                {/* 3. 발생 정보 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-3.5">
                    <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                        <span className="w-6 h-6 bg-amber-50 rounded-lg flex items-center justify-center text-sm">📍</span>
                        발생 정보
                    </h3>

                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">발생일</label>
                        <input type="date" value={incidentDate}
                            onChange={e => setIncidentDate(e.target.value)}
                            className={inputCls} />
                    </div>

                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">발생센터</label>
                        <input type="text" value={incidentCenter}
                            onChange={e => setIncidentCenter(e.target.value)}
                            placeholder="발생센터 입력"
                            className={inputCls} />
                    </div>
                </section>
            </div>

            {/* 하단 고정 등록 버튼 */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/95 to-transparent pt-8">
                <button onClick={handleSubmit} disabled={isSubmitting}
                    className={`w-full py-[18px] rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-all
                        ${isSubmitting
                            ? 'bg-slate-200 text-slate-400'
                            : 'bg-letusOrange hover:bg-orange-500 active:bg-orange-600 active:scale-[0.98] text-white shadow-orange-200'}`}>
                    {isSubmitting ? (
                        <>
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            등록 중...
                        </>
                    ) : <>📋 회수 건 등록하기</>}
                </button>
            </div>
        </div>
    );
};
