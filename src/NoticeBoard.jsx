import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon } from './SharedUI.jsx';

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

                const finalTeams = [...new Set([...checkedTeams, ...uniqueTeams])];
                setTeamList(finalTeams);
            } catch (err) { console.error(err); } finally { setIsLoading(false); }
        };

        const timer = setTimeout(() => fetchTeams(), 300);
        return () => clearTimeout(timer);
    }, [query]);

    const toggleTeam = (team) => setCheckedTeams(prev => prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]);

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[250] backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col slide-up h-[500px]">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white">
                    <h4 className="text-sm font-bold text-gray-800 flex items-center"><span className="w-1.5 h-3.5 bg-letusBlue rounded-full mr-2"></span>태그 부서 선택</h4>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1"><CloseIcon /></button>
                </div>
                <div className="px-5 py-3 border-b border-gray-100 bg-slate-50">
                    <div className="relative">
                        <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="부서명 검색..." className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-[4px] focus:outline-none focus:border-letusBlue bg-white transition-all" autoFocus />
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
                <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-[9px] border border-gray-300 text-gray-600 text-[11px] font-bold rounded-[3px] hover:bg-gray-50 transition-colors">취소</button>
                    <button onClick={() => { onApply(checkedTeams.join(', ')); onClose(); }} className="px-5 py-[9px] bg-letusBlue text-white text-[11px] font-bold rounded-[3px] hover:bg-blue-600 transition-colors">적용하기</button>
                </div>
            </div>
        </div>
    );
};

