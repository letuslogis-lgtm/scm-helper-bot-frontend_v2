import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

const INCIDENT_REASONS = ['시공팀 상차 누락', '센터 과/오출', '확인 중', '미출고', '연기건 미상차', '반품건 미적재'];

const fmtDate = (d) => {
    if (!d) return '-';
    const [y, m, day] = d.split('-');
    return `${y}.${m}.${day}`;
};

export const MobilePreDeliveryManage = ({ userProfile }) => {
    const navigate = useNavigate();
    const fileRef = useRef(null);

    // phase: 'scan' | 'confirm_recover' | 'recover_list' | 'confirm_new' | 'register_form' | 'done'
    const [phase, setPhase] = useState('scan');
    const [doneType, setDoneType] = useState('');

    const [photos, setPhotos] = useState([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState(null);

    const [itemCode, setItemCode] = useState('');
    const [brand, setBrand] = useState('');
    const [color, setColor] = useState('');
    const [quantity, setQuantity] = useState('');
    const [incidentDate, setIncidentDate] = useState(new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [incidentCenter, setIncidentCenter] = useState('');
    const [incidentReason, setIncidentReason] = useState('');
    const [constructionTeam, setConstructionTeam] = useState('');

    const [pendingList, setPendingList] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (userProfile?.workplace) setIncidentCenter(userProfile.workplace);
    }, [userProfile?.workplace]);

    const compressImage = (file, maxWidth = 1024, quality = 0.6) =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
            };
            img.onerror = () => reject(new Error('이미지 로드 실패'));
            img.src = URL.createObjectURL(file);
        });

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

    const lookupFromDB = async (code) => {
        const { data } = await supabase
            .from('products')
            .select('brand_category, item_color')
            .eq('item_code', code)
            .single();
        if (data) {
            if (data.brand_category) setBrand(data.brand_category);
            if (data.item_color) setColor(data.item_color);
        }
    };

    const queryPendingList = async (code) => {
        const thirtyDaysAgo = new Date(Date.now() + 9 * 60 * 60 * 1000);
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
        const fromDate = thirtyDaysAgo.toISOString().split('T')[0];
        const { data } = await supabase
            .from('logistics_returns')
            .select('id, incident_date, incident_center, brand, item_code, color, quantity, construction_team, incident_reason, writer')
            .eq('item_code', code)
            .eq('type', '선출고')
            .eq('is_recovered', false)
            .gte('incident_date', fromDate)
            .order('incident_date', { ascending: false });
        return data || [];
    };

    const runSearch = async (code) => {
        setIsAnalyzing(true);
        try {
            await lookupFromDB(code);
            const list = await queryPendingList(code);
            setPendingList(list);
            setSelectedId(null);
            if (list.length > 0) {
                setPhase('confirm_recover');
            } else {
                setPhase('confirm_new');
            }
        } catch {
            alert('조회 중 오류가 발생했습니다.');
        } finally {
            setIsAnalyzing(false);
        }
    };

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
                const codePart = hyphenIdx !== -1 ? fullCode.substring(0, hyphenIdx) : fullCode;
                const colorPart = hyphenIdx !== -1 ? fullCode.substring(hyphenIdx + 1) : '';
                setItemCode(codePart);
                if (colorPart) setColor(colorPart);
                if (data.brand) setBrand(data.brand);
                setAiResult({ success: true, code: fullCode });
                setIsAnalyzing(false);
                await runSearch(codePart);
            } else {
                setAiResult({ success: false, message: data?.message || '바코드를 인식하지 못했습니다.' });
                setIsAnalyzing(false);
            }
        } catch {
            setAiResult({ success: false, message: '분석 중 오류가 발생했습니다.' });
            setIsAnalyzing(false);
        }
    };

    const handleManualSearch = async () => {
        if (!itemCode.trim()) return alert('품목코드를 입력해주세요.');
        await runSearch(itemCode.trim());
    };

    const handleRecover = async () => {
        if (!selectedId) return alert('회수할 건을 선택해주세요.');
        setIsProcessing(true);
        try {
            const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
            const { error } = await supabase
                .from('logistics_returns')
                .update({
                    is_recovered: true,
                    recovered_at: today,
                    recovery_handler: userProfile?.name || '',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', selectedId);
            if (error) throw error;
            setDoneType('recovered');
            setPhase('done');
        } catch (e) {
            alert('처리 실패: ' + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSubmit = async () => {
        if (!itemCode.trim()) return alert('품목코드를 입력해주세요.');
        if (!quantity) return alert('수량을 입력해주세요.');
        if (!incidentReason) return alert('발생 사유를 선택해주세요.');
        if (!constructionTeam.trim()) return alert('시공팀명을 입력해주세요.');
        setIsProcessing(true);
        try {
            const { error } = await supabase.from('logistics_returns').insert([{
                type: '선출고',
                incident_date: incidentDate,
                incident_center: incidentCenter,
                writer: userProfile?.name || '',
                brand: brand || null,
                item_code: itemCode.trim(),
                color: color || null,
                quantity: parseInt(quantity, 10),
                incident_reason: incidentReason,
                construction_team: constructionTeam.trim(),
                is_recovered: false,
            }]);
            if (error) throw error;
            setDoneType('registered');
            setPhase('done');
        } catch (e) {
            alert('등록 실패: ' + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const reset = () => {
        setPhase('scan');
        setDoneType('');
        setPhotos([]);
        setAiResult(null);
        setItemCode(''); setBrand(''); setColor(''); setQuantity('');
        setIncidentDate(new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]);
        setIncidentCenter(userProfile?.workplace || '');
        setIncidentReason('');
        setConstructionTeam('');
        setPendingList([]);
        setSelectedId(null);
    };

    const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue transition-all';

    const BackBtn = ({ onClick }) => (
        <button onClick={onClick} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
        </button>
    );

    // ── 완료 ──
    if (phase === 'done') {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">
                    {doneType === 'recovered' ? '회수 처리 완료!' : '등록 완료!'}
                </h2>
                <p className="text-slate-500 text-sm mb-8">
                    {doneType === 'recovered'
                        ? '선출고 건이 회수 처리되었습니다.'
                        : '선출고 건이 성공적으로 등록되었습니다.'}
                </p>
                <button onClick={reset}
                    className="bg-letusOrange hover:bg-orange-500 active:bg-orange-600 text-white font-bold text-base px-8 py-4 rounded-xl shadow-md active:scale-95 transition-all">
                    + 계속 작업하기
                </button>
                <button onClick={() => navigate('/mobile')}
                    className="mt-3 text-slate-400 text-sm font-medium py-2 px-4">
                    메뉴로 돌아가기
                </button>
            </div>
        );
    }

    // ── 팝업: 미회수 내역 있음 ──
    if (phase === 'confirm_recover') {
        return (
            <div className="min-h-screen bg-slate-900/50 flex flex-col items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 w-full max-w-sm">
                    <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                        <span className="text-2xl">⚠️</span>
                    </div>
                    <h2 className="text-slate-800 font-black text-lg text-center mb-1">미회수 선출고 내역 있음</h2>
                    <p className="text-slate-500 text-sm text-center mb-1">
                        <span className="font-bold text-letusBlue">{itemCode}</span>
                    </p>
                    <p className="text-slate-400 text-xs text-center mb-6">
                        최근 30일 이내 미회수 선출 건이 {pendingList.length}건 있습니다.
                        <br />회수 등록하시겠습니까?
                    </p>
                    <button onClick={() => setPhase('recover_list')}
                        className="w-full py-3.5 rounded-xl bg-letusBlue text-white font-bold text-sm mb-2.5 active:scale-[0.98] transition-all shadow-sm">
                        ✅ 회수 등록하기
                    </button>
                    <button onClick={() => setPhase('register_form')}
                        className="w-full py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:scale-[0.98] transition-all">
                        신규 선출로 등록
                    </button>
                </div>
            </div>
        );
    }

    // ── 미회수 리스트 ──
    if (phase === 'recover_list') {
        return (
            <div className="min-h-screen bg-slate-100 flex flex-col">
                <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600" />
                    <div className="px-4 py-3 flex items-center gap-3">
                        <BackBtn onClick={() => setPhase('confirm_recover')} />
                        <div>
                            <h1 className="text-slate-800 font-black text-base leading-none">회수할 건 선택</h1>
                            <p className="text-slate-400 text-[11px] font-medium mt-0.5">선출고 관리 · {itemCode}</p>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-3">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">미회수 선출 내역</p>
                    {pendingList.map(row => (
                        <button key={row.id} onClick={() => setSelectedId(row.id)}
                            className={`w-full bg-white rounded-xl border p-4 text-left transition-all active:scale-[0.98]
                                ${selectedId === row.id ? 'border-letusBlue ring-1 ring-letusBlue shadow-md' : 'border-slate-100 shadow-sm'}`}>
                            <div className="flex items-start justify-between mb-2">
                                <span className="text-xs font-bold text-slate-800">{fmtDate(row.incident_date)}</span>
                                <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5 font-bold">미회수</span>
                            </div>
                            <p className="text-xs text-slate-500">{row.incident_center} · {row.quantity}EA</p>
                            {row.construction_team && (
                                <p className="text-xs text-slate-400 mt-0.5">시공팀: {row.construction_team}</p>
                            )}
                            {row.incident_reason && (
                                <p className="text-xs text-slate-400 mt-0.5">사유: {row.incident_reason}</p>
                            )}
                            {selectedId === row.id && (
                                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5 text-letusBlue" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-[11px] font-bold text-letusBlue">선택됨</span>
                                </div>
                            )}
                        </button>
                    ))}
                </div>

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/95 to-transparent pt-8">
                    <button onClick={handleRecover} disabled={!selectedId || isProcessing}
                        className={`w-full py-[18px] rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-all
                            ${!selectedId || isProcessing
                                ? 'bg-slate-200 text-slate-400'
                                : 'bg-letusBlue hover:bg-blue-800 active:bg-blue-900 active:scale-[0.98] text-white shadow-blue-200'}`}>
                        {isProcessing ? (
                            <>
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                처리 중...
                            </>
                        ) : '✅ 회수 처리하기'}
                    </button>
                </div>
            </div>
        );
    }

    // ── 팝업: 내역 없음 ──
    if (phase === 'confirm_new') {
        return (
            <div className="min-h-screen bg-slate-900/50 flex flex-col items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 w-full max-w-sm">
                    <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                        <span className="text-2xl">📋</span>
                    </div>
                    <h2 className="text-slate-800 font-black text-lg text-center mb-1">선출고 내역 없음</h2>
                    <p className="text-slate-500 text-sm text-center mb-1">
                        <span className="font-bold text-letusBlue">{itemCode}</span>
                    </p>
                    <p className="text-slate-400 text-xs text-center mb-6">
                        최근 30일 이내 미회수 선출고 내역이 없습니다.
                        <br />신규 선출로 등록합니다.
                    </p>
                    <button onClick={() => setPhase('register_form')}
                        className="w-full py-3.5 rounded-xl bg-letusOrange text-white font-bold text-sm mb-2.5 active:scale-[0.98] transition-all shadow-sm">
                        ⚡ 신규 선출 등록하기
                    </button>
                    <button onClick={reset}
                        className="w-full py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:scale-[0.98] transition-all">
                        취소
                    </button>
                </div>
            </div>
        );
    }

    // ── 등록 폼 ──
    if (phase === 'register_form') {
        return (
            <div className="min-h-screen bg-slate-100 flex flex-col">
                <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 to-orange-600" />
                    <div className="px-4 py-3 flex items-center gap-3">
                        <BackBtn onClick={() => setPhase('scan')} />
                        <div>
                            <h1 className="text-slate-800 font-black text-base leading-none">선출 등록</h1>
                            <p className="text-slate-400 text-[11px] font-medium mt-0.5">LETUS LOGIS · Mobile</p>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-3">
                    <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-3.5">
                        <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                            <span className="w-6 h-6 bg-violet-50 rounded-lg flex items-center justify-center text-sm">📦</span>
                            품목 정보
                        </h3>
                        <div>
                            <label className="text-slate-500 text-xs font-bold mb-1.5 block">품목코드 <span className="text-red-400">*</span></label>
                            <input type="text" value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="품목코드" className={inputCls} />
                        </div>
                        <div>
                            <label className="text-slate-500 text-xs font-bold mb-1.5 block">브랜드</label>
                            <input type="text" value={brand} onChange={e => setBrand(e.target.value)} placeholder="브랜드" className={inputCls} />
                        </div>
                        <div>
                            <label className="text-slate-500 text-xs font-bold mb-1.5 block">색상</label>
                            <input type="text" value={color} onChange={e => setColor(e.target.value)} placeholder="색상" className={inputCls} />
                        </div>
                        <div>
                            <label className="text-slate-500 text-xs font-bold mb-1.5 block">수량 <span className="text-red-400">*</span></label>
                            <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="수량 입력" inputMode="numeric" className={inputCls} />
                        </div>
                    </section>

                    <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-3.5">
                        <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                            <span className="w-6 h-6 bg-amber-50 rounded-lg flex items-center justify-center text-sm">📍</span>
                            발생 정보
                        </h3>
                        <div>
                            <label className="text-slate-500 text-xs font-bold mb-1.5 block">발생일</label>
                            <input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className="text-slate-500 text-xs font-bold mb-1.5 block">발생센터</label>
                            <input type="text" value={incidentCenter} onChange={e => setIncidentCenter(e.target.value)} placeholder="발생센터" className={inputCls} />
                        </div>
                        <div>
                            <label className="text-slate-500 text-xs font-bold mb-1.5 block">발생 사유 <span className="text-red-400">*</span></label>
                            <select value={incidentReason} onChange={e => setIncidentReason(e.target.value)} className={`${inputCls} cursor-pointer`}>
                                <option value="">선택</option>
                                {INCIDENT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </section>

                    <section className="bg-white rounded-xl shadow-sm border border-orange-100 p-4 space-y-3.5">
                        <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                            <span className="w-6 h-6 bg-orange-50 rounded-lg flex items-center justify-center text-sm">⚡</span>
                            선출 정보
                        </h3>
                        <div>
                            <label className="text-slate-500 text-xs font-bold mb-1.5 block">시공팀명 <span className="text-red-400">*</span></label>
                            <input type="text" value={constructionTeam} onChange={e => setConstructionTeam(e.target.value)} placeholder="선출 받은 시공팀명" className={inputCls} />
                        </div>
                    </section>
                </div>

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/95 to-transparent pt-8">
                    <button onClick={handleSubmit} disabled={isProcessing}
                        className={`w-full py-[18px] rounded-xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-all
                            ${isProcessing
                                ? 'bg-slate-200 text-slate-400'
                                : 'bg-letusOrange hover:bg-orange-500 active:bg-orange-600 active:scale-[0.98] text-white shadow-orange-200'}`}>
                        {isProcessing ? (
                            <>
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                등록 중...
                            </>
                        ) : '⚡ 선출 건 등록하기'}
                    </button>
                </div>
            </div>
        );
    }

    // ── 스캔 화면 (기본) ──
    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 to-orange-600" />
                <div className="px-4 py-3 flex items-center gap-3">
                    <BackBtn onClick={() => navigate(-1)} />
                    <div>
                        <h1 className="text-slate-800 font-black text-base leading-none">선출고 관리</h1>
                        <p className="text-slate-400 text-[11px] font-medium mt-0.5">LETUS LOGIS · Mobile</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-10 space-y-3">
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
                                : <>⚠️ {aiResult.message}</>}
                        </div>
                    )}
                </section>

                <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-3">
                    <h3 className="text-slate-700 font-bold text-sm flex items-center gap-2">
                        <span className="w-6 h-6 bg-slate-50 rounded-lg flex items-center justify-center text-sm">⌨️</span>
                        품목코드 직접 입력
                    </h3>
                    <div className="flex gap-2">
                        <input type="text" value={itemCode} onChange={e => setItemCode(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                            placeholder="품목코드 직접 입력"
                            className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue transition-all" />
                        <button onClick={handleManualSearch} disabled={isAnalyzing || !itemCode.trim()}
                            className={`shrink-0 w-16 py-3 rounded-xl font-bold text-sm transition-all
                                ${isAnalyzing || !itemCode.trim() ? 'bg-slate-100 text-slate-400' : 'bg-letusBlue text-white active:scale-[0.98]'}`}>
                            {isAnalyzing ? '...' : '조회'}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
};
