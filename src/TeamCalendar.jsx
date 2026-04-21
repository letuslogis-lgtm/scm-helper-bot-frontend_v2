import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient.js';
import { CalendarEventModal } from './CalendarEventModal.jsx'; // 🚩 외부 모달 불러오기

export const TeamCalendar = ({ userProfile }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // 🚩 폼 관련 상태(formData)는 삭제됨! CalendarEventModal이 자체 관리합니다.
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);
    const [editEvent, setEditEvent] = useState(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const fetchEvents = async () => {
        setIsLoading(true);
        try {
            const pad = n => String(n).padStart(2, '0');
            const prevM = new Date(year, month - 1, 1);
            const startStr = `${prevM.getFullYear()}-${pad(prevM.getMonth() + 1)}-01`;
            const nextM = new Date(year, month + 2, 0); // 0 gets the last day of the previous month (which is month+1)
            const endStr = `${nextM.getFullYear()}-${pad(nextM.getMonth() + 1)}-${pad(nextM.getDate())}`;

            const { data, error } = await supabase
                .from('calendar_events')
                .select('*')
                .gte('event_date', startStr)
                .lte('event_date', endStr)
                .order('event_date', { ascending: true });

            if (error) throw error;
            setEvents(data || []);
        } catch (err) {
            console.error("일정 불러오기 실패:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchEvents(); }, [year, month]);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToday = () => setCurrentDate(new Date());

    const getEventTypeStyles = (type) => {
        switch (type) {
            case '상차': return 'bg-orange-100 text-orange-700 border-orange-200';
            case '시공': return 'bg-blue-100 text-blue-700 border-blue-200';
            case '회의': return 'bg-purple-100 text-purple-700 border-purple-200';
            case '긴급': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    // 1. 새 일정 클릭 시
    const handleDayClick = (dayStr) => {
        setSelectedDate(dayStr);
        setEditEvent(null);
        setIsModalOpen(true);
    };

    // 2. 기존 일정 클릭 시 (수정 모드) - 🚩 모달이 요구하는 규격에 맞게 데이터 가공
    const handleEventClick = (e, event) => {
        e.stopPropagation();
        const safeEventDate = String(event.event_date || '').replace('T', ' ');
        const datePart = safeEventDate.split(' ')[0] || '';
        const timePart = safeEventDate.split(' ')[1]?.substring(0, 5) || '09:00';

        const safeEndDate = event.end_date ? String(event.end_date).replace('T', ' ') : '';
        const endDatePart = safeEndDate.split(' ')[0] || datePart;
        const endTimePart = safeEndDate.split(' ')[1]?.substring(0, 5) || '18:00';

        setSelectedDate(datePart);
        // CalendarEventModal 내부의 변수명(startDate, endDate 등)에 맞춰서 객체를 만들어줍니다.
        setEditEvent({
            id: event.id,
            title: event.title,
            startDate: datePart,
            endDate: endDatePart,
            startTime: timePart,
            endTime: endTimePart,
            isImportant: event.is_important,
            description: event.description,
            collabTeams: event.collab_teams,
            collaborators: event.collaborators,
            location: event.location
        });
        setIsModalOpen(true);
    };

    // 3. 모달에서 [저장] 눌렀을 때 - 🚩 외부 모달의 데이터를 DB 규격으로 매핑
    const handleSaveEvent = async (eventData) => {
        const startDateTime = `${eventData.startDate} ${eventData.startTime}:00`;
        const endDateTime = `${eventData.endDate} ${eventData.endTime}:00`;

        const payload = {
            user_id: userProfile?.id || 'system',
            user_name: userProfile?.name || '시스템',
            title: eventData.title,
            event_date: startDateTime,
            end_date: endDateTime,
            description: eventData.description,
            collab_teams: eventData.collabTeams,
            collaborators: eventData.collaborators,
            location: eventData.location,
            is_important: eventData.isImportant,
            // 중요도에 따라 달력에 보일 색상(타입)을 자동으로 지정합니다.
            type: eventData.isImportant ? '긴급' : '기타'
        };

        try {
            if (eventData.id) {
                const { error } = await supabase.from('calendar_events').update(payload).eq('id', eventData.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('calendar_events').insert([payload]);
                if (error) throw error;
            }
            setIsModalOpen(false);
            fetchEvents();
        } catch (err) {
            alert("일정 저장 중 오류가 발생했습니다.");
            console.error(err);
        }
    };

    const calendarCells = useMemo(() => {
        const cells = [];
        for (let i = 0; i < firstDayOfMonth; i++) {
            cells.push({ date: new Date(year, month - 1, daysInPrevMonth - firstDayOfMonth + i + 1), isCurrentMonth: false });
        }
        for (let i = 1; i <= daysInMonth; i++) {
            cells.push({ date: new Date(year, month, i), isCurrentMonth: true });
        }
        const remainingCells = 42 - cells.length;
        for (let i = 1; i <= remainingCells; i++) {
            cells.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
        }
        return cells;
    }, [year, month, daysInMonth, firstDayOfMonth, daysInPrevMonth]);

    return (
        <div className="p-6 bg-slate-50 min-h-[calc(100vh-64px)] slide-up flex flex-col gap-4">

            {/* 상단 컨트롤 패널 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-black text-gray-800 tracking-tight">{year}년 {month + 1}월</h2>
                    <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
                        <button onClick={prevMonth} className="p-1.5 hover:bg-white rounded-md text-gray-500"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg></button>
                        <button onClick={goToday} className="px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-white rounded-md">오늘</button>
                        <button onClick={nextMonth} className="p-1.5 hover:bg-white rounded-md text-gray-500"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg></button>
                    </div>
                </div>

                <div className="flex gap-3">
                    <div className="hidden lg:flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg mr-2">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500"><div className="w-2 h-2 rounded-full bg-red-500"></div>긴급/중요</span>
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500"><div className="w-2 h-2 rounded-full bg-slate-400"></div>일반 업무</span>
                    </div>
                    <button onClick={() => handleDayClick(new Date().toISOString().split('T')[0])} className="bg-letusBlue text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-600 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                        새 일정 등록
                    </button>
                </div>
            </div>

            {/* 메인 달력 그리드 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-[600px]">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 shrink-0">
                    {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                        <div key={day} className={`py-3 text-center text-xs font-black ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{day}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 flex-1 auto-rows-fr relative">
                    {isLoading && <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10"><div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div></div>}

                    {calendarCells.map((cell, idx) => {
                        const pad = n => String(n).padStart(2, '0');
                        const dateStr = `${cell.date.getFullYear()}-${pad(cell.date.getMonth() + 1)}-${pad(cell.date.getDate())}`;
                        const dayEvents = events.filter(e => e.event_date && e.event_date.startsWith(dateStr));
                        const isToday = dateStr === new Date().toISOString().split('T')[0];

                        return (
                            <div key={idx} onClick={() => handleDayClick(dateStr)} className={`border-r border-b border-slate-100 p-1.5 sm:p-2 cursor-pointer hover:bg-slate-50 flex flex-col gap-1 min-h-[100px] overflow-hidden ${cell.isCurrentMonth ? 'bg-white' : 'bg-slate-50/50'}`}>
                                <div className="flex justify-between items-start">
                                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-letusBlue text-white' : !cell.isCurrentMonth ? 'text-gray-300' : idx % 7 === 0 ? 'text-red-500' : idx % 7 === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                                        {cell.date.getDate()}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar flex-1 pb-1 pr-1">
                                    {dayEvents.map(event => {
                                        const timeStr = event.event_date.split(' ')[1]?.substring(0, 5) || '';
                                        return (
                                            <div key={event.id} onClick={(e) => handleEventClick(e, event)} className={`text-[10px] font-bold px-1.5 py-1 rounded border shadow-sm truncate hover:scale-[1.02] ${getEventTypeStyles(event.type)}`} title={event.title}>
                                                <span className="opacity-70 mr-1">{timeStr}</span>{event.title}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 🚩 분리된 외부 모달 하나로 통합! */}
            {isModalOpen && (
                <CalendarEventModal
                    selectedDate={selectedDate}
                    eventToEdit={editEvent}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSaveEvent}
                />
            )}
        </div>
    );
};