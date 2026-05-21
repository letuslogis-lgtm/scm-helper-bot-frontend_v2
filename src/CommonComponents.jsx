import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { ALL_MENUS } from './menuConfig.jsx';



// 🛠️ 공통 업체 검색/리스트 모달
const VendorSearchModal = ({ initialVendors, onApplyVendors, initialBrands, onApplyBrands, onClose }) => {
    const [query, setQuery] = React.useState('');
    const [vendorList, setVendorList] = React.useState([]);
    const [isLoading, setIsLoading] = React.useState(true);

    const [checkedVendors, setCheckedVendors] = React.useState(() => {
        if (!initialVendors) return [];
        return initialVendors.split(',').map(s => s.trim()).filter(Boolean);
    });

    const [checkedBrands, setCheckedBrands] = React.useState(() => {
        if (!initialBrands) return [];
        return initialBrands.split(',').map(s => s.trim()).filter(Boolean);
    });

    const brandList = ['퍼시스', '일룸', '시디즈', '슬로우베드', '알로소', '데스커', '바로스'];

    const lastVendorIdx = React.useRef(null);
    const lastBrandIdx = React.useRef(null);

    React.useEffect(() => {
        const fetchVendors = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('vendors')
                    .select('id, vendor_name')
                    .order('vendor_name', { ascending: true });
                if (error) throw error;
                setVendorList(data || []);
            } catch (err) {
                console.error('vendors fetch error:', err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchVendors();
    }, []);

    // 검색어 바뀌면 인덱스 초기화 (이전 리스트 기준 인덱스 오염 방지)
    React.useEffect(() => {
        lastVendorIdx.current = null;
        lastBrandIdx.current = null;
    }, [query]);

    const filteredVendors = vendorList.filter(v => v.vendor_name.includes(query));
    const filteredBrands = brandList.filter(b => b.includes(query));

    const toggleVendor = (name, idx, e) => {
        if (e.shiftKey && lastVendorIdx.current !== null) {
            e.preventDefault();
            const start = Math.min(lastVendorIdx.current, idx);
            const end = Math.max(lastVendorIdx.current, idx);
            const rangeNames = filteredVendors.slice(start, end + 1).map(v => v.vendor_name);
            const isChecking = !checkedVendors.includes(name);
            setCheckedVendors(prev =>
                isChecking
                    ? [...new Set([...prev, ...rangeNames])]
                    : prev.filter(n => !rangeNames.includes(n))
            );
        } else {
            setCheckedVendors(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
        }
        lastVendorIdx.current = idx;
    };

    const toggleBrand = (name, idx, e) => {
        if (e.shiftKey && lastBrandIdx.current !== null) {
            e.preventDefault();
            const start = Math.min(lastBrandIdx.current, idx);
            const end = Math.max(lastBrandIdx.current, idx);
            const rangeNames = filteredBrands.slice(start, end + 1);
            const isChecking = !checkedBrands.includes(name);
            setCheckedBrands(prev =>
                isChecking
                    ? [...new Set([...prev, ...rangeNames])]
                    : prev.filter(n => !rangeNames.includes(n))
            );
        } else {
            setCheckedBrands(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
        }
        lastBrandIdx.current = idx;
    };

    const handleApply = () => {
        onApplyVendors(checkedVendors.join(','));
        onApplyBrands(checkedBrands.join(','));
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col slide-up h-[600px]" style={{ maxHeight: '80vh' }}>
                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
                    <h4 className="text-sm font-bold text-gray-800 flex items-center">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full mr-2"></span>
                        담당 업체 및 브랜드 검색
                    </h4>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-4 py-3 border-b border-gray-100 bg-slate-50">
                    <div className="relative">
                        <svg className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="브랜드명 또는 업체명 검색..."
                            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-[4px] focus:outline-none focus:border-letusBlue bg-white"
                            autoFocus
                        />
                    </div>
                    {(checkedVendors.length > 0 || checkedBrands.length > 0) && (
                        <p className="text-[10px] text-letusBlue font-bold mt-2">
                            브랜드 {checkedBrands.length}개, 업체 {checkedVendors.length}개 선택됨
                        </p>
                    )}
                </div>

                <div className="overflow-y-auto flex-1">
                    {isLoading ? (
                        <div className="py-10 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
                            <svg className="animate-spin w-5 h-5 text-letusBlue" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                            목록 로딩 중...
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filteredBrands.length > 0 && (
                                <div className="bg-white">
                                    <div className="px-5 py-2 bg-slate-50 text-[10px] font-bold text-slate-400">관리 브랜드</div>
                                    {filteredBrands.map((b, idx) => (
                                        <div key={b} className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors select-none ${checkedBrands.includes(b) ? 'bg-orange-50' : 'hover:bg-gray-50'}`} onClick={e => toggleBrand(b, idx, e)}>
                                            <input type="checkbox" readOnly checked={checkedBrands.includes(b)} className="w-3.5 h-3.5 accent-letusOrange cursor-pointer" />
                                            <span className="text-xs font-bold text-gray-700">{b}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {filteredVendors.length > 0 && (
                                <div className="bg-white">
                                    <div className="px-5 py-2 bg-slate-50 text-[10px] font-bold text-slate-400">담당 업체 <span className="text-gray-400 font-normal">(Shift+클릭으로 범위 선택)</span></div>
                                    {filteredVendors.map((v, idx) => (
                                        <div key={v.id} className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors select-none ${checkedVendors.includes(v.vendor_name) ? 'bg-blue-50' : 'hover:bg-gray-50'}`} onClick={e => toggleVendor(v.vendor_name, idx, e)}>
                                            <input type="checkbox" readOnly checked={checkedVendors.includes(v.vendor_name)} className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                                            <span className="text-xs font-bold text-gray-700">{v.vendor_name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {filteredBrands.length === 0 && filteredVendors.length === 0 && (
                                <div className="py-10 text-center text-xs text-gray-400">검색 결과가 없습니다.</div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-4 py-3 border-t border-gray-100 bg-white flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-gray-500 text-[11px] font-bold rounded-[3px] hover:bg-gray-50">취소</button>
                    <button
                        onClick={handleApply}
                        className="px-5 py-2 bg-letusBlue text-white text-[11px] font-bold rounded-[3px] hover:bg-blue-600 transition-colors"
                    >
                        적용하기 {(checkedVendors.length > 0 || checkedBrands.length > 0) && `(${checkedVendors.length + checkedBrands.length})`}
                    </button>
                </div>
            </div>
        </div>
    );
};

const VendorListModal = ({ user, onClose }) => {
    const bRaw = user?.managed_brands || '';
    const vRaw = user?.managed_vendors || '';
    const brandList = typeof bRaw === 'string' ? bRaw.split(',').map(v => v.trim()).filter(Boolean) : [];
    const vendorList = typeof vRaw === 'string' ? vRaw.split(',').map(v => v.trim()).filter(Boolean) : [];

    const totalCount = brandList.length + vendorList.length;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden flex flex-col slide-up h-[500px]" style={{ maxHeight: '70vh' }}>
                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 shrink-0">
                    <h4 className="text-sm font-bold text-gray-800 flex items-center">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full mr-2"></span>
                        담당 브랜드 및 업체
                        <span className="ml-2 text-xs text-letusBlue font-bold bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">{totalCount}개</span>
                    </h4>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
                    {brandList.length > 0 && (
                        <div>
                            <div className="px-5 py-2 bg-orange-50/50 text-[10px] font-bold text-orange-400">관리 브랜드</div>
                            {brandList.map((b, i) => (
                                <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                                    <span className="w-4 h-4 rounded-full bg-orange-100 text-letusOrange text-[9px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                                    <span className="text-xs font-bold text-gray-700">{b}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {vendorList.length > 0 && (
                        <div>
                            <div className="px-5 py-2 bg-blue-50/50 text-[10px] font-bold text-letusBlue">담당 업체</div>
                            {vendorList.map((v, i) => (
                                <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                                    <span className="w-4 h-4 rounded-full bg-blue-100 text-letusBlue text-[9px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                                    <span className="text-xs font-bold text-gray-700">{v}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {totalCount === 0 && (
                        <div className="py-16 text-center text-xs text-gray-400 font-bold">등록된 정보가 없습니다.</div>
                    )}
                </div>

                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
                    <button onClick={onClose} className="px-5 py-2 bg-slate-700 text-white text-[11px] font-bold rounded-[3px] hover:bg-slate-800 transition-colors">닫기</button>
                </div>
            </div>
        </div>
    );
};

// 🔐 메뉴 권한 설정 모달 (UserManagement에서 이동 - 순환 참조 방지)
// 🔐 메뉴 권한 설정 모달 (하드코딩 제거 및 menuConfig.js 완벽 연동)
const MenuPermissionModal = ({ initialMenus, onApply, onClose }) => {
    const [selectedMenus, setSelectedMenus] = useState(initialMenus || []);

    // 🌟 하드코딩 제거: ALL_MENUS의 첫 번째 대메뉴 ID를 기본으로 열어둡니다.
    const [expandedMenus, setExpandedMenus] = useState(ALL_MENUS.length > 0 ? [ALL_MENUS[0].id] : []);

    // 🌟 노가다로 적혀있던 MENU_DATA 배열 전체 삭제! (상단에서 import한 ALL_MENUS를 사용합니다)

    const toggleExpand = (id) => {
        setExpandedMenus(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };

    const toggleMainMenu = (menu) => {
        if (!menu.children) return; // 방어 코드: 혹시 자식 메뉴가 없는 대메뉴일 경우 에러 방지
        const childIds = menu.children.map(c => c.id);
        const isAllSelected = childIds.every(id => selectedMenus.includes(id));
        if (isAllSelected) {
            setSelectedMenus(prev => prev.filter(id => !childIds.includes(id)));
        } else {
            setSelectedMenus(prev => [...new Set([...prev, ...childIds])]);
        }
    };

    const toggleSubMenu = (id) => {
        setSelectedMenus(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };

    const handleSave = () => {
        onApply(selectedMenus);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[400px] overflow-hidden flex flex-col slide-up">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50 shrink-0">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center">
                        <span className="w-1.5 h-3.5 bg-purple-500 rounded-full mr-2"></span>메뉴 접근 권한 설정
                    </h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-5 bg-white flex-1 overflow-y-auto max-h-[60vh] custom-scrollbar space-y-2">
                    <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-xs text-gray-600 mb-4 font-medium">
                        💡 대메뉴를 선택하면 하위 메뉴가 모두 선택됩니다.<br />
                        <span className="text-gray-400 mt-1 block">* 관리자 그룹은 이 설정과 무관하게 모든 메뉴에 접근 가능합니다.</span>
                    </div>

                    <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                        {/* 🌟 MENU_DATA.map 대신 ALL_MENUS.map 으로 교체! */}
                        {ALL_MENUS.map(menu => {
                            const childIds = menu.children ? menu.children.map(c => c.id) : [];
                            const isAllSelected = childIds.length > 0 && childIds.every(id => selectedMenus.includes(id));
                            const isPartiallySelected = !isAllSelected && childIds.some(id => selectedMenus.includes(id));
                            const isExpanded = expandedMenus.includes(menu.id);

                            return (
                                <div key={menu.id} className="bg-white">
                                    <div className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-2.5">
                                            <input
                                                type="checkbox"
                                                checked={isAllSelected}
                                                ref={input => { if (input) input.indeterminate = isPartiallySelected; }}
                                                onChange={() => toggleMainMenu(menu)}
                                                className="w-4 h-4 accent-purple-500 cursor-pointer"
                                            />
                                            <span className="text-sm font-bold text-gray-800 select-none cursor-pointer" onClick={() => toggleMainMenu(menu)}>{menu.label}</span>
                                        </div>
                                        <button onClick={() => toggleExpand(menu.id)} className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-200">
                                            <svg className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                    </div>

                                    {isExpanded && menu.children && (
                                        <div className="bg-slate-50 pl-10 pr-3 py-2 space-y-2 border-t border-gray-50">
                                            {menu.children.map(child => (
                                                <label key={child.id} className="flex items-center gap-2.5 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedMenus.includes(child.id)}
                                                        onChange={() => toggleSubMenu(child.id)}
                                                        className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                                                    />
                                                    <span className={`text-xs font-medium transition-colors select-none ${selectedMenus.includes(child.id) ? 'text-gray-800 font-bold' : 'text-gray-500 group-hover:text-gray-700'}`}>{child.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2 shrink-0">
                    <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 text-xs font-bold rounded hover:bg-gray-100 transition-colors bg-white">취소</button>
                    <button onClick={handleSave} className="px-5 py-2 bg-purple-600 text-white text-xs font-bold rounded hover:bg-purple-700 transition-colors flex items-center gap-1.5 shadow-sm">
                        권한 적용
                    </button>
                </div>
            </div>
        </div>
    );
};

// 🌟 전역 등록
export { VendorSearchModal };
export { VendorListModal };
export { MenuPermissionModal };