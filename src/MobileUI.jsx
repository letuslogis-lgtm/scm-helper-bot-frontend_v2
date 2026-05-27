/**
 * MobileUI.jsx — PWA 공용 모바일 UI 컴포넌트
 *
 * 포함 컴포넌트:
 *   MobileDateRangeSheet  달력 기반 날짜 범위 선택 시트
 */

import React, { useState } from 'react';

// ── 유틸 ──────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');

const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const todayStr = () => toStr(new Date());

const daysAgoStr = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return toStr(d);
};

const firstOfMonthStr = () => {
    const d = new Date();
    d.setDate(1);
    return toStr(d);
};

const MONTH_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const DAY_KO   = ['일','월','화','수','목','금','토'];

const PRESETS = [
    { label: '오늘',   getRange: () => ({ start: todayStr(),       end: todayStr() }) },
    { label: '3일',    getRange: () => ({ start: daysAgoStr(3),    end: todayStr() }) },
    { label: '이번달', getRange: () => ({ start: firstOfMonthStr(), end: todayStr() }) },
    { label: '한달',   getRange: () => ({ start: daysAgoStr(30),   end: todayStr() }) },
];

// ── 달력 기반 날짜 범위 시트 ───────────────────────────────────────────────
/**
 * props:
 *   value   { start: 'YYYY-MM-DD' | '', end: 'YYYY-MM-DD' | '' }
 *   onApply (range: { start, end }) => void
 *   onClose () => void
 */
