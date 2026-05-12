import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, invokeFunction } from './supabaseClient.js';
import { VendorSearchModal } from './CommonComponents.jsx';
import { MenuPermissionModal } from './CommonComponents.jsx';




// --- 범용 컴포넌트 ---
const TableSkeleton = ({ colCount = 7 }) => (
    <tbody className="bg-white">
        <tr>
            {/* text-center 제거하고 내부 div에서 위치를 제어합니다 */}
            <td colSpan={colCount} className="py-24">
                {/* 🔥 w-full과 sticky left-0을 줘서 스크롤을 움직여도 항상 화면 한가운데 오도록 고정! */}
                <div className="flex flex-col items-center justify-center animate-pulse w-full sticky left-0">
                    <svg className="w-8 h-8 text-letusBlue mb-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-gray-500 font-bold text-sm tracking-tight">데이터를 불러오는 중입니다...</p>
                </div>
            </td>
        </tr>
    </tbody>
);

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
);

const CATEGORY_COLORS = {
    '파손 및 불량': '#ef4444',
    '제품 파손': '#f87171',
    '박스 훼손': '#fb923c',
    '박스훼손': '#fb923c',
    '바코드 불량': '#eab308',
    '계획 이슈': '#3b82f6',
    '계획 미생성': '#60a5fa',
    '계획 부족(실물 과다)': '#818cf8',
    '계획 과다(실물 부족)': '#c084fc',
    '기타 특이사항': '#9ca3af',
    '기타': '#9ca3af',
    '파손': '#ef4444',
    '수량부족': '#facc15',
    '오입고': '#22c55e',
    '품질불량': '#3b82f6'
};
const BRAND_COLORS = ['#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#f97316', '#ef4444'];

const StatusBadge = ({ status, category }) => {
    let bg = '', text = '', icon = null;
    if (status === '조치대기') { bg = 'bg-red-50 border-red-200'; text = 'text-red-500'; }
    if (status === '처리 중') { bg = 'bg-yellow-50 border-yellow-300'; text = 'text-yellow-600'; }
    if (status === '조치완료') { bg = 'bg-green-50 border-green-200'; text = 'text-green-600'; }
    if (status === '피드백완료') {
        bg = 'bg-blue-50 border-blue-200';
        text = 'text-blue-600';
        icon = <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>;
    }
    return (
        <span className={`inline-flex outline-none items-center px-2 py-1 rounded-full text-xs font-bold border shadow-sm ${bg} ${text} justify-center`}>
            {icon}
            {status}
        </span>
    );
};

const CategoryBadge = ({ category }) => {
    const color = CATEGORY_COLORS[category] || '#9ca3af';
    return (
        <div className="flex items-center">
            <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: color }}></span>
            <span className="text-sm text-gray-700">{category}</span>
        </div>
    );
}

const formatDateTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '-';
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const ImageSlider = ({ imageUrlString }) => {
    const urls = imageUrlString ? imageUrlString.split(',').map(s => s.trim()).filter(Boolean) : [];
    const [currentIndex, setCurrentIndex] = React.useState(0);

    if (urls.length === 0) {
        return (
            <div className="w-full h-full min-h-[400px] bg-gray-50 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm font-medium">
                첨부된 사진이 없습니다
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-3 w-full h-full">
            <div className="relative w-full h-[400px] flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200 overflow-hidden group">
                <img
                    src={urls[currentIndex]}
                    alt={`현장사진 ${currentIndex + 1}`}
                    className="w-full h-full object-contain transition-opacity duration-300"
                />

                {urls.length > 1 && (
                    <div className="absolute top-4 right-4 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-md backdrop-blur-sm">
                        {currentIndex + 1} / {urls.length}
                    </div>
                )}
            </div>

            {urls.length > 1 && (
                <div className="flex bg-gray-100 px-3 py-1.5 rounded-full gap-2 border border-gray-200 shadow-inner">
                    {urls.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentIndex(idx); }}
                            className={`w-1.5 h-1.5 rounded-full outline-none transition-all ${idx === currentIndex ? 'bg-letusBlue scale-125' : 'bg-gray-300 hover:bg-gray-400'}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// --- 👤 사용자 정보 수정 모달 (UserEditModal - UI 간소화 및 메뉴권한 모달 분리) ---
const UserEditModal = ({ user, onClose, onReload, isProfileMode = false }) => {
    const [name, setName] = useState(user.name || '');
    const [loginId, setLoginId] = useState(user.login_id || '');
    const [password, setPassword] = useState('');
    const [group, setGroup] = useState(user.role || '사용자');
    const [status, setStatus] = useState(user.status || '정상');
    const [brand, setBrand] = useState(user.brands || '전체');
    const [team, setTeam] = useState(user.team || '');
    const [managedVendors, setManagedVendors] = useState(user.managed_vendors || '');
    const [managedBrands, setManagedBrands] = useState(user.managed_brands || '');

    const [vendorModalOpen, setVendorModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // 🔥 신규: 메뉴 권한 모달 상태 설정
    const [menuModalOpen, setMenuModalOpen] = useState(false);
    const [accessibleMenus, setAccessibleMenus] = useState(user.accessible_menus ? user.accessible_menus.split(',') : []);

    React.useEffect(() => {
        if (user) {
            setManagedVendors(user.managed_vendors || '');
            setManagedBrands(user.managed_brands || '');
        }
    }, [user]);

    const handleSave = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!name || !loginId) { setErrorMsg('이름과 아이디는 필수 입력 항목입니다.'); return; }
        if (password && password.length < 6) { setErrorMsg('비밀번호는 최소 6자리 이상이어야 합니다.'); return; }

        setIsSaving(true);
        try {
            // profiles UPDATE — RLS:
            //   - isProfileMode=true: 본인이 자기 프로필 수정 → profiles_self_update 통과
            //   - isProfileMode=false: 관리자가 타인 프로필 수정 → profiles_admin_all 통과
            const { error: profileError } = await supabase.from('profiles').update({
                name, login_id: loginId, role: group, status, brands: brand, team,
                managed_vendors: managedVendors, managed_brands: managedBrands,
                accessible_menus: accessibleMenus.join(','),
            }).eq('id', user.id);
            if (profileError) throw profileError;

            if (password) {
                // 비밀번호 변경은 Edge Function 경유 (본인 OR 관리자만 통과)
                await invokeFunction('user-admin', {
                    action: 'updatePassword',
                    payload: { userId: user.id, password },
                });
            }

            alert('사용자 정보가 수정되었습니다.');
            onReload();
            onClose();
        } catch (error) {
            console.error('User Update Error:', error);
            setErrorMsg(`수정 실패: ${error.message}`);
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
                            <span className="w-1.5 h-3.5 bg-letusBlue rounded-full mr-2"></span>
                            {isProfileMode ? '내 정보 수정' : '사용자 정보 수정'}
                        </h3>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1"><CloseIcon /></button>
                    </div>

                    <div className="p-6 bg-slate-50 flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar">
                        <form id="editForm" onSubmit={handleSave} className="space-y-4">
                            {errorMsg && (
                                <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded border border-red-100 flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    {errorMsg}
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">이름 <span className="text-red-500">*</span></label>
                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-xs focus:outline-none focus:border-letusBlue transition-all bg-white" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">아이디 (ID) <span className="text-red-500">*</span></label>
                                <div className="flex items-center border border-gray-300 rounded-[4px] overflow-hidden focus-within:border-letusBlue bg-white transition-all">
                                    <input type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)} required disabled={isProfileMode} autoComplete="off" className={`flex-1 px-3.5 py-2 text-xs focus:outline-none ${isProfileMode ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'placeholder-slate-400'}`} />
                                    <span className="bg-slate-50 px-3 py-2 text-xs text-slate-500 font-bold border-l border-gray-200 shrink-0">@letus.com</span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-700">새 비밀번호 <span className="text-slate-400 font-normal">(변경 시에만 입력)</span></label>
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete="new-password" className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-xs focus:outline-none focus:border-letusBlue transition-all bg-white" placeholder="변경하지 않으려면 비워두세요" />
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-1">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-gray-700">소속 팀 <span className="text-red-500">*</span></label>
                                    <input type="text" value={team} onChange={(e) => setTeam(e.target.value)} required className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-[11px] focus:outline-none focus:border-letusBlue transition-all bg-white text-gray-800" />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-gray-700">소속 브랜드 <span className="text-red-500">*</span></label>
                                    <select value={brand} onChange={(e) => setBrand(e.target.value)} className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-[11px] focus:outline-none focus:border-letusBlue transition-all bg-white text-gray-800 font-medium cursor-pointer">
                                        <option value="전체">전체 (All)</option><option value="퍼시스">퍼시스</option><option value="일룸">일룸</option><option value="슬로우베드">슬로우베드</option><option value="데스커">데스커</option><option value="시디즈">시디즈</option><option value="알로소">알로소</option><option value="바로스">바로스</option>
                                    </select>
                                </div>
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

                            {!isProfileMode && (
                                <>
                                    <div className="grid grid-cols-2 gap-4 pb-1">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-bold text-gray-700">권한 그룹</label>
                                            <select value={group} onChange={(e) => setGroup(e.target.value)} className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-[11px] focus:outline-none focus:border-letusBlue transition-all bg-white text-gray-800 font-medium cursor-pointer">
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
                                </>
                            )}
                        </form>
                    </div>

                    {/* 🔥 하단 영역 분리 */}
                    <div className="p-4 border-t border-gray-200 bg-white flex justify-between items-center shrink-0">
                        <div>
                            {!isProfileMode && (
                                <button
                                    type="button"
                                    onClick={() => setMenuModalOpen(true)}
                                    disabled={group === '관리자'}
                                    className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-[9px] rounded-[3px] border transition-colors ${group === '관리자' ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 cursor-pointer'}`}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                                    메뉴 권한 설정
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={onClose} className="px-5 py-[9px] border border-gray-300 text-gray-600 text-[11px] font-bold rounded-[3px] hover:bg-gray-50 transition-colors">취소</button>
                            <button onClick={handleSave} disabled={isSaving} className={`px-5 py-[9px] bg-letusBlue text-white text-[11px] font-bold rounded-[3px] hover:bg-blue-600 transition-colors flex items-center gap-1.5 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
                                {isSaving ? <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : null}
                                {isSaving ? '수정 중...' : '수정하기'}
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

export { TableSkeleton };
export { CloseIcon };
export { CATEGORY_COLORS };
export { BRAND_COLORS };
export { StatusBadge };
export { CategoryBadge };
export { formatDateTime };
export { ImageSlider };
export { UserEditModal };