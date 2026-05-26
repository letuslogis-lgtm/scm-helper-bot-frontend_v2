import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon, formatDateTime, SearchButton } from './SharedUI.jsx';
import { RpaRunHistoryModal } from './RpaRunHistoryModal.jsx';

// ============================================================
// 자주 쓰는 cron 표현식 예시 — 모달에서 사용자가 빠르게 고를 수 있게
// ============================================================
const CRON_PRESETS = [
    { label: '매일 새벽 3시', value: '0 3 * * *' },
    { label: '매일 오전 9시', value: '0 9 * * *' },
    { label: '평일 오전 8시', value: '0 8 * * 1-5' },
    { label: '매시간 정각', value: '0 * * * *' },
    { label: '5분마다', value: '*/5 * * * *' },
];

// ============================================================
// 컬럼 기본 정의
// ============================================================
const DEFAULT_COLUMNS = [
    { label: '활성',          key: null,           w: 70  },
    { label: 'RPA 봇 이름',  key: 'rpa_name',     w: 240 },
    { label: '설명',          key: null,           w: 220 },
    { label: '실행 방식',    key: 'trigger_type',  w: 110 },
    { label: '스케줄 (Cron)', key: 'cron_expr',   w: 150 },
    { label: '상태',          key: 'status',       w: 110 },
    { label: '마지막 실행',  key: 'last_run_at',   w: 170 },
    { label: '액션',          key: null,           w: 180 },
];

// rpa_jobs 에 처음 INSERT 할 때의 기본값
const EMPTY_FORM = {
    id: null,
    rpa_name: '',
    description: '',
    trigger_type: 'manual',     // 'manual' | 'auto'
    cron_expr: '',
    script_command: '',
    working_dir: '',
    runner_type: 'local',       // 'local' | 'github_actions'
    enabled: true,
};

