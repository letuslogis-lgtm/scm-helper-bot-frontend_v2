import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from './supabaseClient.js';
import { StatusBadge, CategoryBadge, formatDateTime, SearchButton, DateRangeInput } from './SharedUI.jsx';
import { RequestModal, HandleModal, DeptReplyModal } from './SupportCenter.jsx';
import { loadXLSX } from './utils.js';



// SharedUI에서 가져옴

const DEFAULT_COLUMNS = [
    { label: '접수번호',   key: 'reception_no',  w: 200 },
    { label: '소속 브랜드', key: 'brand',          w: 100 },
    { label: '품목코드',   key: 'product_code',   w: 150 },
    { label: '유형',      key: 'issue_type',      w: 160 },
    { label: '접수자',    key: 'reporter',        w: 90  },
    { label: '공급업체',   key: 'vendor',          w: 120 },
    { label: '처리상태',   key: 'status',          w: 100 },
    { label: '알림톡',    key: 'is_notified',     w: 80  },
    { label: '요청내용',   key: null,              w: 110 },
    { label: '처리 내용',  key: null,              w: 110 },
    { label: '최종 처리자', key: 'final_handler',  w: 120 },
    { label: '최종 처리일시', key: 'resolved_at',  w: 150 },
];

// --- 특이사항 리스트 (IssueList) 🌟 화면 고정 & 내부 스크롤 완벽 적용 ---
const IssueList = ({ issues = [], isLoading = false, onReload, savedFilters, setSavedFilters, userProfile }) => {
    const [activeModalRow, setActiveModalRow] = useState(null);
    const [activeHandleRow, setActiveHandleRow] = useState(null);
    const [activeDeptReplyRow, setActiveDeptReplyRow] = useState(null);
    const [similarModal, setSimilarModal] = useState(null); // { row, loading, candidates }
    const [selectedIds, setSelectedIds] = useState([]);
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [isSendingFeedback, setIsSendingFeedback] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });
    const [draftFilters, setDraftFilters] = useState({ ...savedFilters });
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [searchParams] = useSearchParams();
    useEffect(() => {
        const brand = searchParams.get('brand');
        const vendor = searchParams.get('vendor');
        const item_code = searchParams.get('item_code');
        if (!brand && !vendor && !item_code) return;
        const _t = new Date();
        const today = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, '0')}-${String(_t.getDate()).padStart(2, '0')}`;
        const d = new Date(); d.setDate(d.getDate() - 30);
        const startStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const updates = {
            ...(brand ? { brand } : {}),
            ...(vendor ? { searchType: '공급업체', searchValue: vendor } : {}),
            ...(item_code ? { searchType: '품목코드', searchValue: item_code } : {}),
            startDate: startStr, endDate: today,
        };
        setDraftFilters(prev => ({ ...prev, ...updates }));
        setSavedFilters(prev => ({ ...prev, ...updates }));
    }, []);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [reporterTeamMap, setReporterTeamMap] = useState({});

    // 컬럼 너비 & 순서 (localStorage 사용자별 저장)
    const [colOrder, setColOrder] = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths] = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef = useRef(null);
    const dragSrcRef = useRef(null);
    const wasDraggedRef = useRef(false);

    useEffect(() => {
        if (!userProfile?.id) return;
        try {
            const saved = JSON.parse(localStorage.getItem(`letus_col_${userProfile.id}`));
            if (saved?.order?.length === DEFAULT_COLUMNS.length) setColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS.length) setColWidths(saved.widths);
        } catch {}
    }, [userProfile?.id]);

    useEffect(() => {
        if (!userProfile?.id) return;
        localStorage.setItem(`letus_col_${userProfile.id}`, JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths, userProfile?.id]);

    // 유사코드 조회 (바코드 불량 건)
    const handleFindSimilar = async (row) => {
        if (!row.product_code || !row.brand) return;
        setSimilarModal({ row, loading: true, candidates: [] });
        try {
            const { data, error } = await supabase.functions.invoke('find-similar-codes', {
                body: { scanned_code: row.product_code, brand: row.brand },
            });
            if (error) throw error;
            setSimilarModal({ row, loading: false, candidates: data?.candidates || [] });
        } catch (err) {
            console.error('유사코드 조회 실패:', err);
            setSimilarModal({ row, loading: false, candidates: [] });
        }
    };

    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS.map(c => c.w));
        if (userProfile?.id) localStorage.removeItem(`letus_col_${userProfile.id}`);
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

    const handleDragStart = (e, visualIdx) => {
        dragSrcRef.current = visualIdx; wasDraggedRef.current = false;
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
    const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

    const renderCell = (origIdx, row) => {
        switch (origIdx) {
            case 0:  return <td key={origIdx} className="p-4 font-bold text-gray-800 text-center">{row.reception_no}</td>;
            case 1:  return <td key={origIdx} className="p-4 font-semibold text-gray-700 text-center">{row.brand}</td>;
            case 2:  return (
                <td key={origIdx} className="p-4 text-gray-600 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                        <span className="truncate max-w-[120px]" title={row.product_code}>{row.product_code}</span>
                        {row.issue_type === '바코드 불량' && (
                            <button
                                onClick={() => handleFindSimilar(row)}
                                className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                                title="유사 품목코드 중 입고계획 있는 건 조회"
                            >입고계획</button>
                        )}
                    </div>
                </td>
            );
            case 3:  return <td key={origIdx} className="p-4 text-center"><CategoryBadge category={row.issue_type} /></td>;
            case 4:  return <td key={origIdx} className="p-4 text-gray-600 text-center">{row.reporter || '물류담당자'}</td>;
            case 5:  return <td key={origIdx} className="p-4 text-gray-700 font-semibold text-center">{row.vendor || '-'}</td>;
            case 6:  return <td key={origIdx} className="p-4 text-center"><StatusBadge status={row.status} category={row.issue_type} /></td>;
            case 7:  return <td key={origIdx} className="p-4 text-center">{row.is_notified ? (<div className="flex justify-center"><span className="flex items-center justify-center w-5 h-5 bg-blue-100 text-blue-600 border border-blue-200 rounded-full shadow-sm" title={`전송완료: ${formatDateTime(row.feedback_sent_at)}`}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></span></div>) : <span className="text-gray-300 font-bold">-</span>}</td>;
            case 8:  return <td key={origIdx} className="p-4 text-center" onClick={e => e.stopPropagation()}>{userProfile?.role === '사용자' ? <span className="text-xs font-bold border px-3 py-1.5 rounded w-[76px] inline-block text-center bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed">{row.status === '조치대기' ? '요청등록' : '요청확인'}</span> : <button onClick={() => setActiveModalRow(row)} className={`text-xs font-bold border px-3 py-1.5 rounded transition-colors shadow-sm w-[76px] ${row.status === '조치대기' ? 'bg-gray-50 text-gray-500' : 'bg-white text-letusBlue border-blue-200 hover:bg-blue-50'}`}>{row.status === '조치대기' ? '요청등록' : '요청확인'}</button>}</td>;
            case 9: {
                const isAdmin = userProfile?.role !== '사용자';
                if (isAdmin) {
                    const adminBtnMap = {
                        '이관 중':      { label: '이관 중', cls: 'bg-orange-50 text-orange-500 border-orange-200 cursor-not-allowed opacity-60', disabled: true },
                        '처리 중':      { label: '조치 등록', cls: 'bg-yellow-50 text-yellow-600 border-yellow-300 hover:bg-yellow-100' },
                        '이관부서 확인': { label: '회신 확인', cls: 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100' },
                        '조치완료':     { label: '조치 확인', cls: 'bg-white text-green-600 border-green-200 hover:bg-green-50' },
                    };
                    const btn = adminBtnMap[row.status];
                    return <td key={origIdx} className="p-4 text-center" onClick={e => e.stopPropagation()}>{btn ? <button onClick={() => !btn.disabled && setActiveHandleRow(row)} disabled={!!btn.disabled} className={`text-xs font-bold border px-3 py-1.5 rounded transition-colors shadow-sm w-[76px] ${btn.cls}`}>{btn.label}</button> : <span className="text-gray-300">-</span>}</td>;
                } else {
                    if (row.status === '이관 중') return <td key={origIdx} className="p-4 text-center" onClick={e => e.stopPropagation()}><button onClick={() => setActiveDeptReplyRow(row)} className="text-xs font-bold border px-3 py-1.5 rounded transition-colors shadow-sm w-[76px] bg-blue-50 text-letusBlue border-blue-200 hover:bg-blue-100">회신 등록</button></td>;
                    if (row.status === '이관부서 확인') return <td key={origIdx} className="p-4 text-center" onClick={e => e.stopPropagation()}><span className="text-xs font-bold border px-3 py-1.5 rounded w-[76px] inline-block text-center bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed">회신완료</span></td>;
                    return <td key={origIdx} className="p-4 text-center"><span className="text-gray-300">-</span></td>;
                }
            }
            case 10: return <td key={origIdx} className="p-4 text-gray-600 font-medium text-center">{row.final_handler || '-'}</td>;
            case 11: return <td key={origIdx} className="p-4 text-gray-500 font-mono text-xs text-center">{formatDateTime(row.resolved_at)}</td>;
            default: return null;
        }
    };

    useEffect(() => { setDraftFilters({ ...savedFilters }); }, [savedFilters]);

    // 접수자 이름 목록으로 profiles 에서 팀 매핑 조회
    useEffect(() => {
        if (!issues || issues.length === 0) return;
        const reporters = [...new Set(issues.map(i => i.reporter).filter(Boolean))];
        if (reporters.length === 0) return;
        supabase.from('profiles').select('name, team').in('name', reporters).then(({ data }) => {
            if (!data) return;
            const map = {};
            data.forEach(p => { if (p.name && p.team) map[p.name] = p.team; });
            setReporterTeamMap(map);
        });
    }, [issues]);
    const handleSearch = () => { setSavedFilters({ ...draftFilters }); };

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

    const teamOptions = useMemo(() => {
        const teams = new Set(Object.values(reporterTeamMap).filter(Boolean));
        return [...teams].sort();
    }, [reporterTeamMap]);

    const filteredIssues = useMemo(() => {
        return issues.filter(issue => {
            const filterBrands = Array.isArray(savedFilters.brand) ? savedFilters.brand : (savedFilters.brand === '전체' ? [] : [savedFilters.brand]);
            const filterStatus = Array.isArray(savedFilters.status) ? savedFilters.status : (savedFilters.status === '전체' ? [] : [savedFilters.status]);
            const filterTeams = Array.isArray(savedFilters.teams) ? savedFilters.teams : (savedFilters.teams === '전체' ? [] : [savedFilters.teams]);
            if (filterBrands.length > 0 && !filterBrands.includes(issue.brand)) return false;
            if (filterStatus.length > 0 && !filterStatus.includes(issue.status)) return false;
            if (filterTeams.length > 0) {
                const issueTeam = reporterTeamMap[issue.reporter];
                if (!issueTeam || !filterTeams.includes(issueTeam)) return false;
            }
            if (issue.created_at) {
                const issueDate = issue.created_at.split('T')[0];
                if (issueDate < savedFilters.startDate || issueDate > savedFilters.endDate) return false;
            }
            if (savedFilters.searchValue) {
                const val = savedFilters.searchValue.toLowerCase();
                if (savedFilters.searchType === '품목코드' && !issue.product_code?.toLowerCase().includes(val)) return false;
                if (savedFilters.searchType === '공급업체' && !(issue.vendor || issue.brand || '').toLowerCase().includes(val)) return false;
                if (savedFilters.searchType === '처리자' && !issue.final_handler?.toLowerCase().includes(val)) return false;
            }
            return true;
        });
    }, [issues, savedFilters, reporterTeamMap]);

    const sortedIssues = useMemo(() => {
        let items = [...filteredIssues];
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
    }, [filteredIssues, sortConfig]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key) {
            if (sortConfig.direction === 'asc') direction = 'desc';
            else if (sortConfig.direction === 'desc') direction = 'none';
        }
        setSortConfig({ key: direction === 'none' ? null : key, direction });
    };

    const handleDeleteSelected = async () => {
        if (userProfile?.role !== '관리자') return alert('🚨 삭제 권한이 없습니다. 관리자에게 문의하세요.');
        if (selectedIds.length === 0) return alert('삭제할 항목을 체크해 주세요.');
        if (!window.confirm(`선택하신 ${selectedIds.length}건의 데이터를 정말 삭제하시겠습니까?\n이 작업은 영구적이며 복구할 수 없습니다.`)) return;
        try {
            const CHUNK_SIZE = 200;
            for (let i = 0; i < selectedIds.length; i += CHUNK_SIZE) {
                const chunk = selectedIds.slice(i, i + CHUNK_SIZE);
                const { error } = await supabase.from('logistics_issues').delete().in('id', chunk);
                if (error) throw error;
            }
            alert(`🗑️ ${selectedIds.length}건의 데이터가 삭제되었습니다.`);
            setSelectedIds([]);
            await onReload();
        } catch (err) {
            alert('삭제 중 오류 발생: ' + err.message);
        }
    };

    const handleSendFeedback = async () => { /* 기존 로직과 동일 */
        if (selectedIds.length === 0) return alert('피드백을 전송할 항목을 1개 이상 선택해 주세요.');
        const invalidItems = issues.filter(i => selectedIds.includes(i.id) && i.status !== '조치완료');
        if (invalidItems.length > 0) return alert(`⚠️ 전송 실패\n'조치완료' 상태인 항목만 전송 가능합니다.`);
        if (!window.confirm(`선택하신 ${selectedIds.length}건의 피드백을 전송하시겠습니까?`)) return;
        setIsSendingFeedback(true);
        try {
            const { error } = await supabase.from('logistics_issues').update({ is_notified: true, feedback_sent_at: new Date().toISOString() }).in('id', selectedIds);
            if (error) throw error;
            alert(`✅ ${selectedIds.length}건의 피드백 전송이 완료되었습니다.`);
            setSelectedIds([]);
            await onReload();
        } catch (err) { alert('피드백 전송 중 오류 발생'); } finally { setIsSendingFeedback(false); }
    };

    const handleRevertSelectedIssues = async () => { /* 기존 로직과 동일 */
        if (selectedIds.length === 0) return alert('원복할 항목을 선택해 주세요.');
        if (userProfile?.role === '사용자') return alert('이 작업은 관리자만 수행할 수 있습니다.');
        if (!window.confirm(`선택하신 ${selectedIds.length}건의 이슈를 '조치대기' 상태로 원복하시겠습니까?`)) return;
        try {
            const { error } = await supabase.from('logistics_issues').update({ status: '조치대기', final_handler: '', action_content: '', resolved_at: null, is_notified: false, feedback_sent_at: null }).in('id', selectedIds);
            if (error) throw error;
            alert('초기화되었습니다.');
            setSelectedIds([]);
            await onReload();
        } catch (err) { alert('오류 발생'); }
    };

    const handleSelectAll = (e) => setSelectedIds(e.target.checked ? sortedIssues.map(i => i.id) : []);
    const handleSelectOne = (e, id) => {
        if (e && e.nativeEvent && e.nativeEvent.shiftKey && lastSelectedId) {
            const startIdx = sortedIssues.findIndex(i => i.id === lastSelectedId);
            const endIdx = sortedIssues.findIndex(i => i.id === id);
            if (startIdx !== -1 && endIdx !== -1) {
                const min = Math.min(startIdx, endIdx);
                const max = Math.max(startIdx, endIdx);
                const idsInRange = sortedIssues.slice(min, max + 1).map(i => i.id);
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

    const handleExportExcel = async () => {
        if (sortedIssues.length === 0) return alert('데이터가 없습니다.');
        const XLSX = await loadXLSX();

        // 엑셀 시트에 들어갈 JSON 데이터 배열 생성
        const excelData = sortedIssues.map(row => ({
            '접수번호': row.reception_no || '',
            '소속 브랜드': row.brand || '',
            '품목코드': row.product_code || '',
            '유형': row.issue_type || '',
            '접수자': row.reporter || '',
            '공급업체': row.vendor || '',
            '처리상태': row.status || '',
            '요청내용': row.request_content || '',
            '처리내용': row.action_content || '',
            '최종 처리자': row.final_handler || '',
            '최종 처리일시': formatDateTime(row.resolved_at) || ''
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 10 }, { wch: 40 }, { wch: 40 }, { wch: 12 }, { wch: 20 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "특이사항_LIST");
        XLSX.writeFile(wb, `특이사항_LIST_${new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]}.xlsx`);
    };

    return (
        // 🚩 [수정] 껍데기가 두 겹이던 것을 완벽한 하나의 레이아웃으로 합쳤습니다!
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* 1. 검색 박스 구역 (사용자 관리 스타일로 통일) */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex flex-col z-30 shrink-0">
                <div className="flex items-center gap-5 w-full flex-wrap">

                    <MultiSelect label="브랜드" options={['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소']} selected={draftFilters.brand} onChange={(val) => setDraftFilters({ ...draftFilters, brand: val })} />

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">등록일자</label>
                        <DateRangeInput
                            startDate={draftFilters.startDate}
                            endDate={draftFilters.endDate}
                            onChange={(start, end) => setDraftFilters({ ...draftFilters, startDate: start, endDate: end })}
                        />
                    </div>

                    <MultiSelect label="처리상태" options={['조치대기', '이관 중', '처리 중', '이관부서 확인', '조치완료']} selected={draftFilters.status} onChange={(val) => setDraftFilters({ ...draftFilters, status: val })} />

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">검색어</label>
                        <div className="flex gap-0 h-[30px]">
                            {/* 🚩 [수정] 검색 드롭다운과 입력칸 높이 및 보더 통일 */}
                            <select value={draftFilters.searchType} onChange={e => setDraftFilters({ ...draftFilters, searchType: e.target.value })} className="border border-gray-200 border-r-0 rounded-l-[3px] text-xs px-2 text-gray-700 bg-gray-50 focus:outline-none cursor-pointer h-full">
                                <option>품목코드</option>
                                <option>공급업체</option>
                                <option>처리자</option>
                            </select>
                            <input type="text" value={draftFilters.searchValue} onChange={e => setDraftFilters({ ...draftFilters, searchValue: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="border border-gray-200 rounded-r-[3px] text-xs px-2.5 w-36 focus:outline-none focus:border-letusOrange h-full" placeholder="검색어 입력" />
                        </div>
                    </div>

                    {/* 🚩 [수정] 버튼 스타일을 사용자 관리와 완벽하게 동일하게 (주황색 강조, 둥글기 맞춤) */}
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className={`text-[11px] font-bold border px-3 h-[30px] rounded-[3px] transition-colors flex items-center gap-1 shadow-sm ${isAdvancedOpen ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                            <svg className={`w-3.5 h-3.5 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            상세 조회
                        </button>
                        <div className="w-px h-4 bg-gray-200 mx-1"></div>
                        <button onClick={() => { const todayStr = new Date().toISOString().split('T')[0]; setDraftFilters({ brand: '전체', status: '전체', startDate: todayStr, endDate: todayStr, searchType: '품목코드', searchValue: '', teams: '전체' }); setSavedFilters({ brand: '전체', status: '전체', startDate: todayStr, endDate: todayStr, searchType: '품목코드', searchValue: '', teams: '전체' }); }} className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] text-xs transition-colors">
                            초기화
                        </button>
                        <SearchButton onClick={handleSearch} />
                    </div>
                </div>

                {/* 상세 조회 아코디언 — 접수팀 필터 */}
                {isAdvancedOpen && (
                    <div className="flex items-center gap-6 pt-3 mt-1 border-t border-gray-100 flex-wrap slide-up">
                        <MultiSelect
                            label="접수팀"
                            options={teamOptions}
                            selected={draftFilters.teams}
                            onChange={(val) => setDraftFilters({ ...draftFilters, teams: val })}
                        />
                    </div>
                )}

            </div>

            {/* 2. 선택실행 (드롭다운) 구역 (사용자 관리 스타일로 통일) */}
            <div className="flex justify-end w-full px-2 z-30 -mt-1 mb-1 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={resetColSettings} className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors" title="컬럼 너비·순서를 기본값으로 초기화">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
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
                                    <button onClick={() => { setIsActionMenuOpen(false); handleExportExcel(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-green-600 hover:bg-green-50 flex items-center justify-between transition-colors">
                                        엑셀 추출
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    </button>
                                    <div className="h-px bg-gray-100 my-1"></div>
                                    <button onClick={() => { setIsActionMenuOpen(false); handleRevertSelectedIssues(); }} className="w-full text-left px-4 py-2 text-xs font-medium text-gray-700 hover:text-orange-600 hover:bg-orange-50 transition-colors">
                                        원복
                                    </button>
                                    <button onClick={() => { setIsActionMenuOpen(false); handleSendFeedback(); }} disabled={isSendingFeedback} className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors ${isSendingFeedback ? 'text-gray-400 cursor-not-allowed bg-gray-50' : 'text-gray-700 hover:text-letusBlue hover:bg-blue-50'}`}>
                                        {isSendingFeedback ? '전송 중...' : '피드백 전송'}
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
            </div>

            {/* 3. 표 구역 */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left whitespace-nowrap table-fixed">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-6 w-10 text-center shrink-0">
                                    <input type="checkbox" checked={sortedIssues.length > 0 && selectedIds.length === sortedIssues.length} onChange={handleSelectAll} className="w-4 h-4 accent-letusBlue cursor-pointer" title="전체 선택" />
                                </th>
                                {colOrder.map((origIdx, visualIdx) => {
                                    const col = DEFAULT_COLUMNS[origIdx];
                                    return (
                                        <th
                                            key={origIdx}
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
                            ) : sortedIssues.length === 0 ? (
                                <tr><td colSpan={colOrder.length + 1} className="p-20 text-center text-gray-400 font-bold">조회 결과가 없습니다.</td></tr>
                            ) : sortedIssues.map((row) => (
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

            {activeModalRow && <RequestModal row={activeModalRow} onClose={() => setActiveModalRow(null)} onReload={onReload} userProfile={userProfile} onDirectHandle={(updatedRow) => { setActiveModalRow(null); setActiveHandleRow(updatedRow); }} />}
            {activeHandleRow && <HandleModal row={activeHandleRow} onClose={() => setActiveHandleRow(null)} onReload={onReload} userProfile={userProfile} />}
            {activeDeptReplyRow && <DeptReplyModal row={activeDeptReplyRow} onClose={() => setActiveDeptReplyRow(null)} onReload={onReload} />}

            {/* 유사코드 입고계획 조회 모달 */}
            {similarModal && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSimilarModal(null)} />
                    <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-md slide-up border border-gray-100 overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b bg-amber-50">
                            <div>
                                <p className="text-xs font-bold text-amber-700">유사 품목코드 · 입고계획 조회</p>
                                <p className="text-[11px] text-amber-600 mt-0.5">스캔 코드: <span className="font-mono font-bold">{similarModal.row.product_code}</span></p>
                            </div>
                            <button onClick={() => setSimilarModal(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
                        </div>
                        <div className="p-5">
                            {similarModal.loading ? (
                                <div className="flex items-center justify-center py-8 text-sm text-gray-400">조회 중...</div>
                            ) : similarModal.candidates.length === 0 ? (
                                <div className="flex items-center justify-center py-8 text-sm text-gray-400">유사한 품목코드를 찾지 못했습니다.</div>
                            ) : (
                                <div className="space-y-2">
                                    {similarModal.candidates.map((c, i) => (
                                        <div key={i} className={`rounded-lg border p-3 ${c.has_plan ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${c.has_plan ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                                                        {c.has_plan ? '입고계획 ✓' : '계획없음'}
                                                    </span>
                                                    <span className="font-mono text-xs font-bold text-gray-800 truncate">{c.item_code}</span>
                                                    <span className="text-[10px] text-gray-400">({c.item_color})</span>
                                                </div>
                                                <span className="shrink-0 text-[10px] text-gray-400">거리 {c.dist}</span>
                                            </div>
                                            <p className="text-[11px] text-gray-600 mt-1 truncate">{c.item_name}</p>
                                            {c.has_plan && (
                                                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-green-700">
                                                    <span>📅 {c.plan_date}</span>
                                                    {c.planned_qty && <span>📦 {c.planned_qty?.toLocaleString()}개</span>}
                                                    {c.plan_vendor && <span className="truncate">🏭 {c.plan_vendor}</span>}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export { IssueList };
