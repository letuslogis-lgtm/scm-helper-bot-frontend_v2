// ===========================================================================
// 기간별 집계 현황 탭
//   업체별/브랜드별 뷰 모드에 따라 그룹핑 기준을 전환하고,
//   월별 누적 차트 + 그룹/서브그룹 집계표를 렌더링한다.
// ===========================================================================
import React, { useState, useMemo } from 'react';
import { isPartnerVendor } from './constants.js';

const fmt = (v) => v === 0 ? '-' : v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// 행의 브랜드명 결정: 1순위 마스터 브랜드, 2순위 비고의 [브랜드] 태그
const resolveBrand = (row, masterInfo) => {
  let brandName = (masterInfo.brand && masterInfo.brand !== '미지정/공통') ? masterInfo.brand : null;
  if (!brandName && row.remark) {
    const match = row.remark.match(/\[(.*?)\]/);
    if (match && match[1] !== '야간' && match[1] !== '전체') {
      brandName = match[1];
    } else if (row.remark.includes('[전체]')) {
      brandName = '전체(공통)';
    }
  }
  return brandName || '미지정/공통';
};

export const AttendanceSummaryTab = ({ chartData, summaryViewMode, workerMasterMap }) => {
  const [expandedGroups, setExpandedGroups] = useState([]);
  const toggleGroup = (name) => setExpandedGroups(prev => prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]);

  const { summaryDataList, chartDataList, totalSummary } = useMemo(() => {
    const groupSummaryMap = {};
    const chartDataMap = {};

    chartData.forEach(row => {
      const monthStr = row.work_date ? row.work_date.substring(0, 7) : '미상';
      const actualVendor = row.worked_vendor || '미분류';

      let groupKey = '';
      let groupType = '';
      let subGroupKey = '';

      if (summaryViewMode === 'vendor') {
        // 🏢 업체별 보기 — 대분류: 실투입 업체, 중분류: 월
        groupKey = actualVendor;
        groupType = isPartnerVendor(groupKey) ? '사내협력사' : '외주도급사';
        subGroupKey = monthStr;
      } else {
        // 🏷️ 브랜드별 보기 — 대분류: 브랜드, 중분류: 실투입 업체
        const cleanName = row.worker_name?.replace(/\s/g, '') || '';
        const masterInfo = workerMasterMap[cleanName] || {};
        groupKey = resolveBrand(row, masterInfo);
        groupType = '브랜드';
        subGroupKey = actualVendor;
      }

      if (!groupSummaryMap[groupKey]) {
        groupSummaryMap[groupKey] = { type: groupType, name: groupKey, normal: 0, overtime: 0, total: 0, weighted: 0, subMap: {} };
      }
      const gMap = groupSummaryMap[groupKey];
      const normalH = Number(row.normal_hours) || 0;
      const overH = Number(row.overtime_hours) || 0;
      const totalH = Number(row.work_hours) || 0;
      const weightedH = Number(row.weighted_hours) || 0;

      gMap.normal += normalH; gMap.overtime += overH; gMap.total += totalH; gMap.weighted += weightedH;

      if (!gMap.subMap[subGroupKey]) gMap.subMap[subGroupKey] = { subName: subGroupKey, normal: 0, overtime: 0, total: 0, weighted: 0 };
      gMap.subMap[subGroupKey].normal += normalH; gMap.subMap[subGroupKey].overtime += overH;
      gMap.subMap[subGroupKey].total += totalH; gMap.subMap[subGroupKey].weighted += weightedH;

      // 차트는 항상 월별 누적
      if (!chartDataMap[monthStr]) chartDataMap[monthStr] = { name: monthStr, normal: 0, overtime: 0, total: 0 };
      chartDataMap[monthStr].normal += normalH; chartDataMap[monthStr].overtime += overH; chartDataMap[monthStr].total += totalH;
    });

    const sortedSummary = Object.values(groupSummaryMap).map(v => ({
      ...v,
      subItems: Object.values(v.subMap).sort((a, b) => a.subName.localeCompare(b.subName)),
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
  }, [chartData, summaryViewMode, workerMasterMap]);

  return (
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
                    <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono text-gray-700 font-medium">{fmt(row.normal)}</td>
                    <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono text-gray-700 font-medium">{fmt(row.overtime)}</td>
                    <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono font-bold text-letusBlue bg-blue-50/10">{fmt(row.total)}</td>
                    <td className="p-3 text-right pr-6 font-mono font-bold text-red-500 bg-orange-50/10">{fmt(row.weighted)}</td>
                  </tr>

                  {isExpanded && row.subItems.map((sub) => (
                    <tr key={`${row.name}-${sub.subName}`} className="bg-slate-50 border-b border-gray-100 text-gray-500 animate-fade-in">
                      <td className="p-2 border-r border-gray-100 bg-slate-100/50"></td>
                      <td className="p-2 border-r border-gray-100 text-left pl-10 font-bold text-[11px] flex items-center gap-2"><span className="text-gray-400">└</span> {sub.subName}</td>
                      <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono text-[12px]">{fmt(sub.normal)}</td>
                      <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono text-[12px]">{fmt(sub.overtime)}</td>
                      <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono font-bold text-[12px] text-blue-400">{fmt(sub.total)}</td>
                      <td className="p-2 text-right pr-6 font-mono font-bold text-[12px] text-red-400">{fmt(sub.weighted)}</td>
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
  );
};
