import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, adminSupabase } from './supabaseClient.js';



// ✖️ 닫기 아이콘
const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

// 🗄️ 기훈님을 위한 데이터 사전 (여기에 내용을 계속 추가해 나가면 됩니다)
const DB_DICTIONARY = {
    calendar_events: {
        name: '팀 일정 관리 (calendar_events)',
        description: '물류 비즈니스 팀 및 타 부서와의 협업 일정을 저장하는 테이블',
        columns: [
            { name: 'title', type: 'text', desc: '일정 제목' },
            { name: 'start_date', type: 'date', desc: '시작 일자' },
            { name: 'end_date', type: 'date', desc: '종료 일자' },
            { name: 'start_time', type: 'time', desc: '시작 시간' },
            { name: 'end_time', type: 'time', desc: '종료 시간' },
            { name: 'is_important', type: 'boolean', desc: '중요 일정 여부 (별표)' },
            { name: 'description', type: 'text', desc: '상세 내용' },
            { name: 'collab_teams', type: 'text', desc: '협업 대상 팀 (예: SCM팀, 배송팀)' },
            { name: 'creator_name', type: 'text', desc: '일정 등록자' },
            { name: 'collaborators', type: 'text', desc: '참여자 명단' }
        ],
        usages: [
            { menu: '📅 팀 캘린더', file: 'CalendarView.jsx', action: 'SELECT / INSERT', desc: '월간/주간 달력에 일정을 렌더링하고 새 일정을 추가함.' },
            { menu: '🏠 대시보드 홈', file: 'MainDashboard.jsx', action: 'SELECT', desc: '오늘의 주요 일정(is_important=true)을 요약해서 보여줌.' }
        ]
    },
    worker_attendance: {
        name: '근로자 일일 근태 (worker_attendance)',
        description: '협력사 및 외주 도급사의 매일 출퇴근 및 작업 시간 가공 데이터',
        columns: [
            { name: 'work_date', type: 'date', desc: '근무 일자' },
            { name: 'worker_name', type: 'text', desc: '근로자명' },
            { name: 'vendor_name', type: 'text', desc: '원 소속 업체' },
            { name: 'worked_vendor', type: 'text', desc: '실투입 업체 (지원/파견 반영)' },
            { name: 'normal_hours', type: 'number', desc: '정상 근무 시간' },
            { name: 'weighted_hours', type: 'number', desc: '가중치 적용 시간 (정산용)' }
        ],
        usages: [
            { menu: '👥 근무자 근태 관리', file: 'AttendanceManagement.jsx', action: 'SELECT / UPDATE', desc: '기간별/브랜드별 집계 현황 및 리스트 렌더링, 지원 수기 변경.' },
            { menu: '💰 도급비 정산 내역', file: 'BillingReport.jsx', action: 'SELECT', desc: '월말 정산 시 가중치 시간(weighted_hours)을 불러와 단가와 곱함.' }
        ]
    }
};

const DatabaseDictionary = () => {
    const [selectedTable, setSelectedTable] = useState('calendar_events');
    const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);

    const currentData = DB_DICTIONARY[selectedTable];

    return (
        <div className="p-6 bg-slate-50 min-h-[calc(100vh-64px)] slide-up max-w-[1400px] mx-auto flex gap-6">

            {/* 좌측: 테이블 목차 */}
            <div className="w-72 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden shrink-0 h-fit">
                <div className="p-4 bg-slate-800 text-white font-black text-sm tracking-wide">
                    🗄️ 시스템 DB 테이블
                </div>
                <div className="flex flex-col p-2 gap-1">
                    {Object.keys(DB_DICTIONARY).map((tableName) => (
                        <button
                            key={tableName}
                            onClick={() => setSelectedTable(tableName)}
                            className={`text-left px-4 py-3 rounded-lg text-sm font-bold transition-all ${selectedTable === tableName ? 'bg-blue-50 text-letusBlue border border-blue-100' : 'text-gray-600 hover:bg-gray-100 border border-transparent'}`}
                        >
                            {tableName}
                        </button>
                    ))}
                </div>
            </div>

            {/* 우측: 상세 명세서 */}
            <div className="flex-1 flex flex-col gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-2xl font-black text-gray-800">{currentData.name}</h2>
                            <p className="text-sm text-gray-500 font-medium mt-2">{currentData.description}</p>
                        </div>
                        {/* 🚩 기훈님이 원하시던 '어디서 쓰이는지 보기' 모달 띄우기 버튼 */}
                        <button
                            onClick={() => setIsUsageModalOpen(true)}
                            className="bg-letusBlue hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            화면 연결 맵 보기
                        </button>
                    </div>

                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-600">
                                <tr>
                                    <th className="p-3 border-r border-slate-200">컬럼명 (Column)</th>
                                    <th className="p-3 border-r border-slate-200 w-32 text-center">데이터 타입</th>
                                    <th className="p-3">설명 (Description)</th>
                                </tr>
                            </thead>
                            <tbody className="text-[13px] text-gray-700 divide-y divide-slate-100">
                                {currentData.columns.map((col, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3 border-r border-slate-200 font-mono font-bold text-letusBlue">{col.name}</td>
                                        <td className="p-3 border-r border-slate-200 text-center"><span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-bold text-gray-500 uppercase">{col.type}</span></td>
                                        <td className="p-3 font-medium text-gray-600">{col.desc}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* 🚩 메뉴 연결 맵 모달창 */}
            {isUsageModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setIsUsageModalOpen(false)}></div>
                    <div className="bg-white rounded-2xl shadow-2xl z-10 w-full max-w-2xl flex flex-col overflow-hidden slide-up">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-[15px] font-black text-gray-800 flex items-center gap-2">
                                🔗 <span className="text-letusBlue font-mono">{selectedTable}</span> 테이블 연결 맵
                            </h3>
                            <button onClick={() => setIsUsageModalOpen(false)} className="text-gray-400 hover:text-gray-600"><CloseIcon /></button>
                        </div>
                        <div className="p-6 flex flex-col gap-4 bg-slate-50/50 max-h-[70vh] overflow-y-auto">
                            {currentData.usages.map((use, idx) => (
                                <div key={idx} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-black text-gray-800">{use.menu}</span>
                                        <span className={`px-2 py-1 text-[10px] font-bold rounded ${use.action.includes('UPDATE') ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                                            {use.action}
                                        </span>
                                    </div>
                                    <div className="text-xs font-mono text-blue-500 font-bold flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        {use.file}
                                    </div>
                                    <p className="text-[13px] text-gray-600 mt-1">{use.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export { DatabaseDictionary };