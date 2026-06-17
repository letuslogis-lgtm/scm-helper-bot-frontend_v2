// ===========================================================================
// 입고 실적 마감 — 집계 현황 탭
// ===========================================================================
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient.js';

const fmt = (v) => (v || 0).toLocaleString();
const todayStr = () => new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
const monthStart = () => todayStr().substring(0, 8) + '01';

const SUB_TABS = [
  { id: 'performance', label: '입고실적' },
  { id: 'transfer',    label: '반출입 집계' },
  { id: 'cut',         label: 'CUT 현황' },
];

export const InboundSummaryTab = () => {
  const [subTab,      setSubTab]      = useState('performance');
  const [startDate,   setStartDate]   = useState(monthStart());
  const [endDate,     setEndDate]     = useState(todayStr());
  const [data,        setData]        = useState([]);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => { loadData(); }, [subTab, startDate, endDate]);

  const loadData = async () => {
    setLoading(true);
    setData([]);
    try {
      let query;
      if (subTab === 'performance') {
        const { data: rows } = await supabase
          .from('inbound_performance')
          .select('brand_category, warehouse_name, 입고유형, 수량, 입고금액')
          .gte('business_date', startDate)
          .lte('business_date', endDate);
        setData(rows || []);
      } else if (subTab === 'transfer') {
        const { data: rows } = await supabase
          .from('inbound_transfer')
          .select('brand_category, transfer_type, other_warehouse, 수량, 금액')
          .gte('business_date', startDate)
          .lte('business_date', endDate);
        setData(rows || []);
      } else {
        const { data: rows } = await supabase
          .from('inbound_cut_list')
          .select('brand_category, cut_type, 공급업체명, owner, cut수량')
          .gte('business_date', startDate)
          .lte('business_date', endDate);
        setData(rows || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── 입고실적 집계 ────────────────────────────────────────────────────────
  const performanceSummary = useMemo(() => {
    if (subTab !== 'performance') return [];
    const map = {};
    data.forEach(r => {
      const key = r.brand_category || '미분류';
      if (!map[key]) map[key] = { brand: key, total수량: 0, total금액: 0, types: {} };
      map[key].total수량 += r.수량 || 0;
      map[key].total금액 += r.입고금액 || 0;
      const t = r.입고유형 || '기타';
      map[key].types[t] = (map[key].types[t] || 0) + (r.수량 || 0);
    });
    return Object.values(map).sort((a, b) => b.total수량 - a.total수량);
  }, [data, subTab]);

  const allInboundTypes = useMemo(() => {
    const set = new Set();
    data.forEach(r => { if (r.입고유형) set.add(r.입고유형); });
    return [...set].sort();
  }, [data]);

  // ── 반출입 집계 ──────────────────────────────────────────────────────────
  const transferSummary = useMemo(() => {
    if (subTab !== 'transfer') return { 반입: [], 반출: [] };
    const mkMap = (type) => {
      const map = {};
      data.filter(r => r.transfer_type === type).forEach(r => {
        const key = r.brand_category || '미분류';
        if (!map[key]) map[key] = { brand: key, 수량: 0, 금액: 0 };
        map[key].수량 += r.수량 || 0;
        map[key].금액 += r.금액 || 0;
      });
      return Object.values(map).sort((a, b) => b.수량 - a.수량);
    };
    return { 반입: mkMap('반입'), 반출: mkMap('반출') };
  }, [data, subTab]);

  // ── CUT 집계 ─────────────────────────────────────────────────────────────
  const cutSummary = useMemo(() => {
    if (subTab !== 'cut') return { 부족컷: [], 직송컷: [] };
    const mkMap = (type) => {
      const map = {};
      data.filter(r => r.cut_type === type).forEach(r => {
        const key = r.brand_category || '미분류';
        if (!map[key]) map[key] = { brand: key, cut수량: 0 };
        map[key].cut수량 += r.cut수량 || 0;
      });
      return Object.values(map).sort((a, b) => b.cut수량 - a.cut수량);
    };
    return { 부족컷: mkMap('부족컷'), 직송컷: mkMap('직송컷') };
  }, [data, subTab]);

  const totalPerf = useMemo(() =>
    performanceSummary.reduce((a, r) => ({ 수량: a.수량 + r.total수량, 금액: a.금액 + r.total금액 }), { 수량: 0, 금액: 0 })
  , [performanceSummary]);

  return (
    <div className="p-6 flex flex-col gap-4">
      {/* 날짜 범위 + 서브탭 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
          {SUB_TABS.map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={`px-4 py-1.5 rounded-md text-xs font-black transition-colors ${subTab === t.id ? 'bg-white text-letusBlue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/40" />
          <span className="text-gray-400 text-sm">~</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/40" />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm font-bold">데이터 로딩 중...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm font-bold">해당 기간의 데이터가 없습니다.</div>
      ) : (
        <>
          {/* ── 입고실적 ── */}
          {subTab === 'performance' && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-600 font-black">
                  <tr>
                    <th className="px-4 py-3">브랜드</th>
                    {allInboundTypes.map(t => <th key={t} className="px-4 py-3 text-right">{t}</th>)}
                    <th className="px-4 py-3 text-right bg-blue-50/50">총 수량</th>
                    <th className="px-4 py-3 text-right">입고금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {performanceSummary.map(r => (
                    <tr key={r.brand} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-bold text-gray-800">{r.brand}</td>
                      {allInboundTypes.map(t => (
                        <td key={t} className="px-4 py-3 text-right font-mono text-gray-600">
                          {r.types[t] ? fmt(r.types[t]) : '-'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-mono font-black text-letusBlue bg-blue-50/20">{fmt(r.total수량)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt(r.total금액)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-black border-t-2 border-gray-300 text-sm">
                    <td className="px-4 py-3 text-center tracking-wider" colSpan={1 + allInboundTypes.length}>합계</td>
                    <td className="px-4 py-3 text-right font-mono text-letusBlue">{fmt(totalPerf.수량)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(totalPerf.금액)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── 반출입 집계 ── */}
          {subTab === 'transfer' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[{ type: '반입', color: 'green' }, { type: '반출', color: 'orange' }].map(({ type, color }) => (
                <div key={type} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                  <div className={`px-4 py-2.5 border-b border-gray-100 text-xs font-black text-${color}-700 bg-${color}-50/50`}>
                    {type} 집계
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-gray-100 text-xs text-slate-500 font-black">
                      <tr>
                        <th className="px-4 py-2">브랜드</th>
                        <th className="px-4 py-2 text-right">수량</th>
                        <th className="px-4 py-2 text-right">금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {transferSummary[type].length === 0 ? (
                        <tr><td colSpan={3} className="text-center py-6 text-gray-400 text-xs">데이터 없음</td></tr>
                      ) : transferSummary[type].map(r => (
                        <tr key={r.brand} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 font-bold text-gray-800">{r.brand}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(r.수량)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-600">{fmt(r.금액)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* ── CUT 현황 ── */}
          {subTab === 'cut' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[{ type: '부족컷', color: 'red' }, { type: '직송컷', color: 'purple' }].map(({ type, color }) => (
                <div key={type} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                  <div className={`px-4 py-2.5 border-b border-gray-100 text-xs font-black text-${color}-700 bg-${color}-50/50`}>
                    {type}
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-gray-100 text-xs text-slate-500 font-black">
                      <tr>
                        <th className="px-4 py-2">브랜드</th>
                        <th className="px-4 py-2 text-right">CUT 수량</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {cutSummary[type].length === 0 ? (
                        <tr><td colSpan={2} className="text-center py-6 text-gray-400 text-xs">데이터 없음</td></tr>
                      ) : cutSummary[type].map(r => (
                        <tr key={r.brand} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 font-bold text-gray-800">{r.brand}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-red-600">{fmt(r.cut수량)}</td>
                        </tr>
                      ))}
                      {cutSummary[type].length > 0 && (
                        <tr className="bg-gray-100 font-black border-t border-gray-200 text-sm">
                          <td className="px-4 py-2.5 text-center">합계</td>
                          <td className="px-4 py-2.5 text-right font-mono text-red-700">
                            {fmt(cutSummary[type].reduce((s, r) => s + r.cut수량, 0))}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