export const RpaManagement = () => {
    const [jobs, setJobs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    // 컬럼 순서 & 너비
    const [colOrder, setColOrder] = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths] = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef = useRef(null);
    const dragSrcRef = useRef(null);
    const wasDraggedRef = useRef(false);

    // 모달 (신규/편집 통합)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const isEditMode = Boolean(form.id);

    // 실행 이력 모달 (rpa_runs 조회)
    const [historyTarget, setHistoryTarget] = useState(null);

    // 필터
    const initialFilters = { triggerType: '전체', status: '전체', searchValue: '' };
    const [savedFilters, setSavedFilters] = useState(initialFilters);
    const [draftFilters, setDraftFilters] = useState(initialFilters);

    // localStorage 복원
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('letus_rpa_col'));
            if (saved?.order?.length === DEFAULT_COLUMNS.length) setColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS.length) setColWidths(saved.widths);
        } catch {}
    }, []);

    // localStorage 저장
    useEffect(() => {
        localStorage.setItem('letus_rpa_col', JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths]);

    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS.map(c => c.w));
        localStorage.removeItem('letus_rpa_col');
    };

    useEffect(() => {
        fetchRpaJobs();

        // rpa_jobs 상태 변경 실시간 반영
        const channel = supabase
            .channel('rpa_jobs_changes')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rpa_jobs' }, (payload) => {
                setJobs(prev => prev.map(j => j.id === payload.new.id ? { ...j, ...payload.new } : j));
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);
    const handleSearch = () => { setSavedFilters({ ...draftFilters }); fetchRpaJobs(); };

    // ============================================================
    // 데이터 로드
    // ============================================================
    const fetchRpaJobs = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('rpa_jobs')
                .select('*')
                .order('last_run_at', { ascending: false, nullsFirst: false });
            if (error) throw error;
            setJobs(data || []);
        } catch (err) {
            console.error('RPA 리스트 조회 실패:', err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // ============================================================
    // MultiSelect (기존과 동일)
    // ============================================================
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

    // ============================================================
    // 필터 + 정렬
    // ============================================================
    const filteredJobs = useMemo(() => {
        return jobs.filter(job => {
            const filterTrigger = Array.isArray(savedFilters.triggerType) ? savedFilters.triggerType : (savedFilters.triggerType === '전체' ? [] : [savedFilters.triggerType]);
            const filterStatus = Array.isArray(savedFilters.status) ? savedFilters.status : (savedFilters.status === '전체' ? [] : [savedFilters.status]);
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

    // ============================================================
    // 체크박스 선택
    // ============================================================
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

    // ============================================================
    // 컬럼 리사이즈 & 드래그 핸들러
    // ============================================================
    const handleResizeStart = (e, visualIdx) => {
        e.preventDefault(); e.stopPropagation();
        const origIdx = colOrder[visualIdx];
        resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
        const onMove = (ev) => {
            const { origIdx: oIdx, startX, startW } = resizingRef.current;
            setColWidths(prev => { const n = [...prev]; n[oIdx] = Math.max(50, startW + (ev.clientX - startX)); return n; });
        };
        const onUp = () => {
            resizingRef.current = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const handleDragStart = (e, visualIdx) => {
        dragSrcRef.current = visualIdx;
        wasDraggedRef.current = false;
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleDragOver = (e, visualIdx) => { e.preventDefault(); setDragOverIdx(visualIdx); };
    const handleDrop = (e, visualIdx) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === visualIdx) return;
        wasDraggedRef.current = true;
        const newOrder = [...colOrder];
        const [moved] = newOrder.splice(dragSrcRef.current, 1);
        newOrder.splice(visualIdx, 0, moved);
        setColOrder(newOrder);
        dragSrcRef.current = null;
    };
    const handleDragEnd = () => {
        setDragOverIdx(null);
        setTimeout(() => { wasDraggedRef.current = false; }, 50);
    };

    // ============================================================
    // 셀 렌더러 (origIdx 기준)
    // ============================================================
    const renderCell = (origIdx, row) => {
        switch (origIdx) {
            case 0: // 활성
                return (
                    <td key={origIdx} className="p-4 text-center" style={{ width: colWidths[origIdx] }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => handleToggleEnabled(row)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${row.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                            title={row.enabled ? 'ON (자동 실행 활성)' : 'OFF (자동 실행 비활성)'}
                        >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${row.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                    </td>
                );
            case 1: // RPA 봇 이름
                return (
                    <td key={origIdx} className="p-4 font-bold text-gray-800 text-center" style={{ width: colWidths[origIdx] }}>{row.rpa_name}</td>
                );
            case 2: // 설명
                return (
                    <td key={origIdx} className="p-4 text-gray-500 text-[11.5px] truncate" style={{ width: colWidths[origIdx] }} title={row.description}>{row.description || '-'}</td>
                );
            case 3: // 실행 방식
                return (
                    <td key={origIdx} className="p-4 text-center" style={{ width: colWidths[origIdx] }}>
                        <span className={`text-[11px] font-bold px-2 py-1 rounded ${row.trigger_type === 'auto' ? 'bg-purple-50 text-purple-600 border border-purple-200' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
                            {row.trigger_type === 'auto' ? '⏱️ 스케줄' : '🖐️ 수동'}
                        </span>
                    </td>
                );
            case 4: // 스케줄 (Cron)
                return (
                    <td key={origIdx} className="p-4 text-gray-600 text-center font-mono text-xs" style={{ width: colWidths[origIdx] }}>{row.cron_expr || '-'}</td>
                );
            case 5: // 상태
                return (
                    <td key={origIdx} className="p-4 text-center" style={{ width: colWidths[origIdx] }}>
                        {row.status === 'idle' && <span className="text-gray-500 font-bold">🟢 대기</span>}
                        {row.status === 'running' && <span className="text-letusBlue font-black animate-pulse">🔄 실행 중</span>}
                        {row.status === 'error' && <span className="text-red-500 font-bold">🔴 오류</span>}
                        {!['idle', 'running', 'error'].includes(row.status) && <span className="text-gray-400">-</span>}
                    </td>
                );
            case 6: // 마지막 실행
                return (
                    <td key={origIdx} className="p-4 text-gray-500 font-mono text-xs text-center" style={{ width: colWidths[origIdx] }}>{row.last_run_at ? formatDateTime(row.last_run_at) : '-'}</td>
                );
            case 7: // 액션
                return (
                    <td key={origIdx} className="p-4 text-center" style={{ width: colWidths[origIdx] }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                            <button
                                onClick={() => handleRunRpa(row)}
                                disabled={row.status === 'running'}
                                className={`text-xs font-bold border px-2.5 py-1.5 rounded transition-colors shadow-sm ${row.status === 'running' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-green-600 border-green-200 hover:bg-green-50'}`}
                            >
                                ▶ 실행
                            </button>
                            <button
                                onClick={() => setHistoryTarget(row)}
                                className="text-xs font-bold border px-2 py-1.5 rounded transition-colors shadow-sm bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                title="실행 이력"
                            >
                                📜
                            </button>
                            <button
                                onClick={() => openEditModal(row)}
                                className="text-xs font-bold border px-2 py-1.5 rounded transition-colors shadow-sm bg-white text-letusBlue border-blue-200 hover:bg-blue-50"
                                title="편집"
                            >
                                ⚙
                            </button>
                        </div>
                    </td>
                );
            default:
                return <td key={origIdx} />;
        }
    };

    // ============================================================
    // 신규/편집 모달 열기
    // ============================================================
    const openNewModal = () => { setForm(EMPTY_FORM); setIsModalOpen(true); };
    const openEditModal = (job) => {
        setForm({
            id: job.id,
            rpa_name: job.rpa_name || '',
            description: job.description || '',
            trigger_type: job.trigger_type || 'manual',
            cron_expr: job.cron_expr || '',
            script_command: job.script_command || '',
            working_dir: job.working_dir || '',
            runner_type: job.runner_type || 'local',
            enabled: job.enabled !== false,
        });
        setIsModalOpen(true);
    };

    // ============================================================
    // RPA 저장 (insert / update)
    // ============================================================
    const handleSaveRpa = async () => {
        if (!form.rpa_name.trim()) return alert('RPA 봇 이름을 입력해주세요.');
        if (form.trigger_type === 'auto' && !form.cron_expr.trim()) {
            return alert('자동 실행이면 Cron 표현식이 필요합니다.');
        }
        if (form.runner_type === 'local' && !form.script_command.trim()) {
            return alert("로컬 Worker 실행이면 'script_command' 가 필요합니다.\n예) node scripts/sync_products.mjs");
        }

        const payload = {
            rpa_name: form.rpa_name.trim(),
            description: form.description.trim() || null,
            trigger_type: form.trigger_type,
            cron_expr: form.trigger_type === 'auto' ? form.cron_expr.trim() : null,
            script_command: form.script_command.trim() || null,
            working_dir: form.working_dir.trim() || null,
            runner_type: form.runner_type,
            enabled: form.enabled,
        };

        try {
            if (isEditMode) {
                const { error } = await supabase.from('rpa_jobs').update(payload).eq('id', form.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('rpa_jobs').insert([{ ...payload, status: 'idle' }]);
                if (error) throw error;
            }
            setIsModalOpen(false);
            setForm(EMPTY_FORM);
            fetchRpaJobs();
        } catch (err) {
            alert(`${isEditMode ? '수정' : '등록'} 실패: ${err.message}`);
        }
    };

    // ============================================================
    // ON/OFF 토글 (auto 모드일 때만 의미 있지만 UI 는 항상 노출)
    // ============================================================
    const handleToggleEnabled = async (job) => {
        try {
            const { error } = await supabase
                .from('rpa_jobs')
                .update({ enabled: !job.enabled })
                .eq('id', job.id);
            if (error) throw error;
            fetchRpaJobs();
        } catch (err) {
            alert('ON/OFF 변경 실패: ' + err.message);
        }
    };

    // ============================================================
    // 수동 실행 — rpa_runs INSERT pending → Worker 가 Realtime 감지
    // ============================================================
    const handleRunRpa = async (job) => {
        if (job.status === 'running') {
            return alert('이미 실행 중입니다.');
        }
        if (job.runner_type === 'local' && !job.script_command) {
            return alert("이 봇은 'script_command' 가 비어있어 로컬 Worker 가 실행할 수 없습니다.\n편집해서 채워주세요.");
        }
        if (!window.confirm(`▶️ '${job.rpa_name}' 을(를) 지금 실행할까요?\n\n(${job.runner_type === 'local' ? '사내 PC 의 Worker' : 'GitHub Actions'} 가 받아서 실행합니다)`)) {
            return;
        }
        try {
            const { error } = await supabase
                .from('rpa_runs')
                .insert([{
                    definition_id: job.id,
                    status: 'pending',
                    triggered_by: 'manual',
                    params: {},
                    created_at: new Date().toISOString(),
                }]);
            if (error) throw error;
            // 낙관적 업데이트: Worker가 잡기 전에도 즉시 버튼 비활성화
            setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'running' } : j));
            alert('✅ 실행 요청이 큐에 등록되었습니다. 결과는 [실행 이력] 에서 확인하세요.');
        } catch (err) {
            alert('실행 요청 실패: ' + err.message);
        }
    };

    // ============================================================
    // 선택 삭제
    // ============================================================
    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return alert('삭제할 봇을 선택해 주세요.');
        if (!window.confirm(`선택하신 ${selectedIds.length}개의 봇을 정말 삭제하시겠습니까?\n관련 실행 이력(rpa_runs) 도 함께 삭제됩니다.`)) return;
        try {
            const { error } = await supabase.from('rpa_jobs').delete().in('id', selectedIds);
            if (error) throw error;
            setSelectedIds([]);
            fetchRpaJobs();
        } catch (err) {
            alert('삭제 실패: ' + err.message);
        }
    };

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* 1. 검색 박스 */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex items-center z-30 shrink-0 justify-between">
                <div className="flex items-center gap-5 w-full flex-wrap">
                    <MultiSelect label="실행 방식" options={['수동', '스케줄']} selected={draftFilters.triggerType} onChange={(val) => setDraftFilters({ ...draftFilters, triggerType: val })} />
                    <MultiSelect label="처리상태" options={['대기', '실행 중', '오류']} selected={draftFilters.status} onChange={(val) => setDraftFilters({ ...draftFilters, status: val })} />

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">봇 이름</label>
                        <input
                            type="text" value={draftFilters.searchValue}
                            onChange={e => setDraftFilters({ ...draftFilters, searchValue: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            className="border border-gray-200 rounded-[3px] text-xs px-2.5 w-48 h-[30px] focus:outline-none focus:border-letusOrange"
                            placeholder="RPA 이름 검색"
                        />
                    </div>

                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button onClick={() => { setDraftFilters(initialFilters); setSavedFilters(initialFilters); }} className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] text-xs transition-colors">초기화</button>
                        <SearchButton onClick={handleSearch} />
                        <button onClick={openNewModal} className="bg-letusBlue text-white hover:bg-blue-600 font-bold px-4 h-[30px] rounded-[3px] transition-colors text-xs flex items-center justify-center shadow-sm ml-2">
                            + 신규 봇 등록
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. 선택실행 */}
            <div className="flex justify-end items-center gap-2 w-full px-2 z-30 -mt-1 mb-1 shrink-0">
                <button onClick={resetColSettings}
                    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    title="컬럼 너비·순서를 기본값으로 초기화">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    칼럼 초기화
                </button>
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

            {/* 3. 테이블 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left whitespace-nowrap table-fixed">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-6 w-10 text-center">
                                    <input type="checkbox" checked={sortedJobs.length > 0 && selectedIds.length === sortedJobs.length} onChange={handleSelectAll} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                </th>
                                {colOrder.map((origIdx, visualIdx) => {
                                    const col = DEFAULT_COLUMNS[origIdx];
                                    return (
                                        <th key={origIdx}
                                            className={`relative p-4 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                                            style={{ width: colWidths[origIdx] }}
                                            draggable
                                            onClick={() => !wasDraggedRef.current && col.key && requestSort(col.key)}
                                            onDragStart={(e) => handleDragStart(e, visualIdx)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={(e) => handleDragOver(e, visualIdx)}
                                            onDrop={(e) => handleDrop(e, visualIdx)}
                                            onDragLeave={() => setDragOverIdx(null)}
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                {col.label}
                                                {col.key && getSortIcon(col.key)}
                                            </div>
                                            <div
                                                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                                onMouseDown={(e) => handleResizeStart(e, visualIdx)}
                                                onClick={e => e.stopPropagation()}
                                            />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={colOrder.length + 1} className="py-32 text-center align-middle">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div>
                                            <p className="text-gray-500 font-bold text-[13px]">데이터를 불러오는 중입니다...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : sortedJobs.length === 0 ? (
                                <tr><td colSpan={colOrder.length + 1} className="p-20 text-center text-gray-400 font-bold">조회 결과가 없습니다.</td></tr>
                            ) : sortedJobs.map((row) => (
                                <tr key={row.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''}`} onClick={(e) => handleSelectOne(e, row.id)}>
                                    <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={(e) => handleSelectOne(e, row.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                    </td>
                                    {colOrder.map(origIdx => renderCell(origIdx, row))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 신규/편집 모달 */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
                    <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-md slide-up border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                                <span className="w-1.5 h-3.5 bg-letusBlue rounded-full"></span>
                                {isEditMode ? 'RPA 봇 편집' : '새로운 RPA 봇 등록'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><CloseIcon /></button>
                        </div>

                        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
                            {/* 봇 이름 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">RPA 봇 이름 <span className="text-letusOrange">*</span></label>
                                <input
                                    type="text" value={form.rpa_name} onChange={e => setForm({ ...form, rpa_name: e.target.value })}
                                    placeholder="예: 사내DB 단품마스터 동기화" autoFocus
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white"
                                />
                            </div>

                            {/* 설명 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">설명</label>
                                <input
                                    type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="이 봇이 하는 일 한 줄 설명"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white"
                                />
                            </div>

                            {/* Runner 타입 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">실행 환경 (Runner)</label>
                                <select
                                    value={form.runner_type}
                                    onChange={e => setForm({ ...form, runner_type: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white cursor-pointer"
                                >
                                    <option value="local">🖥️ 사내 PC (Windows Worker — 사내망 접근 OK)</option>
                                    <option value="github_actions">☁️ GitHub Actions (외부 환경)</option>
                                </select>
                            </div>

                            {/* 실행 명령어 (local 일 때 강조) */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">
                                    실행 명령어 (script_command){form.runner_type === 'local' && <span className="text-letusOrange"> *</span>}
                                </label>
                                <input
                                    type="text" value={form.script_command} onChange={e => setForm({ ...form, script_command: e.target.value })}
                                    placeholder="예: node scripts/sync_products.mjs"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white font-mono"
                                />
                                <p className="text-[10px] text-gray-400 font-medium">프로젝트 루트 기준의 명령어. Worker 가 shell 로 그대로 실행합니다.</p>
                            </div>

                            {/* working_dir (선택) */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">작업 폴더 (선택, 기본: 프로젝트 루트)</label>
                                <input
                                    type="text" value={form.working_dir} onChange={e => setForm({ ...form, working_dir: e.target.value })}
                                    placeholder="예: scripts (비워두면 프로젝트 루트)"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white font-mono"
                                />
                            </div>

                            {/* 실행 방식 */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">실행 방식 (Trigger)</label>
                                <select
                                    value={form.trigger_type}
                                    onChange={e => setForm({ ...form, trigger_type: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white cursor-pointer"
                                >
                                    <option value="manual">🖐️ 수동 실행 (버튼 클릭 시에만)</option>
                                    <option value="auto">⏱️ 자동 스케줄 (Cron)</option>
                                </select>
                            </div>

                            {/* Cron */}
                            {form.trigger_type === 'auto' && (
                                <div className="flex flex-col gap-1.5 animate-fade-in-up">
                                    <label className="text-xs font-bold text-gray-700">Cron 표현식 <span className="text-letusOrange">*</span></label>
                                    <input
                                        type="text" value={form.cron_expr} onChange={e => setForm({ ...form, cron_expr: e.target.value })}
                                        placeholder="예: 0 3 * * *"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white font-mono"
                                    />
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {CRON_PRESETS.map(p => (
                                            <button
                                                key={p.value}
                                                onClick={() => setForm({ ...form, cron_expr: p.value })}
                                                className="text-[10px] px-2 py-1 rounded border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 text-gray-600 transition-colors"
                                                title={p.value}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-medium mt-1">시간대: Asia/Seoul. 형식: 분 시 일 월 요일</p>
                                </div>
                            )}

                            {/* enabled (auto 일 때만 의미) */}
                            {form.trigger_type === 'auto' && (
                                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                                    <div>
                                        <div className="text-xs font-bold text-gray-700">자동 실행 활성화</div>
                                        <div className="text-[10px] text-gray-500">OFF 면 cron 시간이 와도 실행 안 됨</div>
                                    </div>
                                    <button
                                        onClick={() => setForm({ ...form, enabled: !form.enabled })}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                                    >
                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors shadow-sm">취소</button>
                            <button onClick={handleSaveRpa} className="px-5 py-2 bg-letusBlue text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-600 transition-colors">
                                {isEditMode ? '수정 저장' : '신규 등록'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 실행 이력 모달 */}
            {historyTarget && (
                <RpaRunHistoryModal job={historyTarget} onClose={() => setHistoryTarget(null)} />
            )}
        </div>
    );
};
