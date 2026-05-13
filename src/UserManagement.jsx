import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, invokeFunction } from './supabaseClient.js';
import { VendorSearchModal, VendorListModal, MenuPermissionModal } from './CommonComponents.jsx';
import { TableSkeleton, CloseIcon, formatDateTime, UserEditModal } from './SharedUI.jsx';
import { DEFAULT_MENUS } from './menuConfig.jsx';
import { loadXLSX } from './utils.js';
import { UserAddModal, UserBulkEditModal, UserBulkUploadModal } from './UserModals.jsx';

const UserManagement = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [editTarget, setEditTarget] = useState(null);
    const [vendorListTarget, setVendorListTarget] = useState(null);
    const [filterRole, setFilterRole] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterKeyword, setFilterKeyword] = useState('');
    const [filterVendor, setFilterVendor] = useState('');
    const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    const isAllSelected = users.length > 0 && selectedUsers.length === users.length;

    const handleExportExcel = async () => {
        const targetData = selectedUserIds.length > 0 ? users.filter(u => selectedUserIds.includes(u.id)) : users;
        if (targetData.length === 0) return alert('추출할 데이터가 없습니다.');
        const XLSX = await loadXLSX();

        // 엑셀 시트에 들어갈 JSON 데이터 배열 생성
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
        XLSX.writeFile(wb, `사용자목록_${new Date().toISOString().split('T')[0]}.xlsx`);
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
        // (참고: userProfile 권한 체크가 필요하다면 주석을 해제해서 쓰세요!)
        // if (userProfile?.role !== '관리자') return alert('🚨 삭제 권한이 없습니다. 관리자에게 문의하세요.');

        if (selectedUsers.length === 0) return alert('삭제할 사용자를 체크해 주세요.');

        if (!window.confirm(`선택하신 ${selectedUsers.length}명의 계정을 정말 삭제하시겠습니까?\n시스템 접속 권한이 영구적으로 박탈되며 복구할 수 없습니다.`)) return;

        setIsLoading(true); // 삭제 중 로딩 스피너 작동
        try {
            // 🔥 Auth 계정 + profile 동시 삭제. Edge Function(user-admin) 안에서 둘 다 처리됨.
            for (const userId of selectedUsers) {
                await invokeFunction('user-admin', {
                    action: 'delete',
                    payload: { userId },
                });
            }

            alert(`🗑️ ${selectedUsers.length}명의 사용자 계정이 완벽하게 삭제되었습니다.`);
            setSelectedUsers([]); // 🚩 체크박스 초기화
            fetchUsers(); // 🚩 사용자 목록 새로고침
        } catch (err) {
            alert('사용자 삭제 중 오류 발생: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchUsers = async (params = {}) => {
        setIsLoading(true);
        try {
            let query = supabase.from('profiles').select('*');
            const role = params.role !== undefined ? params.role : filterRole;
            const status = params.status !== undefined ? params.status : filterStatus;
            const keyword = params.keyword !== undefined ? params.keyword : filterKeyword;
            const vendor = params.vendor !== undefined ? params.vendor : filterVendor;
            if (role) query = query.eq('role', role);
            if (status) query = query.eq('status', status);
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
        fetchUsers();
    }, []);

    return (
        // 🚩 문제 1 해결: h-[calc(100vh-140px)] -> h-[calc(100vh-64px)] 로 늘리고, min-h-[600px] 제거하여 화면 꽉 채움!
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
                            onClick={() => { setFilterRole(''); setFilterStatus(''); setFilterKeyword(''); setFilterVendor(''); fetchUsers({ role: '', status: '', keyword: '', vendor: '' }); }}
                            className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] transition-colors text-xs"
                        >
                            초기화
                        </button>
                        {/* 🚩 문제 3 해결: 조회 버튼을 bg-letusOrange text-white 로 채워서 강조! */}
                        <button onClick={handleSearch} className="bg-letusOrange text-white hover:bg-orange-600 font-bold px-6 h-[30px] rounded-[3px] transition-colors text-xs flex items-center justify-center shadow-sm">
                            조회하기
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex justify-end w-full px-2 z-30 -mt-1 mb-1 shrink-0">
                <div className="flex items-center gap-3">
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
                                            if (selectedUsers.length === 0 && selectedUserIds.length === 0) alert('일괄 변경할 사용자를 먼저 체크박스로 선택해 주세요.');
                                            else setIsBulkEditModalOpen(true);
                                        }}
                                        className={`w-full text-left px-4 py-2 text-xs font-medium ${(selectedUsers.length > 0 || selectedUserIds.length > 0) ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'}`}
                                    >
                                        일괄 변경 {(selectedUsers.length > 0 || selectedUserIds.length > 0) && `(${Math.max(selectedUsers.length, selectedUserIds.length)})`}
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
                                            if (selectedUsers.length === 0 && selectedUserIds.length === 0) alert('삭제할 사용자를 먼저 선택해 주세요.');
                                            else handleDeleteSelected();
                                        }}
                                        className={`w-full text-left px-4 py-2 text-xs font-medium ${(selectedUsers.length > 0 || selectedUserIds.length > 0) ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}
                                    >
                                        삭제
                                    </button>

                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* 🚩 문제 1 해결: 표 컨테이너에 flex-1 을 주어 남은 공간을 꽉 채우도록 만듦! */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20">
                {/* 🚩 문제 2 해결: 표 안쪽 스크롤 영역 설정 (h-[600px] 고정값 제거) */}
                <div className="p-0 overflow-auto flex-1 custom-scrollbar">
                    <table className="w-full text-left table-fixed">
                        {/* 🚩 문제 2 해결: <thead>에 bg-slate-50 을 줘서 글자 겹침 방지 (투명도 /70 제거) */}
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-6 w-12 text-center">
                                    <input type="checkbox" checked={isAllSelected} onChange={toggleAll} className="w-4 h-4 accent-letusBlue cursor-pointer" title="전체 선택" />
                                </th>
                                <th className="p-4 w-12 text-center">No</th>
                                <th className="p-4 w-[11%]">사용자명</th>
                                <th className="p-4 w-[12%]">사용자 ID</th>
                                <th className="p-4 w-[11%]">소속 팀</th>
                                <th className="p-4 w-[14%]">소속 브랜드</th>
                                <th className="p-4 w-[16%]">담당 업체/창고</th>
                                <th className="p-4 w-[8%]">권한 그룹</th>
                                <th className="p-4 w-[14%] text-center">가입일시</th>
                                <th className="p-4 w-[8%] text-center">상태</th>
                            </tr>
                        </thead>
                        {isLoading ? (
                            <TableSkeleton rowCount={8} colCount={10} />
                        ) : users.length === 0 ? (
                            <tbody>
                                <tr>
                                    <td colSpan="10" className="p-10 text-center text-gray-400">
                                        <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                        <p className="font-semibold text-gray-500 mb-1">등록된 사용자가 없습니다.</p>
                                        <p className="text-sm">상단의 [사용자 추가] 버튼을 눌러 첫 계정을 생성하세요.</p>
                                    </td>
                                </tr>
                            </tbody>
                        ) : (
                            <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                                {users.map((user, idx) => (
                                    <tr key={user.id}
                                        className={`transition-colors cursor-pointer ${selectedUsers.includes(user.id) ? 'bg-blue-50' : 'hover:bg-blue-50/30'}`}
                                        onDoubleClick={() => setEditTarget(user)}
                                        title="더블클릭하면 정보를 수정할 수 있습니다"
                                    >
                                        <td className="p-4 pl-6 text-center">
                                            <input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={() => toggleOne(user.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" onClick={e => e.stopPropagation()} />
                                        </td>
                                        <td className="p-4 text-center text-gray-400 font-medium">{idx + 1}</td>
                                        <td className="p-4 font-black text-gray-800 text-sm tracking-tight truncate" title={user.name}>{user.name}</td>
                                        <td className="p-4 font-bold text-gray-600 truncate" title={user.login_id}>{user.login_id}</td>
                                        <td className="p-4 text-gray-600 font-medium truncate" title={user.team || '-'}>{user.team || '-'}</td>
                                        <td className="p-4">
                                            <div className="flex gap-1.5 flex-wrap">
                                                {user.brands
                                                    ? <span className="bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded-[4px] text-[11px] whitespace-nowrap font-bold shadow-sm">{user.brands}</span>
                                                    : <span className="text-gray-400">-</span>
                                                }
                                            </div>
                                        </td>
                                        <td className="p-4">
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
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-[4px] font-bold text-[11px] ${user.role === '관리자' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-slate-100 text-slate-600'}`}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center text-gray-400 font-bold">{formatDateTime(user.created_at)}</td>
                                        <td className="p-4 text-center">
                                            <span className={`px-3 py-1 rounded-full font-bold text-[11px] shadow-sm ${user.status === '정상' || user.status === '정상 승인' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                                                {user.status}
                                            </span>
                                        </td>
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
