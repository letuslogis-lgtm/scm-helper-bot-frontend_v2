// 📄 CalendarEventModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon } from './SharedUI.jsx';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const computeOccurrences = (startDate, endDate, repeatDays, repeatEndDate) => {
    const selectedNums = new Set(repeatDays.map(d => DAY_LABELS.indexOf(d)));
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = repeatEndDate.split('-').map(Number);
    const [oey, oem, oed] = endDate.split('-').map(Number);

    const firstStart = new Date(sy, sm - 1, sd);
    const firstEnd = new Date(oey, oem - 1, oed);
    const durationDays = Math.round((firstEnd - firstStart) / (1000 * 60 * 60 * 24));

    const repeatEnd = new Date(ey, em - 1, ed);
    const pad = n => String(n).padStart(2, '0');
    const results = [];
    const cursor = new Date(sy, sm - 1, sd);

    while (cursor <= repeatEnd && results.length < 200) {
        if (selectedNums.has(cursor.getDay())) {
            const occStartStr = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
            const occEndDate = new Date(cursor);
            occEndDate.setDate(occEndDate.getDate() + durationDays);
            const occEndStr = `${occEndDate.getFullYear()}-${pad(occEndDate.getMonth() + 1)}-${pad(occEndDate.getDate())}`;
            results.push({ startDate: occStartStr, endDate: occEndStr });
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return results;
};

export const CalendarEventModal = ({ selectedDate, eventToEdit, onClose, onSave, currentUser }) => {
    const [startDate, setStartDate] = useState(eventToEdit ? eventToEdit.startDate : selectedDate || '');
    const [endDate, setEndDate] = useState(eventToEdit ? eventToEdit.endDate : selectedDate || '');
    const [startTime, setStartTime] = useState(eventToEdit ? eventToEdit.startTime : '08:30');
    const [endTime, setEndTime] = useState(eventToEdit ? eventToEdit.endTime : '17:30');
    const [title, setTitle] = useState(eventToEdit ? eventToEdit.title : '');
    const [isImportant, setIsImportant] = useState(eventToEdit ? eventToEdit.isImportant : false);
    const [description, setDescription] = useState(eventToEdit ? eventToEdit.description : '');
    const [location, setLocation] = useState(eventToEdit ? eventToEdit.location : '미사용');
    const [collabTeams, setCollabTeams] = useState(eventToEdit ? eventToEdit.collabTeams : '');
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [collaborators, setCollaborators] = useState(eventToEdit ? eventToEdit.collaborators : '');
    const [isAttending, setIsAttending] = useState(() => {
        if (eventToEdit) return (eventToEdit.collaborators || '').includes(currentUser);
        return true;
    });
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [isVacation, setIsVacation] = useState(eventToEdit?.is_vacation || false);

    // 반복 일정
    const [isRecurring, setIsRecurring] = useState(false);
    const [repeatDays, setRepeatDays] = useState([]);
    const [repeatEndDate, setRepeatEndDate] = useState('');

    const locationOptions = ['미사용', 'fursys Office', 'iloom office', 'sidiz office', 'letus office', '바로스 회의실', '바로스 관제실'];

    const timeOptions = useMemo(() => {
        const opts = [];
        for (let i = 0; i < 24; i++) {
            const h = i.toString().padStart(2, '0');
            opts.push(`${h}:00`);
            opts.push(`${h}:30`);
        }
        return opts;
    }, []);

    const toggleRepeatDay = (day) => {
        setRepeatDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
    };

    const toggleRecurring = () => {
        setIsRecurring(p => !p);
        setRepeatDays([]);
        setRepeatEndDate('');
    };

    const occurrenceCount = useMemo(() => {
        if (!isRecurring || repeatDays.length === 0 || !repeatEndDate || !startDate || !endDate) return 0;
        if (repeatEndDate < startDate) return 0;
        try { return computeOccurrences(startDate, endDate, repeatDays, repeatEndDate).length; } catch { return 0; }
    }, [isRecurring, repeatDays, repeatEndDate, startDate, endDate]);

    const handleSave = (eventType) => {
        if (!startDate || !endDate || !title.trim()) return alert('날짜와 일정명을 필수로 입력해 주세요.');
        if (startDate > endDate) return alert('종료일이 시작일보다 빠를 수 없습니다.');

        let finalDescription = description;
        if (isVacation) {
            const sTime = startTime || '08:30';
            const eTime = endTime || '17:30';
            if (sTime <= '08:30' && eTime >= '17:30') finalDescription = '연차';
            else if (sTime <= '08:30' && eTime <= '12:30') finalDescription = '오전반차';
            else if (sTime >= '13:30' && eTime >= '17:30') finalDescription = '오후반차';
            else finalDescription = '반반차';
        }

        let finalCollaboratorsList = collaborators ? collaborators.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (isAttending && currentUser) {
            if (!finalCollaboratorsList.includes(currentUser)) finalCollaboratorsList.push(currentUser);
        } else if (!isAttending && currentUser) {
            finalCollaboratorsList = finalCollaboratorsList.filter(u => u !== currentUser);
        }
        const finalCollaboratorsStr = finalCollaboratorsList.join(', ');

        const baseEvent = {
            startTime, endTime,
            title: title.trim(),
            isImportant,
            is_vacation: isVacation,
            is_personal: eventType !== '팀',
            description: finalDescription,
            collabTeams,
            collaborators: finalCollaboratorsStr,
            location,
            type: eventType,
        };

        if (!eventToEdit && isRecurring) {
            if (repeatDays.length === 0) return alert('반복 요일을 하나 이상 선택해 주세요.');
            if (!repeatEndDate) return alert('반복 종료일을 입력해 주세요.');
            if (repeatEndDate < startDate) return alert('반복 종료일이 시작일보다 빠를 수 없습니다.');
            const occurrences = computeOccurrences(startDate, endDate, repeatDays, repeatEndDate);
            if (occurrences.length === 0) return alert('선택한 요일에 해당하는 날짜가 없습니다. 시작일과 반복 요일을 확인해 주세요.');
            onSave(occurrences.map(({ startDate: sd, endDate: ed }) => ({ ...baseEvent, startDate: sd, endDate: ed, id: null })));
        } else {
            onSave({ ...baseEvent, id: eventToEdit ? eventToEdit.id : null, startDate, endDate });
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-md slide-up border border-gray-100 overflow-hidden flex flex-col">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full"></span>
                        {eventToEdit ? '일정 수정' : '새로운 일정 등록'}
                    </h3>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><CloseIcon /></button>
                </div>

                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {/* 날짜 */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-700">
                                {!eventToEdit && isRecurring ? '첫 번째 일정일' : '시작일'} <span className="text-red-500">*</span>
                            </label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-letusBlue" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-700">종료일 <span className="text-red-500">*</span></label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-letusBlue" />
                        </div>
                    </div>

                    {/* 시간 */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-700">시작 시간</label>
                            <select value={startTime} onChange={e => setStartTime(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-letusBlue cursor-pointer bg-white font-medium">
                                {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-700">종료 시간</label>
                            <select value={endTime} onChange={e => setEndTime(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-letusBlue cursor-pointer bg-white font-medium">
                                {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* 일정명 */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-end">
                            <label className="text-xs font-bold text-gray-700">일정명 <span className="text-red-500">*</span></label>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-orange-500 hover:bg-orange-50 px-2 py-0.5 rounded transition-colors border border-transparent hover:border-orange-200">
                                    <input type="checkbox" checked={isVacation} onChange={(e) => setIsVacation(e.target.checked)} className="w-3.5 h-3.5 accent-orange-500" />
                                    🏖️ 휴가
                                </label>
                                <div className="w-px h-3 bg-gray-200"></div>
                                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-red-500 hover:bg-red-50 px-2 py-0.5 rounded transition-colors border border-transparent hover:border-red-200">
                                    <input type="checkbox" checked={isImportant} onChange={e => setIsImportant(e.target.checked)} className="w-3.5 h-3.5 accent-red-500" />
                                    🚨 중요(긴급)
                                </label>
                            </div>
                        </div>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="일정 제목을 입력하세요"
                            className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-letusBlue w-full"
                        />
                    </div>

                    {/* 반복 일정 (신규 등록 시에만 표시) */}
                    {!eventToEdit && (
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={toggleRecurring}
                                className={`flex items-center gap-2 w-fit text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${isRecurring ? 'text-violet-600 bg-violet-50 border-violet-300' : 'text-gray-500 bg-gray-50 border-gray-200 hover:border-gray-300'}`}
                            >
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                반복 일정
                                <span className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${isRecurring ? 'bg-violet-500' : 'bg-gray-300'}`}>
                                    <span className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform duration-200 ${isRecurring ? 'translate-x-4' : 'translate-x-0'}`}></span>
                                </span>
                            </button>

                            {isRecurring && (
                                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex flex-col gap-3">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[11px] font-bold text-violet-700">반복 요일</label>
                                        <div className="flex gap-1.5">
                                            {DAY_LABELS.map((day, i) => (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    onClick={() => toggleRepeatDay(day)}
                                                    className={`w-9 h-9 rounded-full text-xs font-bold border transition-all ${
                                                        repeatDays.includes(day)
                                                            ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                                                            : i === 0
                                                                ? 'text-red-500 border-red-200 bg-white hover:bg-red-50'
                                                                : i === 6
                                                                    ? 'text-blue-500 border-blue-200 bg-white hover:bg-blue-50'
                                                                    : 'text-gray-600 border-gray-200 bg-white hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {day}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[11px] font-bold text-violet-700">반복 종료일</label>
                                        <input
                                            type="date"
                                            value={repeatEndDate}
                                            min={startDate}
                                            onChange={e => setRepeatEndDate(e.target.value)}
                                            className="border border-violet-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-violet-500 bg-white"
                                        />
                                    </div>
                                    {occurrenceCount > 0 && (
                                        <div className="flex items-center gap-2 bg-white border border-violet-200 rounded-lg px-3 py-2">
                                            <span className="text-violet-500 font-black text-lg leading-none">{occurrenceCount}</span>
                                            <span className="text-xs font-bold text-gray-600">개 일정이 생성됩니다</span>
                                            {occurrenceCount >= 200 && (
                                                <span className="text-[10px] font-bold text-orange-500 ml-auto">최대 200개 제한</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {!isVacation && (
                        <div className="space-y-4">
                            {/* 회의실 선택 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">회의실 선택</label>
                                <select value={location} onChange={e => setLocation(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-letusBlue bg-white cursor-pointer w-full font-medium">
                                    {locationOptions.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                </select>
                            </div>

                            {/* 부서 추가 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">협업 부서 추가</label>
                                <div className="min-h-[42px] border border-gray-300 rounded-lg bg-gray-50 px-3 py-2 flex items-center justify-between">
                                    <div className="flex flex-wrap gap-1.5">
                                        {collabTeams ? collabTeams.split(',').map((team, i) => (
                                            <span key={i} className="bg-blue-100 text-letusBlue border border-blue-200 px-2 py-0.5 rounded-full text-[10px] font-bold">{team.trim()}</span>
                                        )) : <span className="text-xs text-gray-400 font-medium">선택된 부서 없음</span>}
                                    </div>
                                    <button onClick={() => setIsTeamModalOpen(true)} className="text-[10px] font-bold text-white bg-slate-700 hover:bg-slate-800 px-2.5 py-1.5 rounded transition-colors shrink-0 shadow-sm">부서 검색</button>
                                </div>
                            </div>

                            {/* 인원 추가 */}
                            <div className="flex flex-col gap-1.5">
                                <div className="flex justify-between items-end">
                                    <label className="text-xs font-bold text-gray-700">협업 인원 추가 (태그)</label>
                                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-letusBlue hover:bg-blue-50 px-2 py-0.5 rounded transition-colors">
                                        <input type="checkbox" checked={isAttending} onChange={e => setIsAttending(e.target.checked)} className="w-3.5 h-3.5 accent-letusBlue" />
                                        🙋‍♂️ 본인 참석
                                    </label>
                                </div>
                                <div className="min-h-[42px] border border-gray-300 rounded-lg bg-green-50/30 px-3 py-2 flex items-center justify-between hover:border-green-300 transition-colors">
                                    <div className="flex flex-wrap gap-1.5">
                                        {collaborators ? collaborators.split(',').map((user, i) => (
                                            <span key={i} className="bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm">👤 {user.trim()}</span>
                                        )) : <span className="text-xs text-gray-400 font-medium">선택된 인원 없음</span>}
                                    </div>
                                    <button onClick={() => setIsUserModalOpen(true)} className="text-[10px] font-bold text-white bg-green-600 hover:bg-green-700 px-2.5 py-1.5 rounded transition-colors shrink-0 shadow-sm">인원 검색</button>
                                </div>
                            </div>

                            {/* 상세 내용 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">상세 내용</label>
                                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="회의 안건, 장소 등 세부사항을 입력하세요." className="border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-letusBlue resize-none w-full"></textarea>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 shadow-sm">취소</button>

                    {eventToEdit ? (
                        <button onClick={() => handleSave(eventToEdit.type || '팀')} className="px-6 py-2 bg-letusBlue text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-600">
                            일정 수정
                        </button>
                    ) : (
                        <>
                            <button onClick={() => handleSave('개인')} className="px-5 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-emerald-600 transition-colors">
                                개인 일정 등록
                            </button>
                            <button onClick={() => handleSave('팀')} className="px-5 py-2 bg-letusBlue text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-600 transition-colors">
                                팀 일정 등록
                            </button>
                        </>
                    )}
                </div>
            </div>

            {isTeamModalOpen && (
                <TeamSearchModal initialTeams={collabTeams} onApply={setCollabTeams} onClose={() => setIsTeamModalOpen(false)} />
            )}

            {isUserModalOpen && (
                <UserSearchModal initialUsers={collaborators} onApply={setCollaborators} onClose={() => setIsUserModalOpen(false)} />
            )}
        </div>
    );
};

// --- 서브 모달들 ---
const TeamSearchModal = ({ initialTeams, onApply, onClose }) => {
    const [query, setQuery] = useState('');
    const [teamList, setTeamList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [checkedTeams, setCheckedTeams] = useState(() => {
        if (!initialTeams) return [];
        return initialTeams.split(',').map(s => s.trim()).filter(Boolean);
    });

    useEffect(() => {
        const fetchTeams = async () => {
            setIsLoading(true);
            try {
                let dbQuery = supabase.from('profiles').select('team');
                if (query.trim()) {
                    dbQuery = dbQuery.ilike('team', `%${query.trim()}%`);
                } else {
                    dbQuery = dbQuery.limit(50);
                }
                const { data, error } = await dbQuery;
                if (error) throw error;
                const uniqueTeams = [...new Set(data.map(d => d.team).filter(Boolean))].sort();

                // 기존 체킹된 항목은 목록 최상단에 유지
                const finalTeams = [...new Set([...checkedTeams, ...uniqueTeams])];
                setTeamList(finalTeams);
            } catch (err) { console.error(err); } finally { setIsLoading(false); }
        };

        const timer = setTimeout(() => fetchTeams(), 300);
        return () => clearTimeout(timer);
    }, [query]);

    const toggleTeam = (team) => setCheckedTeams(prev => prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[250] backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col slide-up h-[500px]">
                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
                    <h4 className="text-sm font-bold text-gray-800 flex items-center"><span className="w-1.5 h-3.5 bg-letusBlue rounded-full mr-2"></span>협업부서 선택</h4>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
                </div>
                <div className="px-4 py-3 border-b border-gray-100 bg-slate-50">
                    <div className="relative">
                        <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="부서명 검색..." className="w-full pl-3 pr-3 py-2 text-xs border border-gray-200 rounded-[4px] focus:outline-none focus:border-letusBlue bg-white" autoFocus />
                    </div>
                </div>
                <div className="overflow-y-auto flex-1">
                    {isLoading ? <div className="py-10 text-center text-xs text-gray-400">로딩 중...</div> : (
                        <div className="divide-y divide-gray-100">
                            {teamList.map(team => (
                                <div key={team} className={`flex items-center gap-3 px-5 py-3 cursor-pointer ${checkedTeams.includes(team) ? 'bg-blue-50' : 'hover:bg-gray-50'}`} onClick={() => toggleTeam(team)}>
                                    <input type="checkbox" readOnly checked={checkedTeams.includes(team)} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                    <span className="text-xs font-bold text-gray-700">{team}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-white flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-500 text-[11px] font-bold rounded-[3px] hover:bg-gray-50">취소</button>
                    <button onClick={() => { onApply(checkedTeams.join(', ')); onClose(); }} className="px-5 py-2 bg-letusBlue text-white text-[11px] font-bold rounded-[3px] hover:bg-blue-600">적용하기</button>
                </div>
            </div>
        </div>
    );
};

const UserSearchModal = ({ initialUsers, onApply, onClose }) => {
    const [query, setQuery] = useState('');
    const [userList, setUserList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [checkedUsers, setCheckedUsers] = useState(() => {
        if (!initialUsers) return [];
        return initialUsers.split(',').map(s => s.trim()).filter(Boolean);
    });

    useEffect(() => {
        const fetchUsers = async () => {
            setIsLoading(true);
            try {
                let dbQuery = supabase.from('profiles').select('name');
                if (query.trim()) {
                    dbQuery = dbQuery.ilike('name', `%${query.trim()}%`);
                } else {
                    dbQuery = dbQuery.limit(50);
                }
                const { data, error } = await dbQuery;
                if (error) throw error;
                const uniqueUsers = [...new Set(data.map(d => d.name).filter(Boolean))].sort();

                const finalUsers = [...new Set([...checkedUsers, ...uniqueUsers])];
                setUserList(finalUsers);
            } catch (err) { console.error(err); } finally { setIsLoading(false); }
        };

        const timer = setTimeout(() => fetchUsers(), 300);
        return () => clearTimeout(timer);
    }, [query]);

    const toggleUser = (user) => setCheckedUsers(prev => prev.includes(user) ? prev.filter(u => u !== user) : [...prev, user]);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[250] backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col slide-up h-[500px]">
                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
                    <h4 className="text-sm font-bold text-gray-800 flex items-center"><span className="w-1.5 h-3.5 bg-green-500 rounded-full mr-2"></span>협업 인원 선택</h4>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
                </div>
                <div className="px-4 py-3 border-b border-gray-100 bg-slate-50">
                    <div className="relative">
                        <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="이름 검색..." className="w-full pl-3 pr-3 py-2 text-xs border border-gray-200 rounded-[4px] focus:outline-none focus:border-green-500 bg-white" autoFocus />
                    </div>
                </div>
                <div className="overflow-y-auto flex-1">
                    {isLoading ? <div className="py-10 text-center text-xs text-gray-400">로딩 중...</div> : (
                        <div className="divide-y divide-gray-100">
                            {userList.map(user => (
                                <div key={user} className={`flex items-center gap-3 px-5 py-3 cursor-pointer ${checkedUsers.includes(user) ? 'bg-green-50' : 'hover:bg-gray-50'}`} onClick={() => toggleUser(user)}>
                                    <input type="checkbox" readOnly checked={checkedUsers.includes(user)} className="w-4 h-4 accent-green-500 cursor-pointer" />
                                    <span className="text-xs font-bold text-gray-700">{user}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-white flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-500 text-[11px] font-bold rounded-[3px] hover:bg-gray-50">취소</button>
                    <button onClick={() => { onApply(checkedUsers.join(', ')); onClose(); }} className="px-5 py-2 bg-green-500 text-white text-[11px] font-bold rounded-[3px] hover:bg-green-600">적용하기</button>
                </div>
            </div>
        </div>
    );
};
