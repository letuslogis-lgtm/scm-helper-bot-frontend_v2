// ===========================================================================
// 일별 상세 내역 탭 (지원/파견 관리) — 테이블 UI 표준 (presentational)
// ===========================================================================
import React from 'react';
import { DETAIL_COLUMNS } from './constants.js';

const renderCell = (origIdx, row, colWidths) => {
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

export const AttendanceDetailTab = ({ rows, table, selectedIds, onSelectAll, onSelectOne }) => {
  const {
    colOrder, colWidths, dragOverIdx, wasDraggedRef,
    getSortIcon, requestSort,
    handleResizeStart, handleDragStart, handleDragOver, handleDrop, handleDragEnd, setDragOverIdx,
  } = table;

  return (
    <div className="flex flex-col gap-4 mt-2 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto outline-none">
          <table className="w-full text-left whitespace-nowrap table-fixed">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-bold sticky top-0 z-10">
              <tr>
                <th className="p-4 pl-6 w-10 text-center border-r border-slate-100">
                  <input type="checkbox" checked={selectedIds.length === rows.length && rows.length > 0} onChange={onSelectAll} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                </th>
                {colOrder.map((origIdx, visualIdx) => {
                  const col = DETAIL_COLUMNS[origIdx];
                  return (
                    <th key={origIdx}
                      className={`relative p-4 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                      style={{ width: colWidths[origIdx] }}
                      draggable
                      onClick={() => !wasDraggedRef.current && col.key && requestSort(col.key)}
                      onDragStart={(e) => handleDragStart(e, visualIdx)}
                      onDragEnd={handleDragEnd}
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
              {rows.length === 0 ? (
                <tr><td colSpan={colOrder.length + 1} className="text-center py-10 text-gray-400 font-bold">조건에 맞는 데이터가 없습니다.</td></tr>
              ) : (
                rows.map((row) => {
                  const isSelected = selectedIds.includes(row.id);
                  return (
                    <tr key={row.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                      onClick={(e) => onSelectOne(e, row.id)}>
                      <td className="p-4 pl-6 text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={(e) => onSelectOne(e, row.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                      </td>
                      {colOrder.map(origIdx => renderCell(origIdx, row, colWidths))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
