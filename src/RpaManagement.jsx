import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon, formatDateTime } from './SharedUI.jsx'; // 기존 SharedUI 사용

export const RpaManagement = () => {
    const [jobs, setJobs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    // 모달 상태
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newRpa, setNewRpa] = useState({ rpa_name: '', trigger_type: 'manual', cron_expr: '' });

    // 필터 상태
    const initialFilters = { triggerType: '전체', status: '전체', searchValue: '' };
    const [savedFilters, setSavedFilters] = useState(initialFilters);
    const [draftFilters, setDraftFilters] = useState(initialFilters);

    useEffect(() => { fetchRpaJobs(); }, []);
    const handleSearch = () => { setSavedFilters({ ...draftFilters }); };

    const fetchRpaJobs = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.from('rpa_jobs').select('*').order('last_run_at', { ascending: false, nullsFirst: false });
            if (error) throw error;
            setJobs(data || []);
        } catch (error) {
            console.error('RPA 리스트 조회 실패:', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // --- IssueList와 동일한 MultiSelect 컴포넌트 ---
    const MultiSelect = ({ label, options, selected, onChange }) => {
        const [isOpen, setIsOpen] = useState(false);
        const toggleOption = (opt) => {
            if (opt === '전체') {
                onChange('전체');
            } else {
                let currentArr = Array.isArray(selected) ? selected : (selected === '전체' ? [] : [selected]);
                const newSelected = currentArr.includes(opt) ? currentArr.filter(s => s !== opt) : [...currentArr, opt];
                onChange(newSelected.length === 0 ? '전체' : newSelected);
            }
        };

        const currentArr = Array.isArray(selected) ? selected : (selected === '전체' ? [] : [selected]);

        return (
            <div className="flex items-center shrink-0">
                <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">{label}</label>
                <div className="relative">
                    <div onClick={() => setIsOpen(!isOpen)} className="border border-gray-200 rounded-[3px] bg-white px-2.5 h-[30px] w-32 flex items-center justify-between cursor-pointer hover:border-letusBlue transition-all text-xs">
                        <span className="truncate text-gray-700 font-medium">
                            {currentArr.length === 0 ? '전체' : `${currentArr[0]}${currentArr.length > 1 ? ` 외 ${currentArr.length - 1}` : ''}`}
                        </span>
                        <svg className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                    {isOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                            <div className="absolute top-[105%] left-0 w-48 bg-white border border-gray-200 rounded shadow-xl z-50 py-1.5 max-h-60 overflow-y-auto custom-scrollbar slide-up">
                                <div onClick={() => { toggleOption('전체'); setIsOpen(false); }} className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${currentArr.length === 0 ? 'text-letusBlue font-bold' : 'text-gray-600'}`}>
                                    <input type="checkbox" readOnly checked={currentArr.length === 0} className="w-3.5 h-3.5 accent-letusBlue" /> 전체
                                </div>
                                <div className="h-px bg-gray-100 my-1"></div>
                                {options.map(opt => (
                                    <div key={opt} onClick={() => toggleOption(opt)} className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${currentArr.includes(opt) ? 'text-letusBlue font-bold bg-blue-50/30' : 'text-gray-600'}`}>
                                        <input type="checkbox" readOnly checked={currentArr.includes(opt)} className="w-3.5 h-3.5 accent-letusBlue" /> {opt}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    // 메모리 내 필터링 로직
    const filteredJobs = useMemo(() => {
        return jobs.filter(job => {
            const filterTrigger = Array.isArray(savedFilters.triggerType) ? savedFilters.triggerType : (savedFilters.triggerType === '전체' ? [] : [savedFilters.triggerType]);
            const filterStatus = Array.isArray(savedFilters.status) ? savedFilters.status : (savedFilters.status === '전체' ? [] : [savedFilters.status]);

            // DB의 enum 값을 한글로 매핑해서 비교
            const triggerMap = { 'manual': '수동', 'auto': '스케줄' };
            const statusMap = { 'idle': '대기', 'running': '실행 중', 'error': '오류' };

            if (filterTrigger.length > 0 && !filterTrigger.includes(triggerMap[job.trigger_type])) return false;
            if (filterStatus.length > 0 && !filterStatus.includes(statusMap[job.status])) return false;

            if (savedFilters.searchValue) {
                if (!job.rpa_name?.toLowerCase().includes(savedFilters.searchValue.toLowerCase())) return false;
            }
            return true;
        });
    }, [jobs, savedFilters]);

    // 정렬 로직
    const sortedJobs = useMemo(() => {
        let items = [...filteredJobs];
        if (sortConfig.key && sortConfig.direction !== 'none') {
            items.sort((a, b) => {
                const aVal = a[sortConfig.key] || '';
                const bVal = b[sortConfig.key] || '';
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [filteredJobs, sortConfig]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key) {
            if (sortConfig.direction === 'asc') direction = 'desc';
            else if (sortConfig.direction === 'desc') direction = 'none';
        }
        setSortConfig({ key: direction === 'none' ? null : key, direction });
    };

    // 체크박스 핸들러
    const handleSelectAll = (e) => setSelectedIds(e.target.checked ? sortedJobs.map(i => i.id) : []);
    const handleSelectOne = (e, id) => {
        if (e && e.nativeEvent && e.nativeEvent.shiftKey && lastSelectedId) {
            const startIdx = sortedJobs.findIndex(i => i.id === lastSelectedId);
            const endIdx = sortedJobs.findIndex(i => i.id === id);
            if (startIdx !== -1 && endIdx !== -1) {
                const min = Math.min(startIdx, endIdx);
                const max = Math.max(startIdx, endIdx);
                const idsInRange = sortedJobs.slice(min, max + 1).map(i => i.id);
                setSelectedIds(prev => {
                    const newSet = new Set(prev);
                    idsInRange.forEach(x => newSet.add(x));
                    return Array.from(newSet);
                });
                return;
            }
        }
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
        setLastSelectedId(id);
    };
    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        if (sortConfig.direction === 'asc') return <span className="ml-1 text-letusBlue font-black">↑</span>;
        if (sortConfig.direction === 'desc') return <span className="ml-1 text-letusBlue font-black">↓</span>;
        return null;
    };

    // RPA 제어 핸들러
    const handleSaveRpa = async () => {
        if (!newRpa.rpa_name.trim()) return alert('RPA 봇 이름을 입력해주세요.');
        if (newRpa.trigger_type === 'auto' && !newRpa.cron_expr.trim()) return alert('스케줄(Cron)을 입력해주세요.');

        try {
            const { error } = await supabase.from('rpa_jobs').insert([{
                rpa_name: newRpa.rpa_name, trigger_type: newRpa.trigger_type,
                cron_expr: newRpa.trigger_type === 'auto' ? newRpa.cron_expr : null, status: 'idle'
            }]);
            if (error) throw error;
            setIsModalOpen(false);
            setNewRpa({ rpa_name: '', trigger_type: 'manual', cron_expr: '' });
            fetchRpaJobs();
        } catch (error) { alert('RPA 등록 실패: ' + error.message); }
    };

    const handleRunRpa = async (id) => {
        if (!window.confirm('▶️ 이 RPA를 즉시 실행하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('rpa_jobs').update({ status: 'running' }).eq('id', id);
            if (error) throw error;
            fetchRpaJobs();
        } catch (error) { alert('실행 요청 실패: ' + error.message); }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return alert('삭제할 봇을 선택해 주세요.');
        if (!window.confirm(`선택하신 ${selectedIds.length}개의 봇을 정말 삭제하시겠습니까?`)) return;
        try {
            const { error } = await supabase.from('rpa_jobs').delete().in('id', selectedIds);
            if (error) throw error;
            setSelectedIds([]);
            fetchRpaJobs();
        } catch (error) { alert('삭제 실패: ' + error.message); }
    };

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* 1. 검색 박스 구역 (IssueList 완벽 동일 스타일) */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex items-center z-30 shrink-0 justify-between">
                <div className="flex items-center gap-5 w-full flex-wrap">

                    <MultiSelect label="실행 방식" options={['수동', '스케줄']} selected={draftFilters.triggerType} onChange={(val) => setDraftFilters({ ...draftFilters, triggerType: val })} />
                    <MultiSelect label="처리상태" options={['대기', '실행 중', '오류']} selected={draftFilters.status} onChange={(val) => setDraftFilters({ ...draftFilters, status: val })} />

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">봇 이름</label>
                        <div className="flex gap-0 h-[30px]">
                            <input
                                type="text" value={draftFilters.searchValue}
                                onChange={e => setDraftFilters({ ...draftFilters, searchValue: e.target.value })}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                className="border border-gray-200 rounded-[3px] text-xs px-2.5 w-48 focus:outline-none focus:border-letusOrange h-full"
                                placeholder="RPA 이름 검색"
                            />
                        </div>
                    </div>

                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button onClick={() => { setDraftFilters(initialFilters); setSavedFilters(initialFilters); }} className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] text-xs transition-colors">초기화</button>
                        <button onClick={handleSearch} className="bg-letusOrange text-white hover:bg-orange-600 font-bold px-6 h-[30px] rounded-[3px] transition-colors text-xs flex items-center justify-center shadow-sm gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            조회하기
                        </button>
                        {/* 🌟 신규 등록 버튼 추가 */}
                        <button onClick={() => setIsModalOpen(true)} className="bg-letusBlue text-white hover:bg-blue-600 font-bold px-4 h-[30px] rounded-[3px] transition-colors text-xs flex items-center justify-center shadow-sm ml-2">
                            + 신규 봇 등록
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. 선택실행 드롭다운 */}
            <div className="flex justify-end w-full px-2 z-30 -mt-1 mb-1 shrink-0">
                <div className="relative">
                    <button onClick={() => setIsActionMenuOpen(!isActionMenuOpen)} className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[90px] h-[32px]">
                        선택실행
                        <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {isActionMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsActionMenuOpen(false)}></div>
                            <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">
                                <button onClick={() => { setIsActionMenuOpen(false); handleDeleteSelected(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors">
                                    선택 삭제
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 3. 표 구역 (IssueList와 동일한 UI 구조) */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left whitespace-nowrap table-fixed min-w-[1000px]">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-6 w-10 text-center">
                                    <input type="checkbox" checked={sortedJobs.length > 0 && selectedIds.length === sortedJobs.length} onChange={handleSelectAll} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                </th>
                                {[{ label: 'RPA 봇 이름', key: 'rpa_name', w: '300px' }, { label: '실행 방식', key: 'trigger_type', w: '120px' }, { label: '스케줄 (Cron)', key: 'cron_expr', w: '180px' }, { label: '상태', key: 'status', w: '120px' }, { label: '마지막 실행 일시', key: 'last_run_at', w: '180px' }, { label: '액션', key: null, w: '120px' }].map((col, idx) => (
                                    <th key={idx} className={`p-4 text-center select-none ${col.key ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}`} style={{ width: col.w }} onClick={() => col.key && requestSort(col.key)}>
                                        <div className="flex items-center justify-center">{col.label} {col.key && getSortIcon(col.key)}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="7" className="py-32 text-center align-middle">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div>
                                            <p className="text-gray-500 font-bold text-[13px]">데이터를 불러오는 중입니다...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : sortedJobs.length === 0 ? (
                                <tr><td colSpan="7" className="p-20 text-center text-gray-400 font-bold">조회 결과가 없습니다.</td></tr>
                            ) : sortedJobs.map((row) => (
                                <tr key={row.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''}`} onClick={(e) => handleSelectOne(e, row.id)}>
                                    <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={(e) => handleSelectOne(e, row.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                    </td>
                                    <td className="p-4 font-bold text-gray-800 text-center">{row.rpa_name}</td>
                                    <td className="p-4 text-center">
                                        <span className={`text-[11px] font-bold px-2 py-1 rounded ${row.trigger_type === 'auto' ? 'bg-purple-50 text-purple-600 border border-purple-200' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
                                            {row.trigger_type === 'auto' ? '⏱️ 스케줄' : '🖐️ 수동'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-600 text-center font-mono text-xs">{row.cron_expr || '-'}</td>
                                    <td className="p-4 text-center">
                                        {row.status === 'idle' && <span className="text-gray-500 font-bold">🟢 대기</span>}
                                        {row.status === 'running' && <span className="text-letusBlue font-black animate-pulse">🔄 실행 중</span>}
                                        {row.status === 'error' && <span className="text-red-500 font-bold">🔴 오류</span>}
                                    </td>
                                    <td className="p-4 text-gray-500 font-mono text-xs text-center">{row.last_run_at ? formatDateTime(row.last_run_at) : '-'}</td>
                                    <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => handleRunRpa(row.id)}
                                            disabled={row.status === 'running'}
                                            className={`text-xs font-bold border px-3 py-1.5 rounded transition-colors shadow-sm w-[76px] ${row.status === 'running' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-green-600 border-green-200 hover:bg-green-50'}`}
                                        >
                                            실행
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 신규 등록 모달 */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
                    <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-sm slide-up border border-gray-100 overflow-hidden flex flex-col">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                                <span className="w-1.5 h-3.5 bg-letusBlue rounded-full"></span>
                                새로운 RPA 봇 등록
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><CloseIcon /></button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">RPA 봇 이름 <span className="text-letusOrange">*</span></label>
                                <input
                                    type="text" value={newRpa.rpa_name} onChange={e => setNewRpa({ ...newRpa, rpa_name: e.target.value })}
                                    placeholder="예: 관세청 배송조회 크롤러" autoFocus
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">실행 방식 (Trigger)</label>
                                <select
                                    value={newRpa.trigger_type}
                                    onChange={e => setNewRpa({ ...newRpa, trigger_type: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white cursor-pointer"
                                >
                                    <option value="manual">🖐️ 수동 실행 (버튼 클릭 시)</option>
                                    <option value="auto">⏱️ 자동 스케줄 (Cron)</option>
                                </select>
                            </div>

                            {newRpa.trigger_type === 'auto' && (
                                <div className="flex flex-col gap-1.5 animate-fade-in-up">
                                    <label className="text-xs font-bold text-gray-700">Cron 표현식 <span className="text-letusOrange">*</span></label>
                                    <input
                                        type="text" value={newRpa.cron_expr} onChange={e => setNewRpa({ ...newRpa, cron_expr: e.target.value })}
                                        placeholder="예: 0 9 * * * (매일 오전 9시)"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white font-mono"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors shadow-sm">취소</button>
                            <button onClick={handleSaveRpa} className="px-5 py-2 bg-letusBlue text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-600 transition-colors">저장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};