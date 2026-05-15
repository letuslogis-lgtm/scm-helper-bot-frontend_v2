import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

const fmtDate = (d) => {
    if (!d) return '-';
    const [y, m, day] = d.split('-');
    return `${y}.${m}.${day}`;
};

const todayStr = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};

const TABS = ['전체', '회수품', '선출고'];

const getStatusInfo = (item) => {
    if (item.type === '선출고') {
        return item.is_recovered
            ? { label: '회수완료', cls: 'bg-green-50 text-green-600 border-green-200' }
            : { label: '미회수',   cls: 'bg-amber-50 text-amber-600 border-amber-200' };
    }
    return item.is_completed
        ? { label: '완료',   cls: 'bg-green-50 text-green-600 border-green-200' }
        : { label: '처리중', cls: 'bg-blue-50 text-blue-600 border-blue-200' };
};

const DateFilterSheet = ({ dateRange, onApply, onClose }) => {
    const [start, setStart] = useState(dateRange.start);
    const [end, setEnd] = useState(dateRange.end);
    const endRef = useRef(null);

    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>
                <div className="px-5 pb-10 pt-3 space-y-4">
                    <p className="text-slate-800 font-black text-base">조회 기간 설정</p>
                    <div className="flex gap-3 items-center">
                        <div className="flex-1">
                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">시작일</label>
                            <input type="date" value={start} max={end || todayStr()}
                                onChange={e => { setStart(e.target.value); setTimeout(() => endRef.current?.focus(), 100); }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue" />
                        </div>
                        <span className="text-slate-300 font-bold mt-5">~</span>
                        <div className="flex-1">
                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">종료일</label>
                            <input ref={endRef} type="date" value={end} min={start} max={todayStr()}
                                onChange={e => setEnd(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {[
                            { label: '오늘',    s: todayStr(),  e: todayStr() },
                            { label: '3일',     s: daysAgo(3),  e: todayStr() },
                            { label: '이번 달', s: (() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; })(), e: todayStr() },
                            { label: '한 달',   s: daysAgo(30), e: todayStr() },
                        ].map(({ label, s, e }) => (
                            <button key={label} onClick={() => { setStart(s); setEnd(e); }}
                                className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold active:bg-slate-200">
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2.5">
                        <button onClick={() => onApply({ start: '', end: '' })}
                            className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm active:bg-slate-200">
                            전체 기간
                        </button>
                        <button onClick={() => onApply({ start, end })} disabled={!start || !end}
                            className="flex-[2] py-3.5 rounded-xl bg-letusOrange text-white font-bold text-sm disabled:bg-slate-200 disabled:text-slate-400 active:bg-orange-600">
                            조회
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

const ReturnDetailSheet = ({ item, onClose }) => {
    if (!item) return null;
    const status = getStatusInfo(item);
    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>
                <div className="px-5 pb-10 pt-3 space-y-4">
                    <div className="flex items-center justify-between">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${item.type === '선출고' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                            {item.type}
                        </span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${status.cls}`}>
                            {status.label}
                        </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400">품목코드</span>
                        <span className="text-sm font-mono font-bold text-slate-700">{item.item_code}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                        {item.brand && (
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                                <p className="text-[11px] font-bold text-slate-400">브랜드</p>
                                <p className="text-sm font-bold text-slate-700 mt-0.5">{item.brand}</p>
                            </div>
                        )}
                        {item.color && (
                            <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                                <p className="text-[11px] font-bold text-slate-400">색상</p>
                                <p className="text-sm font-bold text-slate-700 mt-0.5">{item.color}</p>
                            </div>
                        )}
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                            <p className="text-[11px] font-bold text-slate-400">수량</p>
                            <p className="text-sm font-bold text-slate-700 mt-0.5">{item.quantity ?? '-'}EA</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                            <p className="text-[11px] font-bold text-slate-400">발생일</p>
                            <p className="text-sm font-bold text-slate-700 mt-0.5">{fmtDate(item.incident_date)}</p>
                        </div>
                    </div>

                    <div className="h-px bg-slate-100" />

                    <div className="space-y-2.5">
                        {item.incident_center && (
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-slate-400">발생센터</span>
                                <span className="text-sm font-bold text-slate-700">{item.incident_center}</span>
                            </div>
                        )}
                        {item.incident_reason && (
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-slate-400">발생사유</span>
                                <span className="text-sm font-bold text-slate-700 text-right max-w-[60%]">{item.incident_reason}</span>
                            </div>
                        )}
                        {item.type === '선출고' && item.construction_team && (
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-slate-400">시공팀</span>
                                <span className="text-sm font-bold text-slate-700">{item.construction_team}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-bold text-slate-400">등록자</span>
                            <span className="text-sm font-bold text-slate-700">{item.writer}</span>
                        </div>
                    </div>

                    {item.type === '선출고' && item.is_recovered && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 space-y-1">
                                <p className="text-green-700 font-bold text-sm">회수 처리 완료</p>
                                {item.recovered_at && (
                                    <p className="text-green-600 text-xs">
                                        {fmtDate(item.recovered_at)}{item.recovery_handler ? ` · ${item.recovery_handler}` : ''}
                                    </p>
                                )}
                            </div>
                        </>
                    )}

                    {item.type === '회수품' && item.is_completed && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                                <p className="text-green-700 font-bold text-sm">처리 완료</p>
                            </div>
                        </>
                    )}

                    <button onClick={onClose}
                        className="w-full py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:bg-slate-200">
                        닫기
                    </button>
                </div>
            </div>
        </>
    );
};

export const MobileReturnsList = ({ userProfile }) => {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState(null);
    const [activeTab, setActiveTab] = useState('전체');
    const [dateRange, setDateRange] = useState({ start: daysAgo(7), end: todayStr() });
    const [showDateSheet, setShowDateSheet] = useState(false);

    const fetchItems = async (range = dateRange) => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('logistics_returns')
                .select('id, type, incident_date, incident_center, brand, item_code, color, quantity, incident_reason, construction_team, writer, is_completed, is_recovered, recovered_at, recovery_handler')
                .order('incident_date', { ascending: false })
                .limit(300);

            if (range.start) query = query.gte('incident_date', range.start);
            if (range.end)   query = query.lte('incident_date', range.end);

            const { data, error } = await query;
            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            console.error('조회 실패:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchItems(); }, []);

    const handleDateApply = (range) => {
        setDateRange(range);
        setShowDateSheet(false);
        fetchItems(range);
    };

    const filteredItems = activeTab === '전체'
        ? items
        : items.filter(i => i.type === activeTab);

    const hasDateFilter = dateRange.start && dateRange.end;

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200">
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1">
                        <p className="text-slate-800 font-black text-base leading-none">회수·선출고 리스트</p>
                    </div>
                    <button onClick={() => setShowDateSheet(true)} className="relative p-2 rounded-lg bg-slate-100 active:bg-slate-200">
                        <svg className={`w-5 h-5 ${hasDateFilter ? 'text-letusOrange' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {hasDateFilter && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-letusOrange" />}
                    </button>
                    <button onClick={() => fetchItems()} className="p-2 rounded-lg bg-slate-100 active:bg-slate-200">
                        <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {hasDateFilter && (
                    <div className="px-4 pb-2 flex items-center gap-2">
                        <span className="text-xs text-letusOrange font-bold">{dateRange.start} ~ {dateRange.end}</span>
                        <button onClick={() => handleDateApply({ start: '', end: '' })} className="text-[11px] text-slate-400 font-bold underline">해제</button>
                    </div>
                )}

                <div className="flex border-t border-slate-100">
                    {TABS.map(tab => {
                        const count = tab === '전체' ? items.length : items.filter(i => i.type === tab).length;
                        const isActive = activeTab === tab;
                        return (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-2.5 text-xs font-bold transition-colors relative ${isActive ? 'text-letusOrange' : 'text-slate-400'}`}>
                                {tab}
                                {count > 0 && (
                                    <span className={`ml-1 text-[10px] font-black ${isActive ? 'text-letusOrange' : 'text-slate-300'}`}>{count}</span>
                                )}
                                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-letusOrange rounded-t-full" />}
                            </button>
                        );
                    })}
                </div>
            </header>

            <div className="flex-1 px-4 py-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-letusOrange rounded-full animate-spin" />
                        <p className="text-slate-500 text-sm font-bold mt-3">불러오는 중...</p>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mb-4">
                            <span className="text-3xl">📦</span>
                        </div>
                        <p className="text-slate-700 font-bold text-base">데이터가 없습니다</p>
                        <p className="text-slate-400 text-sm mt-1">기간을 변경하거나 다른 탭을 선택해보세요.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {filteredItems.map(item => {
                            const status = getStatusInfo(item);
                            return (
                                <button key={item.id} onClick={() => setSelectedItem(item)}
                                    className="w-full bg-white rounded-xl shadow-sm border border-slate-100 p-4 text-left active:scale-[0.99] transition-transform">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex gap-1.5 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${item.type === '선출고' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                                {item.type}
                                            </span>
                                            {item.brand && (
                                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
                                                    {item.brand}
                                                </span>
                                            )}
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border flex-shrink-0 ${status.cls}`}>
                                            {status.label}
                                        </span>
                                    </div>
                                    <p className="text-slate-800 font-bold text-sm">{item.item_code}</p>
                                    <p className="text-slate-400 text-xs mt-0.5">
                                        {[item.color, item.quantity != null && `${item.quantity}EA`].filter(Boolean).join(' · ')}
                                    </p>
                                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100">
                                        <span className="text-slate-400 text-xs">{item.writer}</span>
                                        <span className="text-slate-400 text-xs">{fmtDate(item.incident_date)}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {showDateSheet && (
                <DateFilterSheet dateRange={dateRange} onApply={handleDateApply} onClose={() => setShowDateSheet(false)} />
            )}
            <ReturnDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
        </div>
    );
};
