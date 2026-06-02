import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, invokeFunction } from './supabaseClient.js';
import { VendorSearchModal, VendorListModal, MenuPermissionModal } from './CommonComponents.jsx';
import { CloseIcon } from './SharedUI.jsx';
import { DEFAULT_MENUS } from './menuConfig.jsx';
import { loadXLSX } from './utils.js';

const WORKPLACE_LIST = ['양지1센터', '양지2센터', '양지3센터', '안성센터', '평택센터', '음성센터', '대전센터', '대구센터', '부산센터', '광주센터'];

const UserAddModal = ({ onClose, onReload }) => {
    const [name, setName] = useState('');
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [group, setGroup] = useState('관리자');
    const [status, setStatus] = useState('정상');
    const [brand, setBrand] = useState('퍼시스');
    const [team, setTeam] = useState('');
    const [workplace, setWorkplace] = useState('');
    const [managedVendors, setManagedVendors] = useState('');
    const [managedBrands, setManagedBrands] = useState('');
    const [slackEmail, setSlackEmail] = useState('');
    const [vendorModalOpen, setVendorModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // 🔥 신규: 메뉴 권한 모달 상태 및 기본값 설정
    const [menuModalOpen, setMenuModalOpen] = useState(false);
    const [accessibleMenus, setAccessibleMenus] = useState(DEFAULT_MENUS);

    const handleSave = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!name || !loginId || !password) { setErrorMsg('이름, 아이디, 비밀번호를 모두 입력해 주세요.'); return; }
        if (password.length < 6) { setErrorMsg('비밀번호는 최소 6자리 이상이어야 합니다.'); return; }

        setIsSaving(true);
        try {
            const targetEmail = loginId.includes('@') ? loginId : `${loginId}@letus.com`;
            // 1) Edge Function 으로 Auth 계정 생성 (서버측에서 관리자 권한 검증)
            const authResult = await invokeFunction('user-admin', {
                action: 'create',
                payload: { email: targetEmail, password },
            });
            const newUserId = authResult?.user?.id;
            if (!newUserId) throw new Error('Auth 계정 생성에 실패했습니다.');

            // 2) profiles INSERT 는 RLS(profiles_admin_all) 로 관리자만 통과
            const { error: profileError } = await supabase.from('profiles').insert([
                {
                    id: newUserId, name: name, login_id: loginId, role: group, status: status, brands: brand, team: team,
                    workplace: workplace || null,
                    managed_vendors: managedVendors, managed_brands: managedBrands,
                    accessible_menus: accessibleMenus.join(','),
                    slack_email: slackEmail || null,
                    created_at: new Date().toISOString()
                }
            ]);
            if (profileError) throw profileError;

            alert('신규 사용자가 성공적으로 등록되었습니다.');
            onReload();
            onClose();
        } catch (error) {
            console.error("User Creation Error:", error);
            setErrorMsg(`등록 실패: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-[480px] overflow-hidden flex flex-col slide-up">
                    <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center">
                            <span className="w-1.5 h-3.5 bg-letusOrange rounded-full mr-2"></span>사용자 추가
                        </h3>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1"><CloseIcon /></button>
                    </div>

                    <div className="p-6 bg-slate-50 flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar">
                        <form id="addForm" onSubmit={handleSave} className="space-y-4">
                            {errorMsg && (
                                <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded border border-red-100 flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    {errorMsg}
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">이름 <span className="text-red-500">*</span></label>
                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-xs focus:outline-none focus:border-letusBlue transition-all bg-white" placeholder="사용자 이름" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">아이디 (ID) <span className="text-red-500">*</span></label>
                                <div className="flex items-center border border-gray-300 rounded-[4px] overflow-hidden focus-within:border-letusBlue bg-white transition-all">
                                    <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} required autoComplete="off" className="flex-1 px-3.5 py-2 text-xs focus:outline-none placeholder-slate-400" placeholder="admin" />
                                    <span className="bg-slate-50 px-3 py-2 text-xs text-slate-500 font-bold border-l border-gray-200 shrink-0">@letus.com</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">비밀번호 <span className="text-red-500">*</span></label>
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-xs focus:outline-none focus:border-letusBlue transition-all bg-white" placeholder="최소 6자리 이상" />
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-1">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-gray-700">소속 팀 <span className="text-red-500">*</span></label>
                                    <input type="text" value={team} onChange={(e) => setTeam(e.target.value)} required className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-[11px] focus:outline-none focus:border-letusBlue transition-all bg-white text-gray-800" placeholder="소속 팀 입력" />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-gray-700">소속 브랜드 <span className="text-red-500">*</span></label>
                                    <select value={brand} onChange={(e) => setBrand(e.target.value)} className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-[11px] focus:outline-none focus:border-letusBlue transition-all bg-white text-gray-800 font-medium cursor-pointer">
                                        <option value="전체">전체 (All)</option><option value="퍼시스">퍼시스</option><option value="일룸">일룸</option><option value="슬로우베드">슬로우베드</option><option value="데스커">데스커</option><option value="시디즈">시디즈</option><option value="알로소">알로소</option><option value="바로스">바로스</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold text-gray-700">근무지</label>
                                <select value={workplace} onChange={(e) => setWorkplace(e.target.value)} className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-[11px] focus:outline-none focus:border-letusBlue transition-all bg-white text-gray-800 font-medium cursor-pointer">
                                    <option value="">미지정</option>
                                    {WORKPLACE_LIST.map(w => <option key={w} value={w}>{w}</option>)}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                                    슬랙 이메일
                                    <span className="text-[9px] font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">알림 수신용</span>
                                </label>
                                <input
                                    type="email"
                                    value={slackEmail}
                                    onChange={(e) => setSlackEmail(e.target.value)}
                                    placeholder="example@fursyspartners.com"
                                    className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-[11px] focus:outline-none focus:border-letusBlue transition-all bg-white text-gray-800"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold text-gray-700">담당 브랜드 및 업체 관리</label>
                                <div className="min-h-[60px] border border-gray-300 rounded-[4px] bg-white px-2.5 py-2 flex flex-col gap-2">
                                    <div className="flex flex-wrap gap-1.5 items-center">
                                        <span className="text-[9px] font-black text-orange-400 bg-orange-50 px-1 rounded">BRAND</span>
                                        {managedBrands ? managedBrands.split(',').filter(Boolean).map((b, i) => (
                                            <span key={i} className="bg-orange-50 text-letusOrange border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">{b.trim()}</span>
                                        )) : <span className="text-gray-300 text-[10px]">미설정</span>}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 items-center">
                                        <span className="text-[9px] font-black text-blue-400 bg-blue-50 px-1 rounded">VENDOR</span>
                                        {managedVendors ? managedVendors.split(',').filter(Boolean).map((v, i) => (
                                            <span key={i} className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">{v.trim()}</span>
                                        )) : <span className="text-gray-300 text-[10px]">미설정</span>}
                                    </div>
                                </div>
                                <button type="button" onClick={() => setVendorModalOpen(true)} className="flex items-center gap-1.5 text-[11px] font-bold text-letusBlue border border-letusBlue/40 bg-blue-50 hover:bg-blue-100 rounded-[4px] px-3 py-1.5 transition-colors w-fit">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> 업체 검색 및 추가
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pb-1">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-gray-700">권한 그룹</label>
                                    <select value={group} onChange={(e) => setGroup(e.target.value)} className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-[11px] focus:outline-none focus:border-letusBlue transition-all bg-white text-gray-800 font-medium cursor-pointer">
                                        <option value="최고관리자">최고관리자</option>
                                        <option value="관리자">관리자</option>
                                        <option value="사용자">사용자</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-gray-700">계정 상태</label>
                                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-[11px] focus:outline-none focus:border-letusBlue transition-all bg-white text-gray-800 font-medium cursor-pointer">
                                        <option value="정상">정상 승인</option>
                                        <option value="정지">이용 정지</option>
                                    </select>
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* 🔥 하단 영역 분리: 좌측(메뉴 권한 설정), 우측(취소/등록) */}
                    <div className="p-4 border-t border-gray-200 bg-white flex justify-between items-center shrink-0">
                        <div>
                            <button
                                type="button"
                                onClick={() => setMenuModalOpen(true)}
                                disabled={group?.includes('관리자')}
                                className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-[9px] rounded-[3px] border transition-colors ${group?.includes('관리자') ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 cursor-pointer'}`}
                                title={group?.includes('관리자') ? "관리자는 모든 메뉴에 접근 가능합니다." : "사용자가 볼 수 있는 메뉴를 설정합니다."}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                                메뉴 권한 설정
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={onClose} className="px-5 py-[9px] border border-gray-300 text-gray-600 text-[11px] font-bold rounded-[3px] hover:bg-gray-50 transition-colors">취소</button>
                            <button onClick={handleSave} disabled={isSaving} className={`px-5 py-[9px] bg-letusBlue text-white text-[11px] font-bold rounded-[3px] hover:bg-blue-600 transition-colors flex items-center gap-1.5 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
                                {isSaving ? <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : null}
                                {isSaving ? '생성 중...' : '등록하기'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {vendorModalOpen && <VendorSearchModal initialVendors={managedVendors} onApplyVendors={setManagedVendors} initialBrands={managedBrands} onApplyBrands={setManagedBrands} onClose={() => setVendorModalOpen(false)} />}
            {/* 🔥 분리된 메뉴 모달 연결 */}
            {menuModalOpen && <MenuPermissionModal initialMenus={accessibleMenus} onApply={setAccessibleMenus} onClose={() => setMenuModalOpen(false)} />}
        </>
    );
};

// 2. 사용자 일괄 수정 모달
const UserBulkEditModal = ({ selectedUserIds, users, onClose, onReload }) => {
    const [updateTarget, setUpdateTarget] = useState({ vendor: false, workplace: false, menu: false });
    const [managedVendors, setManagedVendors] = useState('');
    const [managedBrands, setManagedBrands] = useState('');
    const [workplace, setWorkplace] = useState('');
    const [accessibleMenus, setAccessibleMenus] = useState([]);
    const [vendorModalOpen, setVendorModalOpen] = useState(false);
    const [menuModalOpen, setMenuModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const targetUsers = users.filter(u => selectedUserIds.includes(u.id));

    const handleSave = async () => {
        if (!updateTarget.vendor && !updateTarget.workplace && !updateTarget.menu) return alert('변경할 대상을 선택해 주세요.');
        if (updateTarget.workplace && !workplace) return alert('변경할 근무지를 선택해 주세요.');

        setIsSaving(true);
        try {
            const updateData = {};
            if (updateTarget.vendor) {
                updateData.managed_vendors = managedVendors;
                updateData.managed_brands = managedBrands;
            }
            if (updateTarget.workplace) {
                updateData.workplace = workplace;
            }
            if (updateTarget.menu) {
                updateData.accessible_menus = accessibleMenus.join(',');
            }

            // 선택된 유저 ID들에 대해 일괄 업데이트 (RLS: 관리자만 통과)
            const { error } = await supabase.from('profiles').update(updateData).in('id', selectedUserIds);
            if (error) throw error;

            alert(`총 ${selectedUserIds.length}명의 정보가 일괄 수정되었습니다.`);
            onReload();
            onClose();
        } catch (err) {
            alert('일괄 수정 중 오류 발생: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-[450px] overflow-hidden flex flex-col slide-up">
                    <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white">
                        <h3 className="text-sm font-bold text-gray-800 flex items-center"><span className="w-1.5 h-3.5 bg-letusBlue rounded-full mr-2"></span>선택 항목 일괄 수정</h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
                    </div>
                    <div className="p-6 bg-slate-50 flex-1 space-y-5">
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs font-bold text-letusBlue text-center">
                            현재 <span className="text-lg mx-1">{selectedUserIds.length}</span>명의 사용자가 선택되었습니다.
                        </div>

                        <div className="space-y-4">
                            {/* 옵션 1: 업체/브랜드 일괄 변경 */}
                            <div className={`border rounded-lg p-4 transition-colors ${updateTarget.vendor ? 'border-letusBlue bg-white shadow-sm' : 'border-gray-200 bg-gray-50'}`}>
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800 text-sm mb-3">
                                    <input type="checkbox" checked={updateTarget.vendor} onChange={e => setUpdateTarget({ ...updateTarget, vendor: e.target.checked })} className="w-4 h-4 accent-letusBlue" />
                                    담당 브랜드 및 업체 일괄 변경
                                </label>
                                {updateTarget.vendor && (
                                    <div className="pl-6 animate-fade-in space-y-2">
                                        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                                            <span className="bg-orange-50 text-letusOrange border border-orange-200 px-2 py-0.5 rounded-full">{managedBrands || '선택된 브랜드 없음'}</span>
                                            <span className="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">{managedVendors || '선택된 업체 없음'}</span>
                                        </div>
                                        <button onClick={() => setVendorModalOpen(true)} className="text-[11px] font-bold text-letusBlue bg-blue-50 border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-100">업체/브랜드 재설정 모달 열기</button>
                                    </div>
                                )}
                            </div>

                            {/* 옵션 2: 근무지 일괄 변경 */}
                            <div className={`border rounded-lg p-4 transition-colors ${updateTarget.workplace ? 'border-indigo-400 bg-white shadow-sm' : 'border-gray-200 bg-gray-50'}`}>
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800 text-sm mb-3">
                                    <input type="checkbox" checked={updateTarget.workplace} onChange={e => setUpdateTarget({ ...updateTarget, workplace: e.target.checked })} className="w-4 h-4 accent-indigo-500" />
                                    근무지 일괄 변경
                                </label>
                                {updateTarget.workplace && (
                                    <div className="pl-6 animate-fade-in">
                                        <select value={workplace} onChange={e => setWorkplace(e.target.value)} className="border border-gray-300 rounded px-2.5 py-1.5 text-[11px] outline-none w-full bg-white cursor-pointer text-gray-700">
                                            <option value="">선택 안함</option>
                                            {WORKPLACE_LIST.map(w => <option key={w} value={w}>{w}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>

                            {/* 옵션 3: 메뉴 권한 일괄 변경 */}
                            <div className={`border rounded-lg p-4 transition-colors ${updateTarget.menu ? 'border-purple-400 bg-white shadow-sm' : 'border-gray-200 bg-gray-50'}`}>
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800 text-sm mb-3">
                                    <input type="checkbox" checked={updateTarget.menu} onChange={e => setUpdateTarget({ ...updateTarget, menu: e.target.checked })} className="w-4 h-4 accent-purple-500" />
                                    메뉴 접근 권한 일괄 덮어쓰기
                                </label>
                                {updateTarget.menu && (
                                    <div className="pl-6 animate-fade-in">
                                        <button onClick={() => setMenuModalOpen(true)} className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded hover:bg-purple-100 flex items-center gap-1.5">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                                            메뉴 권한 아코디언 열기 ({accessibleMenus.length}개 선택됨)
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t bg-white flex justify-end gap-2">
                        <button onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 text-[11px] font-bold rounded hover:bg-gray-50">취소</button>
                        <button onClick={handleSave} disabled={isSaving || (!updateTarget.vendor && !updateTarget.workplace && !updateTarget.menu)} className="px-5 py-2 bg-letusBlue text-white text-[11px] font-bold rounded hover:bg-blue-600 flex items-center gap-1.5 disabled:opacity-50">
                            {isSaving ? '일괄 적용 중...' : '선택 대상 일괄 적용'}
                        </button>
                    </div>
                </div>
            </div>
            {vendorModalOpen && <VendorSearchModal initialVendors={managedVendors} onApplyVendors={setManagedVendors} initialBrands={managedBrands} onApplyBrands={setManagedBrands} onClose={() => setVendorModalOpen(false)} />}
            {menuModalOpen && <MenuPermissionModal initialMenus={accessibleMenus} onApply={setAccessibleMenus} onClose={() => setMenuModalOpen(false)} />}
        </>
    );
};

// 3. 엑셀 일괄 업로드 모달
const UserBulkUploadModal = ({ onClose, onReload }) => {
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStats, setUploadStats] = useState(null);

    const handleDownloadTemplate = async () => {
        const XLSX = await loadXLSX();
        const templateData = [
            {
                '이름(필수)': '홍길동', '아이디(필수)': 'gildong', '비밀번호(필수/선택)': '123456',
                '소속팀(필수)': '물류사업1팀', '소속브랜드': '퍼시스', '근무지': '양지1센터', '권한그룹': '사용자', '상태': '정상',
                '담당브랜드': '퍼시스, 일룸', '담당업체': 'CJ대한통운',
                '허용메뉴(ID)': DEFAULT_MENUS.join(',')
            }
        ];
        const ws = XLSX.utils.json_to_sheet(templateData);
        ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 40 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "사용자업로드양식");
        XLSX.writeFile(wb, `사용자_일괄등록수정_양식_${new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]}.xlsx`);
    };

    const handleFileChange = (e) => {
        const selected = e.target.files[0];
        if (selected && selected.name.includes('.xls')) setFile(selected);
        else { alert('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.'); e.target.value = null; }
    };

    const handleUpload = async () => {
        if (!file) return alert('업로드할 엑셀 파일을 선택해 주세요.');
        setIsUploading(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const XLSX = await loadXLSX();
                const data = e.target.result;
                let wb = XLSX.read(data, { type: 'binary' });
                const sheetName = wb.SheetNames[0];
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

                if (rows.length === 0) throw new Error('엑셀 파일에 데이터가 없습니다.');

                let stats = { insert: 0, update: 0, fail: 0, logs: [] };

                // 🚩 1. 기존 유저 목록 가져오기 (RLS: 관리자는 전체 조회 가능)
                const { data: existingProfiles } = await supabase.from('profiles').select('id, login_id');
                const existingMap = {};
                if (existingProfiles) {
                    existingProfiles.forEach(p => { existingMap[p.login_id] = p.id; });
                }

                // 🚩 2. 엑셀 데이터를 한 줄씩 읽으며 처리
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    // 공백 없는 키 생성 (오타 방지)
                    const cleanRow = {};
                    for (let key in row) cleanRow[key.replace(/\s/g, '')] = row[key];

                    const name = cleanRow['이름(필수)'];
                    const loginId = cleanRow['아이디(필수)'];
                    let password = cleanRow['비밀번호(필수/선택)'];
                    if (password) password = String(password); // 숫자로 입력된 비번을 문자로 변환

                    if (!name || !loginId) {
                        stats.fail++;
                        stats.logs.push(`${i + 2}행: 필수 정보(이름, 아이디) 누락`);
                        continue;
                    }

                    // DB에 넣을 형태 정리
                    const payload = {
                        name: name,
                        login_id: loginId,
                        team: cleanRow['소속팀(필수)'] || '',
                        brands: cleanRow['소속브랜드'] || '',
                        workplace: cleanRow['근무지'] || null,
                        role: cleanRow['권한그룹'] || '사용자',
                        status: cleanRow['상태'] || '정상',
                        managed_brands: cleanRow['담당브랜드'] || '',
                        managed_vendors: cleanRow['담당업체'] || '',
                        accessible_menus: cleanRow['허용메뉴(ID)'] || DEFAULT_MENUS.join(',')
                    };

                    try {
                        if (existingMap[loginId]) {
                            // 🔄 [기존 사용자] 프로필 업데이트 (RLS: 관리자만 통과)
                            const userId = existingMap[loginId];
                            const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
                            if (error) throw error;

                            // 엑셀에 비번이 적혀있으면 비번도 변경 (Edge Function 경유)
                            if (password && password.length >= 6) {
                                await invokeFunction('user-admin', {
                                    action: 'updatePassword',
                                    payload: { userId, password },
                                });
                            }
                            stats.update++;
                        } else {
                            // ✨ [신규 사용자] 로그인 계정 생성 후 프로필 등록
                            if (!password || password.length < 6) {
                                throw new Error('신규 계정은 6자리 이상의 비밀번호가 필수입니다.');
                            }
                            const targetEmail = loginId.includes('@') ? loginId : `${loginId}@letus.com`;

                            const authResult = await invokeFunction('user-admin', {
                                action: 'create',
                                payload: { email: targetEmail, password },
                            });
                            const newUserId = authResult?.user?.id;
                            if (!newUserId) throw new Error('Auth 계정 생성에 실패했습니다.');

                            payload.id = newUserId;
                            payload.created_at = new Date().toISOString();

                            const { error: profileError } = await supabase.from('profiles').insert([payload]);
                            if (profileError) throw profileError;

                            stats.insert++;
                        }
                    } catch (rowErr) {
                        stats.fail++;
                        stats.logs.push(`[${loginId}] ${rowErr.message}`);
                    }
                }

                setUploadStats(stats);
                if (stats.insert > 0 || stats.update > 0) onReload();

            } catch (err) {
                alert('업로드 중 오류 발생: ' + err.message);
            } finally {
                setIsUploading(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[500px] overflow-hidden flex flex-col slide-up">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center"><span className="w-1.5 h-3.5 bg-green-500 rounded-full mr-2"></span>사용자 일괄 등록/수정 (Excel)</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
                </div>
                <div className="p-6 bg-slate-50 flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar">
                    {!uploadStats ? (
                        <div className="space-y-4">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs font-medium text-gray-600 space-y-1">
                                <p className="font-bold text-letusBlue mb-2">💡 엑셀 일괄 처리 가이드</p>
                                <p>- <span className="font-bold text-green-600">신규 아이디:</span> 시스템에 새로운 계정으로 등록됩니다.</p>
                                <p>- <span className="font-bold text-orange-500">기존 아이디:</span> 엑셀 데이터로 기존 정보가 <b>업데이트(덮어쓰기)</b> 됩니다.</p>
                            </div>
                            <button onClick={handleDownloadTemplate} className="w-full flex justify-center gap-2 py-2.5 border border-green-500 text-green-600 text-xs font-bold rounded-lg hover:bg-green-50 shadow-sm"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>양식 다운로드</button>
                            <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="block w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded file:border-0 file:font-bold file:bg-blue-50 file:text-letusBlue hover:file:bg-blue-100 border border-gray-300 rounded-lg bg-white cursor-pointer" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 rounded-lg border bg-white border-gray-200">
                                <h4 className="font-bold text-gray-800 mb-2 text-center">업로드 처리 결과</h4>
                                <div className="flex justify-center gap-4 text-sm font-bold">
                                    <span className="text-green-600">✨ 신규: {uploadStats.insert}</span>
                                    <span className="text-blue-600">🔄 수정: {uploadStats.update}</span>
                                    <span className="text-red-500">❌ 실패: {uploadStats.fail}</span>
                                </div>
                            </div>
                            {uploadStats.logs.length > 0 && (
                                <div className="bg-red-50 border border-red-100 rounded-lg p-3 max-h-32 overflow-auto text-[11px] text-red-500">
                                    {uploadStats.logs.map((l, i) => <p key={i}>- {l}</p>)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t bg-white flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 text-[11px] font-bold rounded hover:bg-gray-50">{uploadStats ? '닫기' : '취소'}</button>
                    {!uploadStats && <button onClick={handleUpload} disabled={isUploading || !file} className="px-5 py-2 bg-letusBlue text-white text-[11px] font-bold rounded hover:bg-blue-600 flex items-center gap-1.5">{isUploading ? '처리 중...' : '데이터 분석 및 적용'}</button>}
                </div>
            </div>
        </div>
    );
};


export { UserAddModal, UserBulkEditModal, UserBulkUploadModal };