const NoticeEditModal = ({ eventToEdit, onClose, onSave }) => {
    const [title, setTitle] = useState(eventToEdit ? eventToEdit.title : '');
    const [content, setContent] = useState(eventToEdit ? eventToEdit.content : '');
    const [isImportant, setIsImportant] = useState(eventToEdit ? eventToEdit.is_important : false);
    const [tags, setTags] = useState(eventToEdit ? eventToEdit.tags : '');
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

    const [hasPoll, setHasPoll] = useState(eventToEdit?.poll ? true : false);
    const [pollQuestion, setPollQuestion] = useState(eventToEdit?.poll?.question || '');
    const [pollOptions, setPollOptions] = useState(eventToEdit?.poll?.options?.join(', ') || '');
    const [isMultiplePoll, setIsMultiplePoll] = useState(eventToEdit?.poll?.is_multiple ? true : false);

    const handleSave = () => {
        if (!title.trim() || !content.trim()) {
            return alert('제목과 내용을 입력해 주세요.');
        }
        if (hasPoll) {
            if (!pollQuestion.trim() || !pollOptions.trim()) return alert('투표 질문과 선택지를 모두 입력해 주세요.');
            const optionsArray = pollOptions.split(',').map(o => o.trim()).filter(Boolean);
            if (optionsArray.length < 2) return alert('투표 선택지는 쉼표로 구분하여 최소 2개 이상 입력해야 합니다.');
        }

        onSave({
            id: eventToEdit ? eventToEdit.id : null,
            title: title.trim(),
            content: content.trim(),
            is_important: isImportant,
            tags: tags,
            poll: hasPoll ? {
                question: pollQuestion.trim(),
                options: pollOptions.split(',').map(o => o.trim()).filter(Boolean),
                is_multiple: isMultiplePoll
            } : null
        });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-[580px] slide-up overflow-hidden flex flex-col">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full mr-2"></span>
                        {eventToEdit ? '공지사항 수정' : '새로운 공지사항 등록'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1"><CloseIcon /></button>
                </div>

                <div className="p-6 bg-slate-50 flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar space-y-4">
                    {/* 공지사항 제목 & 중요 체크 */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-end">
                            <label className="text-xs font-bold text-gray-700">제목 <span className="text-red-500">*</span></label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-red-500 hover:bg-red-50 px-2 py-0.5 rounded transition-colors border border-transparent hover:border-red-200">
                                <input
                                    type="checkbox"
                                    checked={isImportant}
                                    onChange={e => setIsImportant(e.target.checked)}
                                    className="w-3.5 h-3.5 accent-red-500"
                                />
                                🚨 중요(긴급)
                            </label>
                        </div>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="공지사항 제목을 입력하세요"
                            className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-xs focus:outline-none focus:border-letusBlue w-full bg-white transition-all"
                        />
                    </div>

                    {/* 관련 부서 태그 추가 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-700">관련 부서 태그 추가 <span className="text-slate-400 font-normal">(선택)</span></label>
                        <div className="min-h-[42px] border border-gray-300 rounded-[4px] bg-white px-3 py-2 flex items-center justify-between">
                            <div className="flex flex-wrap gap-1.5">
                                {tags ? tags.split(',').map((tag, i) => (
                                    <span key={i} className="bg-blue-100 text-letusBlue border border-blue-200 px-2 py-0.5 rounded-full text-[10px] font-bold">{tag.trim()}</span>
                                )) : <span className="text-xs text-gray-400 font-medium">선택된 부서 없음</span>}
                            </div>
                            <button onClick={() => setIsTeamModalOpen(true)} className="flex items-center gap-1.5 text-[11px] font-bold text-letusBlue border border-letusBlue/40 bg-blue-50 hover:bg-blue-100 rounded-[4px] px-3 py-1.5 transition-colors shrink-0">부서 검색</button>
                        </div>
                    </div>

                    {/* 상세 내용 */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-700">공지 내용 <span className="text-red-500">*</span></label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            rows={8}
                            placeholder="공지할 내용을 상세히 작성해주세요."
                            className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-xs focus:outline-none focus:border-letusBlue resize-none w-full bg-white transition-all"
                        ></textarea>
                    </div>

                    {/* 투표 첨부 토글 및 입력 */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700">
                            <input
                                type="checkbox"
                                checked={hasPoll}
                                onChange={e => setHasPoll(e.target.checked)}
                                className="w-3.5 h-3.5 accent-letusBlue"
                            />
                            📊 투표 첨부하기
                        </label>
                        {hasPoll && (
                            <div className="bg-blue-50 border border-blue-100 rounded-[4px] p-3 space-y-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-blue-800">투표 제목/질문 <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        value={pollQuestion}
                                        onChange={e => setPollQuestion(e.target.value)}
                                        placeholder="예: 사내 교육 참석 여부를 선택해 주세요."
                                        className="border border-blue-200 rounded-[4px] px-3.5 py-2 text-xs w-full focus:outline-none focus:border-letusBlue bg-white transition-all"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-blue-800">선택지 (쉼표 ','로 구분) <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        value={pollOptions}
                                        onChange={e => setPollOptions(e.target.value)}
                                        placeholder="예: 참석, 불참, 미정"
                                        className="border border-blue-200 rounded-[4px] px-3.5 py-2 text-xs w-full focus:outline-none focus:border-letusBlue bg-white transition-all"
                                    />
                                </div>
                                <div className="pt-1">
                                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-blue-800">
                                        <input
                                            type="checkbox"
                                            checked={isMultiplePoll}
                                            onChange={e => setIsMultiplePoll(e.target.checked)}
                                            className="w-3.5 h-3.5 accent-letusBlue"
                                        />
                                        복수 선택 허용 (다중 투표 가능)
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-5 py-[9px] border border-gray-300 text-gray-600 text-[11px] font-bold rounded-[3px] hover:bg-gray-50 transition-colors">취소</button>
                    <button onClick={handleSave} className="px-5 py-[9px] bg-letusBlue text-white text-[11px] font-bold rounded-[3px] hover:bg-blue-600 transition-colors">
                        {eventToEdit ? '수정하기' : '등록하기'}
                    </button>
                </div>
            </div>

            {isTeamModalOpen && (
                <TeamSearchModal initialTeams={tags} onApply={setTags} onClose={() => setIsTeamModalOpen(false)} />
            )}
        </div>
    );
};

const NoticeModal = ({ item, onClose, isAdmin, userProfile, onEdit, onDelete }) => {
    const [votes, setVotes] = useState([]);
    const [myVote, setMyVote] = useState(null); // array of strings
    const [selectedOptions, setSelectedOptions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [forceShowResults, setForceShowResults] = useState(false);

    const hasPoll = !!item.poll;
    const isCreator = userProfile?.name === item.creator_name;

    useEffect(() => {
        if (!hasPoll) {
            setIsLoading(false);
            return;
        }
        const fetchVotes = async () => {
            try {
                const { data, error } = await supabase
                    .from('notice_poll_votes')
                    .select('*')
                    .eq('poll_id', item.poll.id);
                if (error) throw error;

                setVotes(data);
                const mine = data.filter(v => v.user_name === userProfile?.name);
                if (mine.length > 0) setMyVote(mine.map(m => m.selected_option));
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchVotes();
    }, [item, userProfile]);

    const handleVote = async () => {
        if (selectedOptions.length === 0) return alert('항목을 선택해주세요.');
        if (!userProfile) return alert('로그인 정보가 없습니다.');

        try {
            const payloads = selectedOptions.map(opt => ({
                poll_id: item.poll.id,
                user_name: userProfile.name,
                selected_option: opt
            }));
            const { error } = await supabase.from('notice_poll_votes').insert(payloads);
            if (error) {
                if (error.code === '23505') { // UNIQUE constraint violation
                    alert('이미 투표에 참여하셨습니다.');
                } else {
                    throw error;
                }
                return;
            }

            setMyVote(selectedOptions);
            setVotes(prev => [...prev, ...payloads]);
        } catch (err) {
            alert('투표 처리 중 오류가 발생했습니다.');
            console.error(err);
        }
    };

    const handleChangeVote = async () => {
        if (!userProfile || !hasPoll) return;
        try {
            const { error } = await supabase
                .from('notice_poll_votes')
                .delete()
                .eq('poll_id', item.poll.id)
                .eq('user_name', userProfile.name);
            if (error) throw error;

            setVotes(prev => prev.filter(v => v.user_name !== userProfile.name));
            setMyVote(null);
            setSelectedOptions([]);
        } catch (err) {
            alert('투표 수정 중 오류가 발생했습니다.');
            console.error(err);
        }
    };

    const toggleOption = (opt) => {
        if (!item.poll.is_multiple) {
            setSelectedOptions([opt]);
        } else {
            setSelectedOptions(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-[580px] slide-up overflow-hidden flex flex-col">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full mr-2"></span>
                        공지사항 상세
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1"><CloseIcon /></button>
                </div>
                <div className="p-6 bg-slate-50 flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar">
                    <div>
                        <div className="flex justify-between items-end mb-2 border-b border-gray-200 pb-3">
                            <h4 className="text-sm font-bold text-gray-800">{item.title}</h4>
                            <div className="flex flex-col items-end gap-2">
                                <span className="text-[11px] font-medium text-gray-400">{item.created_at} | 작성자: <span className="font-bold text-gray-600">{item.creator_name || '관리자'}</span></span>
                                {item.tags && (
                                    <div className="flex gap-1.5">
                                        {item.tags.split(',').map((tag, i) => (
                                            <span key={i} className="bg-blue-50 text-letusBlue border border-blue-100 px-2 py-0.5 rounded text-[10px] font-bold">#{tag.trim()}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="pt-2 text-xs text-gray-700 min-h-[100px] whitespace-pre-wrap leading-relaxed">
                            {item.content}
                        </div>

                        {/* 투표 (Poll) UI */}
                        {hasPoll && (
                            <div className="mt-4 border border-gray-200 rounded-[4px] overflow-hidden">
                                <div className="bg-white px-4 py-3 border-b border-gray-200">
                                    <h5 className="font-bold text-xs text-gray-800 flex items-center gap-2">
                                        📊 <span>{item.poll.question}</span>
                                    </h5>
                                </div>
                                <div className="p-4 bg-white">
                                    {isLoading ? (
                                        <div className="text-center text-xs text-gray-400 py-4 font-bold">투표 데이터를 불러오는 중...</div>
                                    ) : myVote || forceShowResults ? (
                                        <div className="space-y-4">
                                            {item.poll.options.map(opt => {
                                                const count = votes.filter(v => v.selected_option === opt).length;
                                                const uniqueVoters = new Set(votes.map(v => v.user_name)).size;
                                                const pct = uniqueVoters === 0 ? 0 : Math.round((count / uniqueVoters) * 100);
                                                const isMine = myVote && myVote.includes(opt);
                                                return (
                                                    <div key={opt} className="relative">
                                                        <div className="flex justify-between text-xs mb-1.5 font-medium">
                                                            <span className={isMine ? 'font-bold text-letusBlue' : 'text-gray-700 font-bold'}>{opt} {isMine && '(내 선택)'}</span>
                                                            <span className="text-gray-500 font-bold">{count}표 ({pct}%)</span>
                                                        </div>
                                                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                                            <div className={`h-2.5 rounded-full transition-all duration-500 ${isMine ? 'bg-letusBlue' : 'bg-gray-300'}`} style={{ width: `${pct}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                                <div className="flex gap-2">
                                                    {!myVote && forceShowResults && (
                                                        <button onClick={() => setForceShowResults(false)} className="text-[10px] text-letusBlue font-bold hover:underline">← 투표하기</button>
                                                    )}
                                                    {myVote && (
                                                        <button onClick={handleChangeVote} className="text-[10px] text-orange-500 font-bold hover:underline">✏️ 투표 수정</button>
                                                    )}
                                                </div>
                                                <div className="text-right text-[10px] text-gray-400 font-bold ml-auto">
                                                    투표 참여 인원: {new Set(votes.map(v => v.user_name)).size}명 (총 {votes.length}표)
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2.5">
                                            {item.poll.options.map(opt => (
                                                <label key={opt} className="flex items-center gap-3 p-2.5 border border-gray-200 rounded-[4px] cursor-pointer hover:bg-blue-50 transition-colors">
                                                    <input
                                                        type={item.poll.is_multiple ? "checkbox" : "radio"}
                                                        name={`poll_${item.poll.id}`}
                                                        value={opt}
                                                        checked={selectedOptions.includes(opt)}
                                                        onChange={() => toggleOption(opt)}
                                                        className="w-4 h-4 accent-letusBlue"
                                                    />
                                                    <span className="text-xs text-gray-700 font-bold">{opt}</span>
                                                </label>
                                            ))}
                                            <div className="flex gap-2 mt-2">
                                                <button onClick={handleVote} className="flex-1 py-[9px] bg-letusBlue text-white text-[11px] font-bold rounded-[3px] hover:bg-blue-600 transition-colors">
                                                    투표하기
                                                </button>
                                                {isAdmin && (
                                                    <button onClick={() => setForceShowResults(true)} className="px-4 py-[9px] border border-gray-300 text-gray-500 text-[11px] font-bold rounded-[3px] hover:bg-gray-50 transition-colors">
                                                        결과 보기
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="p-4 border-t border-gray-200 bg-white flex justify-end items-center shrink-0">
                    <div className="flex gap-2">
                        {isCreator && (
                            <>
                                <button onClick={onEdit} className="px-5 py-[9px] border border-gray-300 text-gray-600 text-[11px] font-bold rounded-[3px] hover:bg-gray-50 transition-colors">수정</button>
                                <button onClick={() => onDelete(item.id)} className="px-5 py-[9px] border border-red-300 text-red-600 text-[11px] font-bold rounded-[3px] hover:bg-red-50 transition-colors">삭제</button>
                            </>
                        )}
                        <button onClick={onClose} className="px-5 py-[9px] bg-letusBlue text-white text-[11px] font-bold rounded-[3px] hover:bg-blue-600 transition-colors">닫기</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const NoticeBoard = ({ userProfile }) => {
    const isAdmin = userProfile?.role === '관리자';
    const [notices, setNotices] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeNotice, setActiveNotice] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingNotice, setEditingNotice] = useState(null);

    const handleOpenEdit = () => {
        setEditingNotice(null);
        setIsEditModalOpen(true);
    };

    const fetchNotices = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('notices')
                .select(`
                    *,
                    poll:notice_polls(id, question, options, is_multiple)
                `)
                .order('is_important', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;

            const formattedData = data.map(n => {
                const rawPoll = n.poll && n.poll.length > 0 ? n.poll[0] : null;
                const parsedPoll = rawPoll ? {
                    ...rawPoll,
                    options: typeof rawPoll.options === 'string' ? JSON.parse(rawPoll.options) : rawPoll.options
                } : null;
                return {
                    ...n,
                    created_at: new Date(n.created_at).toLocaleDateString().replace(/\. /g, '.').replace(/\.$/, ''),
                    poll: parsedPoll
                };
            });

            setNotices(formattedData);
        } catch (err) {
            console.error("공지사항 로딩 에러:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveNotice = async (noticeData) => {
        const payload = {
            title: noticeData.title,
            content: noticeData.content,
            tags: noticeData.tags,
            is_important: noticeData.is_important,
            creator_name: userProfile?.name || '관리자'
        };

        try {
            const { data: savedNotice, error } = noticeData.id
                ? await supabase.from('notices').update(payload).eq('id', noticeData.id).select().single()
                : await supabase.from('notices').insert([payload]).select().single();

            if (error) {
                alert(`DB 저장 오류: ${error.message}`);
                return;
            }

            // 투표 데이터 연동
            if (noticeData.poll) {
                const pollPayload = {
                    notice_id: savedNotice.id,
                    question: noticeData.poll.question,
                    options: noticeData.poll.options,
                    is_multiple: noticeData.poll.is_multiple
                };

                // 기존 투표가 있으면 삭제 후 재등록
                await supabase.from('notice_polls').delete().eq('notice_id', savedNotice.id);
                const { error: pollError } = await supabase.from('notice_polls').insert([pollPayload]);

                if (pollError) {
                    alert(`투표 저장 중 오류가 발생했습니다: ${pollError.message}`);
                }
            } else {
                // 투표를 없앤 경우 삭제
                await supabase.from('notice_polls').delete().eq('notice_id', savedNotice.id);
            }

            setIsEditModalOpen(false);
            setEditingNotice(null);
            fetchNotices(); // 다시 조회
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteNotice = async (id) => {
        if (!window.confirm('이 공지사항을 삭제하시겠습니까? 관련된 투표 현황도 모두 삭제됩니다.')) return;
        try {
            const { error } = await supabase.from('notices').delete().eq('id', id);
            if (error) throw error;
            setActiveNotice(null);
            fetchNotices();
        } catch (err) {
            alert(`삭제 중 오류가 발생했습니다: ${err.message}`);
        }
    };

    useEffect(() => {
        fetchNotices();
    }, []);

    return (
        <div className="p-6 bg-slate-100 min-h-[calc(100vh-64px)] slide-up">
            <div className="w-full">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                    <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <svg className="w-6 h-6 text-letusBlue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                                공지사항
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">시스템 업데이트 및 주요 안내사항을 확인하세요.</p>
                        </div>
                        {isAdmin && (
                            <button onClick={handleOpenEdit} className="bg-letusBlue text-white px-4 py-2 text-sm font-bold rounded shadow-sm hover:bg-blue-600 transition-colors flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                공지 등록
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-0 overflow-auto max-h-[600px] custom-scrollbar">
                        <table className="w-full text-left whitespace-nowrap text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 sticky top-0">
                                <tr>
                                    <th className="p-4 pl-6 w-24 text-center">번호</th>
                                    <th className="p-4">제목</th>
                                    <th className="p-4 w-32 text-center">등록일</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {isLoading ? (
                                    <tr><td colSpan="3" className="p-10 text-center text-gray-400">데이터를 불러오는 중입니다...</td></tr>
                                ) : notices.length === 0 ? (
                                    <tr><td colSpan="3" className="p-10 text-center text-gray-400">등록된 공지사항이 없습니다.</td></tr>
                                ) : notices.map((notice, index) => (
                                    <tr key={notice.id} className={`hover:bg-blue-50/30 cursor-pointer transition-colors ${notice.is_important ? 'bg-red-50/10' : ''}`} onClick={() => setActiveNotice(notice)}>
                                        <td className="p-4 pl-6 text-center text-gray-500 font-medium">
                                            {notice.is_important ? <span className="bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded">중요</span> : notices.length - index}
                                        </td>
                                        <td className={`p-4 font-medium truncate max-w-[400px] ${notice.is_important ? 'text-red-600 font-bold' : 'text-gray-800'}`}>
                                            {notice.title}
                                        </td>
                                        <td className="p-4 text-center text-gray-500 text-xs">{notice.created_at}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {activeNotice && (
                <NoticeModal
                    item={activeNotice}
                    onClose={() => setActiveNotice(null)}
                    isAdmin={isAdmin}
                    userProfile={userProfile}
                    onEdit={() => {
                        setActiveNotice(null);
                        setEditingNotice(activeNotice);
                        setIsEditModalOpen(true);
                    }}
                    onDelete={handleDeleteNotice}
                />
            )}

            {isEditModalOpen && (
                <NoticeEditModal eventToEdit={editingNotice} onClose={() => setIsEditModalOpen(false)} onSave={handleSaveNotice} />
            )}
        </div>
    );
};