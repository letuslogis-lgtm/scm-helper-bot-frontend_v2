import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon, SearchButton, DateRangeInput } from './SharedUI.jsx';
import { AttendanceUploadModal } from './AttendanceUploadModal.jsx';

const supabaseClient = supabase;

const DETAIL_COLUMNS = [
    { label: '근무 일자',              key: 'work_date',        w: 110 },
    { label: '구분',                   key: 'company_type',     w: 80  },
    { label: '원 소속 업체',           key: 'vendor_name',      w: 130 },
    { label: '실 투입 (생산성 기준)',  key: 'worked_vendor',    w: 160 },
    { label: '근무자명',               key: 'worker_name',      w: 100 },
    { label: '출근',                   key: 'go_work_time',     w: 90  },
    { label: '퇴근',                   key: 'leave_work_time',  w: 90  },
    { label: '정상근무',               key: 'normal_hours',     w: 90  },
    { label: '연장근무',               key: 'overtime_hours',   w: 90  },
    { label: '총 시간',                key: 'work_hours',       w: 90  },
    { label: '특이사항(비고)',         key: 'remark',           w: 150 },
];

const AttendanceBulkEditModal = ({ selectedIds, onClose, onReload }) => {
  const [workedVendor, setWorkedVendor] = useState('');
  const [remark, setRemark] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!workedVendor && !remark) return alert('변경할 투입 업체나 비고 내용을 입력해 주세요.');
    if (!window.confirm(`선택하신 ${selectedIds.length}명의 근무 데이터를 일괄 수정하시겠습니까?\n(지원/파견 처리)`)) return;

    setIsSaving(true);
    try {
      const updateData = {};
      if (workedVendor) updateData.worked_vendor = workedVendor;
      if (remark) updateData.remark = remark;

      const { error } = await supabaseClient.from('worker_attendance').update(updateData).in('id', selectedIds);
      if (error) throw error;

      alert(`🎉 총 ${selectedIds.length}명의 데이터가 일괄 수정되었습니다.`);
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
      <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-md slide-up overflow-hidden border border-gray-100 flex flex-col">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <span className="w-1.5 h-3.5 bg-letusOrange rounded-full"></span>
            선택 인원 일괄 수정 (지원/파견)
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm font-bold text-letusBlue text-center">
            현재 <span className="text-lg mx-1">{selectedIds.length}</span>명의 근무 데이터가 선택되었습니다.
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-2">실제 투입 업체 (지원/파견 변경 시)</label>
              <select value={workedVendor} onChange={e => setWorkedVendor(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue transition-all cursor-pointer bg-white">
                <option value="">변경 안 함 (기존 소속 유지)</option>
                <option value="바로서비스">바로서비스</option>
                <option value="하나물류">하나물류</option>
                <option value="에프스토리">에프스토리</option>
                <option value="IPC">IPC</option>
                <option value="한국사람들">한국사람들</option>
                <option value="JNT">JNT</option>
              </select>
              <p className="text-[10px] text-gray-400 mt-1.5 font-medium">* 선택 시 원 소속과 무관하게 해당 업체의 생산성(UPH)으로 집계됩니다.</p>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-2">특이사항 (비고) 일괄 적용</label>
              <input type="text" value={remark} onChange={e => setRemark(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue transition-all placeholder:text-gray-300" placeholder="예: IPC 물량 증가로 인한 오후 지원" />
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors shadow-sm">취소</button>
          <button onClick={handleSave} disabled={isSaving || (!workedVendor && !remark)} className={`px-6 py-2 bg-letusBlue text-white text-sm font-bold rounded-lg shadow hover:bg-blue-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}>
            {isSaving ? '일괄 적용 중...' : '확인 및 일괄 적용'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- 👥 3. 근무자 근태 관리 대시보드 (메인 화면) ---
// --- 👥 3. 근무자 근태 관리 대시보드 (메인 화면) ---
const AttendanceManagement = () => {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [expandedGroups, setExpandedGroups] = useState([]);

  const [selectedIds, setSelectedIds] = useState([]);
  const [lastSelectedId, setLastSelectedId] = useState(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);

  const [sortConfig, setSortConfig] = useState(null);

  const [colOrder, setColOrder] = useState(DETAIL_COLUMNS.map((_, i) => i));
  const [colWidths, setColWidths] = useState(DETAIL_COLUMNS.map(c => c.w));
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const resizingRef = useRef(null);
  const dragSrcRef = useRef(null);
  const wasDraggedRef = useRef(false);

  // 날짜 상태
  const [tempStartDate, setTempStartDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
  const [tempEndDate, setTempEndDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()}`);
  const [startDate, setStartDate] = useState(tempStartDate);
  const [endDate, setEndDate] = useState(tempEndDate);

  const [tempChartStartDate, setTempChartStartDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
  const [tempChartEndDate, setTempChartEndDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()}`);
  const [chartStartDate, setChartStartDate] = useState(tempChartStartDate);
  const [chartEndDate, setChartEndDate] = useState(tempChartEndDate);

  // 필터 상태
  const [inputValue, setInputValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [workerTypeFilter, setWorkerTypeFilter] = useState('전체');
  const [locationFilter, setLocationFilter] = useState('전체');
  const [selectedVendor, setSelectedVendor] = useState('전체');

  // 🚩 [신규] 집계 화면 뷰 모드 (업체별 vs 브랜드별)
  const [summaryViewMode, setSummaryViewMode] = useState('vendor');

  const [workerMasterMap, setWorkerMasterMap] = useState({});
  const [attendanceData, setAttendanceData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [filterType, setFilterType] = useState('D');
  const [chartFilterType, setChartFilterType] = useState('M');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('letus_attendance_col'));
      if (saved?.order?.length === DETAIL_COLUMNS.length) setColOrder(saved.order);
      if (saved?.widths?.length === DETAIL_COLUMNS.length) setColWidths(saved.widths);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('letus_attendance_col', JSON.stringify({ order: colOrder, widths: colWidths }));
  }, [colOrder, colWidths]);

  const resetColSettings = () => {
    setColOrder(DETAIL_COLUMNS.map((_, i) => i));
    setColWidths(DETAIL_COLUMNS.map(c => c.w));
    localStorage.removeItem('letus_attendance_col');
  };

  React.useEffect(() => {
    const fetchWorkerMaster = async () => {
      try {
        // 🚩 브랜드명(managed_brand) 추가 로드
        const { data, error } = await supabaseClient.from('workers').select('name, employment_type, workplace, managed_brand');
        if (data) {
          const masterMap = {};
          data.forEach(w => {
            masterMap[w.name.replace(/\s/g, '')] = {
              type: w.employment_type,
              location: w.workplace,
              brand: w.managed_brand || '미지정/공통' // 브랜드 정보 저장
            };
          });
          setWorkerMasterMap(masterMap);
        }
      } catch (err) { console.error("마스터 정보 로드 실패", err); }
    };
    fetchWorkerMaster();
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const getFilterDates = (type) => {
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const format = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (type === 'D') {
      const today = format(now); return { start: today, end: today };
    } else if (type === 'W') {
      const day = now.getDay(); const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now); monday.setDate(diffToMonday);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return { start: format(monday), end: format(sunday) };
    } else if (type === 'M') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: format(firstDay), end: format(lastDay) };
    }
    return { start: tempStartDate, end: tempEndDate };
  };

  React.useEffect(() => {
    if (filterType !== 'CUSTOM') {
      const { start, end } = getFilterDates(filterType);
      setStartDate(start); setEndDate(end); setTempStartDate(start); setTempEndDate(end);
    } else { setStartDate(tempStartDate); setEndDate(tempEndDate); }
  }, [filterType]);

  React.useEffect(() => {
    if (chartFilterType !== 'CUSTOM') {
      const { start, end } = getFilterDates(chartFilterType);
      setChartStartDate(start); setChartEndDate(end); setTempChartStartDate(start); setTempChartEndDate(end);
    } else { setChartStartDate(tempChartStartDate); setChartEndDate(tempChartEndDate); }
  }, [chartFilterType]);

  const fetchAttendance = async () => {
    setIsLoading(true);
    try {
      let allData = []; let hasMore = true; let page = 0; const pageSize = 1000;
      while (hasMore) {
        const { data, error } = await supabaseClient.from('worker_attendance').select('*').order('work_date', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) { allData = [...allData, ...data]; page++; if (data.length < pageSize) hasMore = false; } else { hasMore = false; }
      }
      const cleanData = allData.filter(row => {
        const validStart = row.start_time && String(row.start_time).trim() !== '' && String(row.start_time).trim() !== ':';
        const validEnd = row.end_time && String(row.end_time).trim() !== '' && String(row.end_time).trim() !== ':';
        return validStart || validEnd || Number(row.work_hours) > 0;
      });
      setAttendanceData(cleanData);
    } catch (err) { console.error('근태 조회 실패:', err.message); } finally { setIsLoading(false); }
  };

  React.useEffect(() => { fetchAttendance(); }, []);

  // 상세 내역 및 차트 공통 필터 로직 (날짜 제외)
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

  const isDateInRange = (dateStr, start, end) => {
    if (!dateStr || !start || !end) return true;
    const dTime = new Date(dateStr).setHours(0, 0, 0, 0);
    const sTime = new Date(start).setHours(0, 0, 0, 0);
    const eTime = new Date(end).setHours(23, 59, 59, 999);
    return dTime >= sTime && dTime <= eTime;
  };

  const filteredDetailData = useMemo(() => {
    return attendanceData.filter(row => {
      if (!isDateInRange(row.work_date, startDate, endDate)) return false;
      return baseFilterLogic(row);
    });
  }, [attendanceData, startDate, endDate, selectedVendor, searchTerm, workerTypeFilter, locationFilter, workerMasterMap]);

  const filteredChartData = useMemo(() => {
    return attendanceData.filter(row => {
      if (!isDateInRange(row.work_date, chartStartDate, chartEndDate)) return false;
      return baseFilterLogic(row);
    });
  }, [attendanceData, chartStartDate, chartEndDate, selectedVendor, searchTerm, workerTypeFilter, locationFilter, workerMasterMap]);

  const sortedDetailData = React.useMemo(() => {
    let sortableItems = [...filteredDetailData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
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
    return sortableItems;
  }, [filteredDetailData, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleResizeStart = (e, visualIdx) => {
    e.preventDefault(); e.stopPropagation();
    const origIdx = colOrder[visualIdx];
    resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
    const onMove = (ev) => {
      const { origIdx, startX, startW } = resizingRef.current;
      setColWidths(prev => { const n = [...prev]; n[origIdx] = Math.max(50, startW + (ev.clientX - startX)); return n; });
    };
    const onUp = () => { resizingRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const handleDragStart = (e, visualIdx) => { dragSrcRef.current = visualIdx; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, visualIdx) => { e.preventDefault(); setDragOverIdx(visualIdx); };
  const handleDrop = (e, visualIdx) => {
    e.preventDefault(); setDragOverIdx(null);
    if (dragSrcRef.current === null || dragSrcRef.current === visualIdx) return;
    wasDraggedRef.current = true;
    const newOrder = [...colOrder]; const [moved] = newOrder.splice(dragSrcRef.current, 1); newOrder.splice(visualIdx, 0, moved);
    setColOrder(newOrder); dragSrcRef.current = null;
  };
  const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

  const getSortIcon = (key) => {
    if (sortConfig?.key !== key) return null;
    if (sortConfig.direction === 'asc') return <span className="ml-1 text-letusBlue font-black">↑</span>;
    if (sortConfig.direction === 'desc') return <span className="ml-1 text-letusBlue font-black">↓</span>;
    return null;
  };

  const renderCell = (origIdx, row) => {
    const isDispatched = row.vendor_name !== row.worked_vendor;
    switch (origIdx) {
      case 0:
        return <td key={origIdx} className="p-3 font-mono text-gray-500 text-center" style={{ width: colWidths[origIdx] }}>{row.work_date}</td>;
      case 1:
        return (
          <td key={origIdx} className="p-3 text-center" style={{ width: colWidths[origIdx] }}>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.company_type === '사내협력사' ? 'bg-blue-50 text-letusBlue border border-blue-100' : 'bg-orange-50 text-letusOrange border border-orange-100'}`}>
              {row.company_type}
            </span>
          </td>
        );
      case 2:
        return <td key={origIdx} className="p-3 font-bold text-gray-500 border-r border-gray-50 text-center" style={{ width: colWidths[origIdx] }}>{row.vendor_name}</td>;
      case 3:
        return (
          <td key={origIdx} className={`p-3 font-black text-center ${isDispatched ? 'text-red-500 bg-red-50/30' : 'text-gray-800'}`} style={{ width: colWidths[origIdx] }}>
            <div className="flex justify-center items-center gap-1.5">
              {isDispatched && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200 shrink-0 tracking-tighter">지원 파견</span>}
              {row.worked_vendor}
            </div>
          </td>
        );
      case 4:
        return <td key={origIdx} className="p-3 font-black text-gray-900 text-center" style={{ width: colWidths[origIdx] }}>{row.worker_name}</td>;
      case 5:
        return <td key={origIdx} className="p-3 text-center font-bold text-gray-600" style={{ width: colWidths[origIdx] }}>{row.start_time || '-'}</td>;
      case 6:
        return <td key={origIdx} className="p-3 text-center font-bold text-gray-600 border-r border-gray-50" style={{ width: colWidths[origIdx] }}>{row.end_time || '-'}</td>;
      case 7:
        return <td key={origIdx} className="p-3 text-center font-bold text-green-600 bg-green-50/20" style={{ width: colWidths[origIdx] }}>{Number(row.normal_hours).toFixed(1)}H</td>;
      case 8:
        return <td key={origIdx} className="p-3 text-center font-bold text-orange-500 bg-orange-50/20" style={{ width: colWidths[origIdx] }}>{Number(row.overtime_hours).toFixed(1)}H</td>;
      case 9:
        return <td key={origIdx} className="p-3 text-center font-black text-letusBlue border-r border-gray-50 bg-blue-50/20" style={{ width: colWidths[origIdx] }}>{Number(row.work_hours).toFixed(1)}H</td>;
      case 10:
        return <td key={origIdx} className={`p-3 truncate max-w-[200px] text-xs ${isDispatched ? 'text-red-500 font-bold' : 'text-gray-500'}`} style={{ width: colWidths[origIdx] }}>{row.remark}</td>;
      default:
        return null;
    }
  };

  // 🚩 [핵심] 집계 로직: 뷰 모드에 따라 그룹핑 기준을 완벽하게 스위칭!
  const { summaryDataList, chartDataList, totalSummary } = useMemo(() => {
    const groupSummaryMap = {};
    const chartDataMap = {};

    filteredChartData.forEach(row => {
      const monthStr = row.work_date ? row.work_date.substring(0, 7) : '미상';
      const actualVendor = row.worked_vendor || '미분류';

      let groupKey = '';
      let groupType = '';
      let subGroupKey = '';

      if (summaryViewMode === 'vendor') {
        // 🏢 [업체별 보기]
        groupKey = actualVendor; // 대분류: 실투입 업체명
        const isPartner = ['바로서비스', '하나물류', '에프스토리'].includes(groupKey);
        groupType = isPartner ? '사내협력사' : '외주도급사';
        subGroupKey = monthStr; // 중분류: 월별 추이
      } else {
        // 🏷️ [브랜드별 보기]
        const cleanName = row.worker_name?.replace(/\s/g, '') || '';
        const masterInfo = workerMasterMap[cleanName] || {};

        // 1순위: 마스터 DB의 브랜드, 2순위: 비고란의 [브랜드] 태그 파싱
        let brandName = (masterInfo.brand && masterInfo.brand !== '미지정/공통') ? masterInfo.brand : null;
        if (!brandName && row.remark) {
          const match = row.remark.match(/\[(.*?)\]/);
          // [야간] 같은 예외 태그 방어
          if (match && match[1] !== '야간' && match[1] !== '전체') {
            brandName = match[1];
          } else if (row.remark.includes('[전체]')) {
            brandName = '전체(공통)';
          }
        }

        groupKey = brandName || '미지정/공통'; // 대분류: 브랜드명
        groupType = '브랜드'; // 구분명
        subGroupKey = actualVendor; // 🚩 중분류: 실투입 업체명!!
      }

      if (!groupSummaryMap[groupKey]) {
        groupSummaryMap[groupKey] = { type: groupType, name: groupKey, normal: 0, overtime: 0, total: 0, weighted: 0, subMap: {} };
      }
      const gMap = groupSummaryMap[groupKey];
      const normalH = Number(row.normal_hours) || 0; const overH = Number(row.overtime_hours) || 0;
      const totalH = Number(row.work_hours) || 0; const weightedH = Number(row.weighted_hours) || 0;

      gMap.normal += normalH; gMap.overtime += overH; gMap.total += totalH; gMap.weighted += weightedH;

      // 🚩 중분류 데이터 합산 (서브맵에 저장)
      if (!gMap.subMap[subGroupKey]) gMap.subMap[subGroupKey] = { subName: subGroupKey, normal: 0, overtime: 0, total: 0, weighted: 0 };
      gMap.subMap[subGroupKey].normal += normalH; gMap.subMap[subGroupKey].overtime += overH;
      gMap.subMap[subGroupKey].total += totalH; gMap.subMap[subGroupKey].weighted += weightedH;

      // 차트는 뷰 모드 상관없이 항상 '월별' 누적으로 표시
      if (!chartDataMap[monthStr]) chartDataMap[monthStr] = { name: monthStr, normal: 0, overtime: 0, total: 0 };
      chartDataMap[monthStr].normal += normalH; chartDataMap[monthStr].overtime += overH; chartDataMap[monthStr].total += totalH;
    });

    // 객체를 배열로 변환하고 정렬
    const sortedSummary = Object.values(groupSummaryMap).map(v => ({
      ...v,
      subItems: Object.values(v.subMap).sort((a, b) => a.subName.localeCompare(b.subName)) // 서브 항목 배열화
    })).sort((a, b) => {
      if (a.type === '사내협력사' && b.type !== '사내협력사') return -1;
      if (a.type !== '사내협력사' && b.type === '사내협력사') return 1;
      return a.name.localeCompare(b.name);
    });

    const sortedChart = Object.values(chartDataMap).sort((a, b) => a.name.localeCompare(b.name));
    const totals = sortedSummary.reduce((acc, curr) => {
      acc.normal += curr.normal; acc.overtime += curr.overtime; acc.total += curr.total; acc.weighted += curr.weighted; return acc;
    }, { normal: 0, overtime: 0, total: 0, weighted: 0 });

    return { summaryDataList: sortedSummary, chartDataList: sortedChart, totalSummary: totals };
  }, [filteredChartData, summaryViewMode, workerMasterMap]);

  const toggleGroup = (name) => setExpandedGroups(prev => prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]);
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

  const currentStats = useMemo(() => {
    const targetData = activeTab === 'summary' ? filteredChartData : filteredDetailData;
    return targetData.reduce((acc, curr) => {
      let actualHeadcount = 1;
      if (curr.worker_name === 'IPC_통합') {
        const match = curr.remark?.match(/총 (\d+)명/);
        if (match) actualHeadcount = parseInt(match[1], 10);
      }

      const isPartner = ['바로서비스', '하나물류', '에프스토리'].includes(curr.worked_vendor);
      if (isPartner) acc.partnerCount += actualHeadcount;
      else acc.contractorCount += actualHeadcount;

      acc.normalHours += (Number(curr.normal_hours) || 0);
      acc.overtimeHours += (Number(curr.overtime_hours) || 0);
      acc.totalHours += (Number(curr.work_hours) || 0);

      return acc;
    }, { partnerCount: 0, contractorCount: 0, normalHours: 0, overtimeHours: 0, totalHours: 0 });
  }, [activeTab, filteredChartData, filteredDetailData]);

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

        <div className="grid grid-cols-5 gap-4 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-blue-400">
            <span className="text-xs font-bold text-blue-500 mb-1">조회 기간 협력사 투입</span>
            <span className="text-2xl font-black text-blue-600">{currentStats.partnerCount.toLocaleString()} <span className="text-sm font-bold text-blue-300 ml-1">명</span></span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-orange-400">
            <span className="text-xs font-bold text-orange-500 mb-1">조회 기간 도급사 투입</span>
            <span className="text-2xl font-black text-orange-600">{currentStats.contractorCount.toLocaleString()} <span className="text-sm font-bold text-orange-300 ml-1">명</span></span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-emerald-400">
            <span className="text-xs font-bold text-emerald-500 mb-1">조회 기간 정상근무</span>
            <span className="text-2xl font-black text-emerald-600">{currentStats.normalHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-sm font-bold text-emerald-300 ml-1">H</span></span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-purple-400">
            <span className="text-xs font-bold text-purple-500 mb-1">조회 기간 연장근무</span>
            <span className="text-2xl font-black text-purple-600">{currentStats.overtimeHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-sm font-bold text-purple-300 ml-1">H</span></span>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-red-400">
            <span className="text-xs font-bold text-red-500 mb-1">조회 기간 총 근무시간</span>
            <span className="text-2xl font-black text-red-600">{currentStats.totalHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-sm font-bold text-red-300 ml-1">H</span></span>
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

            {/* 공통 필터 영역 (사무직/현장직, 메인/지방센터) */}
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
                {/* 🚩 집계 현황 탭 전용: 뷰 모드 스위치 */}
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
                    {[{ id: 'D', name: '당일' }, { id: 'W', name: '주간' }, { id: 'M', name: '월간' }, { id: 'CUSTOM', name: '직접지정' }].map(btn => (
                      <button key={btn.id} onClick={() => setChartFilterType(btn.id)} className={`px-3 h-full text-xs font-bold rounded-md transition-all ${chartFilterType === btn.id ? 'bg-white text-gray-800 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}>{btn.name}</button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* 상세 내역 탭 전용: 검색 및 데이터 필터 */}
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-1">
                  {['전체', '사내협력사', '외주도급사'].map(type => (
                    <button key={type} onClick={() => setSelectedVendor(type)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${selectedVendor === type ? 'bg-white text-letusBlue shadow-sm ring-1 ring-letusBlue/20' : 'text-gray-500 hover:bg-gray-100'}`}>{type}</button>
                  ))}
                </div>
                <div className="relative">
                  <input type="text" placeholder="사원/업체 검색..." value={inputValue} onChange={(e) => setInputValue(e.target.value)} className="border border-gray-200 rounded-lg pl-8 pr-3 py-[7px] text-xs font-bold text-gray-700 outline-none focus:border-letusBlue w-40" />
                  <svg className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
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
                    {[{ id: 'D', name: '당일' }, { id: 'W', name: '주간' }, { id: 'M', name: '월간' }, { id: 'CUSTOM', name: '직접지정' }].map(btn => (
                      <button key={btn.id} onClick={() => setFilterType(btn.id)} className={`px-3 h-full text-xs font-bold rounded-md transition-all ${filterType === btn.id ? 'bg-white text-gray-800 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}>{btn.name}</button>
                    ))}
                  </div>
                  <button onClick={resetColSettings}
                    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[38px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    title="컬럼 너비·순서를 기본값으로 초기화">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    칼럼 초기화
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
                {/* 집계 카드 스켈레톤 */}
                <div className="grid grid-cols-5 gap-4 mb-4">
                    {[1,2,3,4,5].map(i => (
                        <div key={i} className="h-24 bg-slate-200 rounded-xl border border-slate-100"></div>
                    ))}
                </div>
                {/* 테이블 헤더 스켈레톤 */}
                <div className="h-12 bg-slate-200 rounded-t-lg border-b border-slate-300"></div>
                {/* 테이블 로우 스켈레톤 */}
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
                <div className="p-6 flex flex-col gap-6">
                  {window.Recharts && chartDataList.length > 0 && (
                    <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm h-72">
                      <h4 className="text-xs font-bold text-gray-500 mb-4">월별 총 근무시간 추이 ({summaryViewMode === 'vendor' ? '업체별' : '브랜드별'} 누적)</h4>
                      <window.Recharts.ResponsiveContainer width="100%" height="100%">
                        <window.Recharts.BarChart data={chartDataList} margin={{ top: 0, right: 0, left: -20, bottom: 25 }}>
                          <window.Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <window.Recharts.XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} dy={10} />
                          <window.Recharts.YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                          <window.Recharts.Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px', padding: '8px 12px' }} />
                          <window.Recharts.Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', color: '#4b5563', paddingTop: '15px' }} />
                          <window.Recharts.Bar dataKey="normal" name="정상근무" stackId="a" fill="#4b89ff" radius={[0, 0, 4, 4]} barSize={30} />
                          <window.Recharts.Bar dataKey="overtime" name="연장근무" stackId="a" fill="#f58220" radius={[4, 4, 0, 0]} />
                        </window.Recharts.BarChart>
                      </window.Recharts.ResponsiveContainer>
                    </div>
                  )}

                  {summaryDataList.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 font-bold">집계할 데이터가 없습니다.</div>
                  ) : (
                    <table className="w-full text-center whitespace-nowrap bg-white border border-gray-200 shadow-sm">
                      <thead className="bg-gray-100 border-b-2 border-gray-300 text-xs font-black text-gray-700">
                        <tr>
                          <th className="p-3 border-r border-gray-200 w-32">구분</th>
                          <th className="p-3 border-r border-gray-200 w-56 text-left pl-6">
                            {/* 🚩 헤더 텍스트 동적 변경 */}
                            {summaryViewMode === 'vendor' ? '업체명 (클릭 시 월별 상세)' : '운영 브랜드 (클릭 시 실투입 업체별 상세)'}
                          </th>
                          <th className="p-3 border-r border-gray-200">정상근무</th>
                          <th className="p-3 border-r border-gray-200">연장근무</th>
                          <th className="p-3 border-r border-gray-200 bg-blue-50/50">총 시간 합계</th>
                          <th className="p-3 bg-orange-50/50">정산 가중시간</th>
                        </tr>
                      </thead>
                      <tbody className="text-[13px] text-gray-800">
                        {summaryDataList.map((row) => {
                          const isExpanded = expandedGroups.includes(row.name);
                          return (
                            <React.Fragment key={row.name}>
                              <tr onClick={() => toggleGroup(row.name)} className={`border-b border-gray-200 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-blue-50/20'}`}>
                                <td className="p-3 border-r border-gray-200 font-black text-gray-600 bg-gray-50/30">{row.type}</td>
                                <td className="p-3 border-r border-gray-200 font-bold text-left pl-6 flex items-center gap-2"><span className="text-[10px] text-letusBlue w-3">{isExpanded ? '▼' : '▶'}</span>{row.name}</td>
                                <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono text-gray-700 font-medium">{row.normal === 0 ? '-' : row.normal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono text-gray-700 font-medium">{row.overtime === 0 ? '-' : row.overtime.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono font-bold text-letusBlue bg-blue-50/10">{row.total === 0 ? '-' : row.total.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                <td className="p-3 text-right pr-6 font-mono font-bold text-red-500 bg-orange-50/10">{row.weighted === 0 ? '-' : row.weighted.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                              </tr>

                              {/* 🚩 서브 메뉴 렌더링 (월 또는 실투입 업체) */}
                              {isExpanded && row.subItems.map((sub, idx) => (
                                <tr key={`${row.name}-${sub.subName}`} className="bg-slate-50 border-b border-gray-100 text-gray-500 animate-fade-in">
                                  <td className="p-2 border-r border-gray-100 bg-slate-100/50"></td>
                                  <td className="p-2 border-r border-gray-100 text-left pl-10 font-bold text-[11px] flex items-center gap-2"><span className="text-gray-400">└</span> {sub.subName}</td>
                                  <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono text-[12px]">{sub.normal === 0 ? '-' : sub.normal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                  <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono text-[12px]">{sub.overtime === 0 ? '-' : sub.overtime.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                  <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono font-bold text-[12px] text-blue-400">{sub.total === 0 ? '-' : sub.total.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                  <td className="p-2 text-right pr-6 font-mono font-bold text-[12px] text-red-400">{sub.weighted === 0 ? '-' : sub.weighted.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                        <tr className="bg-gray-200 border-t-2 border-gray-400 font-black text-gray-900">
                          <td colSpan="2" className="p-4 border-r border-gray-300 text-center tracking-widest">전체 총 합계</td>
                          <td className="p-4 border-r border-gray-300 text-right pr-6 font-mono text-[14px]">{totalSummary.normal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-4 border-r border-gray-300 text-right pr-6 font-mono text-[14px]">{totalSummary.overtime.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-4 border-r border-gray-300 text-right pr-6 font-mono text-[14px] text-blue-700">{totalSummary.total.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                          <td className="p-4 text-right pr-6 font-mono text-[14px] text-red-700">{totalSummary.weighted.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'detail' && (
                <div className="flex flex-col gap-4 mt-2 p-4">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto outline-none">
                      <table className="w-full text-left whitespace-nowrap table-fixed">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-bold sticky top-0 z-10">
                          <tr>
                            <th className="p-4 pl-6 w-10 text-center border-r border-slate-100">
                              <input type="checkbox" checked={selectedIds.length === sortedDetailData.length && sortedDetailData.length > 0} onChange={handleSelectAll} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                            </th>
                            {colOrder.map((origIdx, visualIdx) => {
                              const col = DETAIL_COLUMNS[origIdx];
                              return (
                                <th key={origIdx}
                                  className={`relative p-4 text-center select-none transition-colors ${col.key ? 'hover:bg-gray-100 cursor-pointer' : ''} ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                                  style={{ width: colWidths[origIdx] }}
                                  onClick={() => !wasDraggedRef.current && col.key && requestSort(col.key)}
                                  onDragOver={(e) => handleDragOver(e, visualIdx)}
                                  onDrop={(e) => handleDrop(e, visualIdx)}
                                  onDragLeave={() => setDragOverIdx(null)}
                                >
                                  <div className="flex items-center justify-center gap-1">
                                    {col.label}
                                    {col.key && getSortIcon(col.key)}
                                  </div>
                                  <div
                                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                    onMouseDown={(e) => handleResizeStart(e, visualIdx)}
                                    onClick={e => e.stopPropagation()}
                                  />
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700 bg-white">
                          {sortedDetailData.length === 0 ? (
                            <tr><td colSpan={colOrder.length + 1} className="text-center py-10 text-gray-400 font-bold">조건에 맞는 데이터가 없습니다.</td></tr>
                          ) : (
                            sortedDetailData.map((row) => {
                              const isSelected = selectedIds.includes(row.id);
                              return (
                                <tr key={row.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                                  onClick={(e) => handleSelectOne(e, row.id)}>
                                  <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" checked={isSelected} onChange={(e) => handleSelectOne(e, row.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                  </td>
                                  {colOrder.map(origIdx => renderCell(origIdx, row))}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {isUploadModalOpen && <AttendanceUploadModal onClose={() => setIsUploadModalOpen(false)} onReload={fetchAttendance} />}
      {isBulkEditModalOpen && <AttendanceBulkEditModal selectedIds={selectedIds} onClose={() => { setIsBulkEditModalOpen(false); setSelectedIds([]); }} onReload={fetchAttendance} />}
    </div>
  );
};

export { AttendanceUploadModal };
export { AttendanceBulkEditModal };
export { AttendanceManagement };