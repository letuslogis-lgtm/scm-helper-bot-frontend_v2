import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, invokeFunction } from './supabaseClient.js';

const BRANDS = ['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소'];
const ISSUE_TYPE_GROUPS = [
    {
        group: '계획·수량',
        items: [
            { label: '계획 없음/누락' },
            { label: '수량 부족 (계획>실물)' },
            { label: '과입고 (계획<실물)' },
            { label: '계획 연기·컷·미출' },
        ],
    },
    {
        group: '품질·포장',
        items: [
            { label: '파손·불량' },
            { label: '바코드 오류' },
            { label: '포장 불량·혼적' },
            { label: '표기·규격 미흡' },
        ],
    },
    {
        group: '반송·오입고',
        items: [
            { label: '반송품 처리' },
            { label: '오반품·잘못 입고' },
        ],
    },
    {
        group: '전산·시스템',
        items: [
            { label: '전산-실물 불일치' },
            { label: 'WMS·전산 오류' },
        ],
    },
    {
        group: '기타',
        items: [
            { label: '기타 특이사항' },
        ],
    },
];

const generateReceptionNo = () => {
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const rand = Math.floor(Math.random() * 900 + 100);
    return `M${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${rand}`;
};

export const MobileIssueRegister = () => {
    const navigate = useNavigate();
    const [brand, setBrand] = useState('');
    const [issueType, setIssueType] = useState('');
    const [productCode, setProductCode] = useState('');
    const [vendor, setVendor] = useState('');
    const [detail, setDetail] = useState('');

    const [photos, setPhotos] = useState([]);
    const fileRef = useRef(null);

const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState(null);

    const [openGroups, setOpenGroups] = useState(new Set(['계획·수량']));

    const toggleGroup = (groupName) => {
        setOpenGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) next.delete(groupName);
            else next.add(groupName);
            return next;
        });
    };

    const handleIssueSelect = (label, groupName) => {
        setIssueType(label);
        setOpenGroups(prev => new Set([...prev, groupName]));
    };

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handlePhotoCapture = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const newPhotos = files.map(file => ({ file, preview: URL.createObjectURL(file) }));
        setPhotos(prev => [...prev, ...newPhotos].slice(0, 5));
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

    const compressImage = (file, maxWidth = 1024, quality = 0.6) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
            };
            img.src = URL.createObjectURL(file);
        });
    };

    const handleAiBarcode = async () => {
        if (photos.length === 0) return alert('사진을 먼저 촬영해주세요.');
        setIsAnalyzing(true);
        setAiResult(null);
        try {
            const base64 = await compressImage(photos[0].file);
            const { data, error } = await supabase.functions.invoke('analyze-barcode', {
                body: { image: base64, mimeType: 'image/jpeg' },
            });
            if (error) throw error;
            if (data?.product_code) {
                setProductCode(data.product_code);
                if (data.brand) setBrand(data.brand);
                if (data.vendor) setVendor(data.vendor);
                setAiResult({ success: true, code: data.product_code, description: data.description || '' });
            } else {
                setAiResult({ success: false, message: data?.message || '바코드를 인식하지 못했습니다.' });
            }
            supabase.from('ai_analysis_logs').insert({
                source_menu: 'MobileBarcode',
                original_text: `바코드 스캔 | 브랜드: ${brand || '미선택'} | 이슈: ${issueType || '미선택'}`,
                ai_analyzed_cause: data?.product_code || 'RECOGNITION_FAILED',
                ai_cause_detail: data?.barcode_type || null,
                ai_cause_summary: data?.product_code
                    ? `인식 성공 — ${data.description || data.product_code}`
                    : (data?.message || '바코드 인식 실패'),
                ai_confidence: data?.product_code ? 'high' : 'low',
                low_confidence_reason: data?.product_code ? null : (data?.message || '인식 불가'),
            }).then(({ error }) => {
                if (error) console.warn('바코드 로그 저장 실패:', error.message);
            });
        } catch (err) {
            console.error('AI 바코드 분석 실패:', err);
            setAiResult({ success: false, message: '분석 중 오류가 발생했습니다.' });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSubmit = async () => {
        if (!brand) return alert('브랜드를 선택해주세요.');
        if (!issueType) return alert('이슈 유형을 선택해주세요.');
        if (!detail.trim()) return alert('상세 내용을 입력해주세요.');
        setIsSubmitting(true);
        try {
            const photoPayload = await Promise.all(
                photos.map(async (p) => ({ base64: await compressImage(p.file), mimeType: 'image/jpeg' }))
            );
            await invokeFunction('submit-mobile-issue', {
                brand, issue_type: issueType,
                product_code: productCode || null,
                vendor: vendor || null,
                detail, photos: photoPayload,
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
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">등록 완료!</h2>
                <p className="text-slate-500 text-sm mb-8">특이사항이 성공적으로 접수되었습니다.<br />담당자가 확인 후 조치합니다.</p>
                <button
                    onClick={() => {
                        setBrand(''); setIssueType(''); setProductCode(''); setVendor(''); setDetail('');
                        setPhotos([]); setAiResult(null); setSubmitted(false);
                    }}
                    className="bg-letusOrange hover:bg-orange-500 active:bg-orange-600 text-white font-bold text-base px-8 py-4 rounded-xl shadow-md active:scale-95 transition-all"
                >
                    + 새로운 특이사항 등록
                </button>
                <button
                    onClick={() => navigate('/mobile')}
                    className="mt-3 text-slate-400 text-sm font-medium py-2 px-4"
                >
                    메뉴로 돌아가기
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 to-orange-600" />
                <div className="px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => navigate('/mobile')}
                        className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-slate-800 font-black text-base leading-none">입고 특이사항 등록</h1>
                        <p className="text-slate-400 text-[11px] font-medium mt-0.5">LETUS LOGIS · Mobile</p>
                    </div>
                </div>
            </header>

            {/* 메인 폼 */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-3">

                {/* 1. 사진 촬영 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                    <h3 className="text-slate-700 font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-50 rounded-lg flex items-center justify-center text-sm">📸</span>
                        현장 사진
                    </h3>
                    <div className="grid grid-cols-3 gap-2.5">
                        {photos.map((p, idx) => (
                            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200">
                                <img src={p.preview} alt={`사진${idx + 1}`} className="w-full h-full object-cover" />
                                <button
                                    onClick={() => removePhoto(idx)}
                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow"
                                >✕</button>
                            </div>
                        ))}
                        {photos.length < 5 && (
                            <button
                                onClick={() => fileRef.current?.click()}
                                className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-400 active:bg-slate-50 transition-colors"
                            >
                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="text-[10px] font-bold">촬영/선택</span>
                            </button>
                        )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture} className="hidden" />

                    {photos.length > 0 && (
                        <button
                            onClick={handleAiBarcode}
                            disabled={isAnalyzing}
                            className={`w-full mt-3 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${isAnalyzing ? 'bg-slate-100 text-slate-400' : 'bg-letusBlue hover:bg-blue-800 active:scale-[0.98] text-white'}`}
                        >
                            {isAnalyzing ? (
                                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>AI 분석 중...</>
                            ) : <>🤖 AI 바코드 인식</>}
                        </button>
                    )}

                    {aiResult && (
                        <div className={`mt-3 p-3 rounded-xl text-sm font-bold border ${aiResult.success ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                            {aiResult.success ? (
                                <>✅ 인식 완료: <span className="text-slate-800">{aiResult.code}</span>
                                {aiResult.description && <p className="text-xs text-green-600 mt-1 font-medium">{aiResult.description}</p>}</>
                            ) : (
                                <>⚠️ {aiResult.message}</>
                            )}
                        </div>
                    )}
                </section>

                {/* 2. 브랜드 선택 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                    <h3 className="text-slate-700 font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-orange-50 rounded-lg flex items-center justify-center text-sm">🏷️</span>
                        브랜드 <span className="text-red-400 font-black">*</span>
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                        {BRANDS.map(b => (
                            <button
                                key={b}
                                onClick={() => setBrand(b)}
                                className={`py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] ${brand === b ? 'bg-letusBlue text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >{b}</button>
                        ))}
                    </div>
                </section>

                {/* 3. 이슈 유형 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="px-4 pt-4 pb-3">
                        <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                            <span className="w-6 h-6 bg-red-50 rounded-lg flex items-center justify-center text-sm">⚡</span>
                            이슈 유형 <span className="text-red-400 font-black">*</span>
                        </h3>
                        {issueType && (
                            <p className="mt-2.5 text-xs text-letusOrange font-bold bg-orange-50 px-3 py-1.5 rounded-lg">
                                선택: {issueType}
                            </p>
                        )}
                    </div>
                    <div className="border-t border-slate-100">
                        {ISSUE_TYPE_GROUPS.map((group, idx) => {
                            const isOpen = openGroups.has(group.group);
                            const hasSelected = group.items.some(i => i.label === issueType);
                            return (
                                <div key={group.group} className={idx > 0 ? 'border-t border-slate-100' : ''}>
                                    <button
                                        onClick={() => toggleGroup(group.group)}
                                        className="w-full px-4 py-3 flex items-center justify-between active:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-bold ${hasSelected ? 'text-letusOrange' : 'text-slate-700'}`}>
                                                {group.group}
                                            </span>
                                            {hasSelected && <span className="w-1.5 h-1.5 rounded-full bg-letusOrange" />}
                                            <span className="text-[11px] text-slate-400 font-medium">{group.items.length}개</span>
                                        </div>
                                        <svg
                                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    {isOpen && (
                                        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
                                            {group.items.map(t => (
                                                <button
                                                    key={t.label}
                                                    onClick={() => handleIssueSelect(t.label, group.group)}
                                                    className={`py-2.5 px-3 rounded-xl text-[13px] font-bold text-left transition-all active:scale-[0.97] ${issueType === t.label ? 'bg-letusOrange text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* 4. 상세 입력 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-3.5">
                    <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                        <span className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-sm">📝</span>
                        상세 정보
                    </h3>
                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">품목코드</label>
                        <input
                            type="text"
                            value={productCode}
                            onChange={e => setProductCode(e.target.value)}
                            placeholder="AI 인식 또는 직접 입력"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue transition-all"
                        />
                    </div>
                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">공급업체</label>
                        <input
                            type="text"
                            value={vendor}
                            onChange={e => setVendor(e.target.value)}
                            placeholder="공급업체명"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue transition-all"
                        />
                    </div>
                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">
                            상세 내용 <span className="text-red-400 font-black">*</span>
                        </label>
                        <textarea
                            value={detail}
                            onChange={e => setDetail(e.target.value)}
                            placeholder="특이사항 상세 내용을 입력해주세요"
                            rows={4}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue transition-all resize-none"
                        />
                    </div>
                </section>
            </div>

            {/* 하단 고정 등록 버튼 */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/95 to-transparent pt-8">
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className={`w-full py-[18px] rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-all ${isSubmitting ? 'bg-slate-200 text-slate-400' : 'bg-letusOrange hover:bg-orange-500 active:bg-orange-600 active:scale-[0.98] text-white shadow-orange-200'}`}
                >
                    {isSubmitting ? (
                        <><svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>등록 중...</>
                    ) : <>📋 특이사항 등록하기</>}
                </button>
            </div>
        </div>
    );
};
