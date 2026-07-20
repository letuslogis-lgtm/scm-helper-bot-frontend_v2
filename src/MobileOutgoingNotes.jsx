import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

const todayKST = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

const fmtDate = (d) => {
    if (!d) return '-';
    const [y, m, day] = d.split('-');
    return `${y}.${m}.${day}`;
};

const fmtTime = (t) => (t ? t.slice(0, 5) : null);

const fmtConfirmedAt = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}`;
};

const displayVal = (val, custom) => (val === '기타' ? (custom || '기타') : val) || '-';

export const MobileOutgoingNotes = () => {
    const navigate = useNavigate();
    const today = todayKST();
    const [date, setDate] = useState(today);
    const [notes, setNotes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const fetchNotes = async (targetDate) => {
        setIsLoading(true);
        try {
            const { data } = await supabase
                .from('outgoing_notes')
                .select('*')
                .eq('is_confirmed', true)
                .eq('scheduled_date', targetDate)
                .order('loading_time', { ascending: true });
            setNotes(data || []);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchNotes(date); }, [date]);

    const shiftDate = (days) => {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        setDate(d.toISOString().split('T')[0]);
    };

    const quickDates = [
        { label: '어제', val: (() => { const d = new Date(today); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })() },
        { label: '오늘', val: today },
        { label: '내일', val: (() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })() },
        { label: '모레', val: (() => { const d = new Date(today); d.setDate(d.getDate() + 2); return d.toISOString().split('T')[0]; })() },
    ];

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
                    <div className="flex-1">
                        <h1 className="text-slate-800 font-black text-base leading-none">출고 특이사항</h1>
                        <p className="text-slate-400 text-[11px] mt-0.5">확정된 출고 일정 조회</p>
                    </div>
                    <button onClick={() => fetchNotes(date)} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors">
                        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* 날짜 네비게이터 */}
            <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-2">
                <button onClick={() => shiftDate(-1)} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors shrink-0">
                    <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button
                    onClick={() => setShowDatePicker(v => !v)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 active:bg-slate-100 transition-colors"
                >
                    <span className="text-slate-800 font-black text-sm">{fmtDate(date)}</span>
                    {date === today && (
                        <span className="text-[10px] font-black text-white bg-letusBlue px-1.5 py-0.5 rounded-full leading-none">TODAY</span>
                    )}
                </button>
                <button onClick={() => shiftDate(1)} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors shrink-0">
                    <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {/* 날짜 직접 선택 (토글) */}
            {showDatePicker && (
                <div className="bg-white border-b border-slate-100 px-4 py-3 space-y-2.5">
                    <input
                        type="date"
                        value={date}
                        onChange={e => { if (e.target.value) { setDate(e.target.value); setShowDatePicker(false); } }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue"
                    />
                    <div className="flex gap-2">
                        {quickDates.map(({ label, val }) => (
                            <button
                                key={label}
                                onClick={() => { setDate(val); setShowDatePicker(false); }}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors active:scale-[0.97] ${
                                    date === val
                                        ? 'bg-letusBlue text-white'
                                        : 'bg-slate-100 text-slate-600 active:bg-slate-200'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 리스트 */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
                {!isLoading && notes.length > 0 && (
                    <p className="text-[11px] font-bold text-slate-400 mb-3">총 {notes.length}건</p>
                )}

                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <svg className="w-6 h-6 animate-spin text-letusBlue" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    </div>
                )}

                {!isLoading && notes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="text-4xl mb-3">📭</div>
                        <p className="text-slate-500 font-bold text-sm">해당 날짜의 출고 특이사항이 없습니다</p>
                        <p className="text-slate-300 text-xs mt-1">확정된 건만 표시됩니다</p>
                    </div>
                )}

                <div className="space-y-3">
                    {notes.map(note => {
                        const brand = displayVal(note.brand, note.brand_custom);
                        const loadingLoc = displayVal(note.loading_location, note.loading_location_custom);
                        const dest = displayVal(note.destination, note.destination_custom);
                        const loadingTime = fmtTime(note.loading_time);
                        const unloadingTime = fmtTime(note.unloading_time);

                        return (
                            <div key={note.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                {/* 상단: 브랜드 + 날짜 */}
                                <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <span className="inline-block text-xs font-black text-letusBlue bg-blue-50 px-2.5 py-1 rounded-full mb-2">
                                            {brand}
                                        </span>
                                        <p className="text-slate-800 font-black text-base leading-tight">{note.item_code}</p>
                                        <p className="text-slate-400 text-xs mt-1">
                                            수량 <span className="text-slate-700 font-bold">{note.quantity.toLocaleString()}개</span>
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[10px] font-bold text-slate-400">출고예정일</p>
                                        <p className="text-sm font-black text-slate-700 mt-0.5">{fmtDate(note.scheduled_date)}</p>
                                    </div>
                                </div>

                                {/* 상차지 → 하차지 */}
                                <div className="mx-4 mb-3 bg-slate-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-bold text-slate-400 mb-0.5">상차지</p>
                                        <p className="text-xs font-bold text-slate-700 truncate">{loadingLoc}</p>
                                        {loadingTime && <p className="text-[10px] text-slate-400 mt-0.5">{loadingTime}</p>}
                                    </div>
                                    <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <div className="flex-1 min-w-0 text-right">
                                        <p className="text-[10px] font-bold text-slate-400 mb-0.5">하차지</p>
                                        <p className="text-xs font-bold text-slate-700 truncate">{dest}</p>
                                        {unloadingTime && <p className="text-[10px] text-slate-400 mt-0.5">{unloadingTime}</p>}
                                    </div>
                                </div>

                                {/* 확정 정보 */}
                                <div className="px-4 pb-3 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                                        ✓ 확정
                                    </span>
                                    <p className="text-[10px] text-slate-300 font-medium">확정 {fmtConfirmedAt(note.confirmed_at)}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
