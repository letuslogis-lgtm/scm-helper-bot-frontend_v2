import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { loadXLSXStyle } from './utils.js';
import { CloseIcon, SearchButton, DateRangeInput } from './SharedUI.jsx';
import { AccidentModal, AccidentBulkEditModal, AccidentUploadModal } from './AccidentModals.jsx';

const NORMAL_COLUMNS = [
    { label: '서비스예약일',   key: 'service_date',     w: 110 },
    { label: '브랜드',         key: 'brand',            w: 90  },
    { label: '서비스센터',     key: 'service_center',   w: 90  },
    { label: '시공/AS',        key: 'service_type',     w: 80  },
    { label: '수주번호',       key: 'order_no',         w: 150 },
    { label: '수주건명',       key: 'order_name',       w: 300 },
    { label: '품목코드',       key: 'item_code',        w: 180 },
    { label: '수량',           key: 'issue_qty',        w: 70  },
    { label: '처리상태',       key: 'status',           w: 120 },
    { label: '귀책부서',       key: 'responsible_dept', w: 120 },
    { label: '확인 결과',      key: 'action_result',    w: 130 },
    { label: '납기지연판별',   key: 'is_delayed',       w: 110 },
];

const AI_COLUMNS = [
    { label: '서비스예약일',          key: 'service_date',      w: 110 },
    { label: '브랜드',                key: 'brand',             w: 90  },
    { label: '서비스센터',            key: 'service_center',    w: 90  },
    { label: '시공/AS',               key: 'service_type',      w: 80  },
    { label: '수주번호',              key: 'order_no',          w: 150 },
    { label: '수주건명',              key: 'order_name',        w: 300 },
    { label: '품목코드',              key: 'item_code',         w: 180 },
    { label: '수량',                  key: 'issue_qty',         w: 70  },
    { label: '처리상태',              key: 'status',            w: 120 },
    { label: '귀책부서',              key: 'responsible_dept',  w: 120 },
    { label: '🤖 AI 사고 원인 분석', key: 'ai_analyzed_cause', w: 240 },
];

