import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from './supabaseClient.js';
import { CloseIcon } from './SharedUI.jsx';

// 1. 사고 내역 상세/수정 모달
export const AccidentModal = ({ row, onClose, onReload, userProfile }) => {
    const initialCause = row.cause_detail || '';
    const match = initialCause.match(/^\[(.*?)\]\s*(.*)$/);
    const initType = match ? match[1] : '';
    const initDetail = match ? match[2] : initialCause;

    // 🔥 권한 체크 (사용자인지 여부 확인)
    const isUser = userProfile?.role !== '관리자';

    const [causeType, setCauseType] = useState(initType);
    const [causeDetail, setCauseDetail] = useState(initDetail);

    const [vendorList, setVendorList] = useState([]);
    const [handlerTeam, setHandlerTeam] = useState(row.handler_team || ''); // 조치 수행처 상태

    // 🔥 사용자인 경우 본인의 소속팀(team)으로 초기값 강제 고정!
    const [dept, setDept] = useState(row.responsible_dept || (isUser ? userProfile?.team : ''));

    const [actionContent, setActionContent] = useState(row.action_content || '');

    const [actionResult, setActionResult] = useState(row.action_result || '미확인');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchVendors = async () => {
            try {
                // workers 테이블(근무자 관리)에서 업체명(vendor_name)만 중복 없이 가져옵니다.
                const { data, error } = await supabase
                    .from('workers')
                    .select('vendor_name');

                if (error) throw error;

                // 중복 제거 및 가나다순 정렬
                const uniqueVendors = [...new Set(data.map(item => item.vendor_name))]
                    .filter(Boolean)
                    .sort();

                setVendorList(uniqueVendors);
            } catch (err) {
                console.error("업체 리스트 조회 오류:", err.message);
            }
        };

        fetchVendors();
    }, []);

    const handleSave = async () => {
        if (!causeType) return alert('발생 원인을 선택해 주세요.');
        if (!dept) return alert('귀책 부서를 선택해 주세요.');

        setIsSaving(true);
        try {
            const finalCauseStr = causeDetail ? `[${causeType}] ${causeDetail}` : `[${causeType}]`;

            const { error } = await supabase
                .from('logistics_accidents')
                .update({
                    responsible_dept: dept,
                    cause_detail: finalCauseStr,
                    action_result: actionResult,

                    handler_team: handlerTeam,
                    action_content: actionContent,

                    // 조치내용에 '일정 연기' 포함 시 납기지연 자동 표시
                    is_delayed: actionContent.includes('일정 연기') ? '재일정(지연)' : '',

                    status: '등록 완료',
                    handler_name: userProfile?.name || '관리자',
                    updated_at: new Date().toISOString()
                })
                .eq('id', row.id);

            if (error) throw error;
            alert('사고 원인이 성공적으로 등록되었습니다.');
            onReload();
            onClose();
        } catch (err) {
            alert('저장 중 오류 발생');
        } finally {
            setIsSaving(false);
        }
    };

    const formatModalTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-lg slide-up overflow-hidden border border-gray-100 flex flex-col">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-letusOrange rounded-full"></span>
                        사고 상세 정보 및 원인 등록
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh] custom-scrollbar">

                    {/* 1. 기본 정보 (Read-Only) 영역 개편 */}
                    <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
                        <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                            <span className="w-1 h-3 bg-slate-300 rounded-full"></span> 기본 정보 (Read-Only)
                        </h4>
                        <div className="flex flex-col gap-3 text-[13px]">
                            {/* 1행: 브랜드 / 등록자 */}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                                    <span className="text-gray-500 font-medium">브랜드</span>
                                    <span className="font-bold text-gray-800">{row.brand}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                                    <span className="text-gray-500 font-medium">등록자</span>
                                    <span className="font-black text-letusBlue">{row.installer_team || '-'}</span>
                                </div>
                            </div>

                            {/* 2행: 수주번호 / 수주건명 */}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                                    <span className="text-gray-500 font-medium">수주번호</span>
                                    <span className="font-bold text-gray-800">{row.order_no}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                                    <span className="text-gray-500 font-medium shrink-0">수주건명</span>
                                    <span className="font-bold text-gray-800 text-right truncate max-w-[150px] ml-4" title={row.order_name}>{row.order_name || '-'}</span>
                                </div>
                            </div>

                            {/* 3행: 품목코드 / 이슈수량 */}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                                    <span className="text-gray-500 font-medium">품목코드</span>
                                    <span className="font-bold text-gray-800">{row.item_code}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                                    <span className="text-gray-500 font-medium">이슈수량</span>
                                    <span className="font-bold text-red-500">{row.issue_qty}개</span>
                                </div>
                            </div>

                            {/* 4행: 기타 상세 정보 */}
                            <div className="grid grid-cols-3 gap-x-4 gap-y-3 mt-1">
                                <div className="flex justify-between border-b border-slate-200/60 pb-1">
                                    <span className="text-gray-500 text-xs">ZONE</span><span className="font-bold text-xs text-letusBlue">{row.zone || '-'}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-200/60 pb-1">
                                    <span className="text-gray-500 text-xs">작업자</span><span className="font-bold text-xs text-gray-800">{row.worker_name || '-'}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-200/60 pb-1">
                                    <span className="text-gray-500 text-xs">주/야</span><span className="font-bold text-xs text-gray-800">{row.shift_type || '-'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. 조치 등록 폼 전체 영역 */}
                    <div className="flex flex-col gap-6">

                        {/* 상단: 보고자 공통 구역 */}
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[12px] font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                                        <span className="text-letusOrange">*</span> 발생 원인 선택
                                    </label>
                                    <select value={causeType} onChange={e => setCauseType(e.target.value)} className="w-full border border-gray-300 rounded-[4px] p-2.5 text-xs outline-none focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue transition-all cursor-pointer bg-white text-gray-800">
                                        <option value="">원인을 선택해 주세요</option>
                                        <option value="작업자 귀책">작업자 귀책</option>
                                        <option value="시공팀 귀책">시공팀 귀책</option>
                                        <option value="전산/시스템 오류">전산/시스템 오류</option>
                                        <option value="서류/정보 불일치">서류/정보 불일치</option>
                                        <option value="재고/수량 이슈">재고/수량 이슈</option>
                                        <option value="제조/생산 이슈">제조/생산 이슈</option>
                                        <option value="프로세스 미준수">프로세스 미준수</option>
                                        <option value="기타">기타</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[12px] font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                                        <span className="text-letusOrange">*</span> 귀책 부서 선택 {isUser && <span className="text-gray-400 font-normal ml-1">(소속팀 고정)</span>}
                                    </label>
                                    <select
                                        value={dept}
                                        onChange={e => setDept(e.target.value)}
                                        disabled={isUser}
                                        className={`w-full border rounded-[4px] p-2.5 text-xs outline-none transition-all ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200' : 'border-gray-300 focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue cursor-pointer bg-white text-gray-800'}`}
                                    >
                                        <option value="">부서를 선택해 주세요</option>
                                        {isUser && dept && !['물류사업1팀', '물류사업2팀', '운송사업팀', '컨택센터', '라스트마일1팀', '라스트마일2팀', '구매/생산', '외부/협력사', '기타'].includes(dept) && (
                                            <option value={dept}>{dept}</option>
                                        )}
                                        <option value="물류사업1팀">물류사업1팀</option>
                                        <option value="물류사업2팀">물류사업2팀</option>
                                        <option value="운송사업팀">운송사업팀</option>
                                        <option value="컨택센터">컨택센터</option>
                                        <option value="라스트마일1팀">라스트마일1팀</option>
                                        <option value="라스트마일2팀">라스트마일2팀</option>
                                        <option value="구매/생산">구매/생산</option>
                                        <option value="외부/협력사">외부/협력사</option>
                                        <option value="기타">기타</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[12px] font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                                    발생 원인 및 조치 상세 내역
                                </label>
                                <textarea
                                    value={causeDetail}
                                    onChange={e => setCauseDetail(e.target.value)}
                                    rows={3}
                                    className="w-full border border-gray-300 rounded-[4px] p-3 text-xs outline-none focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue resize-none transition-all placeholder:text-gray-300"
                                    placeholder="사고 발생의 구체적인 원인과 현장 상황을 자유롭게 입력해 주세요."
                                ></textarea>
                                {row.handler_name && (
                                    <div className="text-right text-[11px] text-gray-400 font-bold mt-1.5 pr-1 tracking-wide">
                                        {formatModalTime(row.updated_at || row.created_at)} / {row.handler_name}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 하단: 관리자 전용 구역 */}
                        {userProfile?.role === '관리자' && (
                            <div className="pt-5 border-t border-slate-200 slide-up">
                                <h5 className="text-[12px] font-black text-letusOrange mb-3 flex items-center gap-1.5">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                    관리자 전용 마감
                                </h5>
                                <div className="grid grid-cols-3 gap-4 bg-orange-50/40 p-4 rounded-lg border border-orange-100">

                                    {/* 1. 확인 결과 */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1">
                                            <span className="text-letusOrange">*</span> 확인 결과
                                        </label>
                                        <select value={actionResult} onChange={e => setActionResult(e.target.value)} className="w-full border border-blue-300 bg-blue-50/30 text-letusBlue rounded-[4px] p-2.5 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue">
                                            <option value="미확인">미확인 (빈칸)</option>
                                            <option value="정상출고">정상출고</option>
                                            <option value="미출고">미출고</option>
                                            <option value="오출고">오출고</option>
                                            <option value="과출고">과출고</option>
                                            <option value="물류파손">물류파손</option>
                                            <option value="시공파손">시공파손</option>
                                            <option value="현장직출">현장직출</option>
                                            <option value="센터직출">센터직출</option>
                                            <option value="납기연기(건)">납기연기(건)</option>
                                            <option value="납기연기(품목)">납기연기(품목)</option>
                                            <option value="제품분실">제품분실</option>
                                            <option value="기타">기타</option>
                                        </select>
                                    </div>

                                    {/* 2. 수행처 */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1">
                                            <span className="text-letusOrange">*</span> 수행처
                                        </label>
                                        <select value={handlerTeam} onChange={e => setHandlerTeam(e.target.value)} className="w-full border border-gray-300 bg-white text-gray-800 rounded-[4px] p-2.5 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue">
                                            <option value="">선택</option>
                                            {vendorList.map(vendor => (
                                                <option key={vendor} value={vendor}>{vendor}</option>
                                            ))}
                                            <option value="기타">기타</option>
                                        </select>
                                    </div>

                                    {/* 3. 조치 내용 */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1">
                                            <span className="text-letusOrange">*</span> 조치 내용
                                        </label>
                                        <select value={actionContent} onChange={e => setActionContent(e.target.value)} className="w-full border border-gray-300 bg-white text-gray-800 rounded-[4px] p-2.5 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue">
                                            <option value="">선택</option>
                                            <option value="출차 전 조치">출차 전 조치</option>
                                            <option value="선조치">선조치</option>
                                            <option value="당일 배차">당일 배차</option>
                                            <option value="일정 연기">일정 연기</option>
                                            <option value="과출고 회수">과출고 회수</option>
                                            <option value="추가 수주/AS 접수">추가 수주/AS 접수</option>
                                        </select>
                                    </div>

                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors shadow-sm">취소</button>
                    <button onClick={handleSave} disabled={isSaving} className={`px-6 py-2 bg-letusBlue text-white text-sm font-bold rounded-lg shadow hover:bg-blue-600 transition-all flex items-center gap-2 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
                        {isSaving ? '저장 중...' : '확인 및 등록'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// 2. 사고 데이터 일괄 수정 모달
export const AccidentBulkEditModal = ({ selectedIds, onClose, onReload, userProfile }) => {
    const isUser = userProfile?.role !== '관리자';

    const [causeType, setCauseType] = useState('');
    const [causeDetail, setCauseDetail] = useState('');
    const [dept, setDept] = useState(isUser ? userProfile?.team : '');
    const [actionResult, setActionResult] = useState('미확인');
    const [handlerTeam, setHandlerTeam] = useState('');
    const [actionContent, setActionContent] = useState('');
    const [vendorList, setVendorList] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchVendors = async () => {
            try {
                const { data, error } = await supabase.from('workers').select('vendor_name');
                if (error || !data) return;
                const uniqueVendors = [...new Set(data.map(item => item.vendor_name))].filter(Boolean).sort();
                setVendorList(uniqueVendors);
            } catch {}
        };
        fetchVendors();
    }, []);

    const handleSave = async () => {
        if (!causeType) return alert('발생 원인을 선택해 주세요.');
        if (!dept) return alert('귀책 부서를 선택해 주세요.');

        if (!window.confirm(`선택하신 ${selectedIds.length}건의 사고 데이터를 일괄 수정하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

        setIsSaving(true);
        try {
            const finalCauseStr = causeDetail ? `[${causeType}] ${causeDetail}` : `[${causeType}]`;

            const { error } = await supabase
                .from('logistics_accidents')
                .update({
                    responsible_dept: dept,
                    cause_detail: finalCauseStr,
                    action_result: actionResult !== '미확인' ? actionResult : undefined,
                    handler_team: handlerTeam || undefined,
                    action_content: actionContent || undefined,
                    // 조치내용 입력 시에만 납기지연 갱신 ('일정 연기' 포함 여부로 판단)
                    ...(actionContent ? { is_delayed: actionContent.includes('일정 연기') ? '재일정(지연)' : '' } : {}),
                    status: '등록 완료',
                    handler_name: userProfile?.name || '관리자',
                    updated_at: new Date().toISOString()
                })
                .in('id', selectedIds);

            if (error) throw error;

            alert(`🎉 총 ${selectedIds.length}건의 데이터가 일괄 마감 처리되었습니다.`);
            onReload();
            onClose();
        } catch (err) {
            alert('일괄 저장 중 오류 발생: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-lg slide-up overflow-hidden border border-gray-100 flex flex-col">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-letusOrange rounded-full"></span>
                        선택 항목 일괄 마감 처리
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh] custom-scrollbar">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm font-bold text-letusBlue text-center">
                        현재 <span className="text-lg mx-1">{selectedIds.length}</span>건의 데이터가 선택되었습니다.
                    </div>

                    <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[12px] font-bold text-gray-700 mb-2 flex items-center gap-1.5"><span className="text-letusOrange">*</span> 발생 원인 일괄 적용</label>
                                <select value={causeType} onChange={e => setCauseType(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue transition-all cursor-pointer bg-white">
                                    <option value="">원인을 선택해 주세요</option>
                                    <option value="작업자 귀책">작업자 귀책</option><option value="시공팀 귀책">시공팀 귀책</option><option value="전산/시스템 오류">전산/시스템 오류</option><option value="서류/정보 불일치">서류/정보 불일치</option><option value="재고/수량 이슈">재고/수량 이슈</option><option value="제조/생산 이슈">제조/생산 이슈</option><option value="프로세스 미준수">프로세스 미준수</option><option value="기타">기타</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[12px] font-bold text-gray-700 mb-2 flex items-center gap-1.5"><span className="text-letusOrange">*</span> 귀책 부서 일괄 적용</label>
                                <select value={dept} onChange={e => setDept(e.target.value)} disabled={isUser} className={`w-full border rounded-lg p-2.5 text-sm font-bold outline-none transition-all ${isUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200' : 'border-gray-300 focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue cursor-pointer bg-white'}`}>
                                    <option value="">부서를 선택해 주세요</option>
                                    {isUser && dept && !['물류사업1팀', '물류사업2팀', '운송사업팀', '컨택센터', '라스트마일1팀', '라스트마일2팀', '구매/생산', '외부/협력사', '기타'].includes(dept) && (<option value={dept}>{dept}</option>)}
                                    <option value="물류사업1팀">물류사업1팀</option><option value="물류사업2팀">물류사업2팀</option><option value="운송사업팀">운송사업팀</option><option value="컨택센터">컨택센터</option><option value="라스트마일1팀">라스트마일1팀</option><option value="라스트마일2팀">라스트마일2팀</option><option value="구매/생산">구매/생산</option><option value="외부/협력사">외부/협력사</option><option value="기타">기타</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[12px] font-bold text-gray-700 mb-2 flex items-center gap-1.5">발생 원인 상세 일괄 기입</label>
                            <textarea value={causeDetail} onChange={e => setCauseDetail(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue resize-none transition-all placeholder:text-gray-300" placeholder="예: 시공팀 오등록 확인, 일괄 마감 처리건"></textarea>
                        </div>

                        {/* 하단: 관리자 전용 구역 */}
                        {userProfile?.role === '관리자' && (
                            <div className="pt-5 border-t border-slate-200 slide-up">
                                <h5 className="text-[12px] font-black text-letusOrange mb-3 flex items-center gap-1.5">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                    관리자 전용 마감
                                </h5>
                                <div className="grid grid-cols-3 gap-4 bg-orange-50/40 p-4 rounded-lg border border-orange-100">

                                    {/* 1. 확인 결과 */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1">
                                            <span className="text-letusOrange">*</span> 확인 결과
                                        </label>
                                        <select value={actionResult} onChange={e => setActionResult(e.target.value)} className="w-full border border-blue-300 bg-blue-50/30 text-letusBlue rounded-[4px] p-2.5 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue">
                                            <option value="미확인">미확인 (빈칸)</option>
                                            <option value="정상출고">정상출고</option>
                                            <option value="미출고">미출고</option>
                                            <option value="오출고">오출고</option>
                                            <option value="과출고">과출고</option>
                                            <option value="물류파손">물류파손</option>
                                            <option value="시공파손">시공파손</option>
                                            <option value="현장직출">현장직출</option>
                                            <option value="센터직출">센터직출</option>
                                            <option value="납기연기(건)">납기연기(건)</option>
                                            <option value="납기연기(품목)">납기연기(품목)</option>
                                            <option value="제품분실">제품분실</option>
                                            <option value="기타">기타</option>
                                        </select>
                                    </div>

                                    {/* 2. 수행처 */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1">
                                            <span className="text-letusOrange">*</span> 수행처
                                        </label>
                                        <select value={handlerTeam} onChange={e => setHandlerTeam(e.target.value)} className="w-full border border-gray-300 bg-white text-gray-800 rounded-[4px] p-2.5 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue">
                                            <option value="">선택</option>
                                            {vendorList.map(vendor => (
                                                <option key={vendor} value={vendor}>{vendor}</option>
                                            ))}
                                            <option value="기타">기타</option>
                                        </select>
                                    </div>

                                    {/* 3. 조치 내용 */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-700 mb-2 flex items-center gap-1">
                                            <span className="text-letusOrange">*</span> 조치 내용
                                        </label>
                                        <select value={actionContent} onChange={e => setActionContent(e.target.value)} className="w-full border border-gray-300 bg-white text-gray-800 rounded-[4px] p-2.5 text-xs font-bold outline-none cursor-pointer focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue">
                                            <option value="">선택</option>
                                            <option value="출차 전 조치">출차 전 조치</option>
                                            <option value="선조치">선조치</option>
                                            <option value="당일 배차">당일 배차</option>
                                            <option value="일정 연기">일정 연기</option>
                                            <option value="과출고 회수">과출고 회수</option>
                                            <option value="추가 수주/AS 접수">추가 수주/AS 접수</option>
                                        </select>
                                    </div>

                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors shadow-sm">취소</button>
                    <button onClick={handleSave} disabled={isSaving} className={`px-6 py-2 bg-letusBlue text-white text-sm font-bold rounded-lg shadow hover:bg-blue-600 transition-all flex items-center gap-2 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
                        {isSaving ? '일괄 적용 중...' : '확인 및 일괄 적용'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// 3. 사고 리포트 엑셀 업로드 모달
export const AccidentUploadModal = ({ onClose, onFileUpload }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [files, setFiles] = useState({ acc: null, sch: null, wms: [] });
    const [applyFilters, setApplyFilters] = useState(true);
    const fileInputRef = React.useRef(null);

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };

    const processFiles = (droppedFiles) => {
        setFiles(prev => {
            let newAcc = prev.acc;
            let newSch = prev.sch;
            let newWms = [...prev.wms];

            Array.from(droppedFiles).forEach(file => {
                if (!file.name.includes('.xls')) return;

                if (file.name.includes('상차이슈')) newAcc = file;
                else if (file.name.includes('시공일정')) newSch = file;
                else if (file.name.includes('WMS')) {
                    if (!newWms.find(w => w.name === file.name)) {
                        newWms.push(file);
                    }
                }
            });
            return { acc: newAcc, sch: newSch, wms: newWms };
        });
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        processFiles(e.dataTransfer.files);
    };

    const handleFileSelect = (e) => { processFiles(e.target.files); };

    const handleUploadClick = () => {
        // 🔥 WMS 필수 제한 완전 해제! 상차이슈나 시공일정 중 하나만 있어도 통과!
        if (!files.acc && !files.sch && files.wms.length === 0) {
            return alert('🚨 업로드할 파일을 선택해주세요!');
        }
        onFileUpload({ ...files, applyFilters });
    };

    const handleResetFiles = () => setFiles({ acc: null, sch: null, wms: [] });

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            <div className="bg-white rounded-2xl shadow-2xl z-10 w-full max-w-lg slide-up overflow-hidden border border-gray-100 flex flex-col">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-green-500 rounded-full"></span>
                        데이터 통합 업로드
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
                </div>

                <div className="p-6 bg-white">
                    <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 mb-5 text-sm">
                        <h4 className="font-bold text-letusBlue mb-2">💡 파일 업로드 가이드</h4>
                        <ul className="list-disc list-inside text-gray-600 space-y-1.5 text-xs font-medium ml-1">
                            <li><span className="font-bold text-gray-800">사고 등록 및 수정 시:</span> 상차이슈 1개 필수 <span className="text-gray-400">(WMS는 선택)</span></li>
                            <li><span className="font-bold text-gray-800">납기지연(재일정) 업데이트 시:</span> 시공일정 단독 업로드 가능</li>
                            <li>파일 이름에 <span className="text-blue-500 font-bold">상차이슈, 시공일정, WMS</span> 단어가 포함되어야 합니다.</li>
                        </ul>
                    </div>

                    <div
                        className={`relative w-full h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all cursor-pointer mb-4 ${isDragging ? 'border-green-500 bg-green-50 scale-[1.02]' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-green-400'}`}
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}
                    >
                        <input type="file" hidden accept=".xlsx, .xls" multiple ref={fileInputRef} onChange={handleFileSelect} />
                        <svg className={`w-8 h-8 mb-2 ${isDragging ? 'text-green-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        <p className="text-gray-800 font-bold text-sm">업로드할 파일들을 이곳으로 드래그 하세요</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className={`p-2 rounded border text-center text-xs font-bold transition-colors ${files.acc ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>1. 상차이슈 {files.acc && '✅'}</div>
                        <div className={`p-2 rounded border text-center text-xs font-bold transition-colors ${files.sch ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>2. 시공일정 {files.sch && '✅'}</div>
                        <div className={`p-2 rounded border text-center text-xs font-bold transition-colors ${files.wms.length > 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>3. WMS <span className="text-blue-500">({files.wms.length}개)</span> {files.wms.length > 0 && '✅'}</div>
                    </div>

                    <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                        <div>
                            <p className="text-[12px] font-bold text-gray-800">🛠️ 예외 데이터 자동 제외 필터</p>
                            <p className="text-[11px] text-gray-500 mt-0.5">'이케아' 브랜드 및 '[SCM팀 부족량 CUT...]' 포함 건 무시</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={applyFilters} onChange={(e) => setApplyFilters(e.target.checked)} />
                            <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-letusBlue"></div>
                        </label>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                    <div>
                        {(files.acc || files.sch || files.wms.length > 0) && (
                            <button onClick={handleResetFiles} className="text-xs font-bold text-gray-400 hover:text-red-500 underline flex items-center gap-1 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                파일 목록 비우기
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded shadow-sm">닫기</button>
                        <button onClick={handleUploadClick} className="px-5 py-2 text-sm font-bold text-white bg-letusBlue hover:bg-blue-600 rounded shadow-sm flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            분석 및 DB 저장
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 4. 사고 현황 분석 보고서 모달
export const AccidentReportModal = ({ items, startDate, endDate, onClose }) => {

    const total = items.length;
    const pending = items.filter(i => i.status === '원인 파악 중').length;
    const delayed = items.filter(i => i.is_delayed === '재일정(지연)').length;
    const completedRate = total > 0 ? Math.round((total - pending) / total * 100) : 0;

    // 사고 유형별 분포 (action_result 기준)
    const resultData = useMemo(() => {
        const map = {};
        items.forEach(i => {
            const r = i.action_result || '미분류';
            map[r] = (map[r] || 0) + 1;
        });
        const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
        const max = sorted[0]?.count || 1;
        return sorted.map(item => ({ ...item, pct: Math.round(item.count / max * 100) }));
    }, [items]);

    // 귀책부서별 현황 (responsible_dept 기준)
    const deptData = useMemo(() => {
        const map = {};
        items.forEach(i => {
            const d = i.responsible_dept || '미분류';
            map[d] = (map[d] || 0) + 1;
        });
        const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
        const max = sorted[0]?.count || 1;
        return sorted.map(item => ({ ...item, pct: Math.round(item.count / max * 100) }));
    }, [items]);

    // 인쇄 스타일 주입
    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'accident-report-print-style';
        style.innerHTML = `@media print {
            html, body { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; }
            body > *:not(#accident-report-overlay) { display: none !important; }
            #accident-report-overlay { position: static !important; display: block !important; padding: 0 !important; }
            #accident-report-overlay > div:first-child { display: none !important; }
            #accident-report-print {
                width: 100% !important; max-width: 100% !important;
                max-height: none !important; height: auto !important;
                overflow: visible !important;
                box-shadow: none !important; border-radius: 0 !important; border: none !important;
            }
            #accident-report-body { overflow: visible !important; max-height: none !important; height: auto !important; flex: none !important; }
            #accident-report-footer { display: none !important; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }`;
        document.head.appendChild(style);
        return () => document.getElementById('accident-report-print-style')?.remove();
    }, []);

    const BAR_COLORS  = ['#3b82f6','#f97316','#ef4444','#10b981','#8b5cf6','#f59e0b','#06b6d4','#ec4899','#84cc16','#6b7280'];
    const DEPT_COLORS = ['#3b82f6','#f97316','#10b981','#ef4444','#8b5cf6','#f59e0b','#06b6d4'];

    const BarRow = ({ name, count, pct, color }) => (
        <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600 font-medium w-28 text-right shrink-0">{name}</span>
            <div className="flex-1 bg-gray-200 rounded-full h-5 overflow-hidden">
                <div className="h-5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <span className="text-xs font-bold text-gray-700 w-20 shrink-0">
                {count}건
                <span className="text-gray-400 font-normal ml-1">({total > 0 ? Math.round(count / total * 100) : 0}%)</span>
            </span>
        </div>
    );

    return ReactDOM.createPortal(
        <div id="accident-report-overlay" className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div id="accident-report-print"
                className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-100 slide-up">

                {/* 헤더 */}
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-letusOrange rounded-full" />
                        <h3 className="font-black text-sm text-gray-800">사고 현황 분석 보고</h3>
                        <span className="text-xs text-gray-400 font-medium">{startDate} ~ {endDate}</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 본문 */}
                <div id="accident-report-body" className="overflow-auto flex-1 p-6 space-y-7 custom-scrollbar">

                    {/* Section 1: KPI 카드 */}
                    <section>
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <span className="w-1 h-3.5 bg-letusOrange rounded-full" /> 종합 현황
                        </h4>
                        <div className="grid grid-cols-4 gap-3">
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                                <p className="text-[11px] text-gray-500 font-bold mb-1">총 사고</p>
                                <p className="text-3xl font-black text-letusBlue leading-none">{total.toLocaleString()}</p>
                                <p className="text-[10px] text-gray-400 mt-1.5">건</p>
                            </div>
                            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                                <p className="text-[11px] text-gray-500 font-bold mb-1">미처리</p>
                                <p className="text-3xl font-black text-red-500 leading-none">{pending.toLocaleString()}</p>
                                <p className="text-[10px] text-gray-400 mt-1.5">원인 파악 중</p>
                            </div>
                            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
                                <p className="text-[11px] text-gray-500 font-bold mb-1">납기 지연</p>
                                <p className="text-3xl font-black text-letusOrange leading-none">{delayed.toLocaleString()}</p>
                                <p className="text-[10px] text-gray-400 mt-1.5">재일정(지연)</p>
                            </div>
                            <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                                <p className="text-[11px] text-gray-500 font-bold mb-1">처리 완료율</p>
                                <p className="text-3xl font-black text-green-600 leading-none">{completedRate}%</p>
                                <p className="text-[10px] text-gray-400 mt-1.5">{(total - pending).toLocaleString()}건 완료</p>
                            </div>
                        </div>
                    </section>

                    {/* Section 2: 사고 유형별 분포 */}
                    <section>
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <span className="w-1 h-3.5 bg-letusBlue rounded-full" /> 사고 유형별 분포
                            <span className="text-[10px] text-gray-400 font-normal normal-case tracking-normal">확인 결과 기준</span>
                        </h4>
                        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2.5">
                            {resultData.length === 0
                                ? <p className="text-xs text-gray-300 py-6 text-center font-bold">데이터 없음</p>
                                : resultData.map((item, idx) => (
                                    <BarRow key={item.name} {...item} color={BAR_COLORS[idx % BAR_COLORS.length]} />
                                ))
                            }
                        </div>
                    </section>

                    {/* Section 3: 귀책부서별 현황 */}
                    <section>
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <span className="w-1 h-3.5 bg-green-500 rounded-full" /> 귀책부서별 현황
                        </h4>
                        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2.5">
                            {deptData.length === 0
                                ? <p className="text-xs text-gray-300 py-6 text-center font-bold">데이터 없음</p>
                                : deptData.map((item, idx) => (
                                    <BarRow key={item.name} {...item} color={DEPT_COLORS[idx % DEPT_COLORS.length]} />
                                ))
                            }
                        </div>
                    </section>
                </div>

                {/* 푸터 */}
                <div id="accident-report-footer" className="p-3 border-t bg-gray-50 flex justify-between items-center shrink-0">
                    <span className="text-[11px] text-gray-400">현재 화면 필터 기준 · 총 {total.toLocaleString()}건</span>
                    <div className="flex gap-2">
                        <button onClick={onClose}
                            className="px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 shadow-sm transition-colors">
                            닫기
                        </button>
                        <button onClick={() => window.print()}
                            className="px-5 py-1.5 bg-letusBlue text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            인쇄
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