export const MobileDateRangeSheet = ({ value = { start: '', end: '' }, onApply, onClose }) => {
    const today = todayStr();

    // 내부 임시 선택값
    const [tempStart, setTempStart] = useState(value.start || '');
    const [tempEnd,   setTempEnd]   = useState(value.end   || '');
    // 'start': 시작일 탭 대기 / 'end': 종료일 탭 대기
    const [selecting, setSelecting] = useState(value.start && !value.end ? 'end' : 'start');

    // 달력 뷰 (월)
    const initDate = value.start ? new Date(value.start + 'T00:00:00') : new Date();
    const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(initDate.getMonth());

    // ── 날짜 셀 클릭 ──
    const handleDayClick = (dateStr) => {
        if (selecting === 'start') {
            setTempStart(dateStr);
            setTempEnd('');
            setSelecting('end');
        } else {
            // 종료일 선택 (시작일보다 이전이면 swap)
            if (dateStr < tempStart) {
                setTempStart(dateStr);
                setTempEnd(tempStart);
            } else {
                setTempEnd(dateStr);
            }
            setSelecting('start');
        }
    };

    // ── 빠른 선택 ──
    const handlePreset = (getRange) => {
        const { start, end } = getRange();
        setTempStart(start);
        setTempEnd(end);
        setSelecting('start');
        // 해당 달로 뷰 이동
        const d = new Date(start + 'T00:00:00');
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
    };

    // ── 달력 네비게이션 ──
    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };

    // ── 달력 셀 생성 ──
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDay    = new Date(viewYear, viewMonth,     1).getDay();
    const cells = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

    // ── 셀 상태 계산 ──
    const getCellState = (dateStr) => {
        const isStart     = !!tempStart && dateStr === tempStart;
        const isEnd       = !!tempEnd   && dateStr === tempEnd;
        const isSingle    = tempStart && tempEnd && tempStart === tempEnd;
        const hasRange    = tempStart && tempEnd && !isSingle;
        const inRange     = hasRange && dateStr > tempStart && dateStr < tempEnd;
        const isRangeStart = isStart && hasRange;
        const isRangeEnd   = isEnd   && hasRange;
        return { isStart, isEnd, isSingle, inRange, isRangeStart, isRangeEnd };
    };

    // ── 선택 표시 라벨 ──
    const selectionLabel = (() => {
        if (!tempStart) return null;
        if (tempStart && !tempEnd) return `${tempStart}`;
        if (tempStart === tempEnd)  return tempStart;
        return `${tempStart}  ~  ${tempEnd}`;
    })();

    const canApply = !!tempStart && !!tempEnd;

    return (
        <>
            {/* 딤 배경 */}
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

            {/* 시트 */}
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl select-none">
                {/* 핸들 */}
                <div className="flex justify-center pt-3 pb-2">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>

                {/* 타이틀 + 선택 표시 */}
                <div className="px-5 pb-3 flex items-center justify-between">
                    <div>
                        <p className="text-slate-800 font-black text-base">조회 기간 선택</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                            {selecting === 'start'
                                ? (tempStart && tempEnd ? '다시 선택하려면 날짜를 탭하세요' : '시작일을 탭하세요')
                                : '종료일을 탭하세요'}
                        </p>
                    </div>
                    {selectionLabel && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5 max-w-[160px]">
                            <p className="text-[11px] font-bold text-orange-600 text-right leading-snug">{selectionLabel}</p>
                        </div>
                    )}
                </div>

                {/* 달력 헤더 */}
                <div className="flex items-center justify-between px-4 pb-1">
                    <button onClick={prevMonth}
                        className="w-10 h-10 flex items-center justify-center text-slate-500 rounded-full active:bg-slate-100 text-2xl font-bold leading-none">
                        ‹
                    </button>
                    <p className="font-black text-slate-800 text-sm">
                        {viewYear}년 {MONTH_KO[viewMonth]}
                    </p>
                    <button onClick={nextMonth}
                        className="w-10 h-10 flex items-center justify-center text-slate-500 rounded-full active:bg-slate-100 text-2xl font-bold leading-none">
                        ›
                    </button>
                </div>

                {/* 요일 헤더 */}
                <div className="grid grid-cols-7 px-3">
                    {DAY_KO.map((d, i) => (
                        <div key={d} className={`text-center text-[11px] font-bold py-1 ${
                            i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-500' : 'text-slate-400'
                        }`}>
                            {d}
                        </div>
                    ))}
                </div>

                {/* 날짜 셀 */}
                <div className="grid grid-cols-7 px-3 pb-2">
                    {cells.map((day, idx) => {
                        if (!day) return <div key={`e${idx}`} className="h-10" />;

                        const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
                        const dow = (firstDay + day - 1) % 7;
                        const isToday = dateStr === today;
                        const { isStart, isEnd, isSingle, inRange, isRangeStart, isRangeEnd } = getCellState(dateStr);
                        const isSelected = isStart || isEnd;

                        return (
                            <div key={day} className="relative h-10 flex items-center justify-center">
                                {/* 범위 배경 바 */}
                                {(inRange || isRangeStart || isRangeEnd) && (
                                    <div className={`absolute inset-y-1 bg-orange-100 pointer-events-none ${
                                        inRange      ? 'inset-x-0'          :
                                        isRangeStart ? 'left-1/2 right-0'   :
                                                       'right-1/2 left-0'
                                    }`} />
                                )}

                                <button
                                    onClick={() => handleDayClick(dateStr)}
                                    className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold active:scale-90 transition-transform ${
                                        isSelected
                                            ? 'bg-letusOrange text-white'
                                            : inRange
                                            ? 'text-orange-700'
                                            : isToday
                                            ? 'text-letusBlue font-black'
                                            : dow === 0
                                            ? 'text-red-400'
                                            : dow === 6
                                            ? 'text-blue-500'
                                            : 'text-slate-700'
                                    }`}
                                >
                                    {day}
                                    {/* 오늘 표시 점 */}
                                    {isToday && !isSelected && (
                                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-letusBlue" />
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* 빠른 선택 */}
                <div className="grid grid-cols-4 gap-2 px-4 pb-3">
                    {PRESETS.map(({ label, getRange }) => {
                        const r = getRange();
                        const isActive = r.start === tempStart && r.end === tempEnd;
                        return (
                            <button key={label} onClick={() => handlePreset(getRange)}
                                className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                                    isActive
                                        ? 'bg-letusOrange/10 text-letusOrange border border-letusOrange/30'
                                        : 'bg-slate-100 text-slate-600 active:bg-slate-200'
                                }`}>
                                {label}
                            </button>
                        );
                    })}
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-2.5 px-4 pb-8">
                    <button
                        onClick={() => onApply({ start: '', end: '' })}
                        className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm active:bg-slate-200 transition-colors"
                    >
                        전체 기간
                    </button>
                    <button
                        onClick={() => onApply({ start: tempStart, end: tempEnd })}
                        disabled={!canApply}
                        className="flex-[2] py-3.5 rounded-xl bg-letusOrange text-white font-bold text-sm active:bg-orange-600 transition-colors disabled:bg-slate-200 disabled:text-slate-400"
                    >
                        조회
                    </button>
                </div>
            </div>
        </>
    );
};
