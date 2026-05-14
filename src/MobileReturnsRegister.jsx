import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

export const MobileReturnsRegister = ({ userProfile }) => {
    const navigate = useNavigate();

    const [itemCode, setItemCode]     = useState('');
    const [brand, setBrand]           = useState('');
    const [color, setColor]           = useState('');
    const [quantity, setQuantity]     = useState('');
    const [incidentDate, setIncidentDate] = useState(new Date().toISOString().split('T')[0]);

    const [isLooking, setIsLooking]     = useState(false);
    const [lookupResult, setLookupResult] = useState(null); // 'found' | 'notfound' | null
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted]     = useState(false);

    const incidentCenter = userProfile?.workplace || '';

    const lookupProduct = async () => {
        const code = itemCode.trim();
        if (!code) return;
        setIsLooking(true);
        setLookupResult(null);
        try {
            const { data } = await supabase
                .from('products')
                .select('brand_category, item_color')
                .eq('item_code', code)
                .single();
            if (data) {
                setBrand(data.brand_category || '');
                setColor(data.item_color || '');
                setLookupResult('found');
            } else {
                setBrand('');
                setColor('');
                setLookupResult('notfound');
            }
        } catch {
            setLookupResult('notfound');
        } finally {
            setIsLooking(false);
        }
    };

    const handleSubmit = async () => {
        if (!itemCode.trim()) return alert('품목코드를 입력해주세요.');
        if (!quantity)        return alert('수량을 입력해주세요.');
        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('logistics_returns').insert([{
                incident_date:   incidentDate,
                incident_center: incidentCenter,
                writer:          userProfile?.name || '',
                brand:           brand  || null,
                item_code:       itemCode.trim(),
                color:           color  || null,
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
        setItemCode(''); setBrand(''); setColor(''); setQuantity('');
        setIncidentDate(new Date().toISOString().split('T')[0]);
        setLookupResult(null); setSubmitted(false);
    };

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

    const inputCls    = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue transition-all';
    const readonlyCls = 'w-full bg-slate-100 border border-slate-100 rounded-xl px-4 py-3 text-sm font-semibold min-h-[48px] flex items-center';

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
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
                        <h1 className="text-slate-800 font-black text-base leading-none">회수품/전시품 등록</h1>
                        <p className="text-slate-400 text-[11px] font-medium mt-0.5">LETUS LOGIS · Mobile</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-3">

                {/* 품목 정보 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-3.5">
                    <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-50 rounded-lg flex items-center justify-center text-sm">🔍</span>
                        품목 정보
                    </h3>

                    {/* 품목코드 + 조회 버튼 */}
                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">
                            품목코드 <span className="text-red-400">*</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={itemCode}
                                onChange={e => { setItemCode(e.target.value); setLookupResult(null); }}
                                onKeyDown={e => e.key === 'Enter' && lookupProduct()}
                                placeholder="품목코드 입력"
                                className={`flex-1 ${inputCls}`}
                            />
                            <button
                                onClick={lookupProduct}
                                disabled={isLooking || !itemCode.trim()}
                                className="px-5 py-3 bg-letusBlue text-white font-bold text-sm rounded-xl active:scale-[0.97] disabled:opacity-40 transition-all shrink-0 flex items-center justify-center"
                            >
                                {isLooking ? (
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                ) : '조회'}
                            </button>
                        </div>
                        {lookupResult === 'found' && (
                            <p className="text-xs font-bold text-green-600 mt-1.5 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                품목 정보가 자동 입력되었습니다
                            </p>
                        )}
                        {lookupResult === 'notfound' && (
                            <p className="text-xs font-bold text-amber-500 mt-1.5 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                DB에 없는 코드입니다
                            </p>
                        )}
                    </div>

                    {/* 브랜드 (자동 입력) */}
                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">브랜드</label>
                        <div className={readonlyCls}>
                            {brand ? (
                                <span className="text-slate-700">{brand}</span>
                            ) : (
                                <span className="text-slate-300 font-normal">코드 조회 시 자동 입력</span>
                            )}
                        </div>
                    </div>

                    {/* 색상 (자동 입력) */}
                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">색상</label>
                        <div className={readonlyCls}>
                            {color ? (
                                <span className="text-slate-700">{color}</span>
                            ) : (
                                <span className="text-slate-300 font-normal">코드 조회 시 자동 입력</span>
                            )}
                        </div>
                    </div>

                    {/* 수량 */}
                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">
                            수량 <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="number"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                            placeholder="수량 입력"
                            inputMode="numeric"
                            className={inputCls}
                        />
                    </div>
                </section>

                {/* 발생 정보 */}
                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-3.5">
                    <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                        <span className="w-6 h-6 bg-amber-50 rounded-lg flex items-center justify-center text-sm">📍</span>
                        발생 정보
                    </h3>

                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">발생일</label>
                        <input
                            type="date"
                            value={incidentDate}
                            onChange={e => setIncidentDate(e.target.value)}
                            className={inputCls}
                        />
                    </div>

                    <div>
                        <label className="text-slate-500 text-xs font-bold mb-1.5 block">발생센터</label>
                        <div className={readonlyCls}>
                            {incidentCenter ? (
                                <span className="text-slate-700">{incidentCenter}</span>
                            ) : (
                                <span className="text-slate-300 font-normal">센터 정보 없음</span>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            {/* 하단 고정 등록 버튼 */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/95 to-transparent pt-8">
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className={`w-full py-[18px] rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-all
                        ${isSubmitting
                            ? 'bg-slate-200 text-slate-400'
                            : 'bg-letusOrange hover:bg-orange-500 active:bg-orange-600 active:scale-[0.98] text-white shadow-orange-200'}`}
                >
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
