// ===========================================================================
// 입고 실적 마감 — 업로드 관리 탭
// ===========================================================================
import React, { useMemo, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { FILE_TYPES, TYPE_BADGE } from './constants.js';

const toKST = (d) => new Date(d + 'T00:00:00+09:00');
const dateRange = (start, end) => {
  const arr = [];
  const cur = toKST(start);
  const last = toKST(end);
  while (cur <= last) {
    arr.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return arr;
};
const weekAgo = () => {
  const d = new Date(Date.now() + 9 * 3600000);
  d.setDate(d.getDate() - 6);
  return d.toISOString().split('T')[0];
};
const todayStr = () => new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];

export const InboundUploadTab = ({ batches, onUploadClick, onDeleteBatch }) => {
  const [rangeStart, setRangeStart] = useState(weekAgo());
  const [rangeEnd,   setRangeEnd]   = useState(todayStr());
  const [deletingId, setDeletingId] = useState(null);

  // 날짜별 × 파일유형별 배치 그룹핑
  const grid = useMemo(() => {
    const days = dateRange(rangeStart, rangeEnd).reverse(); // 최신순
    return days.map(date => {
      const byType = {};
      FILE_TYPES.forEach(t => {
        byType[t.id] = batches.filter(b => b.business_date === date && b.file_type === t.id);
      });
      return { date, byType };
    });
  }, [batches, rangeStart, rangeEnd]);

  const handleDelete = async (batch) => {
    if (!window.confirm(`[${batch.file_type}] ${batch.business_date} ${batch.warehouse_name ? `(${batch.warehouse_name})` : ''} 배치를 삭제할까요?\n관련 데이터 ${batch.row_count}건이 모두 삭제됩니다.`)) return;
    setDeletingId(batch.id);
    await supabase.from('inbound_upload_batches').delete().eq('id', batch.id);
    setDeletingId(null);
    onDeleteBatch();
  };

  return (
    <div className="p-6 flex flex-col gap-4">
      {/* 날짜 범위 */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-black text-gray-600">기간</span>
        <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/40" />
        <span className="text-gray-400 text-sm">~</span>
        <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/40" />
        <button onClick={onUploadClick}
          className="ml-auto flex items-center gap-1.5 bg-letusBlue text-white text-xs font-black px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          새 파일 업로드
        </button>
      </div>

      {/* 업로드 현황 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-xs font-black text-gray-600 w-28">기준일</th>
              {FILE_TYPES.map(t => (
                <th key={t.id} className="px-4 py-3 text-xs font-black text-gray-600">{t.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grid.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">조회된 날짜가 없습니다.</td></tr>
            ) : grid.map(({ date, byType }) => (
              <tr key={date} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">{date}</td>
                {FILE_TYPES.map(t => {
                  const list = byType[t.id];
                  return (
                    <td key={t.id} className="px-4 py-3">
                      {list.length === 0 ? (
                        <span className="text-[10px] text-gray-300 font-bold">미업로드</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {list.map(b => (
                            <div key={b.id}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${TYPE_BADGE[t.id]}`}>
                              <span>{b.warehouse_name || `${b.row_count}건`}</span>
                              {b.warehouse_name && <span className="text-[9px] opacity-60">{b.row_count}건</span>}
                              <button
                                onClick={() => handleDelete(b)}
                                disabled={deletingId === b.id}
                                className="ml-0.5 opacity-40 hover:opacity-100 transition-opacity text-red-500"
                                title="배치 삭제">
                                {deletingId === b.id ? '…' : '✕'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-2">
        {FILE_TYPES.map(t => (
          <span key={t.id} className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${TYPE_BADGE[t.id]}`}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
};
