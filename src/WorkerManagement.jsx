import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { loadXLSX } from './utils.js';
import { CloseIcon, SearchButton } from './SharedUI.jsx';
import { BrandTaskSelectModal, WorkerAddModal, WorkerEditModal, WorkerBulkUploadModal, WorkerBulkEditModal } from './WorkerModals.jsx';

const supabaseClient = supabase;

const DEFAULT_COLUMNS = [
    { label: '근무자명',    key: 'name',             w: 120 },
    { label: '소속 구분',   key: 'company_type',     w: 110 },
    { label: '지원 여부',   key: 'support_status',   w: 100 },
    { label: '업체명',      key: 'vendor_name',      w: 130 },
    { label: '근무지',      key: 'workplace',        w: 120 },
    { label: '담당 브랜드', key: 'managed_brand',    w: 120 },
    { label: '업무',        key: 'task',             w: 120 },
    { label: '근로 형태',   key: 'employment_type',  w: 110 },
    { label: '연락처',      key: 'phone',            w: 120 },
    { label: '상태',        key: 'status',           w: 90  },
];

const WorkerManagement = () => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [workers, setWorkers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [editTarget, setEditTarget] = useState(null);

    // 🔥 기본 조회 필터 상태
    const [filterCompany, setFilterCompany] = useState('');
    const [filterWorkplace, setFilterWorkplace] = useState('');
    const [filterKeyword, setFilterKeyword] = useState('');

    // 🔥 상세 조회 필터 상태
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
    const [filterSupport, setFilterSupport] = useState('');
    const [filterBrand, setFilterBrand] = useState('');
    const [filterTask, setFilterTask] = useState('');
    const [filterEmpType, setFilterEmpType] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    // 🔥 정렬(Sort) 상태
    const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

    const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    // 🔥 컬럼 관리 상태
    const [colOrder, setColOrder] = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths] = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef = useRef(null);
    const dragSrcRef = useRef(null);
    const wasDraggedRef = useRef(false);

    const isAllSelected = workers.length > 0 && selectedIds.length === workers.length;

    const uniqueVendorList = useMemo(() => {
        const vendors = workers.map(w => w.vendor_name).filter(Boolean);
        return [...new Set(vendors)];
    }, [workers]);

    const brandList = ['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소', '바로스'];
    const taskList = ['총괄 운영', '상/하차', '피킹', '입고', '반품', '연기', 'A/S', '시공관리'];

    // 🔥 localStorage 로드 (마운트 시 1회)
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('letus_workers_col'));
            if (saved?.order?.length === DEFAULT_COLUMNS.length) setColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS.length) setColWidths(saved.widths);
        } catch {}
    }, []);

    // 🔥 localStorage 저장 (colOrder/colWidths 변경 시)
    useEffect(() => {
        localStorage.setItem('letus_workers_col', JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths]);

    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS.map(c => c.w));
        localStorage.removeItem('letus_workers_col');
    };

    // 🚀 수동 조회 함수 (조회하기 버튼 클릭 시 실행)
    const fetchWorkers = async () => {
        setIsLoading(true);
        try {
            let query = supabaseClient.from('workers').select('*');

            // 기본 조건
            if (filterCompany) query = query.eq('company_type', filterCompany);
            if (filterWorkplace) query = query.eq('workplace', filterWorkplace);
            if (filterKeyword) query = query.or(`name.ilike.%${filterKeyword}%,vendor_name.ilike.%${filterKeyword}%`);

            // 상세 조건
            if (filterSupport) query = query.eq('support_status', filterSupport);
            if (filterBrand) query = query.ilike('managed_brand', `%${filterBrand}%`);
            if (filterTask) query = query.ilike('task', `%${filterTask}%`);
            if (filterEmpType) query = query.eq('employment_type', filterEmpType);
            if (filterStatus) query = query.eq('status', filterStatus);

            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            setWorkers(data || []);
        } catch (error) {
            console.error("fetchWorkers error:", error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // 화면 첫 진입 시 1회만 데이터 불러오기
    useEffect(() => { fetchWorkers(); }, []);

    // 🔥 정렬 기능 (오름차순 -> 내림차순 -> 해제)
    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        else if (sortConfig.key === key && sortConfig.direction === 'desc') direction = null;

        setSortConfig({ key: direction ? key : null, direction });
    };

    // 정렬된 데이터 계산
    const sortedWorkers = useMemo(() => {
        let sortableItems = [...workers];
        if (sortConfig.key && sortConfig.direction) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key] || '';
                const bValue = b[sortConfig.key] || '';
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [workers, sortConfig]);

    // 🔥 정렬 아이콘 함수 (SortIcon 컴포넌트 대체)
    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        if (sortConfig.direction === 'asc') return <span className="ml-1 text-letusBlue font-black">↑</span>;
        if (sortConfig.direction === 'desc') return <span className="ml-1 text-letusBlue font-black">↓</span>;
        return null;
    };

    const handleSearch = () => fetchWorkers();

    const handleReset = () => {
        setFilterCompany(''); setFilterWorkplace(''); setFilterKeyword('');
        setFilterSupport(''); setFilterBrand(''); setFilterTask(''); setFilterEmpType(''); setFilterStatus('');
        setSortConfig({ key: null, direction: null });
        fetchWorkers(); // 초기화 후 바로 전체 목록 재조회
    };

    const handleExportExcel = async () => {
        const targetData = selectedIds.length > 0 ? sortedWorkers.filter(w => selectedIds.includes(w.id)) : sortedWorkers;
        if (targetData.length === 0) return alert('추출할 데이터가 없습니다.');
        const XLSX = await loadXLSX();

        const excelData = targetData.map((row, idx) => ({
            'No': idx + 1,
            '이름': row.name || '',
            '소속구분': row.company_type || '',
            '지원여부': row.support_status || '',
            '업체명': row.vendor_name || '',
            '근무지': row.workplace || '',
            '담당브랜드': row.managed_brand || '',
            '업무': row.task || '',
            '근로형태': row.employment_type || '',
            '연락처': row.phone || '',
            '상태': row.status || '',
            '등록일시': new Date(row.created_at).toLocaleString()
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 8 }, { wch: 20 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "근무자목록");
        XLSX.writeFile(wb, `근무자목록_${new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]}.xlsx`);
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return alert('삭제할 근무자를 체크해 주세요.');
        if (!window.confirm(`선택하신 ${selectedIds.length}명의 근무자를 완전히 삭제하시겠습니까?\n(퇴사 처리는 상태 변경을 이용해주세요)`)) return;

        try {
            const { error } = await supabaseClient.from('workers').delete().in('id', selectedIds);
            if (error) throw error;
            alert(`🗑️ ${selectedIds.length}명의 데이터가 삭제되었습니다.`);
            setSelectedIds([]);
            fetchWorkers();
        } catch (err) { alert('삭제 중 오류 발생: ' + err.message); }
    };

    const toggleAll = () => setSelectedIds(isAllSelected ? [] : sortedWorkers.map(w => w.id));
    const toggleOne = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const handleSelectOne = (e, id) => {
        if (e.target.type === 'checkbox') return;
        toggleOne(id);
    };

    // 🔥 컬럼 리사이즈 핸들러
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

    // 🔥 컬럼 드래그 핸들러
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

    // 🔥 셀 렌더러 (origIdx 기준)
    const renderCell = (origIdx, worker) => {
        const col = DEFAULT_COLUMNS[origIdx];
        switch (col.key) {
            case 'name':
                return <td key={origIdx} className="p-4 text-center font-black text-gray-800 text-sm">{worker.name}</td>;
            case 'company_type':
                return (
                    <td key={origIdx} className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${worker.company_type === '사내협력사' ? 'bg-blue-50 text-letusBlue border border-blue-100' : 'bg-orange-50 text-letusOrange border border-orange-100'}`}>{worker.company_type}</span>
                    </td>
                );
            case 'support_status':
                return (
                    <td key={origIdx} className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${worker.support_status && worker.support_status !== '미지원' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>{worker.support_status || '미지원'}</span>
                    </td>
                );
            case 'vendor_name':
                return <td key={origIdx} className="p-4 text-center font-bold text-gray-600">{worker.vendor_name}</td>;
            case 'workplace':
                return <td key={origIdx} className="p-4 text-center font-bold text-gray-600">{worker.workplace || '-'}</td>;
            case 'managed_brand':
                return (
                    <td key={origIdx} className="p-4 text-center text-gray-600 font-medium">
                        {worker.managed_brand ? worker.managed_brand.split(',').map(b => b.trim()).filter(Boolean).map((b, i) => (
                            <span key={i} className="inline-block bg-orange-50 text-letusOrange border border-orange-100 px-1.5 py-0.5 rounded text-[10px] font-bold mr-1 mb-1">{b}</span>
                        )) : '-'}
                    </td>
                );
            case 'task':
                return (
                    <td key={origIdx} className="p-4 text-center text-gray-600 font-medium">
                        {worker.task ? worker.task.split(',').map(t => t.trim()).filter(Boolean).map((t, i) => (
                            <span key={i} className="inline-block bg-blue-50 text-letusBlue border border-blue-100 px-1.5 py-0.5 rounded text-[10px] font-bold mr-1 mb-1">{t}</span>
                        )) : '-'}
                    </td>
                );
            case 'employment_type':
                return <td key={origIdx} className="p-4 text-center text-gray-600">{worker.employment_type}</td>;
            case 'phone':
                return <td key={origIdx} className="p-4 text-center font-mono text-gray-500">{worker.phone || '-'}</td>;
            case 'status':
                return (
                    <td key={origIdx} className="p-4 text-center">
                        <span className={`px-3 py-1 rounded-full font-bold text-[11px] shadow-sm ${worker.status === '재직' ? 'bg-green-100 text-green-700 border border-green-200' : worker.status === '휴직' ? 'bg-yellow-50 text-yellow-600 border border-yellow-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>{worker.status}</span>
                    </td>
                );
            default:
                return <td key={origIdx} className="p-4 text-center">-</td>;
        }
    };

    return (
        // 🚩 [수정] 전체 창 높이 고정 유지, 배경색 통일
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* 1. 검색 박스 구역 (사용자 관리 스타일로 통일) */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex flex-col gap-3 z-30 shrink-0 transition-all duration-300">
                <div className="flex items-center gap-5 w-full flex-wrap">

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">소속 구분</label>
                        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange min-w-[120px] cursor-pointer text-gray-700">
                            <option value="">전체</option><option value="사내협력사">사내협력사</option><option value="외주도급사">외주도급사</option>
                        </select>
                    </div>

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">근무지</label>
                        <select value={filterWorkplace} onChange={e => setFilterWorkplace(e.target.value)} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange min-w-[120px] cursor-pointer text-gray-700">
                            <option value="">전체</option>
                            <option value="양지1센터">양지1센터</option><option value="양지2센터">양지2센터</option><option value="양지3센터">양지3센터</option>
                            <option value="안성센터">안성센터</option><option value="평택센터">평택센터</option><option value="음성센터">음성센터</option>
                            <option value="대전센터">대전센터</option><option value="대구센터">대구센터</option><option value="부산센터">부산센터</option><option value="광주센터">광주센터</option>
                        </select>
                    </div>

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">검색어</label>
                        <input type="text" value={filterKeyword} onChange={e => setFilterKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="이름 또는 업체명 입력" className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange w-48 text-gray-700" />
                    </div>

                    <div className="ml-auto shrink-0 flex items-center gap-2">
                        <button onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)} className={`text-[11px] font-bold border px-3 h-[30px] rounded-[3px] transition-colors flex items-center gap-1 shadow-sm ${isAdvancedSearchOpen ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                            <svg className={`w-3.5 h-3.5 transition-transform ${isAdvancedSearchOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            상세 조회
                        </button>
                        <div className="w-px h-4 bg-gray-200 mx-1"></div>
                        <button onClick={handleReset} className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] transition-colors text-xs">초기화</button>
                        <SearchButton onClick={handleSearch} />
                    </div>
                </div>

                {/* 상세 조회 아코디언 영역 */}
                {isAdvancedSearchOpen && (
                    <div className="flex flex-col gap-3 pt-3 mt-1 border-t border-gray-100 slide-up">
                        <div className="flex items-center gap-6 w-full flex-wrap">

                            <div className="flex items-center shrink-0">
                                <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">지원 여부</label>
                                <select value={filterSupport} onChange={e => setFilterSupport(e.target.value)} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange cursor-pointer bg-white text-gray-700 min-w-[120px] font-medium">
                                    <option value="">전체</option><option value="미지원">미지원</option>
                                    {uniqueVendorList.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                            </div>

                            <div className="flex items-center shrink-0">
                                <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">담당 브랜드</label>
                                <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange cursor-pointer bg-white text-gray-700 min-w-[120px] font-medium">
                                    <option value="">전체</option>
                                    {brandList.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>

                            <div className="flex items-center shrink-0">
                                <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">담당 업무</label>
                                <select value={filterTask} onChange={e => setFilterTask(e.target.value)} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange cursor-pointer bg-white text-gray-700 min-w-[120px] font-medium">
                                    <option value="">전체</option>
                                    {taskList.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            <div className="flex items-center shrink-0">
                                <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">근로 형태</label>
                                <select value={filterEmpType} onChange={e => setFilterEmpType(e.target.value)} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange cursor-pointer bg-white text-gray-700 w-28 font-medium">
                                    <option value="">전체</option><option value="현장직">현장직</option><option value="사무직">사무직</option>
                                </select>
                            </div>

                            <div className="flex items-center shrink-0">
                                <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">근무 상태</label>
                                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange cursor-pointer bg-white text-gray-700 w-28 font-medium">
                                    <option value="">전체</option><option value="재직">재직</option><option value="휴직">휴직</option><option value="퇴사">퇴사</option>
                                </select>
                            </div>

                        </div>
                    </div>
                )}
            </div>

            {/* 2. 선택실행 (드롭다운) 구역 (사용자 관리 스타일로 통일) */}
            <div className="flex justify-end w-full px-2 z-30 -mt-1 mb-1 shrink-0">
                <div className="flex items-center gap-3">
                    {/* 칼럼 초기화 버튼 */}
                    <button onClick={resetColSettings}
                        className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                        title="컬럼 너비·순서를 기본값으로 초기화">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        칼럼 초기화
                    </button>

                    <div className="relative z-50">
                        <button onClick={() => setIsActionMenuOpen(!isActionMenuOpen)} className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[90px] h-[32px]">
                            선택실행 {selectedIds.length > 0 && `(${selectedIds.length})`}
                            <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        {isActionMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsActionMenuOpen(false)}></div>
                                <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">
                                    <button onClick={() => { setIsActionMenuOpen(false); setIsAddModalOpen(true); }} className="w-full text-left px-4 py-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">근무자 추가</button>
                                    <button onClick={() => { setIsActionMenuOpen(false); setIsBulkUploadModalOpen(true); }} className="w-full text-left px-4 py-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">엑셀 일괄 등록</button>
                                    <button onClick={() => { setIsActionMenuOpen(false); if (selectedIds.length === 0) return alert('근무자를 체크해주세요.'); setIsBulkEditModalOpen(true); }} className={`w-full text-left px-4 py-2 text-[11px] font-medium transition-colors ${selectedIds.length > 0 ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}>일괄 변경</button>

                                    <div className="h-px bg-gray-100 my-1"></div>
                                    <button onClick={() => { setIsActionMenuOpen(false); handleExportExcel(); }} className="w-full text-left px-4 py-2 text-[11px] font-bold text-green-600 hover:bg-green-50 flex items-center justify-between transition-colors">엑셀 추출 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>

                                    <div className="h-px bg-gray-100 my-1"></div>
                                    <button onClick={() => { setIsActionMenuOpen(false); if (selectedIds.length === 0) return alert('근무자를 체크해주세요.'); handleDeleteSelected(); }} className={`w-full text-left px-4 py-2 text-[11px] font-medium flex justify-between items-center transition-colors ${selectedIds.length > 0 ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}>
                                        영구 삭제
                                        {selectedIds.length > 0 && <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                    </button>
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
                                <th className="p-4 pl-6 w-10 text-center">
                                    <input type="checkbox" checked={isAllSelected} onChange={toggleAll} className="w-4 h-4 accent-letusBlue cursor-pointer" />
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
                                            <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                                onMouseDown={(e) => handleResizeStart(e, visualIdx)} onClick={e => e.stopPropagation()} />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        {isLoading ? (
                            <tbody><tr><td colSpan={colOrder.length + 1} className="text-center py-32 text-gray-400 font-bold"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div><p>데이터를 조회하는 중입니다...</p></div></td></tr></tbody>
                        ) : sortedWorkers.length === 0 ? (
                            <tbody>
                                <tr>
                                    <td colSpan={colOrder.length + 1} className="p-20 text-center text-gray-400">
                                        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                        <p className="font-semibold text-gray-500 mb-1">조건에 맞는 데이터가 없습니다.</p>
                                    </td>
                                </tr>
                            </tbody>
                        ) : (
                            <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                                {sortedWorkers.map((worker, idx) => (
                                    <tr key={worker.id}
                                        className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedIds.includes(worker.id) ? 'bg-blue-50' : ''}`}
                                        onClick={(e) => handleSelectOne(e, worker.id)}
                                        onDoubleClick={() => setEditTarget(worker)}>
                                        <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" checked={selectedIds.includes(worker.id)} onChange={() => toggleOne(worker.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                        </td>
                                        {colOrder.map(origIdx => renderCell(origIdx, worker))}
                                    </tr>
                                ))}
                            </tbody>
                        )}
                    </table>
                </div>
            </div>

            {isAddModalOpen && <WorkerAddModal vendorList={uniqueVendorList} onClose={() => setIsAddModalOpen(false)} onReload={fetchWorkers} />}
            {editTarget && <WorkerEditModal vendorList={uniqueVendorList} worker={editTarget} onClose={() => setEditTarget(null)} onReload={fetchWorkers} />}
            {isBulkUploadModalOpen && <WorkerBulkUploadModal onClose={() => setIsBulkUploadModalOpen(false)} onReload={fetchWorkers} />}
            {isBulkEditModalOpen && <WorkerBulkEditModal vendorList={uniqueVendorList} selectedIds={selectedIds} workers={workers} onClose={() => setIsBulkEditModalOpen(false)} onReload={fetchWorkers} />}
        </div>
    );
};

export { WorkerManagement };
