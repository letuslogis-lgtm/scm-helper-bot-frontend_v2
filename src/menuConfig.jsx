// menuConfig.js
import React from 'react';

// 1. 시스템의 전체 메뉴 리스트 (화면에 보여질 이름과 ID 매핑)
export const ALL_MENUS = [
    {
        id: 'home_menu', label: '나의 워크스페이스',
        icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
        children: [
            { id: 'home', label: 'MY DASHBOARD' },
            { id: 'team_calendar', label: 'TEAM CALENDAR' }
        ]
    },
    {
        id: 'automation', label: '자동화 업무 관리',
        icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
        children: [
            { id: 'rpa_management', label: 'RPA 자동화 관리' }
        ]
    },
    {
        id: 'master', label: '마스터 정보 관리',
        icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
        children: [
            { id: 'user_management', label: '사용자 관리' },
            { id: 'worker_management', label: '근무자 관리' },
            { id: 'loading_map', label: '상차 맵 관리' },
            { id: 'db_map', label: '시스템 데이터 맵' },
            { id: 'product_manager', label: 'ITEM DB 수동 업데이트' },
            { id: 'erp_inbound_config', label: '시스템 데이터 관리' }
        ]
    },
    {
        id: 'closing_management', label: '물류 마감 관리',
        icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
        children: [
            { id: 'logistics_closing', label: '물류 마감 자동화' },
            { id: 'attendance', label: '근무자 근태 관리' },
            { id: 'wms_stock', label: '창고별 재고현황' },
        ]
    },
    {
        id: 'logistics', label: '입고 특이사항',
        icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>,
        children: [
            { id: 'dashboard', label: '대시보드' },
            { id: 'list', label: '특이사항 LIST' },
            { id: 'wms_shortage', label: 'D-2 결품 리스트' }
        ]
    },
    {
        id: 'loading_issues', label: '출고 특이사항',
        icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
        children: [
            { id: 'accident_dashboard', label: '사고분석 대시보드' },
            { id: 'accident_list', label: '사고분석 LIST' },
            { id: 'accident_report', label: '사고분석 레포트' },
            { id: 'returns_management', label: '회수품/선출고 관리' }
        ]
    },
    {
        id: 'support_menu', label: '고객 지원',
        icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
        children: [
            { id: 'notice', label: '공지사항' },
            { id: 'support', label: '지원센터' }
        ]
    },
    {
        id: 'ai_system', label: 'AI 인사이트 랩',
        icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
        children: [
            { id: 'ai_lab', label: 'AI 분석 검토소' }
        ]
    }
];

// 2. 신규 사용자 가입 시 기본으로 체크해 줄 메뉴들
export const DEFAULT_MENUS = [
    'home',
    'team_calendar',
    'support'
];