// 📄 TeamCalendar.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient.js';
import { CalendarEventModal } from './CalendarEventModal.jsx';

const getLocalDateString = (d) => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const TeamCalendar = ({ userProfile }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [holidays, setHolidays] = useState(new Set());

    const [searchQuery, setSearchQuery] = useState('');
    const [listDate, setListDate] = useState(getLocalDateString(new Date()));
    const [expandedEventId, setExpandedEventId] = useState(null);

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
            const nextM = new Date(year, month + 2, 0);
            const endStr = `${nextM.getFullYear()}-${pad(nextM.getMonth() + 1)}-${pad(nextM.getDate())}`;

            const { data, error } = await supabase
                .from('calendar_events')
                .select('*')
                .gte('start_date', startStr)
                .lte('start_date', endStr)
                .order('start_date', { ascending: true });

            if (error) throw error;

            const { data: profiles } = await supabase.from('profiles').select('name, team');
            const teamMap = {};
            if (profiles) profiles.forEach(p => teamMap[p.name] = p.team);

            const processedEvents = (data || []).map(ev => {
                const actDate = ev.start_date || '';
                const actTime = ev.start_time ? ev.start_time.substring(0, 5) : '09:00';
                const creatorName = ev.creator_name || '';

                const isMine = creatorName === userProfile?.name;

                // 1. 달력 표시용: 우리 팀원이 만들었거나, 우리 팀이 태그된 경우
                const isSameTeam = teamMap[creatorName] === userProfile?.team || (ev.collab_teams || '').includes(userProfile?.team);

                // 🌟 2. 하이라이트 전용: '협업 부서' 명단에 우리 팀이 확실히 적혀있는 경우만!
                const isMyTeamTagged = !!userProfile?.team && (ev.collab_teams || '').includes(userProfile.team);

                // 🌟 3. 하이라이트 전용: '협업 인원'에 내 이름이 확실히 적혀있는 경우만!
                const isTagged = !!userProfile?.name && (ev.collaborators || '').includes(userProfile.name);

                return {
                    ...ev,
                    _parsedDate: actDate,
                    _parsedTime: actTime,
                    _isMine: isMine,
                    _isSameTeam: isSameTeam,
                    _isMyTeamTagged: isMyTeamTagged, // 👈 새로 추가해서 내보냅니다!
                    _isTagged: isTagged
                };
            }).filter(ev => {
                if (ev._parsedDate < startStr || ev._parsedDate > endStr) return false;
                if (ev.is_private) return false;
                return ev._isMine || ev._isSameTeam || ev._isTagged || userProfile?.role === '관리자';
            });

            setEvents(processedEvents);
        } catch (err) {
            console.error("일정 불러오기 실패:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (userProfile) {
            fetchEvents();
        }
    }, [year, month, userProfile]);

    useEffect(() => {
        const fetchHolidays = async () => {
            const { data } = await supabase
                .from('company_holidays')
                .select('holiday_date');
setHolidays(new Set((data || []).map(h => String(h.holiday_date).trim())));
        };
        fetchHolidays();
    }, []);

    const getEventStyles = (ev) => {
        if (ev.is_important) return 'bg-red-100 text-red-700 border-red-200';
        if (ev.is_private) return 'bg-slate-100 text-slate-700 border-slate-200';
        return 'bg-blue-100 text-blue-700 border-blue-200';
    };

    const handleDayClick = (dayStr) => {
        setSelectedDate(dayStr);
        setEditEvent(null);
        setIsModalOpen(true);
    };

    const handleEventClick = (e, event) => {
        e.stopPropagation();
        setSelectedDate(event.start_date || '');
        setEditEvent({
            id: event.id,
            title: event.title || '',
            startDate: event.start_date || '',
            endDate: event.end_date || event.start_date || '',
            startTime: event.start_time ? event.start_time.substring(0, 5) : '09:00',
            endTime: event.end_time ? event.end_time.substring(0, 5) : '18:00',
            isImportant: event.is_important || false,
            isPrivate: event.is_private || false,
            description: event.description || '',
            collabTeams: event.collab_teams || '',
            collaborators: event.collaborators || '',
            location: event.location || '',
            is_vacation: event.is_vacation === true || event.is_vacation === 'true'
        });
        setIsModalOpen(true);
    };

    const handleDeleteEvent = async (id) => {
        if (!window.confirm("이 일정을 정말 삭제하시겠습니까?")) return;
        try {
            const { error } = await supabase.from('calendar_events').delete().eq('id', id);
            if (error) throw error;
            setEvents(prev => prev.filter(ev => ev.id !== id));
        } catch (err) {
            alert('삭제 실패: ' + err.message);
        }
    };

    const handleSaveEvent = async (eventData) => {
        const payload = {
            creator_name: userProfile?.name || '시스템',
            title: eventData.title,
            start_date: eventData.startDate,
            end_date: eventData.endDate,
            start_time: eventData.startTime ? `${eventData.startTime}:00` : null,
            end_time: eventData.endTime ? `${eventData.endTime}:00` : null,
            is_important: eventData.isImportant ?? false,
            description: eventData.description,
            collab_teams: eventData.collabTeams,
            collaborators: eventData.collaborators,
            location: eventData.location,
            is_private: eventData.isPrivate ?? false,
            is_vacation: eventData.is_vacation ?? false
        };

        try {
            const { error } = eventData.id
                ? await supabase.from('calendar_events').update(payload).eq('id', eventData.id)
                : await supabase.from('calendar_events').insert([payload]);

            if (error) {
                alert(`DB 저장 오류: ${error.message}`);
                return;
            }

            setIsModalOpen(false);
            fetchEvents();
        } catch (err) {
            console.error(err);
        }
    };

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToday = () => setCurrentDate(new Date());

    const CalenderCells = useMemo(() => {
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

    const displayedEvents = events.filter(ev => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        const titleMatch = ev.title?.toLowerCase().includes(query);
        const creatorMatch = ev.creator_name?.toLowerCase().includes(query);
        const collabMatch = ev.collaborators?.toLowerCase().includes(query);
        const locationMatch = ev.location?.toLowerCase().includes(query);
        return titleMatch || creatorMatch || collabMatch || locationMatch;
    });

    const now = new Date();
    const sidebarEvents = displayedEvents
        .filter(ev => ev._parsedDate === listDate)
        .map(ev => {
            const timeToCompare = ev.end_time ? ev.end_time.substring(0, 5) : ev._parsedTime;
            const evDateTime = new Date(`${ev._parsedDate}T${timeToCompare}:00`);
            return { ...ev, _isPast: evDateTime < now };
        })
        .sort((a, b) => {
            if (a._isPast !== b._isPast) return a._isPast ? 1 : -1;
            return a._parsedTime.localeCompare(b._parsedTime);
        });

    const handleBadgeClick = (e, text) => {
        e.stopPropagation();
        setSearchQuery(prev => prev === text ? '' : text);
    };

    return (
        <div className="p-6 bg-slate-50 min-h-[calc(100vh-64px)] slide-up flex flex-col gap-4">

            {/* 상단 헤더 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 px-4 py-2 min-h-[56px] flex flex-col md:flex-row justify-between items-center gap-3 shrink-0 z-20">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-black text-gray-800 tracking-tight">{year}년 {month + 1}월</h2>
                    <div className="flex items-center bg-gray-100 rounded-lg p-0.5 border border-gray-200">
                        <button onClick={prevMonth} className="p-1 hover:bg-white rounded-md text-gray-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg></button>
                        <button onClick={goToday} className="px-3 py-1 text-xs font-bold text-gray-700 hover:bg-white rounded-md">오늘</button>
                        <button onClick={nextMonth} className="p-1 hover:bg-white rounded-md text-gray-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg></button>
                    </div>
                </div>

                <div className="flex gap-4 items-center w-full md:w-auto">
                    <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>긴급</span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>팀 공유</span>
                    </div>

                    <div className="relative flex items-center flex-1 md:flex-none">
                        <input
                            type="text"
                            placeholder="일정명, 참석자, 회의실 검색"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-3 pr-8 py-1.5 border border-gray-300 rounded-lg text-xs font-medium focus:outline-none focus:border-letusBlue w-full md:w-56"
                        />
                        <svg className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 flex-1 w-full">
                {/* 메인 달력 그리드 */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[600px] flex-1 lg:w-[calc(100%-360px)]">
                    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 shrink-0">
                        {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                            <div key={day} className={`py-2.5 text-center text-[11px] font-black ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{day}</div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 flex-1 auto-rows-fr relative">
                        {isLoading && <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10"><div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div></div>}

                        {CalenderCells.map((cell, idx) => {
                            const pad = n => String(n).padStart(2, '0');
                            const dateStr = `${cell.date.getFullYear()}-${pad(cell.date.getMonth() + 1)}-${pad(cell.date.getDate())}`;

                            // 🌟 달력 도트를 그리기 위한 이벤트 정리 (휴가 확실히 제외, 종료 일정 뒤로 밀기)
                            const dayEvents = displayedEvents
                                .filter(e => e._parsedDate === dateStr && e.is_vacation !== true && e.is_vacation !== 'true')
                                .map(e => {
                                    const timeToCompare = e.end_time ? e.end_time.substring(0, 5) : e._parsedTime;
                                    const evDateTime = new Date(`${e._parsedDate}T${timeToCompare}:00`);
                                    return { ...e, _isPast: evDateTime < now };
                                })
                                .sort((a, b) => {
                                    if (a._isPast !== b._isPast) return a._isPast ? 1 : -1; // 종료된 일정을 가장 뒤로 배치
                                    return a._parsedTime.localeCompare(b._parsedTime);
                                });

                            const isToday = dateStr === getLocalDateString(new Date());
                            const isSelectedList = dateStr === listDate;
                            const isHoliday = cell.isCurrentMonth && holidays.has(dateStr);

                            return (
                                <div
                                    key={idx}
                                    onClick={() => setListDate(dateStr)}
                                    className={`border-r border-b border-slate-100 p-1.5 sm:p-2 cursor-pointer flex flex-col h-[80px] sm:h-[100px] overflow-hidden group transition-colors ${isSelectedList ? 'bg-blue-50/60 ring-inset ring-2 ring-blue-200' : cell.isCurrentMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100'}`}
                                >
                                    <div className="flex justify-between items-start shrink-0">
                                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-letusBlue text-white' : !cell.isCurrentMonth ? 'text-gray-300' : (idx % 7 === 0 || isHoliday) ? 'text-red-500' : idx % 7 === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                                            {cell.date.getDate()}
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDayClick(dateStr); }}
                                            className="text-gray-400 hover:text-letusBlue hover:bg-blue-100 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="새 일정 등록"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                        </button>
                                    </div>

                                    <div className="flex flex-wrap gap-2 mt-1.5 px-0.5 content-start flex-1">
                                        {dayEvents.map(event => {
                                            // 🌟 색상 판별 로직
                                            let dotColor = 'bg-blue-400';
                                            let ringColor = 'ring-letusBlue';

                                            if (event.is_important) {
                                                dotColor = 'bg-red-500';
                                                ringColor = 'ring-red-500';
                                            }

                                            // 종료된 일정이면 무조건 회색으로 덮어씌움
                                            if (event._isPast) {
                                                dotColor = 'bg-gray-400';
                                                ringColor = 'ring-gray-400';
                                            }

                                            const isMyEvent = event._isTagged || event._isMyTeamTagged;

                                            return (
                                                <div
                                                    key={event.id}
                                                    className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${dotColor} ${isMyEvent
                                                        ? `opacity-100 ring-[1px] ring-offset-1 ${ringColor}`
                                                        : 'opacity-40'
                                                        }`}
                                                    title={`[${event._parsedTime}] ${event.title}`}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 우측: 일정 상세 LIST */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col w-full lg:w-[360px] shrink-0 h-[600px] lg:h-auto overflow-hidden">
                    <div className="p-3 border-b border-gray-100 bg-gray-50 flex flex-col gap-1 shrink-0 z-20">
                        <div className="flex items-center justify-between min-h-[28px]">
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-3.5 bg-letusBlue rounded-full"></span>
                                <h3 className="font-bold text-gray-800 text-sm leading-none">일정 상세 LIST</h3>
                            </div>

                            <div className="flex items-center gap-2">
                                {(() => {
                                    const vacationers = sidebarEvents.filter(ev => ev.is_vacation === true || ev.is_vacation === 'true');
                                    if (vacationers.length === 0) return null;

                                    return (
                                        <div className="group relative flex items-center">
                                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-orange-50 text-orange-600 border border-orange-100 rounded-full cursor-help shadow-sm transition-colors hover:bg-orange-100">
                                                <span className="text-[10px] font-black leading-none mt-0.5 mb-px">🏖️ 휴가 중 {vacationers.length}명</span>
                                            </div>

                                            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-100 shadow-xl rounded-xl p-3 opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all duration-200 z-50">
                                                <p className="text-[10px] font-black text-gray-400 mb-2 border-b border-gray-50 pb-1">휴가자 현황</p>
                                                <div className="space-y-2">
                                                    {vacationers.map(v => {
                                                        // 🌟 팝오버 시간 칼럼 DB 원본 참조 (start_time, end_time) 
                                                        const sTime = v.start_time ? v.start_time.substring(0, 5) : '00:00';
                                                        const eTime = v.end_time ? v.end_time.substring(0, 5) : '00:00';
                                                        return (
                                                            <div key={v.id} className="flex items-center justify-between">
                                                                <span className="text-xs font-bold text-gray-800">{v.creator_name || '이름 없음'}</span>
                                                                <div className="flex gap-2 items-center">
                                                                    <span className="text-[10px] text-gray-500 font-medium">{sTime}~{eTime}</span>
                                                                    <span className="text-[10px] font-black text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded leading-none">{v.description || '휴가'}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                <span className="bg-blue-100 text-letusBlue text-[10px] font-bold px-2 py-0.5 rounded-full leading-none mt-px">
                                    {sidebarEvents.filter(ev => !(ev.is_vacation === true || ev.is_vacation === 'true')).length}건
                                </span>
                            </div>
                        </div>
                        <div className="text-[11px] font-bold text-gray-500 pl-3 leading-none">{listDate}</div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar relative z-10">
                        {sidebarEvents.filter(ev => !(ev.is_vacation === true || ev.is_vacation === 'true')).map(ev => {
                            const timeStr = ev._parsedTime;
                            const pastClass = ev._isPast ? 'bg-gray-100 border-gray-200 opacity-60 grayscale' : getEventStyles(ev);
                            const textClass = ev._isPast ? 'text-gray-400 line-through' : 'text-gray-800';

                            const canEdit = ev.creator_name === userProfile?.name || ev.collaborators?.includes(userProfile?.name);

                            const peopleList = [];
                            if (ev.collaborators) {
                                peopleList.push(...ev.collaborators.split(',').map(s => s.trim()));
                            }
                            const uniquePeople = [...new Set(peopleList)].filter(Boolean);

                            const isHighlight = (ev._isTagged || ev._isMyTeamTagged) && !ev._isPast;

                            return (
                                <div
                                    key={ev.id}
                                    onClick={() => setExpandedEventId(prev => prev === ev.id ? null : ev.id)}
                                    className={`group px-3 py-2.5 rounded-lg border flex flex-col gap-1 cursor-pointer transition-all duration-200 ${pastClass}`}
                                    style={{
                                        ...(isHighlight ? {
                                            borderColor: '#3b82f6',
                                            boxShadow: '0 0 0 2px white, 0 0 0 4px #3b82f6',
                                            backgroundColor: '#eff6ff'
                                        } : {
                                            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                                        })
                                    }}
                                >
                                    <div className="relative flex items-center gap-2 w-full pr-16">

                                        <div className={`text-[11px] font-black shrink-0 flex items-center gap-1 ${ev._isPast ? 'text-gray-400' : 'text-letusBlue'}`}>
                                            <span>{timeStr}</span>
                                            {ev.end_time && ev.end_time.substring(0, 5) !== timeStr && (
                                                <>
                                                    <span className="font-black">~</span>
                                                    <span>{ev.end_time.substring(0, 5)}</span>
                                                </>
                                            )}
                                        </div>

                                        <div className="w-px h-3.5 bg-gray-300 shrink-0"></div>

                                        <div className="flex items-center gap-1.5 overflow-hidden">
                                            {ev.is_important && !ev._isPast && (
                                                <span className="text-[9px] bg-red-100 text-red-600 px-1 py-0.5 rounded border border-red-200 font-black shrink-0">긴급</span>
                                            )}
                                            <span className={`text-xs font-bold leading-tight truncate ${textClass}`}>
                                                {ev.title}
                                            </span>
                                        </div>

                                        {canEdit && !ev._isPast && (
                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEventClick(e, ev); }}
                                                    className="p-1.5 text-gray-400 hover:text-letusBlue hover:bg-gray-100 rounded-full transition-colors"
                                                    title="수정"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.id); }}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-full transition-colors"
                                                    title="삭제"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {expandedEventId === ev.id && (
                                        <div className="mt-2 pt-2 border-t border-black/5 flex flex-col gap-2 animate-in slide-in-from-top-1 fade-in duration-200">

                                            <div className="flex flex-wrap gap-1.5">
                                                {ev.location && ev.location !== '미사용' && (
                                                    <span
                                                        onClick={(e) => handleBadgeClick(e, ev.location)}
                                                        className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border font-bold shadow-sm transition-colors hover:opacity-80
                                        ${searchQuery === ev.location ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white/70 text-slate-600 border-slate-200'}`}
                                                    >
                                                        📍 {ev.location}
                                                    </span>
                                                )}

                                                {ev.collab_teams && ev.collab_teams.split(',').map((team, tIdx) => {
                                                    const teamName = team.trim();
                                                    return (
                                                        <span
                                                            key={`team-${tIdx}`}
                                                            onClick={(e) => handleBadgeClick(e, teamName)}
                                                            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border font-bold shadow-sm transition-colors hover:opacity-80
                                            ${searchQuery === teamName ? 'bg-slate-600 text-white border-slate-600' : 'bg-slate-100 text-slate-700 border-slate-200'}`}
                                                        >
                                                            🏢 {teamName}
                                                        </span>
                                                    );
                                                })}

                                                {uniquePeople.map((person, idx) => (
                                                    <span
                                                        key={idx}
                                                        onClick={(e) => handleBadgeClick(e, person)}
                                                        className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border font-bold shadow-sm transition-colors hover:opacity-80
                                        ${searchQuery === person ? 'bg-blue-500 text-white border-blue-500' : 'bg-blue-50 text-letusBlue border-blue-100'}`}
                                                    >
                                                        👤 {person}
                                                    </span>
                                                ))}
                                            </div>

                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {sidebarEvents.filter(ev => !(ev.is_vacation === true || ev.is_vacation === 'true')).length === 0 && (
                            <div className="text-center text-xs text-gray-400 py-10 font-bold cursor-default">
                                {searchQuery ? '검색 결과가 없습니다.' : '이 날짜엔 일정이 없습니다.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {
                isModalOpen && (
                    <CalendarEventModal
                        selectedDate={selectedDate}
                        eventToEdit={editEvent}
                        onClose={() => setIsModalOpen(false)}
                        onSave={handleSaveEvent}
                        currentUser={userProfile?.name}
                    />
                )
            }
        </div >
    );
};