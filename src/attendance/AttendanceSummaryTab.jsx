// ===========================================================================
// 기간별 집계 현황 탭
//   A1: 차트가 업체별/브랜드별 토글과 연동
//   A2: 집계표에 비중(%) 막대 컬럼 추가
// ===========================================================================
import React, { useState, useMemo } from 'react';
import { isPartnerVendor } from './constants.js';

const fmt = (v) => v === 0 ? '-' : v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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

  const { summaryDataList, totalSummary } = useMemo(() => {
    const groupSummaryMap = {};

    chartData.forEach(row => {
      const actualVendor = row.worked_vendor || '미분류';
      let groupKey = '';
      let groupType = '';
      let subGroupKey = '';

      if (summaryViewMode === 'vendor') {
        groupKey = actualVendor;
        groupType = isPartnerVendor(groupKey) ? '사내협력사' : '외주도급사';
        subGroupKey = row.work_date ? row.work_date.substring(0, 7) : '미상';
      } else {
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
    });

    const sortedSummary = Object.values(groupSummaryMap).map(v => ({
      ...v,
      subItems: Object.values(v.subMap).sort((a, b) => a.subName.localeCompare(b.subName)),
    })).sort((a, b) => {
      if (a.type === '사내협력사' && b.type !== '사내협력사') return -1;
      if (a.type !== '사내협력사' && b.type === '사내협력사') return 1;
      return b.total - a.total;
    });

    const totals = sortedSummary.reduce((acc, curr) => {
      acc.normal += curr.normal; acc.overtime += curr.overtime; acc.total += curr.total; acc.weighted += curr.weighted; return acc;
    }, { normal: 0, overtime: 0, total: 0, weighted: 0 });

    return { summaryDataList: sortedSummary, totalSummary: totals };
  }, [chartData, summaryViewMode, workerMasterMap]);

  // A1: 차트 데이터 = 현재 뷰 모드의 그룹별 합계 (상위 12개)
  const chartDisplayData = summaryDataList
    .slice(0, 12)
    .map(v => ({
      name: v.name.length > 8 ? v.name.slice(0, 8) + '…' : v.name,
      정상: +(v.normal.toFixed(1)),
      연장: +(v.overtime.toFixed(1)),
    }));

  const chartTitle = summaryViewMode === 'vendor' ? '업체별 총 근무시간' : '브랜드별 총 근무시간';

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* A1: 토글 연동 차트 */}
      {window.Recharts && chartDisplayData.length > 0 && (
        <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm h-72">
          <h4 className="text-xs font-bold text-gray-500 mb-4">{chartTitle} (상위 12개 · 정상+연장 누적)</h4>
          <window.Recharts.ResponsiveContainer width="100%" height="100%">
            <window.Recharts.BarChart data={chartDisplayData} margin={{ top: 0, right: 0, left: -20, bottom: 30 }}>
              <window.Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <window.Recharts.XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                dy={10}
                interval={0}
                angle={chartDisplayData.length > 6 ? -30 : 0}
                textAnchor={chartDisplayData.length > 6 ? 'end' : 'middle'}
              />
              <window.Recharts.YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
              <window.Recharts.Tooltip
                cursor={{ fill: '#f3f4f6' }}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px', padding: '8px 12px' }}
                formatter={(value) => [`${value.toLocaleString()}H`, undefined]}
              />
              <window.Recharts.Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', color: '#4b5563', paddingTop: '8px' }} />
              <window.Recharts.Bar dataKey="정상" name="정상근무" stackId="a" fill="#4b89ff" radius={[0, 0, 4, 4]} barSize={28} />
              <window.Recharts.Bar dataKey="연장" name="연장근무" stackId="a" fill="#f58220" radius={[4, 4, 0, 0]} />
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
              {/* A2: 비중 컬럼 */}
              <th className="p-3 border-r border-gray-200 w-36">비중</th>
              <th className="p-3 bg-orange-50/50">정산 가중시간</th>
            </tr>
          </thead>
          <tbody className="text-[13px] text-gray-800">
            {summaryDataList.map((row) => {
              const isExpanded = expandedGroups.includes(row.name);
              const pct = totalSummary.total > 0 ? (row.total / totalSummary.total * 100) : 0;
              return (
                <React.Fragment key={row.name}>
                  <tr onClick={() => toggleGroup(row.name)} className={`border-b border-gray-200 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-blue-50/20'}`}>
                    <td className="p-3 border-r border-gray-200 font-black text-gray-600 bg-gray-50/30">{row.type}</td>
                    <td className="p-3 border-r border-gray-200 font-bold text-left pl-6 flex items-center gap-2">
                      <span className="text-[10px] text-letusBlue w-3">{isExpanded ? '▼' : '▶'}</span>{row.name}
                    </td>
                    <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono text-gray-700 font-medium">{fmt(row.normal)}</td>
                    <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono text-gray-700 font-medium">{fmt(row.overtime)}</td>
                    <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono font-bold text-letusBlue bg-blue-50/10">{fmt(row.total)}</td>
                    {/* A2: 비중 막대 */}
                    <td className="p-3 border-r border-gray-200">
                      <div className="flex items-center gap-2 px-1">
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden min-w-[60px]">
                          <div className="h-full bg-letusBlue/70 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-gray-500 w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-right pr-6 font-mono font-bold text-red-500 bg-orange-50/10">{fmt(row.weighted)}</td>
                  </tr>

                  {isExpanded && row.subItems.map((sub) => (
                    <tr key={`${row.name}-${sub.subName}`} className="bg-slate-50 border-b border-gray-100 text-gray-500 animate-fade-in">
                      <td className="p-2 border-r border-gray-100 bg-slate-100/50"></td>
                      <td className="p-2 border-r border-gray-100 text-left pl-10 font-bold text-[11px] flex items-center gap-2"><span className="text-gray-400">└</span> {sub.subName}</td>
                      <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono text-[12px]">{fmt(sub.normal)}</td>
                      <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono text-[12px]">{fmt(sub.overtime)}</td>
                      <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono font-bold text-[12px] text-blue-400">{fmt(sub.total)}</td>
                      <td className="p-2 border-r border-gray-100"></td>
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
              <td className="p-4 border-r border-gray-300 text-center text-[12px] text-gray-500">100%</td>
              <td className="p-4 text-right pr-6 font-mono text-[14px] text-red-700">{totalSummary.weighted.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
};
