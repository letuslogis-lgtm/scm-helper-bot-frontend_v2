// ===========================================================================
// 👥 근무자 근태 관리 (메인 컨테이너)
//   C1: KPI 카드 ▲▼% 전기 대비 증감
//   B2: 지원/파견만 필터 토글
//   B3: 엑셀 내보내기
// ===========================================================================
import React, { useState, useEffect, useMemo } from 'react';
import { SearchButton, DateRangeInput } from '../SharedUI.jsx';
import { isPartnerVendor } from './constants.js';
import { getFilterDates, isDateInRange, monthStart, monthEnd } from './dateUtils.js';
import { useAttendance } from './useAttendance.js';
import { useDetailTable } from './useDetailTable.jsx';
import { AttendanceSummaryTab } from './AttendanceSummaryTab.jsx';
import { AttendanceDetailTab } from './AttendanceDetailTab.jsx';
import { AttendanceUploadModal } from './AttendanceUploadModal.jsx';
import { AttendanceBulkEditModal } from './AttendanceBulkEditModal.jsx';

const PERIOD_BUTTONS = [{ id: 'D', name: '당일' }, { id: 'W', name: '주간' }, { id: 'M', name: '월간' }, { id: 'CUSTOM', name: '직접지정' }];

// C1: ▲▼% 증감 배지
const DeltaBadge = ({ curr, prior }) => {
  if (prior === 0 || curr === prior) return null;
  const d = ((curr - prior) / prior * 100).toFixed(1);
  const up = curr > prior;
  return (
    <span className={`text-[10px] font-bold ml-1 ${up ? 'text-green-500' : 'text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(d)}%
    </span>
  );
};

const AttendanceManagement = () => {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');

  const [selectedIds, setSelectedIds] = useState([]);
  const [lastSelectedId, setLastSelectedId] = useState(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);

  // 날짜 상태 (상세 탭)
  const [tempStartDate, setTempStartDate] = useState(monthStart());
  const [tempEndDate, setTempEndDate] = useState(monthEnd());
  const [startDate, setStartDate] = useState(tempStartDate);
  const [endDate, setEndDate] = useState(tempEndDate);
  const [filterType, setFilterType] = useState('D');

  // 날짜 상태 (집계 차트 탭)
  const [tempChartStartDate, setTempChartStartDate] = useState(monthStart());
  const [tempChartEndDate, setTempChartEndDate] = useState(monthEnd());
  const [chartStartDate, setChartStartDate] = useState(tempChartStartDate);
  const [chartEndDate, setChartEndDate] = useState(tempChartEndDate);
  const [chartFilterType, setChartFilterType] = useState('M');

  // 필터 상태
  const [inputValue, setInputValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [workerTypeFilter, setWorkerTypeFilter] = useState('전체');
  const [locationFilter, setLocationFilter] = useState('전체');
  const [selectedVendor, setSelectedVendor] = useState('전체');
  const [summaryViewMode, setSummaryViewMode] = useState('vendor');
  const [dispatchOnly, setDispatchOnly] = useState(false); // B2

  // C1: 전기 대비 기간 계산
  const currentStart = activeTab === 'summary' ? chartStartDate : startDate;
  const currentEnd   = activeTab === 'summary' ? chartEndDate   : endDate;
  const periodMs = new Date(currentEnd) - new Date(currentStart);
  const _pe = new Date(currentStart);
  _pe.setDate(_pe.getDate() - 1);
  const _ps = new Date(_pe.getTime() - periodMs);
  const priorStart = _ps.toISOString().split('T')[0];
  const priorEnd   = _pe.toISOString().split('T')[0];

  // DB 조회 범위 = 상세·차트·전기 세 기간의 합집합
  const fetchStart = [startDate, chartStartDate, priorStart].reduce((a, b) => a < b ? a : b);
  const fetchEnd   = endDate > chartEndDate ? endDate : chartEndDate;
  const { attendanceData, workerMasterMap, isLoading, reload } = useAttendance(fetchStart, fetchEnd);

  const table = useDetailTable();

  // 검색어 디바운스
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // 빠른 기간 선택 → 상세 날짜 동기화
  useEffect(() => {
    if (filterType !== 'CUSTOM') {
      const { start, end } = getFilterDates(filterType);
      setStartDate(start); setEndDate(end); setTempStartDate(start); setTempEndDate(end);
    } else { setStartDate(tempStartDate); setEndDate(tempEndDate); }
  }, [filterType]);

  // 빠른 기간 선택 → 차트 날짜 동기화
  useEffect(() => {
    if (chartFilterType !== 'CUSTOM') {
      const { start, end } = getFilterDates(chartFilterType);
      setChartStartDate(start); setChartEndDate(end); setTempChartStartDate(start); setTempChartEndDate(end);
    } else { setChartStartDate(tempChartStartDate); setChartEndDate(tempChartEndDate); }
  }, [chartFilterType]);

  // 날짜를 제외한 공통 필터
  const baseFilterLogic = (row) => {
    if (selectedVendor !== '전체' && row.company_type !== selectedVendor) return false;
    if (searchTerm) {
      const matchName = row.worker_name?.includes(searchTerm);
      const matchVendor = row.vendor_name?.includes(searchTerm) || row.worked_vendor?.includes(searchTerm);
      if (!matchName && !matchVendor) return false;
    }
    const cleanName = row.worker_name?.replace(/\s/g, '') || '';
    const masterInfo = workerMasterMap[cleanName] || {};
    const rawType = masterInfo.type ? masterInfo.type.replace(/\s/g, '') : '';
    const wType = rawType === '사무직' ? '사무직' : '현장직';
    if (workerTypeFilter === '현장직' && wType === '사무직') return false;
    if (workerTypeFilter === '사무직' && wType !== '사무직') return false;
    const loc = masterInfo.location || '';
    const isRegional = (loc === '동부센터' || loc === '서부센터');
    if (locationFilter === '메인센터' && isRegional) return false;
    if (locationFilter === '지방센터' && !isRegional) return false;
    return true;
  };

  const filteredDetailData = useMemo(() => {
    return attendanceData.filter(row => {
      if (!isDateInRange(row.work_date, startDate, endDate)) return false;
      if (dispatchOnly && row.vendor_name === row.worked_vendor) return false; // B2
      return baseFilterLogic(row);
    });
  }, [attendanceData, startDate, endDate, selectedVendor, searchTerm, workerTypeFilter, locationFilter, workerMasterMap, dispatchOnly]);

  const filteredChartData = useMemo(() => {
    return attendanceData.filter(row => {
      if (!isDateInRange(row.work_date, chartStartDate, chartEndDate)) return false;
      return baseFilterLogic(row);
    });
  }, [attendanceData, chartStartDate, chartEndDate, selectedVendor, searchTerm, workerTypeFilter, locationFilter, workerMasterMap]);

  const sortedDetailData = useMemo(() => {
    const items = [...filteredDetailData];
    const { sortConfig } = table;
    if (sortConfig !== null) {
      items.sort((a, b) => {
        let aValue = a[sortConfig.key]; let bValue = b[sortConfig.key];
        if (sortConfig.key === 'work_date' || sortConfig.key === 'go_work_time' || sortConfig.key === 'leave_work_time') {
          aValue = new Date(aValue || 0).getTime() || 0; bValue = new Date(bValue || 0).getTime() || 0;
        } else if (sortConfig.key === 'normal_hours' || sortConfig.key === 'overtime_hours' || sortConfig.key === 'work_hours') {
          aValue = Number(aValue) || 0; bValue = Number(bValue) || 0;
        } else {
          aValue = (aValue || '').toString().toLowerCase(); bValue = (bValue || '').toString().toLowerCase();
        }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [filteredDetailData, table.sortConfig]);

  const calcStats = (data) => data.reduce((acc, curr) => {
    let h = 1;
    if (curr.worker_name === 'IPC_통합') {
      const m = curr.remark?.match(/총 (\d+)명/);
      if (m) h = parseInt(m[1], 10);
    }
    if (isPartnerVendor(curr.worked_vendor)) acc.partnerCount += h;
    else acc.contractorCount += h;
    acc.normalHours += (Number(curr.normal_hours) || 0);
    acc.overtimeHours += (Number(curr.overtime_hours) || 0);
    acc.totalHours += (Number(curr.work_hours) || 0);
    return acc;
  }, { partnerCount: 0, contractorCount: 0, normalHours: 0, overtimeHours: 0, totalHours: 0 });

  const currentStats = useMemo(() => {
    const targetData = activeTab === 'summary' ? filteredChartData : filteredDetailData;
    return calcStats(targetData);
  }, [activeTab, filteredChartData, filteredDetailData]);

  // C1: 전기 통계
  const priorStats = useMemo(() => {
    const priorData = attendanceData.filter(row => {
      if (!isDateInRange(row.work_date, priorStart, priorEnd)) return false;
      return baseFilterLogic(row);
    });
    return calcStats(priorData);
  }, [attendanceData, priorStart, priorEnd, selectedVendor, searchTerm, workerTypeFilter, locationFilter, workerMasterMap]);

  const handleSelectAll = (e) => setSelectedIds(e.target.checked ? filteredDetailData.map(i => i.id) : []);
  const handleSelectOne = (e, id) => {
    if (e && e.nativeEvent && e.nativeEvent.shiftKey && lastSelectedId) {
      const startIdx = sortedDetailData.findIndex(i => i.id === lastSelectedId);
      const endIdx = sortedDetailData.findIndex(i => i.id === id);
      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        const idsInRange = sortedDetailData.slice(min, max + 1).map(i => i.id);
        setSelectedIds(prev => {
          const newSet = new Set(prev);
          idsInRange.forEach(x => newSet.add(x));
          return Array.from(newSet);
        });
        return;
      }
    }
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setLastSelectedId(id);
  };

  // B3: 엑셀 내보내기
  const handleExportExcel = async () => {
    try {
      const XLSXmod = await import('xlsx');
      const XLSX = XLSXmod.default || XLSXmod;
      const exportData = sortedDetailData.map(row => ({
        '근무일자': row.work_date,
        '구분': row.company_type,
        '소속업체': row.vendor_name,
        '실투입처': row.worked_vendor,
        '지원/파견': row.vendor_name !== row.worked_vendor ? 'Y' : '',
        '성명': row.worker_name,
        '출근': row.start_time || '',
        '퇴근': row.end_time || '',
        '정상(H)': Number(row.normal_hours) || 0,
        '연장(H)': Number(row.overtime_hours) || 0,
        '합계(H)': Number(row.work_hours) || 0,
        '비고': row.remark || '',
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '근태내역');
      XLSX.writeFile(wb, `근태내역_${startDate}_${endDate}.xlsx`);
    } catch (e) {
      alert('엑셀 내보내기 실패: ' + (e.message || e));
    }
  };

  const fixed1 = (v) => v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="p-6 bg-slate-100 min-h-[calc(100vh-64px)] w-full transition-all duration-300 slide-up flex flex-col gap-6 ">

      <div className="sticky top-0 z-40 bg-slate-100 pb-4 pt-6 -mt-6 -mx-6 px-6 shadow-[0_4px_6px_-6px_rgba(0,0,0,0.1)]">
        <div className="flex justify-between items-center shrink-0 mb-6">
          <div>
            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
              <span className="text-letusOrange">👥</span> 근무자 근태 관리
            </h2>
            <p className="text-sm text-gray-500 font-medium mt-1">협력사 및 도급사의 일일 근태를 통합 관리하고 리포트를 산출합니다.</p>
          </div>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            근태 엑셀 업로드
          </button>
        </div>

        {/* C1: KPI 카드 + 전기 대비 ▲▼% */}
        <div className="grid grid-cols-5 gap-4 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-blue-400">
            <span className="text-xs font-bold text-blue-500 mb-1">조회 기간 협력사 투입</span>
            <span className="text-2xl font-black text-blue-600">
              {currentStats.partnerCount.toLocaleString()} <span className="text-sm font-bold text-blue-300 ml-1">명</span>
              <DeltaBadge curr={currentStats.partnerCount} prior={priorStats.partnerCount} />
            </span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-orange-400">
            <span className="text-xs font-bold text-orange-500 mb-1">조회 기간 도급사 투입</span>
            <span className="text-2xl font-black text-orange-600">
              {currentStats.contractorCount.toLocaleString()} <span className="text-sm font-bold text-orange-300 ml-1">명</span>
              <DeltaBadge curr={currentStats.contractorCount} prior={priorStats.contractorCount} />
            </span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-emerald-400">
            <span className="text-xs font-bold text-emerald-500 mb-1">조회 기간 정상근무</span>
            <span className="text-2xl font-black text-emerald-600">
              {fixed1(currentStats.normalHours)} <span className="text-sm font-bold text-emerald-300 ml-1">H</span>
              <DeltaBadge curr={currentStats.normalHours} prior={priorStats.normalHours} />
            </span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-purple-400">
            <span className="text-xs font-bold text-purple-500 mb-1">조회 기간 연장근무</span>
            <span className="text-2xl font-black text-purple-600">
              {fixed1(currentStats.overtimeHours)} <span className="text-sm font-bold text-purple-300 ml-1">H</span>
              <DeltaBadge curr={currentStats.overtimeHours} prior={priorStats.overtimeHours} />
            </span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-red-400">
            <span className="text-xs font-bold text-red-500 mb-1">조회 기간 총 근무시간</span>
            <span className="text-2xl font-black text-red-600">
              {fixed1(currentStats.totalHours)} <span className="text-sm font-bold text-red-300 ml-1">H</span>
              <DeltaBadge curr={currentStats.totalHours} prior={priorStats.totalHours} />
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20">
        <div className="flex border-b border-gray-200 bg-gray-50/50 px-4 pt-4 shrink-0">
          <button onClick={() => { setActiveTab('summary'); setSelectedIds([]); }} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'summary' ? 'border-letusBlue text-letusBlue bg-white' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 rounded-t-lg'}`}>
            📊 기간별 집계 현황
          </button>
          <button onClick={() => { setActiveTab('detail'); setSelectedIds([]); }} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'detail' ? 'border-letusBlue text-letusBlue bg-white' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 rounded-t-lg'}`}>
            📋 일별 상세 내역 (지원/파견 관리)
          </button>
        </div>

        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between bg-white shrink-0 gap-y-3 min-h-[70px]">
          <div className="flex flex-wrap items-center w-full min-w-0 md:w-auto md:flex-1 gap-4">

            <div className="flex items-center gap-2">
              <div className="relative">
                <select value={workerTypeFilter} onChange={(e) => setWorkerTypeFilter(e.target.value)} className={`appearance-none pl-3 pr-7 py-[7px] text-xs font-bold rounded-lg border outline-none transition-colors cursor-pointer ${workerTypeFilter === '현장직' ? 'bg-white border-gray-200 text-gray-600' : 'bg-blue-50 border-blue-200 text-letusBlue'}`}>
                  <option value="현장직">현장직</option>
                  <option value="사무직">사무직</option>
                  <option value="전체">전체</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"><svg className="fill-current h-3 w-3" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg></div>
              </div>
              <div className="relative">
                <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={`appearance-none pl-3 pr-7 py-[7px] text-xs font-bold rounded-lg border outline-none transition-colors cursor-pointer ${locationFilter === '메인센터' ? 'bg-white border-gray-200 text-gray-600' : 'bg-orange-50 border-orange-200 text-letusOrange'}`}>
                  <option value="메인센터">메인센터</option>
                  <option value="지방센터">지방(동/서부)</option>
                  <option value="전체">근무지</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"><svg className="fill-current h-3 w-3" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg></div>
              </div>
            </div>
            <div className="h-6 w-px bg-gray-200 hidden md:block"></div>

            {activeTab === 'summary' ? (
              <>
                <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner">
                  <button onClick={() => setSummaryViewMode('vendor')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all flex items-center gap-1.5 ${summaryViewMode === 'vendor' ? 'bg-white text-letusBlue shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}>🏢 업체별 보기</button>
                  <button onClick={() => setSummaryViewMode('brand')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all flex items-center gap-1.5 ${summaryViewMode === 'brand' ? 'bg-white text-letusOrange shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}>🏷️ 브랜드별 보기</button>
                </div>
                <div className="flex items-center justify-end flex-1 gap-2">
                  {chartFilterType === 'CUSTOM' && (
                    <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 animate-fade-in shadow-sm h-[38px]">
                      <DateRangeInput
                        startDate={tempChartStartDate}
                        endDate={tempChartEndDate}
                        onChange={(s, e) => { setTempChartStartDate(s); setTempChartEndDate(e); }}
                        variant="ghost"
                      />
                      <SearchButton onClick={() => { setChartStartDate(tempChartStartDate); setChartEndDate(tempChartEndDate); }} label="조회" className="ml-1" />
                    </div>
                  )}
                  <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner h-[38px] items-center">
                    {PERIOD_BUTTONS.map(btn => (
                      <button key={btn.id} onClick={() => setChartFilterType(btn.id)} className={`px-3 h-full text-xs font-bold rounded-md transition-all ${chartFilterType === btn.id ? 'bg-white text-gray-800 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}>{btn.name}</button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-1">
                  {['전체', '사내협력사', '외주도급사'].map(type => (
                    <button key={type} onClick={() => setSelectedVendor(type)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${selectedVendor === type ? 'bg-white text-letusBlue shadow-sm ring-1 ring-letusBlue/20' : 'text-gray-500 hover:bg-gray-100'}`}>{type}</button>
                  ))}
                </div>
                <div className="relative">
                  <input type="text" placeholder="사원/업체 검색..." value={inputValue} onChange={(e) => setInputValue(e.target.value)} className="border border-gray-200 rounded-lg pl-8 pr-3 py-[7px] text-xs font-bold text-gray-700 outline-none focus:border-letusBlue w-40" />
                  <svg className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                {/* B2: 지원/파견만 토글 */}
                <button
                  onClick={() => setDispatchOnly(prev => !prev)}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 h-[38px] rounded-lg border transition-all ${dispatchOnly ? 'bg-red-500 text-white border-red-500 shadow-sm' : 'bg-white text-gray-500 border-gray-300 hover:border-red-300 hover:text-red-500'}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  지원/파견만
                </button>
                <div className="flex items-center justify-end flex-1 gap-2">
                  {filterType === 'CUSTOM' && (
                    <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 animate-fade-in shadow-sm h-[38px]">
                      <DateRangeInput
                        startDate={tempStartDate}
                        endDate={tempEndDate}
                        onChange={(s, e) => { setTempStartDate(s); setTempEndDate(e); }}
                        variant="ghost"
                      />
                      <SearchButton onClick={() => { setStartDate(tempStartDate); setEndDate(tempEndDate); }} label="조회" className="ml-1" />
                    </div>
                  )}
                  <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner h-[38px] items-center">
                    {PERIOD_BUTTONS.map(btn => (
                      <button key={btn.id} onClick={() => setFilterType(btn.id)} className={`px-3 h-full text-xs font-bold rounded-md transition-all ${filterType === btn.id ? 'bg-white text-gray-800 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}>{btn.name}</button>
                    ))}
                  </div>
                  <button onClick={table.resetColSettings}
                    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[38px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    title="컬럼 너비·순서를 기본값으로 초기화">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    칼럼 초기화
                  </button>
                  {/* B3: 엑셀 내보내기 */}
                  <button
                    onClick={handleExportExcel}
                    className="flex items-center gap-1.5 text-xs font-bold text-gray-600 border border-gray-300 bg-white rounded shadow-sm px-3 h-[38px] hover:bg-gray-50 transition-colors"
                    title="현재 필터 결과를 엑셀로 내보내기"
                  >
                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    엑셀 내보내기
                  </button>
                  <div className="relative z-50 ml-1">
                    <button onClick={() => setIsActionMenuOpen(!isActionMenuOpen)} className="flex items-center text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded px-3 py-1.5 h-[38px] hover:bg-slate-50 min-w-[100px] justify-between shadow-sm transition-all">
                      <span>선택실행 {selectedIds.length > 0 && `(${selectedIds.length})`}</span>
                      <svg className={`w-3.5 h-3.5 ml-2 text-slate-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {isActionMenuOpen && (
                      <>
                        <div className="fixed inset-0" onClick={() => setIsActionMenuOpen(false)}></div>
                        <div className="absolute right-0 top-[110%] w-[140px] bg-white border border-slate-200 rounded-md shadow-xl p-1.5 flex flex-col gap-0.5 slide-down z-50">
                          <button onClick={() => { setIsActionMenuOpen(false); if (selectedIds.length === 0) return alert('항목을 체크해 주세요.'); setIsBulkEditModalOpen(true); }} className={`w-full text-left px-2.5 py-2 font-bold rounded text-[11px] transition-colors ${selectedIds.length > 0 ? 'text-letusBlue hover:bg-blue-50' : 'text-gray-300 cursor-not-allowed'}`}>
                            일괄 수정 (지원/파견)
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="overflow-auto flex-1 custom-scrollbar bg-slate-50/30 relative">
          {isLoading ? (
            <div className="p-6 flex flex-col gap-4 animate-pulse">
              <div className="grid grid-cols-5 gap-4 mb-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-24 bg-slate-200 rounded-xl border border-slate-100"></div>
                ))}
              </div>
              <div className="h-12 bg-slate-200 rounded-t-lg border-b border-slate-300"></div>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-10 bg-slate-100 rounded-md mb-1.5 flex items-center px-4 gap-4">
                  <div className="h-4 bg-slate-200 rounded w-1/12"></div>
                  <div className="h-4 bg-slate-200 rounded w-2/12"></div>
                  <div className="h-4 bg-slate-200 rounded w-3/12"></div>
                  <div className="h-4 bg-slate-200 rounded w-2/12"></div>
                  <div className="h-4 bg-slate-200 rounded w-full"></div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {activeTab === 'summary' && (
                <AttendanceSummaryTab
                  chartData={filteredChartData}
                  summaryViewMode={summaryViewMode}
                  workerMasterMap={workerMasterMap}
                />
              )}
              {activeTab === 'detail' && (
                <AttendanceDetailTab
                  rows={sortedDetailData}
                  table={table}
                  selectedIds={selectedIds}
                  onSelectAll={handleSelectAll}
                  onSelectOne={handleSelectOne}
                />
              )}
            </>
          )}
        </div>
      </div>

      {isUploadModalOpen && <AttendanceUploadModal onClose={() => setIsUploadModalOpen(false)} onReload={reload} />}
      {isBulkEditModalOpen && <AttendanceBulkEditModal selectedIds={selectedIds} onClose={() => { setIsBulkEditModalOpen(false); setSelectedIds([]); }} onReload={reload} />}
    </div>
  );
};

export { AttendanceManagement };