const AccidentList = ({ userProfile, initialFilter }) => {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeRow, setActiveRow] = useState(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [isAiView, setIsAiView] = useState(false); // AI 분석 뷰 토글 상태

    // 컬럼 너비·순서·드래그 상태
    const [colOrder, setColOrder] = useState(NORMAL_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths] = useState(NORMAL_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef = useRef(null);
    const dragSrcRef = useRef(null);
    const wasDraggedRef = useRef(false);

    // 🔥 신규: 누락되었던 모달 오픈용 상태값 추가
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);

    // 🔗 딥링크 (바로가기) 모달 자동 팝업 로직
    useEffect(() => {
        const fetchTargetRow = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const tId = urlParams.get('target_id');
            if (tId) {
                const { data, error } = await supabase.from('logistics_accidents').select('*').eq('id', tId).single();
                if (data && !error) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    setActiveRow(data);
                }
            }
        };
        fetchTargetRow();
    }, []);

    // isAiView 변경 시 해당 뷰의 localStorage에서 컬럼 설정 로드
    useEffect(() => {
        const cols = isAiView ? AI_COLUMNS : NORMAL_COLUMNS;
        const lsKey = isAiView ? `letus_accident_ai_col_${userProfile?.id}` : `letus_accident_col_${userProfile?.id}`;
        if (!userProfile?.id) {
            setColOrder(cols.map((_, i) => i));
            setColWidths(cols.map(c => c.w));
            return;
        }
        try {
            const saved = JSON.parse(localStorage.getItem(lsKey));
            if (saved?.order?.length === cols.length) setColOrder(saved.order);
            else setColOrder(cols.map((_, i) => i));
            if (saved?.widths?.length === cols.length) setColWidths(saved.widths);
            else setColWidths(cols.map(c => c.w));
        } catch {
            setColOrder(cols.map((_, i) => i));
            setColWidths(cols.map(c => c.w));
        }
    }, [isAiView, userProfile?.id]);

    // 컬럼 설정 변경 시 localStorage 저장
    useEffect(() => {
        if (!userProfile?.id) return;
        const lsKey = isAiView ? `letus_accident_ai_col_${userProfile.id}` : `letus_accident_col_${userProfile.id}`;
        localStorage.setItem(lsKey, JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths, userProfile?.id, isAiView]);

    const today = new Date().toISOString().split('T')[0];

    const initialFiltersMap = {
        brands: [], centers: [], serviceTypes: [], statuses: [], depts: [], actionResults: [],
        startDate: today, endDate: today, searchType: '수주건명', searchValue: '', excludeNormal: false, isDelayed: '전체',
        // 🚩 여기 추가! (드릴다운용 숨겨진 필터들)
        workers: [], zones: [], aiCauses: []
    };

    const [draftFilters, setDraftFilters] = useState(initialFiltersMap);
    const [appliedFilters, setAppliedFilters] = useState(initialFiltersMap);
    const [searchTrigger, setSearchTrigger] = useState(0);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });

    useEffect(() => {
        if (initialFilter) {
            const newF = { ...initialFiltersMap, ...initialFilter };
            setDraftFilters(newF); setAppliedFilters(newF);
        }
    }, [initialFilter]);

    const fetchAccidents = async () => {
        setIsLoading(true);
        try {
            let query = supabase.from('logistics_accidents').select('*').gte('service_date', appliedFilters.startDate).lte('service_date', appliedFilters.endDate).order('created_at', { ascending: false });
            const { data, error } = await query;
            if (error) throw error;
            let filtered = data || [];

            if (appliedFilters.brands.length > 0) filtered = filtered.filter(i => appliedFilters.brands.includes(i.brand));
            if (appliedFilters.centers.length > 0) filtered = filtered.filter(i => appliedFilters.centers.includes(i.service_center));
            if (appliedFilters.serviceTypes.length > 0) filtered = filtered.filter(i => appliedFilters.serviceTypes.includes(i.service_type));
            if (appliedFilters.statuses.length > 0) filtered = filtered.filter(i => appliedFilters.statuses.includes(i.status));
            if (appliedFilters.depts.length > 0) filtered = filtered.filter(i => appliedFilters.depts.includes(i.responsible_dept));
            if (appliedFilters.actionResults.length > 0) filtered = filtered.filter(i => appliedFilters.actionResults.includes(i.action_result));
            if (appliedFilters.workers?.length > 0) {
                filtered = filtered.filter(i => {
                    const w = i.worker_name ? String(i.worker_name).trim() : '';
                    return appliedFilters.workers.includes(w);
                });
            }

            // 2️⃣ ZONE 구역 필터 ('미분류' 통역 장착!)
            if (appliedFilters.zones?.length > 0) {
                filtered = filtered.filter(i => {
                    let z = i.zone ? String(i.zone).trim() : '';
                    if (!z || z === '-') z = '미분류'; // DB의 빈칸이나 하이픈을 '미분류'로 번역
                    return appliedFilters.zones.includes(z);
                });
            }

            // 3️⃣ AI 분석 원인 필터 ('분석 대기/미분류' 통역 장착!)
            if (appliedFilters.aiCauses?.length > 0) {
                filtered = filtered.filter(i => {
                    let c = i.ai_analyzed_cause ? String(i.ai_analyzed_cause).trim() : '';
                    if (!c || c === '-') c = '분석 대기/미분류'; // DB의 빈칸을 번역
                    return appliedFilters.aiCauses.includes(c);
                });
            }

            if (appliedFilters.searchValue) {
                const val = appliedFilters.searchValue.toLowerCase();
                if (appliedFilters.searchType === '수주건명') filtered = filtered.filter(i => (i.order_name || '').toLowerCase().includes(val));
                if (appliedFilters.searchType === '수주번호') filtered = filtered.filter(i => (i.order_no || '').toLowerCase().includes(val));
                if (appliedFilters.searchType === '품목코드') filtered = filtered.filter(i => (i.item_code || '').toLowerCase().includes(val));
            }

            if (appliedFilters.excludeNormal) { filtered = filtered.filter(i => i.action_result !== '정상출고'); }

            if (appliedFilters.isDelayed !== '전체') {
                if (appliedFilters.isDelayed === '지연') filtered = filtered.filter(i => i.is_delayed !== '-');
                else if (appliedFilters.isDelayed === '정상') filtered = filtered.filter(i => i.is_delayed === '-');
            }
            setItems(filtered);
        } catch (err) { console.error(err); } finally { setIsLoading(false); }
    };

    useEffect(() => { fetchAccidents(); }, [appliedFilters, searchTrigger]);

    const handleSearchClick = () => {
        window.getSelection()?.removeAllRanges();
        setAppliedFilters({ ...draftFilters });
        setSearchTrigger(t => t + 1);
        setSelectedIds([]);
    };
    const handleResetClick = () => { setDraftFilters(initialFiltersMap); setAppliedFilters(initialFiltersMap); setSearchTrigger(t => t + 1); setSelectedIds([]); };

    const sortedItems = useMemo(() => {
        let sortableItems = [...items];
        if (sortConfig.key && sortConfig.direction !== 'none') {
            sortableItems.sort((a, b) => {
                const aVal = a[sortConfig.key] || ''; const bVal = b[sortConfig.key] || '';
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [items, sortConfig]);

    const activeColumns = isAiView ? AI_COLUMNS : NORMAL_COLUMNS;

    const resetColSettings = () => {
        const cols = isAiView ? AI_COLUMNS : NORMAL_COLUMNS;
        setColOrder(cols.map((_, i) => i));
        setColWidths(cols.map(c => c.w));
        if (userProfile?.id) {
            const lsKey = isAiView ? `letus_accident_ai_col_${userProfile.id}` : `letus_accident_col_${userProfile.id}`;
            localStorage.removeItem(lsKey);
        }
    };

    const handleResizeStart = (e, visualIdx) => {
        e.preventDefault(); e.stopPropagation();
        const origIdx = colOrder[visualIdx];
        resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
        const onMove = (ev) => {
            const { origIdx, startX, startW } = resizingRef.current;
            setColWidths(prev => { const n = [...prev]; n[origIdx] = Math.max(50, startW + (ev.clientX - startX)); return n; });
        };
        const onUp = () => { resizingRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    const handleDragStart = (e, visualIdx) => { dragSrcRef.current = visualIdx; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver = (e, visualIdx) => { e.preventDefault(); setDragOverIdx(visualIdx); };
    const handleDrop = (e, visualIdx) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === visualIdx) return;
        wasDraggedRef.current = true;
        const newOrder = [...colOrder]; const [moved] = newOrder.splice(dragSrcRef.current, 1); newOrder.splice(visualIdx, 0, moved);
        setColOrder(newOrder); dragSrcRef.current = null;
    };
    const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

    const renderCell = (origIdx, row) => {
        const col = activeColumns[origIdx];
        switch (col.key) {
            case 'service_date':
                return <td key={origIdx} className="p-4 text-center text-gray-700">{row.service_date}</td>;
            case 'brand':
                return <td key={origIdx} className="p-4 text-center font-semibold">{row.brand}</td>;
            case 'service_center':
                return <td key={origIdx} className="p-4 text-center text-gray-600">{row.service_center}</td>;
            case 'service_type':
                return (
                    <td key={origIdx} className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.service_type === '시공' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                            {row.service_type}
                        </span>
                    </td>
                );
            case 'order_no':
                return <td key={origIdx} className="p-4 text-center font-mono text-gray-500">{row.order_no}</td>;
            case 'order_name':
                return <td key={origIdx} className="p-4 font-bold text-gray-800 text-sm tracking-tight truncate max-w-[300px]" title={row.order_name}>{row.order_name}</td>;
            case 'item_code':
                return <td key={origIdx} className="p-4 font-bold text-gray-600 truncate">{row.item_code}</td>;
            case 'issue_qty':
                return <td key={origIdx} className="p-4 text-center font-bold">{row.issue_qty}</td>;
            case 'status':
                return (
                    <td key={origIdx} className="p-4 text-center">
                        <span className={`px-2 py-1 rounded text-[11px] font-bold ${row.status === '등록 완료' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-100 animate-pulse'}`}>
                            {row.status}
                        </span>
                    </td>
                );
            case 'responsible_dept':
                return <td key={origIdx} className="p-4 text-center font-bold text-letusBlue">{row.responsible_dept || '-'}</td>;
            case 'action_result':
                return <td key={origIdx} className="p-4 text-center text-gray-600">{row.action_result}</td>;
            case 'is_delayed':
                return (
                    <td key={origIdx} className={`p-4 font-black text-center ${row.is_delayed !== '-' ? 'text-red-500' : 'text-gray-400'}`}>
                        {row.is_delayed}
                    </td>
                );
            case 'ai_analyzed_cause':
                return (
                    <td key={origIdx} className="py-3 px-4 text-center bg-purple-50/20">
                        {row.ai_analyzed_cause ? (
                            <div className="flex flex-col items-center gap-0.5 group relative">
                                <div className="flex items-center gap-1.5">
                                    <span className="px-3 py-0.5 rounded-full font-black text-[11px] bg-purple-100 text-purple-700 border border-purple-200 shadow-sm inline-block">
                                        {row.ai_analyzed_cause}
                                    </span>
                                    {row.ai_cause_detail && (
                                        <span className="text-[10px] font-bold text-purple-500 tracking-tight whitespace-nowrap">
                                            {row.ai_cause_detail}
                                            {row.ai_confidence === 'low' && (
                                                <span className="ml-1 text-amber-500" title="신뢰도 낮음 — 재분석 권장">⚠</span>
                                            )}
                                            {row.ai_confidence === 'human' && (
                                                <span className="ml-1 text-slate-500" title="관리자가 직접 보정한 결과입니다">⚙️</span>
                                            )}
                                        </span>
                                    )}
                                </div>
                                {row.ai_cause_summary && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-64 p-3 bg-slate-800 text-white text-[11px] rounded-lg shadow-xl pointer-events-none">
                                        <div className="font-bold text-purple-200 mb-1">🤖 AI 상세 분석</div>
                                        <div className="text-white mb-2">{row.ai_cause_summary}</div>
                                        {row.ai_keywords && row.ai_keywords.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {row.ai_keywords.map((kw, i) => (
                                                    <span key={i} className="px-1.5 py-0.5 bg-purple-500/30 rounded text-[10px]">
                                                        #{kw}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="mt-1.5 pt-1.5 border-t border-slate-600 text-[10px] text-slate-300">
                                            신뢰도: {row.ai_confidence === 'high' ? '🟢 높음' : row.ai_confidence === 'medium' ? '🟡 보통' : row.ai_confidence === 'low' ? '🔴 낮음' : row.ai_confidence === 'human' ? '⚙️ 관리자 보정' : '-'}
                                        </div>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-slate-800"></div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <span className="text-[11px] font-bold text-slate-400 italic">대기중...</span>
                        )}
                    </td>
                );
            default:
                return null;
        }
    };

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key) {
            if (sortConfig.direction === 'asc') direction = 'desc';
            else if (sortConfig.direction === 'desc') direction = 'none';
        }
        setSortConfig({ key: direction === 'none' ? null : key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? <span className="ml-1 text-letusBlue">↑</span> : <span className="ml-1 text-letusBlue">↓</span>;
    };

    const handleSelectAll = (e) => setSelectedIds(e.target.checked ? sortedItems.map(i => i.id) : []);
    const handleSelectOne = (e, id) => {
        if (e && e.nativeEvent && e.nativeEvent.shiftKey && lastSelectedId) {
            const startIdx = sortedItems.findIndex(i => i.id === lastSelectedId);
            const endIdx = sortedItems.findIndex(i => i.id === id);
            if (startIdx !== -1 && endIdx !== -1) {
                const min = Math.min(startIdx, endIdx);
                const max = Math.max(startIdx, endIdx);
                const idsInRange = sortedItems.slice(min, max + 1).map(i => i.id);
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

    // 🔥 신규 추가: 일괄 삭제 기능 (청크 처리 완료)
    const handleDeleteSelected = async () => {
        if (userProfile?.role !== '관리자') return alert('🚨 삭제 권한이 없습니다. 관리자에게 문의하세요.');
        if (selectedIds.length === 0) return alert('삭제할 항목을 체크해 주세요.');

        if (!window.confirm(`선택하신 ${selectedIds.length}건의 데이터를 정말 삭제하시겠습니까?\n이 작업은 영구적이며 복구할 수 없습니다.`)) return;

        try {
            const CHUNK_SIZE = 200;
            for (let i = 0; i < selectedIds.length; i += CHUNK_SIZE) {
                const chunk = selectedIds.slice(i, i + CHUNK_SIZE);
                const { error } = await supabase.from('logistics_accidents').delete().in('id', chunk);
                if (error) throw error;
            }
            alert(`🗑️ ${selectedIds.length}건의 데이터가 깔끔하게 삭제되었습니다.`);
            setSelectedIds([]);
            fetchAccidents();
        } catch (err) {
            alert('삭제 중 오류 발생: ' + err.message);
        }
    };

    const handleAiAnalysis = async () => {
        if (selectedIds.length === 0) return alert('분석할 항목을 먼저 체크박스로 선택해 주세요.');

        // 1. 선택된 데이터 중 '이미 분석된 항목'이 몇 개인지 스마트하게 자동 카운트
        const targetItems = sortedItems.filter(item => selectedIds.includes(item.id));
        const alreadyAnalyzedCount = targetItems.filter(item => item.ai_cause_detail).length;

        let forceReanalyze = false;

        // 2. 50건 초과 확인
        if (selectedIds.length > 50) {
            if (!window.confirm(`⚠️ 선택하신 건수가 ${selectedIds.length}건입니다.\nAI 분석은 1회 최대 50건까지 진행되며, 초과분은 다음에 다시 실행해 주세요.\n계속하시겠습니까?`)) return;
        }

        // 3. 스마트 분기: 이미 분석된 데이터가 1건이라도 포함되어 있다면?
        if (alreadyAnalyzedCount > 0) {
            const wantOverwrite = window.confirm(
                `선택하신 ${selectedIds.length}건 중 이미 분석이 완료된 데이터가 ${alreadyAnalyzedCount}건 포함되어 있습니다.\n\n기존 분석 결과를 무시하고 모두 '덮어쓰기' 하시겠습니까?\n(취소를 누르면 아직 분석되지 않은 항목만 골라서 진행합니다.)`
            );
            forceReanalyze = wantOverwrite;

            // 만약 전체가 싹 다 이미 분석된 건인데 사용자가 '취소(미분석건만 진행)'를 눌렀다면 중단
            if (!wantOverwrite && alreadyAnalyzedCount === selectedIds.length) {
                return alert('새로 분석할 대기 데이터가 없습니다. 취소되었습니다.');
            }
        } else {
            // 미분석 데이터만 깔끔하게 골랐을 때는 평범하게 진행 여부만 확인
            if (!window.confirm(`선택하신 ${selectedIds.length}건에 대해 AI 사고 원인 분석을 실행하시겠습니까?`)) return;
        }

        setIsLoading(true);
        setIsActionMenuOpen(false);

        try {
            const { data, error } = await supabase.functions.invoke('analyze-accidents', {
                body: { ids: selectedIds, forceReanalyze }
            });

            if (error) throw error;

            const stats = data?.confidence_stats || {};
            const statsMsg = Object.keys(stats).length > 0 ? `\n• 고신뢰: ${stats.high || 0}건 / 중: ${stats.medium || 0}건 / 저: ${stats.low || 0}건` : '';
            const truncMsg = data?.truncated ? '\n\n⚠️ 일부만 처리되었습니다. 나머지는 다시 실행해 주세요.' : '';

            let failMsg = '';
            if (data?.failed_count > 0 && data?.failure_reasons) {
                failMsg = '\n\n🚨 [실패 상세 내역]';
                Object.entries(data.failure_reasons).forEach(([reason, count]) => {
                    // 백엔드에서 넘어온 원시 에러 메시지를 사용자가 읽기 쉽게 번역
                    let readableReason = reason;
                    if (reason.includes('API_ERROR_429')) readableReason = 'AI 서버 요청 한도 초과 (잠시 후 다시 시도)';
                    else if (reason.includes('API_ERROR_503')) readableReason = 'AI 서버 일시적 응답 지연';
                    else if (reason.includes('parse_array_fail')) readableReason = 'AI 응답 형식 오류 (다시 시도)';
                    else if (reason.includes('ai_missed_record')) readableReason = 'AI가 해당 데이터를 분석 누락함';

                    failMsg += `\n- ${readableReason}: ${count}건`;
                });
            }

            alert(`✨ AI 분석이 완료되었습니다!\n처리: ${data?.processed_count ?? 0}건${statsMsg}${failMsg}${truncMsg}`);
            fetchAccidents();
            setSelectedIds([]);
        } catch (err) {
            console.error('AI 분석 호출 에러:', err);
            alert('AI 분석 중 오류가 발생했습니다.\n' + (err.message || ''));
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportExcel = async () => {
        if (selectedIds.length === 0) return alert('다운로드할 항목을 선택해 주세요.');
        const XLSX = await loadXLSXStyle();
        const targetItems = sortedItems.filter(item => selectedIds.includes(item.id));

        const headersMap = {
            service_date: '서비스예약일', brand: '브랜드', service_center: '서비스센터', service_type: '시공/AS',
            order_no: '수주번호', order_name: '수주건명', item_code: '품목코드', issue_qty: '이슈수량',
            action_result: '조치결과구분', is_delayed: '납기지연판별', zone: 'ZONE', worker_name: '작업자',
            shift_type: '주/야', status: '처리상태', responsible_dept: '귀책부서', cause_detail: '발생원인 상세',
            handler_team: '수행처', action_content: '조치내용', handler_name: '최종처리자',
            // 🤖 AI 분석 결과 4종 추가
            ai_analyzed_cause: 'AI 대분류',
            ai_cause_detail: 'AI 소분류',
            ai_cause_summary: 'AI 상세원인',
            ai_confidence: 'AI 신뢰도',
            created_at: '등록일시', updated_at: '수정일시'
        };

        // 엑셀 시트에 들어갈 JSON 데이터 배열 생성
        const excelData = targetItems.map(row => {
            const rowData = {};
            Object.keys(headersMap).forEach(key => {
                rowData[headersMap[key]] = row[key] || '';
            });
            return rowData;
        });

        const ws = XLSX.utils.json_to_sheet(excelData);
        // 열 너비 자동 조절 (선택사항)
        ws['!cols'] = Object.keys(headersMap).map(() => ({ wch: 15 }));

        // 모든 셀에 폰트 10pt 적용
        for (const cell in ws) {
            if (cell[0] === '!') continue;
            if (ws[cell]) {
                if (!ws[cell].s) ws[cell].s = {};
                if (!ws[cell].s.font) ws[cell].s.font = {};
                ws[cell].s.font.sz = 10;
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "사고분석_데이터");
        XLSX.writeFile(wb, `사고분석_데이터_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const MultiSelect = ({ label, options, selected, onChange, width = 'w-32' }) => {
        const [isOpen, setIsOpen] = useState(false);
        const toggleOption = (opt) => {
            if (opt === '전체') onChange([]);
            else onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
        };
        return (
            <div className="flex items-center shrink-0">
                <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">{label}</label>
                <div className="relative">
                    <div onClick={() => setIsOpen(!isOpen)} className={`border border-gray-200 rounded-[3px] bg-white px-2.5 h-[30px] ${width} flex items-center justify-between cursor-pointer hover:border-letusBlue transition-all text-xs`}>
                        <span className="truncate text-gray-700 font-medium">{selected.length === 0 ? '전체' : `${selected[0]}${selected.length > 1 ? ` 외 ${selected.length - 1}` : ''}`}</span>
                        <svg className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                    {isOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                            <div className="absolute top-[105%] left-0 w-48 bg-white border border-gray-200 rounded shadow-xl z-50 py-1.5 max-h-60 overflow-y-auto custom-scrollbar slide-up">
                                <div onClick={() => { toggleOption('전체'); setIsOpen(false); }} className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${selected.length === 0 ? 'text-letusBlue font-bold' : 'text-gray-600'}`}><input type="checkbox" readOnly checked={selected.length === 0} className="w-3.5 h-3.5 accent-letusBlue" /> 전체</div>
                                <div className="h-px bg-gray-100 my-1"></div>
                                {options.map(opt => (<div key={opt} onClick={() => toggleOption(opt)} className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${selected.includes(opt) ? 'text-letusBlue font-bold bg-blue-50/30' : 'text-gray-600'}`}><input type="checkbox" readOnly checked={selected.includes(opt)} className="w-3.5 h-3.5 accent-letusBlue" /> {opt}</div>))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    const handleFileUpload = async (filesObj) => {
        setIsLoading(true); setIsUploadModalOpen(false);
        const XLSX = await loadXLSXStyle();
        const applyFilters = filesObj.applyFilters;

        const readExcel = (file) => new Promise(res => {
            if (!file) return res([]);
            const reader = new FileReader();
            reader.onload = e => { const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true }); res(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, dateNF: 'yyyy-mm-dd' })); };
            reader.readAsBinaryString(file);
        });

        try {
            const rawAcc = filesObj.acc ? await readExcel(filesObj.acc) : [];
            const rawSch = filesObj.sch ? await readExcel(filesObj.sch) : [];
            let rawWms = [];
            if (filesObj.wms && filesObj.wms.length > 0) {
                const wmsPromises = filesObj.wms.map(f => readExcel(f));
                const wmsResults = await Promise.all(wmsPromises);
                rawWms = wmsResults.flat();
            }

            const findCol = (row, names) => { for (const n of names) { if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return row[n]; } return ''; };
            const cleanId = (v) => { if (!v) return ""; let s = String(v).trim().toUpperCase(); if (s.endsWith('.0')) s = s.slice(0, -2); return s; };
            const cleanTxt = (v) => v ? String(v).trim().replace(/\.0$/, '') : "";

            const normalizeDate = (d) => {
                if (!d) return 0;
                if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                let s = String(d).replace(/\./g, '-').replace(/\//g, '-').trim().split(' ')[0];
                if (/^\d{8}$/.test(s)) s = `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
                const parsed = new Date(s);
                if (!isNaN(parsed.getTime())) return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
                return 0;
            };

            const schMap = {};
            if (rawSch.length > 0) {
                rawSch.forEach(r => {
                    const id = cleanId(findCol(r, ['수주번호', '오더번호']));
                    if (!id) return;
                    if (!schMap[id]) schMap[id] = [];
                    const dVal = findCol(r, ['시공예정일', '서비스예약일', '예약일']);
                    const reworkFlag = findCol(r, ['재시공']);
                    schMap[id].push({ date: dVal, rework: reworkFlag ? String(reworkFlag).trim().toUpperCase() : '' });
                });
            }

            if (rawWms.length > 0 && rawAcc.length === 0) {
                const wmsByOrder = {};
                rawWms.forEach(r => {
                    const oId = cleanId(findCol(r, ['오더번호', '수주번호', '출고번호']));
                    if (!oId) return;
                    if (!wmsByOrder[oId]) wmsByOrder[oId] = [];
                    wmsByOrder[oId].push({
                        item: cleanTxt(findCol(r, ['ITEM ID', '단품코드', '품목코드'])), loc: findCol(r, ['LOCATION', '로케이션', '존', 'ZONE']), worker: findCol(r, ['작업자', '작업자명', '피커']), time: findCol(r, ['작업일시', '출고일시', '작업시간'])
                    });
                });

                const orderNos = Object.keys(wmsByOrder);
                if (orderNos.length === 0) { alert('WMS 데이터에서 유효한 오더번호를 찾지 못했습니다.'); setIsLoading(false); return; }

                let existingData = []; const FETCH_CHUNK = 200;
                for (let i = 0; i < orderNos.length; i += FETCH_CHUNK) {
                    const chunkOrders = orderNos.slice(i, i + FETCH_CHUNK);
                    const { data, error } = await supabase.from('logistics_accidents').select('id, order_no, item_code, location, zone, worker_name, shift_type').in('order_no', chunkOrders);
                    if (!error && data) existingData = [...existingData, ...data];
                }

                if (existingData.length === 0) { alert('DB에 등록된 사고 데이터 중 WMS 오더번호와 일치하는 건이 없습니다.\n(상차이슈를 먼저 업로드해 주세요!)'); setIsLoading(false); return; }

                const toUpdateMap = new Map();
                existingData.forEach(row => {
                    const wmsCandidates = wmsByOrder[row.order_no] || [];
                    if (wmsCandidates.length === 0) return;
                    let matchedWms = {};
                    if (wmsCandidates.length === 1) matchedWms = wmsCandidates[0];
                    else matchedWms = wmsCandidates.find(w => w.item.includes(row.item_code) || row.item_code.includes(w.item)) || wmsCandidates[0];
                    const loc = matchedWms.loc; 
                    const rawLocation = loc ? String(loc).trim() : '';
                    const newZone = rawLocation.toUpperCase().startsWith('P-3') ? 'DPC' : (rawLocation ? rawLocation[0].toUpperCase() : '');
                    let newShift = '-';
                    if (matchedWms.time) {
                        let h; if (matchedWms.time instanceof Date) h = matchedWms.time.getHours();
                        else { const d = new Date(matchedWms.time); if (!isNaN(d.getTime())) h = d.getHours(); }
                        if (h !== undefined) newShift = (h >= 9 && h < 18) ? '주간' : '야간';
                    }
                    if (row.zone !== newZone || row.worker_name !== matchedWms.worker || row.shift_type !== newShift || row.location !== rawLocation) {
                        toUpdateMap.set(row.id, { id: row.id, location: rawLocation || row.location, zone: newZone || row.zone, worker_name: matchedWms.worker || row.worker_name, shift_type: newShift !== '-' ? newShift : row.shift_type, updated_at: new Date().toISOString() });
                    }
                });

                const finalToUpdate = Array.from(toUpdateMap.values());
                if (finalToUpdate.length === 0) { alert('✅ WMS 정보가 이미 최신 상태로 모두 반영되어 있습니다.'); setIsLoading(false); return; }

                const CHUNK_SIZE = 500;
                for (let i = 0; i < finalToUpdate.length; i += CHUNK_SIZE) {
                    const chunk = finalToUpdate.slice(i, i + CHUNK_SIZE);
                    const { error } = await supabase.from('logistics_accidents').upsert(chunk, { onConflict: 'id' });
                    if (error) throw error;
                }
                alert(`🎉 WMS 정보 반영 완료!\n- ${finalToUpdate.length}건의 데이터에 [ZONE/작업자/주야] 정보가 업데이트 되었습니다.`);
            }
            else if (rawAcc.length > 0) {
                const wmsByOrder = {};
                rawWms.forEach(r => {
                    const oId = cleanId(findCol(r, ['오더번호', '수주번호', '출고번호']));
                    if (!oId) return;
                    if (!wmsByOrder[oId]) wmsByOrder[oId] = [];
                    wmsByOrder[oId].push({
                        item: cleanTxt(findCol(r, ['ITEM ID', '단품코드', '품목코드'])), loc: findCol(r, ['LOCATION', '로케이션', '존', 'ZONE']), worker: findCol(r, ['작업자', '작업자명', '피커']), time: findCol(r, ['작업일시', '출고일시', '작업시간'])
                    });
                });

                const validTypes = ['정상출고', '미출고', '오출고', '과출고', '물류파손', '시공파손', '현장직출', '센터직출', '납기연기(건)', '납기연기(품목)', '제품분실'];
                const processed = [];

                rawAcc.forEach(row => {
                    const brandStr = cleanTxt(row['브랜드']);
                    const issueStr = cleanTxt(findCol(row, ['발생원인 및 조치상세 내역', '이슈내용']));
                    if (applyFilters) {
                        if (brandStr.includes('이케아')) return;
                        if (issueStr.includes('[SCM팀 부족량 CUT 조치결과]')) return;
                    }
                    let type = cleanTxt(row['조치결과구분']);
                    if (!validTypes.includes(type)) {
                        if (type === '') type = '미확인';
                        else return;
                    }
                    const orderId = cleanId(findCol(row, ['수주번호']));
                    if (!orderId) return;

                    const accDate = findCol(row, ['서비스예약일', '예약일', '시공예정일']);

                    let delayCount = 0;
                    if (schMap[orderId]) {
                        const hasDelay = schMap[orderId].some(item => item.rework === 'R');
                        if (hasDelay) delayCount = 1;
                    }
                    const isDelayed = delayCount > 0 ? "재일정(지연)" : "-";

                    const item = cleanTxt(findCol(row, ['단품코드', '품목코드']));
                    const color = cleanTxt(row['색상']);
                    let finalItemCode = item;
                    if (color && !item.includes(color) && !item.includes('-')) { finalItemCode = `${item}-${color}`; }
                    const wmsCandidates = wmsByOrder[orderId] || [];
                    let matchedWms = {};
                    if (wmsCandidates.length === 1) matchedWms = wmsCandidates[0];
                    else if (wmsCandidates.length > 1) matchedWms = wmsCandidates.find(w => w.item.includes(item) || item.includes(w.item)) || wmsCandidates[0];
                    const loc = matchedWms.loc;
                    const rawLocation = loc ? String(loc).trim() : '';
                    const zone = rawLocation.toUpperCase().startsWith('P-3') ? 'DPC' : (rawLocation ? rawLocation[0].toUpperCase() : '');
                    let shift = '-';
                    if (matchedWms.time) {
                        let h; if (matchedWms.time instanceof Date) h = matchedWms.time.getHours();
                        else { const d = new Date(matchedWms.time); if (!isNaN(d.getTime())) h = d.getHours(); }
                        if (h !== undefined) shift = (h >= 9 && h < 18) ? '주간' : '야간';
                    }
                    const isNormal = type === '정상출고';
                    processed.push({
                        service_date: accDate && String(accDate).trim() !== '' ? accDate : null, brand: brandStr || '알수없음', service_center: row['서비스센터'] || '', service_type: row['시공/AS'] || '',
                        order_no: orderId, order_name: row['수주건명'] || '', item_code: finalItemCode, issue_qty: parseInt(row['이슈수량']) || 0,
                        action_result: type, is_delayed: isDelayed, location: rawLocation, zone: zone, worker_name: matchedWms.worker || '', shift_type: shift,
                        cause_detail: issueStr || '',
                        ...(isNormal ? { ai_analyzed_cause: 'E-03', ai_cause_detail: '정상 출고', ai_confidence: 'high' } : {}),
                        status: '원인 파악 중'
                    });
                });

                if (processed.length === 0) { alert('분석 결과 저장할 데이터가 없습니다.'); setIsLoading(false); return; }
                const orderNos = [...new Set(processed.map(p => p.order_no))];

                let existingData = []; const FETCH_CHUNK = 200;
                for (let i = 0; i < orderNos.length; i += FETCH_CHUNK) {
                    const chunkOrders = orderNos.slice(i, i + FETCH_CHUNK);
                    const { data, error } = await supabase.from('logistics_accidents').select('id, order_no, item_code, is_delayed, location, zone, worker_name, shift_type, ai_analyzed_cause').in('order_no', chunkOrders);
                    if (!error && data) existingData = [...existingData, ...data];
                }

                const existingMap = new Map();
                (existingData || []).forEach(d => { existingMap.set(`${d.order_no}_${d.item_code}`, d); });
                const toInsert = []; const toUpdate = [];
                processed.forEach(p => {
                    const key = `${p.order_no}_${p.item_code}`;
                    const existingRow = existingMap.get(key);
                    if (!existingRow) { toInsert.push(p); }
                    else {
                        let finalDelayed = existingRow.is_delayed;
                        if (p.is_delayed === '재일정(지연)') finalDelayed = '재일정(지연)';
                        let finalZone = existingRow.zone; let finalLocation = existingRow.location; let finalWorker = existingRow.worker_name; let finalShift = existingRow.shift_type;
                        if (p.worker_name) { finalZone = p.zone; finalLocation = p.location; finalWorker = p.worker_name; finalShift = p.shift_type; }
                        toUpdate.push({
                            id: existingRow.id, service_date: p.service_date, brand: p.brand, service_center: p.service_center, service_type: p.service_type,
                            order_no: p.order_no, order_name: p.order_name, item_code: p.item_code, issue_qty: p.issue_qty, action_result: p.action_result,
                            is_delayed: finalDelayed, location: finalLocation, zone: finalZone, worker_name: finalWorker, shift_type: finalShift,
                            cause_detail: p.cause_detail,
                            ...(p.action_result === '정상출고' && !existingRow.ai_analyzed_cause ? { ai_analyzed_cause: 'E-03', ai_cause_detail: '정상 출고', ai_confidence: 'high' } : {}),
                            updated_at: new Date().toISOString()
                        });
                    }
                });

                // 🔥 중복 제거 로직
                const uniqueUpdateMap = new Map();
                toUpdate.forEach(item => uniqueUpdateMap.set(item.id, item));
                const finalToUpdate = Array.from(uniqueUpdateMap.values());

                const uniqueInsertMap = new Map();
                toInsert.forEach(item => uniqueInsertMap.set(`${item.order_no}_${item.item_code}`, item));
                const finalToInsert = Array.from(uniqueInsertMap.values());

                if (finalToInsert.length === 0 && finalToUpdate.length === 0) { alert(`✅ 이미 최신 상태입니다.`); setIsLoading(false); return; }

                const CHUNK_SIZE = 500;
                if (finalToInsert.length > 0) {
                    for (let i = 0; i < finalToInsert.length; i += CHUNK_SIZE) {
                        const chunk = finalToInsert.slice(i, i + CHUNK_SIZE);
                        const { error } = await supabase.from('logistics_accidents').insert(chunk);
                        if (error) throw error;
                    }
                }
                if (finalToUpdate.length > 0) {
                    for (let i = 0; i < finalToUpdate.length; i += CHUNK_SIZE) {
                        const chunk = finalToUpdate.slice(i, i + CHUNK_SIZE);
                        const { error } = await supabase.from('logistics_accidents').upsert(chunk, { onConflict: 'id' });
                        if (error) throw error;
                    }
                }
                alert(`🎉 업데이트 완료!\n- 신규: ${finalToInsert.length}건\n- 수정: ${finalToUpdate.length}건\n(중복 제외됨)`);
            }
            else if (rawSch.length > 0) {
                const orderNos = Object.keys(schMap);
                let existingData = []; const FETCH_CHUNK = 200;
                for (let i = 0; i < orderNos.length; i += FETCH_CHUNK) {
                    const chunkOrders = orderNos.slice(i, i + FETCH_CHUNK);
                    const { data, error } = await supabase.from('logistics_accidents').select('id, order_no, service_date, is_delayed').in('order_no', chunkOrders);
                    if (!error && data) existingData = [...existingData, ...data];
                }

                const toUpdate = [];
                existingData.forEach(row => {
                    let isDelayedNow = false;
                    if (schMap[row.order_no]) { isDelayedNow = schMap[row.order_no].some(item => item.rework === 'R'); }
                    if (isDelayedNow && row.is_delayed !== '재일정(지연)') {
                        toUpdate.push({ id: row.id, is_delayed: '재일정(지연)', updated_at: new Date().toISOString() });
                    }
                });

                if (toUpdate.length > 0) {
                    const UPDATE_CHUNK = 500;
                    for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
                        const chunk = toUpdate.slice(i, i + UPDATE_CHUNK);
                        const { error } = await supabase.from('logistics_accidents').upsert(chunk, { onConflict: 'id' });
                        if (error) throw error;
                    }
                    alert(`✅ 지연 업데이트 완료 (${toUpdate.length}건)`);
                } else { alert('✅ 새롭게 지연된 건이 없습니다.'); }
            }
            fetchAccidents();
        } catch (error) {
            console.error('❌ 업로드 에러 전문:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
                full: error
            });
            alert(`오류: ${error.message}\n상세: ${error.details || '-'}\n힌트: ${error.hint || '-'}\n코드: ${error.code || '-'}`);
            setIsLoading(false);
        }
    };

    return (
        // 🚩 [수정 완료] 맨 위에 두 겹으로 겹쳐있던 div를 완벽한 템플릿 하나로 합쳤습니다!
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* 1. 검색 박스 구역 (사용자 관리 스타일로 통일) */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex flex-col gap-3 z-30 shrink-0 transition-all duration-300">
                <div className="flex items-center gap-5 w-full flex-wrap">
                    <MultiSelect label="브랜드" options={['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소']} selected={draftFilters.brands} onChange={(val) => setDraftFilters({ ...draftFilters, brands: val })} />

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">서비스예약일</label>
                        <DateRangeInput
                            startDate={draftFilters.startDate}
                            endDate={draftFilters.endDate}
                            onChange={(s, e) => setDraftFilters({ ...draftFilters, startDate: s, endDate: e })}
                        />
                    </div>

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">검색어</label>
                        <div className="flex gap-0 h-[30px]">
                            <select value={draftFilters.searchType} onChange={e => setDraftFilters({ ...draftFilters, searchType: e.target.value })} className="border border-gray-200 border-r-0 rounded-l-[3px] text-xs px-2 text-gray-700 bg-gray-50 focus:outline-none cursor-pointer h-full">
                                <option>수주건명</option>
                                <option>수주번호</option>
                                <option>품목코드</option>
                            </select>
                            <input type="text" value={draftFilters.searchValue} onChange={e => setDraftFilters({ ...draftFilters, searchValue: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleSearchClick()} className="border border-gray-200 rounded-r-[3px] text-xs px-2.5 w-36 focus:outline-none focus:border-letusOrange h-full" placeholder="검색어 입력" />
                        </div>
                    </div>

                    <div className="flex items-center shrink-0 bg-blue-50/50 px-3 h-[30px] rounded-[3px] border border-blue-100">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-letusBlue h-full">
                            <input type="checkbox" checked={draftFilters.excludeNormal} onChange={e => setDraftFilters({ ...draftFilters, excludeNormal: e.target.checked })} className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                            '정상출고' 제외
                        </label>
                    </div>

                    <div className="ml-auto shrink-0 flex items-center gap-2">
                        <button onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className={`text-[11px] font-bold border px-3 h-[30px] rounded-[3px] transition-colors flex items-center gap-1 shadow-sm ${isAdvancedOpen ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                            <svg className={`w-3.5 h-3.5 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            상세 조회
                        </button>
                        <div className="w-px h-4 bg-gray-200 mx-1"></div>
                        <button onClick={handleResetClick} className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] transition-colors text-xs">초기화</button>
                        <SearchButton onClick={handleSearchClick} />
                    </div>
                </div>

                {isAdvancedOpen && (
                    <div className="flex flex-col gap-3 pt-3 mt-1 border-t border-gray-100 slide-up">
                        <div className="flex items-center gap-6 w-full flex-wrap">
                            <MultiSelect label="서비스센터" options={['양지센터', '대전센터', '대구센터', '광주센터', '전북센터', '전남센터', '부산센터', '울산센터', '창원센터', '제주센터']} selected={draftFilters.centers} onChange={(val) => setDraftFilters({ ...draftFilters, centers: val })} width="w-40" />
                            <MultiSelect label="시공/AS" options={['시공', 'AS']} selected={draftFilters.serviceTypes} onChange={(val) => setDraftFilters({ ...draftFilters, serviceTypes: val })} width="w-24" />
                            <MultiSelect label="처리상태" options={['원인 파악 중', '등록 완료']} selected={draftFilters.statuses} onChange={(val) => setDraftFilters({ ...draftFilters, statuses: val })} width="w-32" />
                            <MultiSelect label="귀책부서" options={['물류사업1팀', '물류사업2팀', '운송사업팀', '컨택센터', '라스트마일1팀', '라스트마일2팀', '기타']} selected={draftFilters.depts} onChange={(val) => setDraftFilters({ ...draftFilters, depts: val })} width="w-40" />

                            {/* 🚩 라벨명 수정: 조치결과 -> 확인 결과 */}
                            <MultiSelect label="확인 결과" options={['정상출고', '미출고', '오출고', '과출고', '물류파손', '시공파손', '현장직출', '센터직출', '납기연기(건)', '납기연기(품목)', '제품분실']} selected={draftFilters.actionResults} onChange={(val) => setDraftFilters({ ...draftFilters, actionResults: val })} width="w-40" />

                            <div className="flex items-center shrink-0">
                                <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">지연판별</label>
                                <select value={draftFilters.isDelayed} onChange={e => setDraftFilters({ ...draftFilters, isDelayed: e.target.value })} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange cursor-pointer bg-white text-gray-700 w-32 font-medium">
                                    <option value="전체">전체 (All)</option>
                                    <option value="지연">재일정(지연)</option>
                                    <option value="정상">정상(지연없음)</option>
                                </select>
                            </div>

                            {/* 🚩 AI 분석 뷰 토글 스위치 (관리자 전용, 가장 우측 배치) */}
                            {userProfile?.role === '관리자' && (
                                <div className="flex items-center ml-auto pl-4 border-l border-gray-200 shrink-0">
                                    <button
                                        onClick={() => setIsAiView(!isAiView)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-[4px] text-xs font-black transition-all border ${isAiView
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                            : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'
                                            }`}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        {isAiView ? 'AI 분석 뷰 ON' : 'AI 분석 뷰 OFF'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 2. 선택실행 (드롭다운) 구역 (사용자 관리 스타일로 통일) */}
            <div className="flex justify-end w-full px-2 z-30 -mt-1 mb-1 shrink-0 gap-3">

                {userProfile?.role === '관리자' && (
                    <button onClick={() => setIsUploadModalOpen(true)} className="bg-white border border-green-600 text-green-600 px-4 py-[7px] rounded-[3px] text-[11px] font-bold flex items-center cursor-pointer hover:bg-green-50 transition-colors shadow-sm h-[32px]">
                        <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21.17 3.25q.33 0 .59.25q.24.26.24.59v15.82q0 .33-.24.59q-.26.25-.59.25H2.83q-.33 0-.59-.25q-.24-.26-.24-.59V4.09q0-.33.24-.59q.26-.25.59-.25h18.34zm-8.25 10.9l3.52 4.67h2.7l-4.9-6.07 4.65-5.94h-2.65l-3.23 4.48-3.32-4.48H7.07l4.76 5.94-5 6.07h2.72l3.37-4.67z" /></svg> 데이터 통합 업로드 (Excel)
                    </button>
                )}

                <button onClick={resetColSettings}
                    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    title="컬럼 너비·순서를 기본값으로 초기화">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    칼럼 초기화
                </button>

                <div className="relative z-50">
                    <button
                        onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                        className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[90px] h-[32px]"
                    >
                        선택실행 {selectedIds.length > 0 && `(${selectedIds.length})`}
                        <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {isActionMenuOpen && (
                        <>
                            <div className="fixed inset-0" onClick={() => setIsActionMenuOpen(false)}></div>
                            <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">

                                {/* 🚩 🤖 단일화된 AI 분석 실행 버튼 */}
                                <button
                                    onClick={handleAiAnalysis}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-purple-600 hover:bg-purple-50 transition-colors flex items-center justify-between"
                                >
                                    AI 원인 분석 실행
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                </button>

                                <div className="h-px bg-gray-100 my-1"></div>

                                <button
                                    onClick={() => { setIsActionMenuOpen(false); if (selectedIds.length === 0) return alert('항목을 체크해 주세요.'); setIsBulkEditModalOpen(true); }}
                                    className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors ${selectedIds.length > 0 ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
                                >
                                    일괄 마감 (수정)
                                </button>

                                <div className="h-px bg-gray-100 my-1"></div>

                                <button
                                    onClick={() => { setIsActionMenuOpen(false); handleExportExcel(); }}
                                    className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors flex items-center justify-between ${selectedIds.length > 0 ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 cursor-not-allowed'}`}
                                >
                                    엑셀 추출
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                </button>

                                {userProfile?.role === '관리자' && (
                                    <>
                                        <div className="h-px bg-gray-100 my-1"></div>
                                        <button
                                            onClick={() => { setIsActionMenuOpen(false); handleDeleteSelected(); }}
                                            className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex justify-between items-center ${selectedIds.length > 0 ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}
                                        >
                                            삭제
                                            {selectedIds.length > 0 && <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 🚩 문제 1 해결: 표 컨테이너에 flex-1 을 주어 남은 공간을 꽉 채우도록 만듦! */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left whitespace-nowrap table-fixed text-[13px]">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-6 w-10 text-center">
                                    <input
                                        type="checkbox"
                                        checked={sortedItems.length > 0 && selectedIds.length === sortedItems.length}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 cursor-pointer accent-letusBlue"
                                    />
                                </th>
                                {colOrder.map((origIdx, visualIdx) => {
                                    const col = activeColumns[origIdx];
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
                                            <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                                onMouseDown={(e) => handleResizeStart(e, visualIdx)} onClick={e => e.stopPropagation()} />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                            {isLoading ? (
                                <tr><td colSpan={colOrder.length + 1} className="py-32 text-center"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div><p className="text-gray-500 font-bold">데이터 로딩 중...</p></div></td></tr>
                            ) : sortedItems.length === 0 ? (
                                <tr><td colSpan={colOrder.length + 1} className="p-20 text-center text-gray-400 font-bold">조회 결과가 없습니다.</td></tr>
                            ) : (
                                <>
                                    {sortedItems.slice(0, 300).map(row => (
                                        <tr key={row.id}
                                            className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(row.id) ? 'bg-blue-50' : ''}`}
                                            onDoubleClick={() => { window.getSelection()?.removeAllRanges(); setActiveRow(row); }}>
                                            <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(row.id)}
                                                    onChange={(e) => handleSelectOne(e, row.id)}
                                                    className="w-4 h-4 cursor-pointer accent-letusBlue"
                                                />
                                            </td>
                                            {colOrder.map(origIdx => renderCell(origIdx, row))}
                                        </tr>
                                    ))}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {activeRow && <AccidentModal row={activeRow} onClose={() => setActiveRow(null)} onReload={fetchAccidents} userProfile={userProfile} />}
            {isUploadModalOpen && <AccidentUploadModal onClose={() => setIsUploadModalOpen(false)} onFileUpload={handleFileUpload} />}

            {/* 🔥 일괄 수정 모달 컴포넌트 추가 */}
            {isBulkEditModalOpen && <AccidentBulkEditModal selectedIds={selectedIds} onClose={() => { setIsBulkEditModalOpen(false); setSelectedIds([]); }} onReload={fetchAccidents} userProfile={userProfile} />}
        </div>
    );
};

// 🌟 전역 등록 (MainLayout과 App에서 찾아쓸 수 있게)

export { AccidentList };
