import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { AttendanceManagement } from './AttendanceManagement.jsx';
;




// ✖️ 닫기 아이콘
const CloseIcon = () => (
 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
);

// 🗄️ 기훈님을 위한 데이터 사전 (여기에 내용을 계속 추가해 나가면 됩니다)
const DB_DICTIONARY = {
 profiles: {
 name: '사용자 계정/권한 프로필 (profiles)',
 description: '앱에 접속하는 모든 사용자의 계정 정보 및 메뉴 접근 권한 관리',
 columns: [
 { name: 'id', type: 'uuid', desc: '고유 식별자' },
 { name: 'login_id', type: 'text', desc: '로그인 아이디' },
 { name: 'name', type: 'text', desc: '사용자 이름' },
 { name: 'role', type: 'text', desc: '권한 등급 (관리자/일반/읽기전용 등)' },
 { name: 'team', type: 'text', desc: '소속 팀' },
 { name: 'brands', type: 'text', desc: '담당 브랜드' },
 { name: 'accessible_menus', type: 'text', desc: '접근 가능한 메뉴 목록' }
 ],
 usages: [
 { menu: '👥 사용자 관리', file: 'UserManagement.jsx', action: 'SELECT / UPDATE', desc: '사용자 목록 조회 및 권한/부서 일괄 변경' },
 { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx', action: 'SELECT', desc: '로그인 사용자의 기본 정보 표출' },
 { menu: '전역 설정', file: 'SharedUI.jsx', action: 'UPDATE', desc: '비밀번호 및 내 정보 변경' }
 ]
 },
 workers: {
 name: '물류 근무자 마스터 (workers)',
 description: '물류센터에 투입되는 모든 정규직 및 외주 협력사 근무자들의 마스터 DB',
 columns: [
 { name: 'name', type: 'text', desc: '근무자 이름' },
 { name: 'employment_type', type: 'text', desc: '고용 형태 (지입/소속/도급 등)' },
 { name: 'work_location', type: 'text', desc: '근무 센터 위치' },
 { name: 'managed_brand', type: 'text', desc: '투입 브랜드' },
 { name: 'support_status', type: 'text', desc: '타 현장 지원 상태' }
 ],
 usages: [
 { menu: '👷 근무자 관리', file: 'WorkerManagement.jsx', action: 'SELECT / INSERT / UPDATE', desc: '전체 근무자 명단 조회 및 부서/상태 일괄 일괄 등록/수정' },
 { menu: '🏭 근무자 근태 관리', file: 'AttendanceManagement.jsx', action: 'SELECT', desc: '근태 입력을 위한 기준 인원 목록으로 활용' }
 ]
 },
 logistics_issues: {
 name: '입고 특이사항 (logistics_issues)',
 description: '입고 시 발생하는 수량부족/오포장/파손 등의 이슈를 추적 및 관리',
 columns: [
 { name: 'reception_no', type: 'text', desc: '접수 번호' },
 { name: 'brand', type: 'text', desc: '브랜드 명' },
 { name: 'vendor', type: 'text', desc: '협력사/벤더' },
 { name: 'product_code', type: 'text', desc: '제품 코드' },
 { name: 'issue_type', type: 'text', desc: '이슈 분류 (파손, 수량부족 등)' },
 { name: 'status', type: 'text', desc: '현재 처리 상태' },
 { name: 'final_handler', type: 'text', desc: '최종 처리 담당자' }
 ],
 usages: [
 { menu: '📊 특이사항 대시보드', file: 'LogisticsDashboard.jsx', action: 'SELECT', desc: '브랜드별, 업체별 이슈 발생 통계 차트 렌더링' },
 { menu: '📝 특이사항 LIST', file: 'IssueList.jsx', action: 'SELECT / UPDATE / INSERT', desc: '이슈 상세 내역 조회 및 상태 변경, 신규 이슈 등록' },
 { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx', action: 'SELECT', desc: '내 담당 입고 이슈 미처리 건수 통계 표시' }
 ]
 },
 logistics_accidents: {
 name: '상차/사고 특이사항 (logistics_accidents)',
 description: '상하차 작업 및 운송 중 발생하는 파손 및 물품 분실 사고 관리',
 columns: [
 { name: 'brand', type: 'text', desc: '관련 브랜드' },
 { name: 'status', type: 'text', desc: '사고 처리 상태' },
 { name: 'handler_name', type: 'text', desc: '담당자명' },
 { name: 'reason', type: 'text', desc: '사고 원인' },
 { name: 'updated_at', type: 'timestamp', desc: '최근 업데이트 일시' }
 ],
 usages: [
 { menu: '📈 사고분석 대시보드', file: 'AccidentAnalyticsReport.jsx', action: 'SELECT', desc: '현장 사고 발생 트렌드 및 요인별 통계 차트' },
 { menu: '📋 사고분석 LIST', file: 'AccidentManagement.jsx', action: 'SELECT / UPDATE / INSERT', desc: '사고 리스트 조회, 해결 프로세스 상태 업데이트' },
 { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx', action: 'SELECT', desc: '내 담당 사고 미처리 건수 통계 표시' }
 ]
 },
 products: {
 name: 'ITEM DB 마스터 (products)',
 description: '취급하는 모든 제품의 코드, 스펙, 바코드 등의 마스터 데이터',
 columns: [
 { name: 'code', type: 'text', desc: '제품 대표 코드' },
 { name: 'part_no', type: 'text', desc: '부품 단위 파트 넘버' },
 { name: 'spec', type: 'text', desc: '제원 및 규격' },
 { name: 'color', type: 'text', desc: '컬러' },
 { name: 'barcode', type: 'text', desc: '바코드 값' }
 ],
 usages: [
 { menu: '📦 ITEM DB 수동업데이트', file: 'ProductManager.jsx', action: 'SELECT / UPSERT', desc: '신규 아이템 DB 파일 업로드 시 갱신 처리' }
 ]
 },
 suggestions: {
 name: '고객 제안 및 지원 (suggestions)',
 description: '시스템 사용자들의 지원 요청 및 기능 개선 건의 목록',
 columns: [
 { name: 'user_name', type: 'text', desc: '작성자 이름' },
 { name: 'content', type: 'text', desc: '문의 내용' },
 { name: 'answer', type: 'text', desc: '운영자 답변' },
 { name: 'status', type: 'text', desc: '처리 상태 (대기/완료)' },
 { name: 'created_at', type: 'timestamp', desc: '작성 일시' }
 ],
 usages: [
 { menu: '🎧 지원센터', file: 'SupportCenter.jsx', action: 'SELECT / INSERT / UPDATE', desc: '건의사항 리스트 표출 및 새로운 질문 등록, 답변 달기' }
 ]
 },
 faqs: {
 name: '자주 묻는 질문 (faqs)',
 description: '시스템 사용법 등의 FAQ 데이터베이스',
 columns: [
 { name: 'category', type: 'text', desc: '분류 카테고리' },
 { name: 'question', type: 'text', desc: '질문 형태' },
 { name: 'answer', type: 'text', desc: '가이드/답변 내용' }
 ],
 usages: [
 { menu: '🎧 지원센터', file: 'SupportCenter.jsx', action: 'SELECT', desc: '분류별 도움말 항목 렌더링' }
 ]
 },
 todos: {
 name: '개인 할 일 (todos)',
 description: '워크스페이스에 기록되는 개인별 매일 할 일 목록',
 columns: [
 { name: 'title', type: 'text', desc: '할 일 명칭' },
 { name: 'memo', type: 'text', desc: '상세 기록장' },
 { name: 'is_important', type: 'boolean', desc: '중요 표시 여부' }
 ],
 usages: [
 { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx', action: 'SELECT / INSERT / UPDATE / DELETE', desc: '체크리스트 표출 및 CRUD 처리' }
 ]
 },
 todo_logs: {
 name: '개인 할 일 완료 기록 (todo_logs)',
 description: '매일 할 일이 언제 완료되었는지를 남키는 히스토리 테이블',
 columns: [
 { name: 'todo_id', type: 'text', desc: '연결된 할 일 ID' },
 { name: 'completed_date', type: 'date', desc: '체크(완료)된 날짜' },
 { name: 'user_id', type: 'uuid', desc: '사용자 ID' }
 ],
 usages: [
 { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx', action: 'SELECT / INSERT / DELETE', desc: '오늘 완료한 항목 체크 및 해제 상태 동기화' }
 ]
 },
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
 { menu: '🏠 나의 워크스페이스', file: 'MyHome.jsx', action: 'SELECT / INSERT', desc: '월간/주간 달력에 일정을 렌더링하고 새 일정을 추가함.' }
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
 { menu: '👥 근무자 근태 관리', file: 'AttendanceManagement.jsx', action: 'SELECT / UPDATE', desc: '기간별/브랜드별 집계 현황 및 리스트 렌더링, 지원 수기 변경.' }
 ]
 },
 company_holidays: {
 name: '회사 휴무일 (company_holidays)',
 description: '공휴일 및 자체 휴가 등의 정보를 담아 근태 요율 계산에 사용',
 columns: [
 { name: 'holiday_date', type: 'date', desc: '휴일 지정 날짜' },
 { name: 'name', type: 'text', desc: '명절, 법정동휴일 등 명칭' }
 ],
 usages: [
 { menu: '👥 근무자 근태 관리', file: 'AttendanceManagement.jsx', action: 'SELECT', desc: '평일과 휴일을 구분해 특근 가중치 자동 계산' }
 ]
 }
};

const DatabaseDictionary = () => {
 const [selectedTable, setSelectedTable] = useState('calendar_events');
 const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);

 const currentData = DB_DICTIONARY[selectedTable];

 return (
 <div className="p-6 bg-slate-50 min-h-[calc(100vh-64px)] slide-up w-full flex gap-6">

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