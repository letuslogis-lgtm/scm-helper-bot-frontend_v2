import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';
import { MobileDateRangeSheet } from './MobileUI.jsx';

const todayKST = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

const fmtDate = (d) => {
    if (!d) return '-';
    const [y, m, day] = d.split('-');
    return `${y}.${m}.${day}`;
};

const fmtTime = (t) => (t ? t.slice(0, 5) : null);

const displayVal = (val, custom) => (val === '기타' ? (custom || '기타') : val) || '-';

// 하역 목업 데이터 (웹앱 하역 메뉴 개발 후 DB 연동으로 교체 예정)
const MOCK_UNLOADING = [
    { id: 'u1', brand: '시디즈', ctrn_no: 'CKSU4021575', item_code: 'T21HF2VG-5G1CWW',   quantity: 390, unloading_time: '09:00' },
    { id: 'u2', brand: '시디즈', ctrn_no: 'TGBU5000159', item_code: 'S51ACF1VG-A443BW',  quantity: 300, unloading_time: '10:30' },
    { id: 'u3', brand: '시디즈', ctrn_no: 'TGBU5000159', item_code: 'S51ACF1VG-A447BW',  quantity: 160, unloading_time: '10:30' },
    { id: 'u4', brand: '데스커', ctrn_no: 'FFAU7720936', item_code: 'DSSDAY0904-5Y1',     quantity:  40, unloading_time: '11:30' },
];

const TABS = [
    { key: 'all',       label: '전체' },
    { key: 'unloading', label: '하역' },
    { key: 'outgoing',  label: '출고' },
];

const TYPE_STYLE = {
    outgoing:  { border: 'border-l-letusBlue',  badge: 'text-letusBlue bg-blue-50',  label: '출고' },
    unloading: { border: 'border-l-amber-500',   badge: 'text-amber-600 bg-amber-50', label: '하역' },
};

export const MobileOutgoingNotes = () => {
    const navigate = useNavigate();
    const today = todayKST();
    const [activeTab, setActiveTab] = useState('all');
    const [dateFilter, setDateFilter] = useState({ start: today, end: today });
    const [showDateSheet, setShowDateSheet] = useState(false);
    const [outgoingNotes, setOutgoingNotes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const dateLabel = (() => {
        const { start, end } = dateFilter;
        if (!start && !end) return '날짜 선택';
        if (start === end) return fmtDate(start);
        return `${fmtDate(start)} ~ ${fmtDate(end)}`;
    })();

    const fetchNotes = async (filter) => {
        const { start, end } = filter || dateFilter;
        setIsLoading(true);
        try {
            const { data } = await supabase
                .from('outgoing_notes')
                .select('*')
                .eq('is_confirmed', true)
                .gte('scheduled_date', start)
                .lte('scheduled_date', end)
                .order('loading_time', { ascending: true });
            setOutgoingNotes(data || []);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchNotes(dateFilter); }, [dateFilter]);

    const displayNotes = (() => {
        if (activeTab === 'outgoing')  return outgoingNotes.map(n => ({ ...n, _type: 'outgoing' }));
        if (activeTab === 'unloading') return MOCK_UNLOADING.map(n => ({ ...n, _type: 'unloading' }));
        return [
            ...MOCK_UNLOADING.map(n => ({ ...n, _type: 'unloading' })),
            ...outgoingNotes.map(n => ({ ...n, _type: 'outgoing' })),
        ];
    })();

    const renderCard = (note) => {
        const ts = TYPE_STYLE[note._type];

        if (note._type === 'unloading') {
            return (
                <div key={note.id} className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden border-l-4 ${ts.border}`}>
                    {/* 상단: 브랜드(좌) / 품목·수량(우) */}
                    <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
                        <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full truncate">
                            {note.brand}
                        </span>
                        <p className="text-xs font-black text-slate-700 shrink-0">
                            {note.item_code} <span className="text-slate-300 font-medium">|</span> {note.quantity.toLocaleString()}개
                        </p>
                    </div>

                    {/* CTRN NO + 하차 시간 */}
                    <div className="mx-4 mb-3 bg-slate-50 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 mb-0.5">CTRN NO</p>
                            <p className="text-xs font-bold text-slate-700">{note.ctrn_no}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 mb-0.5">하차 시간</p>
                            <p className="text-xs font-bold text-slate-700">{note.unloading_time}</p>
                        </div>
                    </div>
                </div>
            );
        }

        // 출고 카드
        const brand = displayVal(note.brand, note.brand_custom);
        const loadingLoc = displayVal(note.loading_location, note.loading_location_custom);
        const dest = displayVal(note.destination, note.destination_custom);
        const loadingTime = fmtTime(note.loading_time);
        const unloadingTime = fmtTime(note.unloading_time);

        return (
            <div key={`outgoing-${note.id}`} className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden border-l-4 ${ts.border}`}>
                {/* 상단: 브랜드(좌) / 품목·수량(우) */}
                <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-letusBlue bg-blue-50 px-2.5 py-1 rounded-full truncate">
                        {brand}
                    </span>
                    <p className="text-xs font-black text-slate-700 shrink-0">
                        {note.item_code} <span className="text-slate-300 font-medium">|</span> {note.quantity?.toLocaleString()}개
                    </p>
                </div>

                {/* 상차지 → 하차지 */}
                <div className="mx-4 mb-3 bg-slate-50 rounded-xl px-3 py-2 flex items-center gap-2">
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
            </div>
        );
    };

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
                        <h1 className="text-slate-800 font-black text-base leading-none">하역/출고 특이사항</h1>
                        <p className="text-slate-400 text-[11px] mt-0.5">하역/출고 일정 조회</p>
                    </div>
                    <button onClick={() => fetchNotes()} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors">
                        <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* 탭 */}
            <div className="bg-white border-b border-slate-200 px-4 pt-2 flex gap-1">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${
                            activeTab === tab.key
                                ? 'text-letusBlue border-b-2 border-letusBlue'
                                : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 날짜 필터 */}
            <div className="bg-white border-b border-slate-100 px-4 py-2.5 flex gap-2 items-center">
                <button
                    onClick={() => setShowDateSheet(true)}
                    className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-left active:bg-slate-100 transition-colors"
                >
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs font-bold text-slate-600">{dateLabel}</span>
                </button>
                {(dateFilter.start !== today || dateFilter.end !== today) && (
                    <button
                        onClick={() => setDateFilter({ start: today, end: today })}
                        className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-500 active:bg-slate-200 transition-colors shrink-0"
                    >
                        오늘
                    </button>
                )}
            </div>

            {/* 리스트 */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
                {!isLoading && displayNotes.length > 0 && (
                    <p className="text-[11px] font-bold text-slate-400 mb-3">총 {displayNotes.length}건</p>
                )}

                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <svg className="w-6 h-6 animate-spin text-letusBlue" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    </div>
                )}

                {!isLoading && displayNotes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="text-4xl mb-3">📭</div>
                        <p className="text-slate-500 font-bold text-sm">해당 날짜의 특이사항이 없습니다</p>
                        <p className="text-slate-300 text-xs mt-1">확정된 건만 표시됩니다</p>
                    </div>
                )}

                <div className="space-y-3">
                    {displayNotes.map(note => renderCard(note))}
                </div>
            </div>

            {showDateSheet && (
                <MobileDateRangeSheet
                    value={dateFilter}
                    onApply={(range) => { setDateFilter(range); setShowDateSheet(false); }}
                    onClose={() => setShowDateSheet(false)}
                />
            )}
        </div>
    );
};
