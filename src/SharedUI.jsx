import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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

const ImageSlider = ({ imageUrlString, imageUrlHqString }) => {
    const urls = imageUrlString ? imageUrlString.split(',').map(s => s.trim()).filter(Boolean) : [];
    const hqUrls = imageUrlHqString ? imageUrlHqString.split(',').map(s => s.trim()).filter(Boolean) : [];
    const [currentIndex, setCurrentIndex] = React.useState(0);
    const [lightboxOpen, setLightboxOpen] = React.useState(false);

    const prev = (e) => { e?.stopPropagation(); setCurrentIndex(i => Math.max(0, i - 1)); };
    const next = (e) => { e?.stopPropagation(); setCurrentIndex(i => Math.min(urls.length - 1, i + 1)); };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowLeft') prev();
        if (e.key === 'ArrowRight') next();
    };

    React.useEffect(() => {
        if (!lightboxOpen) return;
        const handler = (e) => {
            if (e.key === 'ArrowLeft') setCurrentIndex(i => Math.max(0, i - 1));
            if (e.key === 'ArrowRight') setCurrentIndex(i => Math.min(urls.length - 1, i + 1));
            if (e.key === 'Escape') setLightboxOpen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [lightboxOpen, urls.length]);

    if (urls.length === 0) {
        return (
            <div className="w-full h-full min-h-[400px] bg-gray-50 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm font-medium">
                첨부된 사진이 없습니다
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-3 w-full h-full">
            <div
                className="relative w-full h-[400px] flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200 overflow-hidden group outline-none"
                tabIndex={0}
                onKeyDown={handleKeyDown}
            >
                <img
                    src={urls[currentIndex]}
                    alt={`현장사진 ${currentIndex + 1}`}
                    className="w-full h-full object-contain transition-opacity duration-300 cursor-zoom-in"
                    onClick={() => setLightboxOpen(true)}
                />

                {urls.length > 1 && (
                    <div className="absolute top-4 right-4 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-md backdrop-blur-sm">
                        {currentIndex + 1} / {urls.length}
                    </div>
                )}

                {/* 좌우 화살표 버튼 */}
                {urls.length > 1 && currentIndex > 0 && (
                    <button
                        onClick={prev}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/65 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                )}
                {urls.length > 1 && currentIndex < urls.length - 1 && (
                    <button
                        onClick={next}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/65 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                    </button>
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

            {lightboxOpen && (
                <div
                    className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
                    onClick={() => setLightboxOpen(false)}
                >
                    <button
                        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 rounded-full transition-colors"
                        onClick={() => setLightboxOpen(false)}
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>

                    <img
                        src={hqUrls[currentIndex] || urls[currentIndex]}
                        alt={`현장사진 ${currentIndex + 1}`}
                        className="max-h-[90vh] max-w-[90vw] object-contain rounded shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    />

                    {urls.length > 1 && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-sm font-bold bg-black/50 px-4 py-1.5 rounded-full">
                            {currentIndex + 1} / {urls.length}
                        </div>
                    )}

                    {urls.length > 1 && currentIndex > 0 && (
                        <button
                            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center transition-colors"
                            onClick={e => { e.stopPropagation(); setCurrentIndex(i => Math.max(0, i - 1)); }}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                    )}
                    {urls.length > 1 && currentIndex < urls.length - 1 && (
                        <button
                            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center transition-colors"
                            onClick={e => { e.stopPropagation(); setCurrentIndex(i => Math.min(urls.length - 1, i + 1)); }}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// --- 👤 사용자 정보 수정 모달 (UserEditModal - UI 간소화 및 메뉴권한 모달 분리) ---
const WORKPLACE_LIST = ['양지1센터', '양지2센터', '양지3센터', '안성센터', '평택센터', '음성센터', '대전센터', '대구센터', '부산센터', '광주센터'];

const UserEditModal = ({ user, onClose, onReload, isProfileMode = false }) => {
    const [name, setName] = useState(user.name || '');
    const [loginId, setLoginId] = useState(user.login_id || '');
    const [password, setPassword] = useState('');
    const [group, setGroup] = useState(user.role || '사용자');
    const [status, setStatus] = useState(user.status || '정상');
    const [brand, setBrand] = useState(user.brands || '전체');
    const [team, setTeam] = useState(user.team || '');
    const [workplace, setWorkplace] = useState(user.workplace || '');
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
                workplace: workplace || null,
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
                                <label className="text-[11px] font-bold text-gray-700">근무지</label>
                                <select value={workplace} onChange={(e) => setWorkplace(e.target.value)} className="border border-gray-300 rounded-[4px] px-3.5 py-2 text-[11px] focus:outline-none focus:border-letusBlue transition-all bg-white text-gray-800 font-medium cursor-pointer">
                                    <option value="">미지정</option>
                                    {WORKPLACE_LIST.map(w => <option key={w} value={w}>{w}</option>)}
                                </select>
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

// --- 조회 버튼 공통 컴포넌트 ---
const SearchButton = ({ onClick, label = '조회하기', className = '' }) => {
    const [phase, setPhase] = useState('idle'); // 'idle' | 'loading' | 'done'

    const handleClick = async () => {
        if (phase !== 'idle') return;
        setPhase('loading');
        await Promise.all([
            Promise.resolve(onClick?.()),
            new Promise(r => setTimeout(r, 500)),
        ]);
        setPhase('done');
        setTimeout(() => setPhase('idle'), 500);
    };

    const base = 'font-bold px-6 h-[30px] rounded-[3px] text-xs flex items-center justify-center shadow-sm gap-1.5 transition-all duration-150 select-none';

    if (phase === 'loading') return (
        <button disabled className={`${base} bg-orange-400 text-white scale-95 cursor-not-allowed ${className}`}>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
            </svg>
            조회 중...
        </button>
    );

    if (phase === 'done') return (
        <button disabled className={`${base} bg-green-500 text-white ${className}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            완료
        </button>
    );

    return (
        <button onClick={handleClick} className={`${base} bg-letusOrange text-white hover:bg-orange-600 active:scale-95 ${className}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {label}
        </button>
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
// --- 날짜 입력 공통 컴포넌트 (커스텀 달력) ---
const DateInput = ({ value, onChange, variant = 'outlined', className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
    const containerRef = useRef(null);
    const pad = n => String(n).padStart(2, '0');
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

    const [viewYear, setViewYear] = useState(() => value ? parseInt(value.slice(0,4)) : today.getFullYear());
    const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.slice(5,7))-1 : today.getMonth());

    const handleOpen = () => {
        if (value) { setViewYear(parseInt(value.slice(0,4))); setViewMonth(parseInt(value.slice(5,7))-1); }
        if (!isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const popupW = 224;
            const left = rect.left + rect.width / 2 - popupW / 2;
            setPopupPos({
                top: rect.bottom + 4,
                left: Math.max(4, Math.min(left, window.innerWidth - popupW - 4)),
            });
        }
        setIsOpen(o => !o);
    };

    useEffect(() => {
        if (!isOpen) return;
        const onDown = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [isOpen]);

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
    const years = Array.from({ length: 10 }, (_, i) => today.getFullYear() - 3 + i);

    const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); } else setViewMonth(m => m-1); };
    const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); } else setViewMonth(m => m+1); };

    const inputBase = variant === 'ghost'
        ? `bg-transparent text-xs text-gray-700 font-bold focus:outline-none cursor-pointer px-1 w-[110px]`
        : `border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] w-[110px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700`;

    return (
        <div ref={containerRef} className="inline-block">
            <input
                type="text"
                readOnly
                value={value || ''}
                placeholder="날짜 선택"
                onClick={handleOpen}
                className={`${inputBase} ${className}`}
            />
            {isOpen && createPortal(
                <div style={{ position: 'fixed', top: popupPos.top, left: popupPos.left }} className="z-[9999] bg-white border border-gray-200 rounded-xl shadow-2xl w-[224px] select-none overflow-hidden">
                    {/* 헤더 */}
                    <div className="bg-letusOrange px-3 py-2 flex items-center justify-between">
                        <button onClick={prevMonth} className="text-white text-lg font-bold w-6 text-center hover:opacity-70 leading-none">‹</button>
                        <div className="flex items-center gap-1">
                            <select value={viewYear} onChange={e => setViewYear(Number(e.target.value))}
                                className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer">
                                {years.map(y => <option key={y} value={y} className="text-gray-800 bg-white">{y}년</option>)}
                            </select>
                            <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))}
                                className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer">
                                {Array.from({ length: 12 }, (_, i) => i).map(m => <option key={m} value={m} className="text-gray-800 bg-white">{m+1}월</option>)}
                            </select>
                        </div>
                        <button onClick={nextMonth} className="text-white text-lg font-bold w-6 text-center hover:opacity-70 leading-none">›</button>
                    </div>
                    {/* 요일 헤더 */}
                    <div className="grid grid-cols-7 px-2 pt-2">
                        {DAY_NAMES.map((d, i) => (
                            <div key={d} className={`text-center text-[10px] font-bold pb-1 ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{d}</div>
                        ))}
                    </div>
                    {/* 날짜 셀 */}
                    <div className="grid grid-cols-7 px-2 pb-2 gap-y-0.5">
                        {cells.map((day, idx) => {
                            if (!day) return <div key={`e${idx}`} className="h-7" />;
                            const dateStr = `${viewYear}-${pad(viewMonth+1)}-${pad(day)}`;
                            const isSelected = dateStr === value;
                            const isToday = dateStr === todayStr;
                            const dow = (firstDay + day - 1) % 7;
                            return (
                                <button key={day}
                                    onClick={() => { onChange(dateStr); setIsOpen(false); }}
                                    className={`h-7 w-full flex items-center justify-center text-[11px] font-semibold rounded-full transition-colors
                                        ${isSelected ? 'bg-letusOrange text-white' :
                                          isToday    ? 'border border-letusOrange text-letusOrange' :
                                          dow === 0  ? 'text-red-400 hover:bg-orange-50' :
                                          dow === 6  ? 'text-blue-400 hover:bg-orange-50' :
                                                       'text-gray-700 hover:bg-orange-50'}`}>
                                    {day}
                                </button>
                            );
                        })}
                    </div>
                    {/* 푸터 */}
                    <div className="border-t border-gray-100 flex justify-between px-3 py-1.5">
                        <button onClick={() => { onChange(''); setIsOpen(false); }} className="text-[11px] text-gray-400 hover:text-gray-600 font-bold">지우기</button>
                        <button onClick={() => { onChange(todayStr); setIsOpen(false); }} className="text-[11px] text-letusOrange hover:opacity-70 font-bold">오늘</button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

const DateRangeInput = ({ startDate, endDate, onChange, variant = 'outlined', className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selecting, setSelecting] = useState('start');
    const [hoverDate, setHoverDate] = useState(null);
    const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
    const containerRef = useRef(null);

    const pad = n => String(n).padStart(2, '0');
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

    const [viewYear, setViewYear] = useState(() =>
        startDate ? parseInt(startDate.slice(0,4)) : today.getFullYear()
    );
    const [viewMonth, setViewMonth] = useState(() =>
        startDate ? parseInt(startDate.slice(5,7))-1 : today.getMonth()
    );

    const handleOpen = () => {
        if (!isOpen) {
            if (startDate) { setViewYear(parseInt(startDate.slice(0,4))); setViewMonth(parseInt(startDate.slice(5,7))-1); }
            setSelecting('start');
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const popupW = 256;
                const left = rect.left;
                setPopupPos({
                    top: rect.bottom + 4,
                    left: Math.max(4, Math.min(left, window.innerWidth - popupW - 4)),
                });
            }
        }
        setIsOpen(o => !o);
    };

    useEffect(() => {
        if (!isOpen) return;
        const onDown = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
                setHoverDate(null);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [isOpen]);

    const handleDayClick = (dateStr) => {
        if (selecting === 'start') {
            onChange(dateStr, dateStr);
            setSelecting('end');
        } else {
            if (dateStr < startDate) {
                onChange(dateStr, startDate);
            } else {
                onChange(startDate, dateStr);
            }
            setIsOpen(false);
            setHoverDate(null);
            setSelecting('start');
        }
    };

    const handlePreset = (type) => {
        const end = new Date();
        const start = new Date();
        if (type === '1w') start.setDate(start.getDate() - 6);
        else if (type === '1m') start.setMonth(start.getMonth() - 1);
        else if (type === '6m') start.setMonth(start.getMonth() - 6);
        const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        onChange(fmt(start), fmt(end));
        setIsOpen(false);
        setHoverDate(null);
        setSelecting('start');
    };

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
    const years = Array.from({ length: 10 }, (_, i) => today.getFullYear() - 3 + i);

    const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); } else setViewMonth(m => m-1); };
    const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); } else setViewMonth(m => m+1); };

    // 호버 미리보기 포함한 실효 범위 계산
    let effStart = startDate;
    let effEnd = endDate;
    if (selecting === 'end' && hoverDate) {
        if (hoverDate < startDate) { effStart = hoverDate; effEnd = startDate; }
        else { effStart = startDate; effEnd = hoverDate; }
    }

    const displayValue = startDate && endDate
        ? `${startDate}  ~  ${endDate}`
        : startDate || '';

    return (
        <div ref={containerRef} className={`inline-block ${className}`}>
            {variant === 'ghost' ? (
                <span
                    onClick={handleOpen}
                    className={`bg-transparent text-xs text-gray-700 font-bold cursor-pointer px-1 whitespace-nowrap ${className}`}
                >
                    {displayValue || '날짜 범위 선택'}
                </span>
            ) : (
                <div
                    onClick={handleOpen}
                    className={`border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] flex items-center gap-1.5 cursor-pointer text-gray-700 bg-white hover:border-gray-300 min-w-[210px] ${className}`}
                >
                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className={displayValue ? 'text-gray-700' : 'text-gray-400'}>
                        {displayValue || '날짜 범위 선택'}
                    </span>
                </div>
            )}

            {isOpen && createPortal(
                <div style={{ position: 'fixed', top: popupPos.top, left: popupPos.left }} className="z-[9999] bg-white border border-gray-200 rounded-xl shadow-2xl w-[256px] select-none overflow-hidden">
                    {/* 헤더 */}
                    <div className="bg-letusOrange px-3 py-2 flex items-center justify-between">
                        <button onClick={prevMonth} className="text-white text-lg font-bold w-6 text-center hover:opacity-70 leading-none">‹</button>
                        <div className="flex items-center gap-1">
                            <select value={viewYear} onChange={e => setViewYear(Number(e.target.value))}
                                className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer">
                                {years.map(y => <option key={y} value={y} className="text-gray-800 bg-white">{y}년</option>)}
                            </select>
                            <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))}
                                className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer">
                                {Array.from({length:12},(_,i)=>i).map(m => <option key={m} value={m} className="text-gray-800 bg-white">{m+1}월</option>)}
                            </select>
                        </div>
                        <button onClick={nextMonth} className="text-white text-lg font-bold w-6 text-center hover:opacity-70 leading-none">›</button>
                    </div>

                    {/* 선택 안내 */}
                    <div className="text-center text-[10px] py-1.5 border-b border-gray-100 font-bold text-gray-400">
                        {selecting === 'start' ? '시작일을 선택하세요' : '종료일을 선택하세요'}
                    </div>

                    {/* 요일 헤더 */}
                    <div className="grid grid-cols-7 px-2 pt-2">
                        {DAY_NAMES.map((d, i) => (
                            <div key={d} className={`text-center text-[10px] font-bold pb-1 ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{d}</div>
                        ))}
                    </div>

                    {/* 날짜 셀 */}
                    <div className="grid grid-cols-7 pb-2">
                        {cells.map((day, idx) => {
                            if (!day) return <div key={`e${idx}`} className="h-7" />;
                            const dateStr = `${viewYear}-${pad(viewMonth+1)}-${pad(day)}`;
                            const isToday = dateStr === todayStr;
                            const dow = (firstDay + day - 1) % 7;
                            const isStart = dateStr === effStart;
                            const isEnd = dateStr === effEnd;
                            const isSelected = isStart || isEnd;
                            const isSingleDay = effStart === effEnd;
                            const inRange = !isSingleDay && effStart && effEnd && dateStr > effStart && dateStr < effEnd;
                            const isRangeStart = isStart && !isSingleDay;
                            const isRangeEnd = isEnd && !isSingleDay;

                            return (
                                <div key={day} className="relative h-7 flex items-center justify-center">
                                    {/* 범위 바 배경 */}
                                    {(inRange || isRangeStart || isRangeEnd) && (
                                        <div className={`absolute inset-y-1 bg-orange-100
                                            ${inRange ? 'inset-x-0' : ''}
                                            ${isRangeStart ? 'left-1/2 right-0' : ''}
                                            ${isRangeEnd ? 'right-1/2 left-0' : ''}
                                        `} />
                                    )}
                                    <button
                                        onClick={() => handleDayClick(dateStr)}
                                        onMouseEnter={() => selecting === 'end' && setHoverDate(dateStr)}
                                        onMouseLeave={() => selecting === 'end' && setHoverDate(null)}
                                        className={`relative z-10 h-7 w-7 flex items-center justify-center text-[11px] font-semibold rounded-full transition-colors
                                            ${isSelected ? 'bg-letusOrange text-white' :
                                              isToday    ? 'border border-letusOrange text-letusOrange' :
                                              dow === 0  ? 'text-red-400 hover:bg-orange-50' :
                                              dow === 6  ? 'text-blue-400 hover:bg-orange-50' :
                                                           'text-gray-700 hover:bg-orange-50'}`}
                                    >
                                        {day}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* 푸터 */}
                    <div className="border-t border-gray-100 flex items-center justify-between px-3 py-1.5">
                        <button onClick={() => { onChange('', ''); setIsOpen(false); setHoverDate(null); setSelecting('start'); }}
                            className="text-[11px] text-gray-400 hover:text-gray-600 font-bold">지우기</button>
                        <div className="flex gap-1">
                            {[{label:'1주일',type:'1w'},{label:'1개월',type:'1m'},{label:'6개월',type:'6m'}].map(({label,type}) => (
                                <button key={type} onClick={() => handlePreset(type)}
                                    className="text-[11px] px-2 py-0.5 rounded border border-gray-200 text-gray-600 hover:bg-orange-50 hover:border-letusOrange hover:text-letusOrange font-bold transition-colors">
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => { onChange(todayStr, todayStr); setIsOpen(false); setHoverDate(null); setSelecting('start'); }}
                            className="text-[11px] text-letusOrange hover:opacity-70 font-bold">오늘</button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export { SearchButton };
export { DateInput };
export { DateRangeInput };