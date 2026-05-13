import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon } from './SharedUI.jsx';
import { CalendarEventModal } from './CalendarEventModal.jsx';
import { TodoModal } from './TodoModal.jsx';

// ---------------------------------------------------------
// 🏠 메인 홈 컴포넌트
// ---------------------------------------------------------

// 🌟 추가: 부모로부터 setGlobalFilter를 Props로 받습니다.
const MyDashboard = ({ userProfile, setPage, setGlobalFilter, favorites }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState({
        todoIssues: 0, todoAccidents: 0, doneIssues: 0, doneAccidents: 0
    });
    const [selectedTodoDate, setSelectedTodoDate] = useState(new Date());

    const [widgets, setWidgets] = useState(() => {
        const saved = localStorage.getItem(`letus_widgets_${userProfile?.id}`);
        return saved ? JSON.parse(saved) : ['issue_todo', 'acc_todo', null, null, null, null];
    });

    const [todos, setTodos] = useState([]);
    const [todoDoneLogs, setTodoDoneLogs] = useState({});

    const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
    const [editingTodo, setEditingTodo] = useState(null);

    const [currentDate, setCurrentDate] = useState(new Date());

    const [calendarEvents, setCalendarEvents] = useState([]);
    const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [selectedDateForEvent, setSelectedDateForEvent] = useState('');
    const [dayEventsModalData, setDayEventsModalData] = useState({ isOpen: false, dateStr: '', events: [], todos: [] });

    const [isWidgetModalOpen, setIsWidgetModalOpen] = useState(false);
    const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);

    const MENU_NAMES = {
        dashboard: '대시보드', list: '특이사항 LIST', accident_dashboard: '사고분석 대시보드', accident_list: '사고분석 LIST',
        user_management: '사용자 관리', product_manager: 'ITEM DB 수동 업데이트', support: '지원센터', rpa_management: 'RPA 자동화 관리'
    };

    useEffect(() => { if (userProfile) localStorage.setItem(`letus_widgets_${userProfile.id}`, JSON.stringify(widgets)); }, [widgets, userProfile]);

    useEffect(() => {
        const fetchMyData = async () => {
            if (!userProfile) return;
            setIsLoading(true);
            try {
                const myBrands = userProfile.managed_brands ? userProfile.managed_brands.split(',').map(s => s.trim()) : [];
                const myVendors = userProfile.managed_vendors ? userProfile.managed_vendors.split(',').map(s => s.trim()) : [];

                let issueQuery = supabase.from('logistics_issues').select('id', { count: 'exact' }).in('status', ['조치대기', '처리 중']);
                if (userProfile.role !== '관리자') {
                    if (myBrands.length > 0 && !myBrands.includes('전체')) issueQuery = issueQuery.in('brand', myBrands);
                    if (myVendors.length > 0) issueQuery = issueQuery.in('vendor', myVendors);
                }
                const { count: issueCount } = await issueQuery;

                let accQuery = supabase.from('logistics_accidents').select('id', { count: 'exact' }).eq('status', '원인 파악 중');
                if (userProfile.role !== '관리자' && userProfile.team) accQuery = accQuery.eq('responsible_dept', userProfile.team);
                const { count: accCount } = await accQuery;

                const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
                const { count: doneIssueCount } = await supabase.from('logistics_issues').select('id', { count: 'exact' }).eq('final_handler', userProfile.name).gte('resolved_at', firstDay);
                const { count: doneAccCount } = await supabase.from('logistics_accidents').select('id', { count: 'exact' }).eq('handler_name', userProfile.name).gte('updated_at', firstDay);

                setStats({ todoIssues: issueCount || 0, todoAccidents: accCount || 0, doneIssues: doneIssueCount || 0, doneAccidents: doneAccCount || 0 });

                const { data: eventsData, error: eventsError } = await supabase
                    .from('calendar_events')
                    .select('*')
                    .ilike('collaborators', `%${userProfile.name}%`)
                    .order('start_date', { ascending: true });

                if (!eventsError && eventsData) {
                    const formattedEvents = eventsData.map(ev => ({
                        id: ev.id, title: ev.title, startDate: ev.start_date, endDate: ev.end_date,
                        startTime: ev.start_time ? ev.start_time.substring(0, 5) : '00:00',
                        endTime: ev.end_time ? ev.end_time.substring(0, 5) : '23:30',
                        isImportant: ev.is_important, description: ev.description,
                        collabTeams: ev.collab_teams,
                        collaborators: ev.collaborators,
                        location: ev.location
                    }));
                    setCalendarEvents(formattedEvents);
                }

                const { data: todoData, error: todoError } = await supabase
                    .from('todos')
                    .select('*')
                    .eq('creator_id', userProfile.id)
                    .order('created_at', { ascending: false });

                if (!todoError && todoData) {
                    const formattedTodos = todoData.map(t => ({
                        id: t.id,
                        text: t.text,
                        priority: t.priority,
                        isDone: t.is_done,
                        repeat: t.repeat_days || [],
                        createdAt: (() => {
                            if (!t.created_at) return '';
                            return t.created_at.split('T')[0];
                        })()
                    }));
                    setTodos(formattedTodos);
                }

                const { data: logData, error: logError } = await supabase
                    .from('todo_logs')
                    .select('todo_id, completed_date')
                    .eq('user_id', userProfile.id);

                if (!logError && logData) {
                    const logMap = {};
                    logData.forEach(log => {
                        logMap[`${log.todo_id}_${log.completed_date}`] = true;
                    });
                    setTodoDoneLogs(logMap);
                }

            } catch (err) { console.error(err); } finally { setIsLoading(false); }
        };

        fetchMyData();
    }, [userProfile]);

    const handleSaveTodo = async (savedTodo) => {
        try {
            const pad = n => String(n).padStart(2, '0');
            const targetDateStr = `${selectedTodoDate.getFullYear()}-${pad(selectedTodoDate.getMonth() + 1)}-${pad(selectedTodoDate.getDate())}`;

            const todoPayload = {
                text: savedTodo.text,
                priority: savedTodo.priority,
                repeat_days: savedTodo.repeat,
                is_done: savedTodo.isDone,
                creator_id: userProfile.id,
                created_at: editingTodo ? undefined : `${targetDateStr}T00:00:00`
            };

            if (editingTodo) {
                const { error } = await supabase.from('todos').update(todoPayload).eq('id', savedTodo.id);
                if (error) throw error;
                setTodos(todos.map(t => t.id === savedTodo.id ? { ...savedTodo, createdAt: t.createdAt } : t));
            } else {
                const { data, error } = await supabase.from('todos').insert([todoPayload]).select();
                if (error) throw error;
                if (data && data.length > 0) {
                    setTodos([{ ...savedTodo, id: data[0].id, createdAt: targetDateStr }, ...todos]);
                }
            }
            setIsTodoModalOpen(false);
            setEditingTodo(null);
        } catch (err) { alert('TODO 저장 실패: ' + err.message); }
    };

    const handleDeleteTodo = async (id) => {
        try {
            const { error } = await supabase.from('todos').delete().eq('id', id);
            if (error) throw error;
            setTodos(todos.filter(t => t.id !== id));
        } catch (err) { alert('삭제 실패: ' + err.message); }
    };

    const toggleTodoDone = async (id) => {
        const pad = n => String(n).padStart(2, '0');
        const dateStr = `${selectedTodoDate.getFullYear()}-${pad(selectedTodoDate.getMonth() + 1)}-${pad(selectedTodoDate.getDate())}`;

        const logKey = `${id}_${dateStr}`;
        const isAlreadyDone = !!todoDoneLogs[logKey];

        try {
            if (isAlreadyDone) {
                const { error } = await supabase.from('todo_logs').delete().eq('todo_id', id).eq('completed_date', dateStr);
                if (error) throw error;
                const newLogs = { ...todoDoneLogs };
                delete newLogs[logKey];
                setTodoDoneLogs(newLogs);
            } else {
                const { error } = await supabase.from('todo_logs').insert([{ todo_id: id, completed_date: dateStr, user_id: userProfile.id }]);
                if (error) throw error;
                setTodoDoneLogs({ ...todoDoneLogs, [logKey]: true });
            }
        } catch (err) { alert('상태 변경 실패: ' + err.message); }
    };

    const padDate = n => String(n).padStart(2, '0');
    const selectedDateStr = `${selectedTodoDate.getFullYear()}-${padDate(selectedTodoDate.getMonth() + 1)}-${padDate(selectedTodoDate.getDate())}`;
    const dayOfWeekStrForSelected = ['일', '월', '화', '수', '목', '금', '토'][selectedTodoDate.getDay()];

    const priorityWeight = { '긴급': 0, '1': 1, '2': 2, '3': 3, '4': 4 };

    const filteredTodosForSelected = todos.filter(todo => {
        if (!todo.repeat || todo.repeat.length === 0) return todo.createdAt === selectedDateStr;
        return todo.repeat.includes(dayOfWeekStrForSelected);
    });

    const sortedAndFilteredTodos = [...filteredTodosForSelected].sort((a, b) => {
        const aCompleted = !!todoDoneLogs[`${a.id}_${selectedDateStr}`];
        const bCompleted = !!todoDoneLogs[`${b.id}_${selectedDateStr}`];

        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

        const pA = priorityWeight[a.priority] ?? 4;
        const pB = priorityWeight[b.priority] ?? 4;
        if (pA !== pB) return pA - pB;

        return b.id - a.id;
    });

    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const handleSaveEvent = async (savedEvent) => {
        try {
            const payload = {
                title: savedEvent.title, start_date: savedEvent.startDate, end_date: savedEvent.endDate,
                start_time: savedEvent.startTime, end_time: savedEvent.endTime, is_important: savedEvent.isImportant,
                description: savedEvent.description, collab_teams: savedEvent.collabTeams,
                collaborators: savedEvent.collaborators,
                location: savedEvent.location
            };

            if (editingEvent) {
                const { error } = await supabase.from('calendar_events').update(payload).eq('id', savedEvent.id);
                if (error) throw error;

                setCalendarEvents(calendarEvents.map(ev => ev.id === savedEvent.id ? { ...savedEvent, id: savedEvent.id } : ev));
                alert('✅ 일정이 성공적으로 수정되었습니다.');
            } else {
                payload.creator_name = userProfile.name;
                const { data, error } = await supabase.from('calendar_events').insert([payload]).select();
                if (error) throw error;

                if (data && data.length > 0) {
                    setCalendarEvents([...calendarEvents, { ...savedEvent, id: data[0].id }]);
                    alert('✅ 일정이 캘린더에 성공적으로 등록되었습니다.');
                }
            }

            setIsCalendarModalOpen(false);
            setEditingEvent(null);
        } catch (err) { alert('일정 저장 중 오류 발생: ' + err.message); }
    };

    const handleDeleteEvent = async (id) => {
        if (!confirm('📅 이 일정을 정말 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('calendar_events').delete().eq('id', id);
            if (error) throw error;
            setCalendarEvents(calendarEvents.filter(ev => ev.id !== id));
            setDayEventsModalData(prev => ({ ...prev, events: prev.events.filter(ev => ev.id !== id) }));
        } catch (err) { alert('삭제 실패: ' + err.message); }
    };

    const handleDropEvent = async (e, targetDateStr) => {
        e.preventDefault();
        const eventId = e.dataTransfer.getData('text/plain');
        if (!eventId) return;

        const targetEvent = calendarEvents.find(ev => ev.id.toString() === eventId);
        if (!targetEvent) return;

        const oldStart = new Date(targetEvent.startDate);
        const oldEnd = new Date(targetEvent.endDate);
        const diffTime = Math.abs(oldEnd - oldStart);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const newStart = new Date(targetDateStr);
        const newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + diffDays);

        const pad = n => String(n).padStart(2, '0');
        const newStartDateStr = `${newStart.getFullYear()}-${pad(newStart.getMonth() + 1)}-${pad(newStart.getDate())}`;
        const newEndDateStr = `${newEnd.getFullYear()}-${pad(newEnd.getMonth() + 1)}-${pad(newEnd.getDate())}`;

        try {
            const { error } = await supabase
                .from('calendar_events')
                .update({ start_date: newStartDateStr, end_date: newEndDateStr })
                .eq('id', targetEvent.id);

            if (error) throw error;

            setCalendarEvents(calendarEvents.map(ev =>
                ev.id === targetEvent.id ? { ...ev, startDate: newStartDateStr, endDate: newEndDateStr } : ev
            ));
        } catch (err) { alert('일정 이동 실패: ' + err.message); }
    };

    const openWidgetModal = (index) => { setSelectedSlotIndex(index); setIsWidgetModalOpen(true); };
    const selectWidget = (type) => {
        const newWidgets = [...widgets];
        newWidgets[selectedSlotIndex] = type;
        setWidgets(newWidgets);
        setIsWidgetModalOpen(false);
    };
    const removeWidget = (index) => {
        const newWidgets = [...widgets];
        newWidgets[index] = null;
        setWidgets(newWidgets);
    };

    const availableWidgets = [
        { id: 'issue_todo', title: '입고 이슈 (대기)', icon: '📦', color: 'blue' },
        { id: 'acc_todo', title: '상차 사고 (대기)', icon: '🚚', color: 'orange' },
        { id: 'issue_done', title: '입고 처리 실적', icon: '✅', color: 'green' },
        { id: 'acc_done', title: '상차 마감 실적', icon: '🏆', color: 'purple' },
        { id: 'favorites', title: '⭐ 즐겨찾기', icon: '⭐', color: 'yellow' },
    ];

    const renderWidget = (type, index) => {
        if (!type) {
            return (
                <div onClick={() => openWidgetModal(index)} className="h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-letusBlue hover:bg-blue-50 transition-all group">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-letusBlue group-hover:text-white transition-colors mb-1">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 group-hover:text-letusBlue">위젯 추가</span>
                </div>
            );
        }

        const closeBtn = <button onClick={(e) => { e.stopPropagation(); removeWidget(index); }} className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all z-10"><CloseIcon /></button>;

        if (type === 'favorites') {
            return (
                <div className="h-24 bg-white rounded-xl shadow-sm border border-slate-200 p-3 relative group flex flex-col">
                    {closeBtn}
                    <span className="text-[11px] font-bold text-gray-500 mb-2 block">⭐ 즐겨찾기</span>
                    <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar flex-1">
                        {(!favorites || favorites.length === 0) ? <span className="text-[10px] text-gray-400">등록된 항목 없음</span> : favorites.slice(0, 3).map(favId => (
                            <div key={favId} onClick={() => setPage(favId)} className="text-[10px] font-bold text-gray-700 bg-gray-50 hover:bg-yellow-50 hover:text-yellow-600 px-2 py-1 rounded cursor-pointer truncate transition-colors border border-transparent hover:border-yellow-200 pr-5">
                                {MENU_NAMES[favId] || favId}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // 🌟 수정 포인트: setGlobalFilter를 통해 타겟 페이지에 필터값을 미리 세팅!
        const WIDGET_UI = {
            issue_todo: {
                title: '입고 대기건', count: stats.todoIssues, color: 'blue',
                onClick: () => { if (setGlobalFilter) setGlobalFilter('입고대기'); setPage('list'); }
            },
            acc_todo: {
                title: '사고 대기건', count: stats.todoAccidents, color: 'orange',
                onClick: () => { if (setGlobalFilter) setGlobalFilter('사고대기'); setPage('accident_list'); }
            },
            issue_done: {
                title: '이번달 입고처리', count: stats.doneIssues, color: 'green',
                onClick: () => { if (setGlobalFilter) setGlobalFilter('처리완료'); setPage('list'); }
            },
            acc_done: {
                title: '이번달 사고마감', count: stats.doneAccidents, color: 'purple',
                onClick: () => { if (setGlobalFilter) setGlobalFilter('처리완료'); setPage('accident_list'); }
            },
        };

        const conf = WIDGET_UI[type];
        if (!conf) return null;

        const colorClasses = {
            blue: 'text-blue-600 bg-blue-50 border-blue-100 hover:border-blue-300',
            orange: 'text-orange-600 bg-orange-50 border-orange-100 hover:border-orange-300',
            green: 'text-green-600 bg-green-50 border-green-100 hover:border-green-300',
            purple: 'text-purple-600 bg-purple-50 border-purple-100 hover:border-purple-300'
        };

        return (
            <div className={`h-24 rounded-xl shadow-sm border p-3.5 relative group flex flex-col justify-between cursor-pointer transition-all ${colorClasses[conf.color]}`} onClick={conf.onClick}>
                {closeBtn}
                <span className="text-[11px] font-bold opacity-80">{conf.title}</span>
                <div className="flex items-baseline justify-between mt-auto">
                    <span className="text-3xl font-black leading-none">{conf.count}</span>
                    <span className="text-[10px] font-bold opacity-60">건</span>
                </div>
            </div>
        );
    };

    const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
    const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === currentDate.getFullYear() && today.getMonth() === currentDate.getMonth();

    if (isLoading) return <div className="p-6 h-[calc(100vh-64px)] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full"></div></div>;

    return (
        <div className="p-6 bg-slate-100 min-h-[calc(100vh-64px)] w-full transition-all duration-300 slide-up flex flex-col gap-6 ">

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-6 py-4 md:px-8 md:py-5 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-50 to-transparent rounded-bl-full -mr-10 -mt-10 pointer-events-none"></div>

                <div className="flex flex-col z-10 shrink-0 md:min-w-[280px] w-full md:w-auto">
                    <span className="text-letusBlue font-bold text-xs mb-0.5 block">{userProfile?.team || 'LETUS'} 소속</span>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">반갑습니다, <span className="text-letusOrange">{userProfile?.name}</span> 님! 👋</h2>
                    <p className="text-gray-500 font-medium text-[13px] mt-1">오늘도 성공적인 물류 관리를 응원합니다.</p>
                </div>

                <div className="flex flex-col gap-2 z-10 w-full md:w-1/2 max-w-[500px] ml-auto">
                    <div className="bg-orange-50/80 border border-orange-100 rounded-lg px-4 py-2 flex items-center gap-3">
                        <span className="text-xs font-black text-orange-400 shrink-0">담당 브랜드</span>
                        <span className="text-[11px] font-bold text-gray-800 truncate flex-1" title={userProfile?.managed_brands || '전체 (권한없음)'}>{userProfile?.managed_brands || '전체 (권한없음)'}</span>
                    </div>
                    <div className="bg-blue-50/80 border border-blue-100 rounded-lg px-4 py-2 flex items-center gap-3">
                        <span className="text-xs font-black text-blue-400 shrink-0">담당 업체</span>
                        <span className="text-[11px] font-bold text-gray-800 truncate flex-1" title={userProfile?.managed_vendors || '전체 (권한없음)'}>{userProfile?.managed_vendors || '전체 (권한없음)'}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 shrink-0">
                {widgets.map((type, index) => <React.Fragment key={index}>{renderWidget(type, index)}</React.Fragment>)}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-6 gap-6 flex-1 min-h-[400px]">

                {/* 🔥 TO DO 리스트 구역 */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col h-full relative">
                    <div className="flex justify-between items-center mb-5 shrink-0">
                        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                            📝 {selectedTodoDate.getDate() === new Date().getDate() && selectedTodoDate.getMonth() === new Date().getMonth() ? '오늘' : `${selectedTodoDate.getMonth() + 1}/${selectedTodoDate.getDate()}`}의 TODO
                            {(() => {
                                const remainingCount = sortedAndFilteredTodos.filter(t => !todoDoneLogs[`${t.id}_${selectedDateStr}`]).length;
                                return <span className="bg-blue-50 text-letusBlue text-[10px] px-2 py-0.5 rounded font-black">{remainingCount}개 남음</span>;
                            })()}
                        </h3>
                        <button onClick={() => { setEditingTodo(null); setIsTodoModalOpen(true); }} className="bg-gray-100 hover:bg-letusBlue hover:text-white text-gray-500 w-7 h-7 rounded-full flex items-center justify-center transition-colors shadow-sm">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2.5">
                        {sortedAndFilteredTodos.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                                <span className="text-3xl mb-2">💡</span>
                                <span className="text-[11px] font-bold">이 날짜에 등록된 할 일이 없습니다.</span>
                            </div>
                        ) : (
                            sortedAndFilteredTodos.map(todo => {
                                const isCompleted = !!todoDoneLogs[`${todo.id}_${selectedDateStr}`];

                                return (
                                    <div key={todo.id} className={`flex flex-col p-3 rounded-lg border transition-all ${isCompleted ? 'bg-gray-50 border-gray-100 opacity-70' : 'bg-white border-gray-200 hover:border-letusBlue/50 hover:shadow-sm'}`}>
                                        <div className="flex items-start gap-3">
                                            <input
                                                type="checkbox"
                                                checked={isCompleted}
                                                onChange={() => toggleTodoDone(todo.id)}
                                                className="w-4 h-4 accent-letusBlue shrink-0 mt-0.5 cursor-pointer"
                                            />
                                            <div className="flex-1 overflow-hidden cursor-pointer" onClick={() => { setEditingTodo(todo); setIsTodoModalOpen(true); }}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    {todo.priority === '긴급' ? <span className="bg-red-100 text-red-600 text-[9px] font-black px-1.5 py-0.5 rounded-sm">긴급</span> :
                                                        todo.priority !== '4' ? <span className="bg-orange-50 text-orange-500 text-[9px] font-bold px-1.5 py-0.5 rounded-sm border border-orange-100">{todo.priority}순위</span> : null}
                                                    <span className={`text-[13px] font-bold truncate block ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{todo.text}</span>
                                                </div>
                                                {todo.repeat && todo.repeat.length > 0 && (
                                                    <div className="flex items-center gap-1 mt-1.5">
                                                        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                        <span className="text-[10px] text-gray-500 font-medium">매주 {todo.repeat.join(', ')}요일</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 🔥 달력 구역 */}
                <div className="lg:col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col h-full relative">
                    <div className="flex justify-between items-center mb-5 shrink-0">
                        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">📅 업무 캘린더</h3>
                        <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1">
                            <button onClick={prevMonth} className="p-1 text-gray-500 hover:text-letusBlue transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg></button>
                            <span className="text-xs font-bold text-gray-700 min-w-[70px] text-center">{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</span>
                            <button onClick={nextMonth} className="p-1 text-gray-500 hover:text-letusBlue transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg></button>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col border border-gray-100 rounded-lg overflow-hidden bg-gray-50/30">
                        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-100/50 shrink-0">
                            {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
                                <div key={day} className={`py-2 text-center text-[12px] font-black ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{day}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 flex-1 auto-rows-fr bg-white">
                            {blanks.map(b => <div key={`b-${b}`} className="border-r border-b border-gray-100 bg-gray-50/50 min-h-[60px]"></div>)}

                            {days.map(day => {
                                const isToday = isCurrentMonth && day === today.getDate();
                                const pad = n => String(n).padStart(2, '0');
                                const dateStr = `${currentDate.getFullYear()}-${pad(currentDate.getMonth() + 1)}-${pad(day)}`;
                                const dayOfWeekStr = ['일', '월', '화', '수', '목', '금', '토'][new Date(currentDate.getFullYear(), currentDate.getMonth(), day).getDay()];

                                const dayEvents = calendarEvents.filter(e => dateStr >= e.startDate && dateStr <= e.endDate);

                                const dayTodos = todos.filter(t => {
                                    if (!t.repeat || t.repeat.length === 0) return t.createdAt === dateStr;
                                    return t.repeat.includes(dayOfWeekStr);
                                });

                                return (
                                    <div
                                        key={day}
                                        onClick={() => setSelectedTodoDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => {
                                            const pad = n => String(n).padStart(2, '0');
                                            const targetDateStr = `${currentDate.getFullYear()}-${pad(currentDate.getMonth() + 1)}-${pad(day)}`;
                                            handleDropEvent(e, targetDateStr);
                                        }}
                                        className={`border-r border-b border-gray-100 p-1.5 flex flex-col relative group transition-colors hover:bg-blue-50/30 min-h-[60px] cursor-pointer ${selectedTodoDate.getDate() === day && selectedTodoDate.getMonth() === currentDate.getMonth() && selectedTodoDate.getFullYear() === currentDate.getFullYear()
                                            ? 'ring-2 ring-inset ring-letusBlue bg-blue-50/10'
                                            : ''
                                            }`}
                                    >
                                        <span className={`text-[13px] font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-letusBlue text-white shadow-sm' : 'text-gray-600'}`}>
                                            {day}
                                        </span>

                                        {dayTodos.length > 0 && (
                                            <div className="flex gap-1 mb-1 px-1 mt-0.5">
                                                {dayTodos.slice(0, 5).map((t, i) => {
                                                    const isCompleted = !!todoDoneLogs[`${t.id}_${dateStr}`];
                                                    return (
                                                        <div key={`dot-${i}`} className={`w-1.5 h-1.5 rounded-full transition-colors ${isCompleted ? 'bg-green-500 shadow-sm' : 'bg-slate-300'}`}></div>
                                                    );
                                                })}
                                                {dayTodos.length > 5 && <span className="text-[10px] font-bold text-gray-400 leading-[6px] ml-0.5">+</span>}
                                            </div>
                                        )}

                                        <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                                            {dayEvents.slice(0, 2).map((ev, idx) => (
                                                <div
                                                    key={`ev-${idx}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDayEventsModalData({ isOpen: true, dateStr, events: dayEvents, todos: dayTodos });
                                                    }}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.stopPropagation();
                                                        e.dataTransfer.setData('text/plain', ev.id.toString());
                                                    }}
                                                    className={`text-[11px] truncate px-1.5 py-0.5 rounded font-bold border cursor-grab active:cursor-grabbing ${ev.isImportant ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'}`}
                                                    title={`${ev.startTime} ~ ${ev.endTime} | ${ev.title}`}
                                                >
                                                    {ev.title}
                                                </div>
                                            ))}

                                            {(dayEvents.length > 2) && (
                                                <div
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDayEventsModalData({ isOpen: true, dateStr, events: dayEvents, todos: dayTodos });
                                                    }}
                                                    className="text-[11px] font-bold text-gray-500 mt-0.5 text-center bg-gray-100 border border-gray-200 rounded py-0.5 cursor-pointer hover:bg-gray-200 transition-colors"
                                                >
                                                    +{dayEvents.length - 2} 더보기
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedDateForEvent(dateStr);
                                                setIsCalendarModalOpen(true);
                                            }}
                                            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-letusBlue bg-white rounded-full p-0.5"
                                            title="일정 추가"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

            </div>

            {/* 모달 연동들 */}
            {isWidgetModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsWidgetModalOpen(false)}></div>
                    <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-sm slide-up border border-gray-100 overflow-hidden flex flex-col">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-sm text-gray-800">위젯 선택</h3>
                            <button onClick={() => setIsWidgetModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><CloseIcon /></button>
                        </div>
                        <div className="p-4 flex flex-col gap-2">
                            {availableWidgets.map(w => {
                                const isAdded = widgets.includes(w.id);
                                return (
                                    <button key={w.id} onClick={() => !isAdded && selectWidget(w.id)} disabled={isAdded} className={`flex items-center p-3 rounded-lg border text-left transition-colors ${isAdded ? 'bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed' : 'bg-white border-gray-200 hover:border-letusBlue hover:bg-blue-50 cursor-pointer'}`}>
                                        <span className="text-2xl mr-3">{w.icon}</span>
                                        <div className="flex-1">
                                            <span className="text-[13px] font-bold text-gray-800 block">{w.title}</span>
                                            <span className="text-[10px] text-gray-500">{isAdded ? '이미 추가된 위젯입니다' : '클릭하여 추가하기'}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {isTodoModalOpen && (
                <TodoModal
                    todo={editingTodo}
                    onClose={() => { setIsTodoModalOpen(false); setEditingTodo(null); }}
                    onSave={handleSaveTodo}
                    onDelete={handleDeleteTodo}
                />
            )}

            {/* 🌟 수정 포인트: 하위 컴포넌트에 currentUser 넘기기 */}
            {isCalendarModalOpen && (
                <CalendarEventModal
                    selectedDate={selectedDateForEvent}
                    eventToEdit={editingEvent}
                    onClose={() => { setIsCalendarModalOpen(false); setEditingEvent(null); }}
                    onSave={handleSaveEvent}
                    currentUser={userProfile?.name} // 👈 '본인 참석' 체크박스를 위해 필수!
                />
            )}

            {dayEventsModalData.isOpen && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setDayEventsModalData({ isOpen: false, dateStr: '', events: [], todos: [] })}></div>
                    <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-sm slide-up border border-gray-100 overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-base text-gray-800 flex items-center gap-2">
                                <span className="w-1.5 h-4 bg-letusBlue rounded-full"></span>
                                {dayEventsModalData.dateStr} 일정 상세
                            </h3>
                            <button onClick={() => setDayEventsModalData({ isOpen: false, dateStr: '', events: [], todos: [] })} className="p-1 text-gray-400 hover:text-gray-600"><CloseIcon /></button>
                        </div>

                        <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                            {dayEventsModalData.events.length === 0 && dayEventsModalData.todos.length === 0 && (
                                <div className="text-center text-sm text-gray-400 py-4">등록된 일정이 없습니다.</div>
                            )}

                            {dayEventsModalData.events.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <h4 className="text-sm font-black text-gray-500 border-b pb-1 mb-1">📅 등록된 일정</h4>
                                    {dayEventsModalData.events.map(ev => (
                                        <div key={ev.id} className={`p-3 rounded-lg border flex flex-col gap-1 relative group ${ev.isImportant ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
                                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all bg-white/80 backdrop-blur-sm rounded p-0.5 shadow-sm">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingEvent(ev);
                                                        setDayEventsModalData({ isOpen: false, dateStr: '', events: [], todos: [] });
                                                        setIsCalendarModalOpen(true);
                                                    }}
                                                    className="p-1 text-gray-400 hover:text-letusBlue transition-colors"
                                                    title="일정 수정"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>

                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.id); }}
                                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                                    title="일정 삭제"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <span className={`text-xs font-black px-1.5 py-0.5 rounded ${ev.isImportant ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-letusBlue'}`}>
                                                    {ev.startTime} ~ {ev.endTime}
                                                </span>
                                                <div className="flex gap-2">
                                                    {ev.collabTeams && <span className="text-[11px] text-gray-500 font-bold truncate max-w-[80px]">팀: {ev.collabTeams}</span>}
                                                    {ev.collaborators && <span className="text-[11px] text-green-600 font-bold truncate max-w-[100px]">👤 {ev.collaborators}</span>}
                                                </div>
                                            </div>
                                            <span className="text-sm font-bold text-gray-800 mt-1 pr-6">{ev.title}</span>
                                            {ev.description && <span className="text-xs text-gray-600 mt-0.5">{ev.description}</span>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {dayEventsModalData.todos.length > 0 && (
                                <div className="flex flex-col gap-2 mt-2">
                                    <h4 className="text-sm font-black text-gray-500 border-b pb-1 mb-1">📝 해당 일자 TODO</h4>
                                    {dayEventsModalData.todos.map(todo => {
                                        const pad = n => String(n).padStart(2, '0');
                                        const dateStr = `${selectedTodoDate.getFullYear()}-${pad(selectedTodoDate.getMonth() + 1)}-${pad(selectedTodoDate.getDate())}`;
                                        const isCompleted = !!todoDoneLogs[`${todo.id}_${dateStr}`];
                                        return (
                                            <div key={todo.id} className={`p-2.5 rounded-lg border flex items-center gap-2 ${isCompleted ? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-gray-50 border-gray-200'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={isCompleted}
                                                    onChange={() => toggleTodoDone(todo.id)}
                                                    className="w-4 h-4 accent-letusBlue shrink-0 cursor-pointer"
                                                />
                                                <span className={`text-sm font-bold ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{todo.text}</span>
                                                {todo.priority === '긴급' && <span className="ml-auto bg-red-100 text-red-600 text-[11px] font-black px-1.5 py-0.5 rounded-sm">긴급</span>}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export { TodoModal };
export { MyDashboard };