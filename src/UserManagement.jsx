import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, invokeFunction } from './supabaseClient.js';
import { VendorSearchModal, VendorListModal, MenuPermissionModal } from './CommonComponents.jsx';
import { TableSkeleton, CloseIcon, formatDateTime, UserEditModal, SearchButton } from './SharedUI.jsx';
import { DEFAULT_MENUS } from './menuConfig.jsx';
import { loadXLSX } from './utils.js';
import { UserAddModal, UserBulkEditModal, UserBulkUploadModal } from './UserModals.jsx';

const DEFAULT_COLUMNS = [
    { label: '사용자명',       key: 'name',            w: 130 },
    { label: '사용자 ID',      key: 'login_id',        w: 180 },
    { label: '소속 팀',        key: 'team',            w: 130 },
    { label: '소속 브랜드',    key: 'brands',          w: 130 },
    { label: '담당 업체/창고', key: 'managed_vendors', w: 160 },
    { label: '권한 그룹',      key: 'role',            w: 110 },
    { label: '가입일시',       key: 'created_at',      w: 160 },
    { label: '상태',           key: 'status',          w: 110 },
];

const UserManagement = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [editTarget, setEditTarget] = useState(null);
    const [vendorListTarget, setVendorListTarget] = useState(null);
    const [filterRole, setFilterRole] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterTeam, setFilterTeam] = useState('');
    const [filterKeyword, setFilterKeyword] = useState('');
    const [filterVendor, setFilterVendor] = useState('');
    const [teamOptions, setTeamOptions] = useState([]);
    const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    // 정렬
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });

    // 컬럼 관리
    const [colOrder, setColOrder] = useState(DEFAULT_COLUMNS.map((_, i) => i));
    const [colWidths, setColWidths] = useState(DEFAULT_COLUMNS.map(c => c.w));
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const resizingRef = useRef(null);
    const dragSrcRef = useRef(null);
    const wasDraggedRef = useRef(false);

    const isAllSelected = users.length > 0 && selectedUsers.length === users.length;

    // localStorage 불러오기
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('letus_users_col'));
            if (saved?.order?.length === DEFAULT_COLUMNS.length) setColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS.length) setColWidths(saved.widths);
        } catch {}
    }, []);

    // localStorage 저장
    useEffect(() => {
        localStorage.setItem('letus_users_col', JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths]);

    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS.map(c => c.w));
        localStorage.removeItem('letus_users_col');
    };

    // 정렬 요청
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
        if (sortConfig.direction === 'asc') return <span className="ml-1 text-letusBlue font-black">↑</span>;
        if (sortConfig.direction === 'desc') return <span className="ml-1 text-letusBlue font-black">↓</span>;
        return null;
    };

    // 정렬 적용
    const sortedUsers = useMemo(() => {
        let items = [...users];
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
    }, [users, sortConfig]);

    // 리사이즈 핸들러
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

    // 드래그 핸들러
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

    // 셀 렌더링 (origIdx 기준)
    const renderCell = (origIdx, user) => {
        const col = DEFAULT_COLUMNS[origIdx];
        switch (col.key) {
            case 'name':
                return (
                    <td key={origIdx} className="p-4 font-black text-gray-800 text-sm tracking-tight truncate" style={{ width: colWidths[origIdx] }} title={user.name}>
                        {user.name}
                    </td>
                );
            case 'login_id':
                return (
                    <td key={origIdx} className="p-4 font-bold text-gray-600 truncate" style={{ width: colWidths[origIdx] }} title={user.login_id}>
                        {user.login_id}
                    </td>
                );
            case 'team':
                return (
                    <td key={origIdx} className="p-4 text-gray-600 font-medium truncate" style={{ width: colWidths[origIdx] }} title={user.team || '-'}>
                        {user.team || '-'}
                    </td>
                );
            case 'brands':
                return (
                    <td key={origIdx} className="p-4" style={{ width: colWidths[origIdx] }}>
                        <div className="flex gap-1.5 flex-wrap">
                            {user.brands
                                ? <span className="bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded-[4px] text-[11px] whitespace-nowrap font-bold shadow-sm">{user.brands}</span>
                                : <span className="text-gray-400">-</span>
                            }
                        </div>
                    </td>
                );
            case 'managed_vendors':
                return (
                    <td key={origIdx} className="p-4" style={{ width: colWidths[origIdx] }}>
                        {(user.managed_vendors || user.managed_brands) ? (
                            <button
                                onClick={e => { e.stopPropagation(); setVendorListTarget(user); }}
                                className="inline-flex items-center gap-1 bg-blue-50 text-letusBlue border border-blue-200 rounded-[4px] px-2 py-1 text-[10px] font-bold hover:bg-blue-100 transition-colors whitespace-nowrap"
                            >
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                상세보기 ({(typeof user.managed_vendors === 'string' ? user.managed_vendors.split(',').filter(Boolean).length : 0) + (typeof user.managed_brands === 'string' ? user.managed_brands.split(',').filter(Boolean).length : 0)})
                            </button>
                        ) : (
                            <span className="text-gray-400 text-xs">-</span>
                        )}
                    </td>
                );
            case 'role':
                return (
                    <td key={origIdx} className="p-4" style={{ width: colWidths[origIdx] }}>
                        <span className={`px-2.5 py-1 rounded-[4px] font-bold text-[11px] ${user.role === '관리자' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-slate-100 text-slate-600'}`}>
                            {user.role}
                        </span>
                    </td>
                );
            case 'created_at':
                return (
                    <td key={origIdx} className="p-4 text-center text-gray-400 font-bold" style={{ width: colWidths[origIdx] }}>
                        {formatDateTime(user.created_at)}
                    </td>
                );
            case 'status':
                return (
                    <td key={origIdx} className="p-4 text-center" style={{ width: colWidths[origIdx] }}>
                        <span className={`px-3 py-1 rounded-full font-bold text-[11px] shadow-sm ${user.status === '정상' || user.status === '정상 승인' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                            {user.status}
                        </span>
                    </td>
                );
            default:
                return <td key={origIdx} className="p-4" style={{ width: colWidths[origIdx] }} />;
        }
    };

    const handleExportExcel = async () => {
        const targetData = selectedUsers.length > 0 ? users.filter(u => selectedUsers.includes(u.id)) : users;
        if (targetData.length === 0) return alert('추출할 데이터가 없습니다.');
        const XLSX = await loadXLSX();

        const excelData = targetData.map(row => ({
            '사용자명': row.name || '',
            '아이디': row.login_id || '',
            '소속팀': row.team || '',
            '소속브랜드': row.brands || '',
            '권한그룹': row.role || '',
            '상태': row.status || ''
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 10 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "사용자목록");
        XLSX.writeFile(wb, `사용자목록_${new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]}.xlsx`);
    };

    const toggleAll = () => {
        if (isAllSelected) {
            setSelectedUsers([]);
        } else {
            setSelectedUsers(users.map(u => u.id));
        }
    };

    const toggleOne = (id) => {
        setSelectedUsers(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // 🔥 선택 항목 일괄 삭제 기능 (Auth 계정 + Profile 동시 삭제)
    const handleDeleteSelected = async () => {
        if (selectedUsers.length === 0) return alert('삭제할 사용자를 체크해 주세요.');

        if (!window.confirm(`선택하신 ${selectedUsers.length}명의 계정을 정말 삭제하시겠습니까?\n시스템 접속 권한이 영구적으로 박탈되며 복구할 수 없습니다.`)) return;

        setIsLoading(true);
        try {
            await Promise.all(selectedUsers.map(userId =>
                invokeFunction('user-admin', { action: 'delete', payload: { userId } })
            ));

            alert(`🗑️ ${selectedUsers.length}명의 사용자 계정이 완벽하게 삭제되었습니다.`);
            setSelectedUsers([]);
            fetchUsers();
        } catch (err) {
            alert('사용자 삭제 중 오류 발생: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTeamOptions = async () => {
        try {
            const { data, error } = await supabase.from('profiles').select('team').not('team', 'is', null).neq('team', '');
            if (error) throw error;
            const unique = [...new Set((data || []).map(d => d.team).filter(Boolean))].sort();
            setTeamOptions(unique);
        } catch (error) {
            console.error("fetchTeamOptions error:", error.message);
        }
    };

    const fetchUsers = async (params = {}) => {
        setIsLoading(true);
        try {
            let query = supabase.from('profiles').select('*');
            const role = params.role !== undefined ? params.role : filterRole;
            const status = params.status !== undefined ? params.status : filterStatus;
            const team = params.team !== undefined ? params.team : filterTeam;
            const keyword = params.keyword !== undefined ? params.keyword : filterKeyword;
            const vendor = params.vendor !== undefined ? params.vendor : filterVendor;
            if (role) query = query.eq('role', role);
            if (status) query = query.eq('status', status);
            if (team) query = query.eq('team', team);
            if (keyword) query = query.ilike('name', `%${keyword}%`);
            if (vendor) query = query.ilike('managed_vendors', `%${vendor}%`);
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error("fetchUsers error:", error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = () => fetchUsers();

    useEffect(() => {
        window.addEventListener('trigger-refresh', handleSearch);
        return () => window.removeEventListener('trigger-refresh', handleSearch);
    }, [filterRole, filterStatus, filterKeyword, filterVendor]);

    useEffect(() => {
        fetchTeamOptions();
        fetchUsers();
    }, []);

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)]">
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex items-center z-30 shrink-0">
                <div className="flex items-center gap-5 w-full flex-wrap">

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">권한 그룹</label>
                        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange w-24 cursor-pointer text-gray-700">
                            <option value="">전체</option>
                            <option value="관리자">관리자</option>
                            <option value="사용자">사용자</option>
                        </select>
                    </div>

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">계정 상태</label>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange w-24 cursor-pointer text-gray-700">
                            <option value="">전체</option>
                            <option value="정상">정상 승인</option>
                            <option value="정지">이용 정지</option>
                        </select>
                    </div>

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">팀</label>
                        <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange w-28 cursor-pointer text-gray-700">
                            <option value="">전체</option>
                            {teamOptions.map(team => (
                                <option key={team} value={team}>{team}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">이름</label>
                        <input
                            type="text" value={filterKeyword} onChange={e => setFilterKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="이름 검색..." className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange w-32 text-gray-700"
                        />
                    </div>

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">담당 업체</label>
                        <input
                            type="text" value={filterVendor} onChange={e => setFilterVendor(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="업체명 검색..." className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange w-32 text-gray-700"
                        />
                    </div>

                    <div className="ml-auto shrink-0 flex items-center gap-2">
                        <button
                            onClick={() => { setFilterRole(''); setFilterStatus(''); setFilterTeam(''); setFilterKeyword(''); setFilterVendor(''); fetchUsers({ role: '', status: '', team: '', keyword: '', vendor: '' }); }}
                            className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] transition-colors text-xs"
                        >
                            초기화
                        </button>
                        <SearchButton onClick={handleSearch} />
                    </div>
                </div>
            </div>

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

                    <div className="relative">
                        <button
                            onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                            className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all w-[90px]"
                        >
                            선택실행
                            <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        {isActionMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsActionMenuOpen(false)}></div>
                                <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">

                                    <button onClick={() => { setIsActionMenuOpen(false); setIsModalOpen(true); }} className="w-full text-left px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">사용자 추가</button>
                                    <button onClick={() => { setIsActionMenuOpen(false); setIsBulkUploadModalOpen(true); }} className="w-full text-left px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">일괄 등록</button>
                                    <button
                                        onClick={() => {
                                            setIsActionMenuOpen(false);
                                            if (selectedUsers.length === 0) alert('일괄 변경할 사용자를 먼저 체크박스로 선택해 주세요.');
                                            else setIsBulkEditModalOpen(true);
                                        }}
                                        className={`w-full text-left px-4 py-2 text-xs font-medium ${selectedUsers.length > 0 ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
                                    >
                                        일괄 변경 {selectedUsers.length > 0 && `(${selectedUsers.length})`}
                                    </button>

                                    <div className="h-px bg-gray-100 my-1"></div>

                                    <button onClick={() => { setIsActionMenuOpen(false); handleExportExcel(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-green-600 hover:bg-green-50 flex items-center justify-between">
                                        엑셀 추출
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    </button>

                                    <div className="h-px bg-gray-100 my-1"></div>

                                    <button
                                        onClick={() => {
                                            setIsActionMenuOpen(false);
                                            if (selectedUsers.length === 0) alert('삭제할 사용자를 먼저 선택해 주세요.');
                                            else handleDeleteSelected();
                                        }}
                                        className={`w-full text-left px-4 py-2 text-xs font-medium ${selectedUsers.length > 0 ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}
                                    >
                                        삭제
                                    </button>

                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left table-fixed">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                {/* 고정: 체크박스 */}
                                <th className="p-4 pl-6 w-10 text-center shrink-0">
                                    <input type="checkbox" checked={isAllSelected} onChange={toggleAll} className="w-4 h-4 accent-letusBlue cursor-pointer" title="전체 선택" />
                                </th>
                                {/* 고정: No */}
                                <th className="p-4 text-center w-12">No</th>
                                {/* 동적 컬럼 */}
                                {colOrder.map((origIdx, visualIdx) => {
                                    const col = DEFAULT_COLUMNS[origIdx];
                                    return (
                                        <th key={origIdx}
                                            className={`relative p-4 text-center select-none transition-colors hover:bg-gray-100 cursor-grab active:cursor-grabbing ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
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
                        {isLoading ? (
                            <TableSkeleton rowCount={8} colCount={colOrder.length + 2} />
                        ) : sortedUsers.length === 0 ? (
                            <tbody>
                                <tr>
                                    <td colSpan={colOrder.length + 2} className="p-10 text-center text-gray-400">
                                        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                        <p className="font-semibold text-gray-500 mb-1">등록된 사용자가 없습니다.</p>
                                        <p className="text-sm">상단의 [사용자 추가] 버튼을 눌러 첫 계정을 생성하세요.</p>
                                    </td>
                                </tr>
                            </tbody>
                        ) : (
                            <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                                {sortedUsers.map((user, idx) => (
                                    <tr key={user.id}
                                        className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedUsers.includes(user.id) ? 'bg-blue-50' : ''}`}
                                        onDoubleClick={() => setEditTarget(user)}
                                        title="더블클릭하면 정보를 수정할 수 있습니다"
                                    >
                                        <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={() => toggleOne(user.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" onClick={e => e.stopPropagation()} />
                                        </td>
                                        <td className="p-4 text-center text-gray-400 font-medium">{idx + 1}</td>
                                        {colOrder.map(origIdx => renderCell(origIdx, user))}
                                    </tr>
                                ))}
                            </tbody>
                        )}
                    </table>
                </div>
            </div>
            {isModalOpen && <UserAddModal onClose={() => setIsModalOpen(false)} onReload={fetchUsers} />}
            {editTarget && <UserEditModal user={editTarget} onClose={() => setEditTarget(null)} onReload={fetchUsers} />}
            {vendorListTarget && <VendorListModal user={vendorListTarget} onClose={() => setVendorListTarget(null)} />}
            {isBulkUploadModalOpen && <UserBulkUploadModal onClose={() => setIsBulkUploadModalOpen(false)} onReload={fetchUsers} />}
            {isBulkEditModalOpen && (<UserBulkEditModal selectedUserIds={selectedUsers} users={users} onClose={() => setIsBulkEditModalOpen(false)} onReload={fetchUsers} />)}
        </div>
    );
};

// ---------------------------------------------------------
// 🛠️ 사용자 관리 전용 모달들 (여기로 이사 시킵니다)
// ---------------------------------------------------------

// 1. 신규 사용자 추가 모달

export { UserManagement };
