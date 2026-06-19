import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient.js';

const ROLES = ['최고관리자', '관리자', '사용자'];

const MENU_GROUPS = [
    {
        id: 'forklift_group',
        label: '지게차 관리',
        sections: [
            {
                menu_id: 'forklift',
                label: '관리대장',
                actions: [
                    { action: 'create',      label: '장비 등록' },
                    { action: 'bulk_create', label: '일괄 등록 (Excel)' },
                    { action: 'edit',        label: '수정' },
                    { action: 'bulk_edit',   label: '일괄 수정' },
                    { action: 'delete',      label: '삭제' },
                    { action: 'retire',      label: '반납·매각' },
                    { action: 'restore',     label: '원복' },
                    { action: 'export',      label: '엑셀 다운로드' },
                ],
            },
            {
                menu_id: 'forklift_check',
                label: '일일점검',
                actions: [
                    { action: 'approve', label: '승인' },
                ],
            },
            {
                menu_id: 'forklift_issue',
                label: '이슈',
                actions: [
                    { action: 'accept',   label: '이슈 접수' },
                    { action: 'complete', label: '수리완료 처리' },
                    { action: 'approve',  label: '이슈 최종승인' },
                ],
            },
        ],
    },
];

export const MenuPermissionConfig = ({ userProfile }) => {
    const [selectedGroup, setSelectedGroup] = useState(MENU_GROUPS[0].id);
    const [matrix, setMatrix]   = useState({});
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);
    const [saved,   setSaved]   = useState(false);

    const isSuperAdmin = userProfile?.role === '최고관리자';

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const { data } = await supabase.from('menu_permissions').select('menu_id, action, allowed_roles');
            const m = {};
            (data ?? []).forEach(row => {
                const key = `${row.menu_id}__${row.action}`;
                m[key] = row.allowed_roles ?? [];
            });
            setMatrix(m);
            setLoading(false);
        };
        load();
    }, []);

    const toggle = (menuId, action, role) => {
        if (!isSuperAdmin) return;
        const key = `${menuId}__${action}`;
        setMatrix(prev => {
            const cur = prev[key] ?? [];
            const next = cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role];
            return { ...prev, [key]: next };
        });
        setSaved(false);
    };

    const handleSave = async () => {
        if (!isSuperAdmin) return;
        setSaving(true);
        const rows = Object.entries(matrix).map(([key, roles]) => {
            const [menu_id, action] = key.split('__');
            return { menu_id, action, allowed_roles: roles };
        });
        const { error } = await supabase
            .from('menu_permissions')
            .upsert(rows, { onConflict: 'menu_id,action' });
        setSaving(false);
        if (!error) setSaved(true);
    };

    const group = MENU_GROUPS.find(g => g.id === selectedGroup);

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* 헤더 */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
                <div>
                    <span className="text-base font-black text-gray-800">메뉴별 권한 설정</span>
                    <span className="text-xs text-gray-400 ml-2">메뉴 기능별 허용 역할 관리</span>
                </div>
                {isSuperAdmin ? (
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-letusBlue hover:bg-blue-700 rounded-lg px-4 h-[32px] transition-colors disabled:opacity-50">
                        {saving ? '저장 중...' : saved ? '✓ 저장됨' : '변경사항 저장'}
                    </button>
                ) : (
                    <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">최고관리자만 수정 가능</span>
                )}
            </div>

            <div className="flex gap-4 flex-1 min-h-0">

                {/* 좌측: 메뉴 그룹 선택 */}
                <div className="w-44 bg-white rounded-lg shadow-sm border border-slate-200 p-3 flex flex-col gap-1 shrink-0">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider px-2 pt-1 pb-2">메뉴 그룹</p>
                    {MENU_GROUPS.map(g => (
                        <button
                            key={g.id}
                            onClick={() => setSelectedGroup(g.id)}
                            className={`w-full text-left text-xs font-bold px-3 py-2 rounded-lg transition-colors ${
                                selectedGroup === g.id
                                    ? 'bg-letusBlue text-white'
                                    : 'text-gray-600 hover:bg-gray-50'
                            }`}>
                            {g.label}
                        </button>
                    ))}
                </div>

                {/* 우측: 매트릭스 */}
                <div className="flex-1 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden min-h-0">
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">불러오는 중...</div>
                    ) : (
                        <div className="overflow-auto flex-1 custom-scrollbar">
                            <table className="w-full text-left whitespace-nowrap">
                                <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3 w-32">섹션</th>
                                        <th className="px-4 py-3">기능</th>
                                        {ROLES.map(role => (
                                            <th key={role} className="px-4 py-3 text-center w-28">{role}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {group?.sections.map(section =>
                                        section.actions.map((item, idx) => {
                                            const key = `${section.menu_id}__${item.action}`;
                                            const allowedRoles = matrix[key] ?? [];
                                            return (
                                                <tr key={key} className="hover:bg-blue-50/20 transition-colors">
                                                    <td className="px-6 py-3 text-[13px]">
                                                        {idx === 0 && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-500">
                                                                {section.label}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-[13px] text-gray-700 font-bold">{item.label}</td>
                                                    {ROLES.map(role => (
                                                        <td key={role} className="px-4 py-3 text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={allowedRoles.includes(role)}
                                                                onChange={() => toggle(section.menu_id, item.action, role)}
                                                                disabled={!isSuperAdmin}
                                                                className="w-4 h-4 accent-letusBlue cursor-pointer disabled:cursor-default"
                                                            />
                                                        </td>
                                                    ))}
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
