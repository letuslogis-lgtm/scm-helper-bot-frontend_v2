import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { supabase } from '../supabaseClient.js';

// ─────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────
const SHAPE_COLORS = {
    '리치':     '#4b89ff',
    '카운터':   '#22c55e',
    '하이리치': '#eab308',
    '오더피커': '#a855f7',
};
const SHAPE_ORDER   = ['리치', '카운터', '하이리치', '오더피커'];
const MAIN_CENTERS  = ['양지1', '양지2', '양지3', '안성', '평택'];
const LOCAL_LABEL   = '지방센터';
const BAR_H         = 220; // 바 차트 높이(px)

// ─────────────────────────────────────────────────────────
// 요약 카드 (카운트업 애니메이션)
// ─────────────────────────────────────────────────────────
const STAT_ICONS = {
    '전체':   'M4 6h16M4 10h16M4 14h16M4 18h16',
    '가동':   'M5 13l4 4L19 7',
    '비가동': 'M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728',
    '정상':   'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    '정비중': 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
    '고장':   'M12 8v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
};
const STAT_BORDER = {
    '전체':   'border-b-gray-300',
    '가동':   'border-b-letusBlue',
    '비가동': 'border-b-gray-400',
    '정상':   'border-b-green-500',
    '정비중': 'border-b-yellow-400',
    '고장':   'border-b-red-500',
};
const STAT_ICON_COLOR = {
    '전체':   'text-gray-300',
    '가동':   'text-blue-200',
    '비가동': 'text-gray-300',
    '정상':   'text-green-200',
    '정비중': 'text-yellow-200',
    '고장':   'text-orange-200',
};

const StatCard = ({ label, value, sub, color }) => {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        if (value === 0) { setDisplay(0); return; }
        const duration = 500;
        const steps = 40;
        const interval = duration / steps;
        let step = 0;
        const timer = setInterval(() => {
            step++;
            setDisplay(Math.round(value * (step / steps)));
            if (step >= steps) clearInterval(timer);
        }, interval);
        return () => clearInterval(timer);
    }, [value]);
    const borderColor = STAT_BORDER[label] ?? 'border-b-gray-200';
    const iconColor   = STAT_ICON_COLOR[label] ?? 'text-gray-200';
    const iconPath    = STAT_ICONS[label];
    return (
        <div className={`relative flex flex-col bg-white rounded-xl border border-gray-200 border-b-4 ${borderColor} px-4 pt-3 pb-3 overflow-hidden`}>
            {iconPath && (
                <svg className={`absolute top-3 right-3 w-7 h-7 ${iconColor}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                </svg>
            )}
            <span className="text-xs font-bold text-gray-400">{label}</span>
            <div className="flex items-end gap-1 mt-2">
                <span className={`text-3xl font-black leading-none ${color}`}>{display}</span>
                <span className="text-sm text-gray-400 mb-0.5">대</span>
            </div>
            {sub && <span className="text-[10px] text-gray-400 mt-1">{sub}</span>}
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 섹션 카드 래퍼
// ─────────────────────────────────────────────────────────
const SectionCard = ({ title, sub, children }) => (
    <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-slate-200 p-4 flex flex-col">
        <div className="mb-3">
            <span className="font-black text-gray-800 text-base">{title}</span>
            {sub && <span className="text-xs text-gray-400 ml-2">{sub}</span>}
        </div>
        {children}
    </div>
);

// ─────────────────────────────────────────────────────────
// 공통 툴팁 스타일
// ─────────────────────────────────────────────────────────
const TOOLTIP_WRAPPER = {
    zIndex: 9999,
    outline: 'none',
};

// 기본 도넛 툴팁 (자가/렌탈, 형태별)
const DefaultDonutTooltip = ({ active, payload, total }) => {
    if (!active || !payload?.length) return null;
    const { name, value, payload: p } = payload[0];
    const color = p?.color ?? '#4b89ff';
    const pct = total > 0 ? Math.round(value / total * 100) : 0;
    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[140px]">
            <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-sm font-black text-gray-800">{name}</span>
                <span className="text-sm font-bold text-gray-500 ml-auto">{value}대</span>
                <span className="text-xs text-gray-400">({pct}%)</span>
            </div>
        </div>
    );
};

// 운행상태 툴팁 — 고장/정비중은 차량 목록 + 이슈 고장유형 표시
const StatusTooltip = ({ active, payload, forklifts, issues, total }) => {
    if (!active || !payload?.length) return null;
    const { name, value, payload: p } = payload[0];
    const color = p?.color ?? '#22c55e';
    const showList = name === '고장' || name === '정비중';
    const vehicles = showList ? forklifts.filter(x => x.status === name) : [];
    const pct = total > 0 ? Math.round(value / total * 100) : 0;

    const issueMap = {};
    (issues || []).forEach(issue => {
        if (['reported', 'accepted', 'completed'].includes(issue.status)) {
            if (!issueMap[issue.forkliftId]) issueMap[issue.forkliftId] = issue;
        }
    });

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[200px] max-w-[280px]">
            <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-sm font-black text-gray-800">{name}</span>
                <span className="text-sm font-bold text-gray-500 ml-auto">{value}대</span>
                <span className="text-xs text-gray-400">({pct}%)</span>
            </div>
            {showList && vehicles.length > 0 && (
                <div className="space-y-1.5 border-t border-gray-100 pt-2 mt-1">
                    {vehicles.map(v => {
                        const issue = issueMap[v.id];
                        return (
                            <div key={v.id} className="text-xs">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-black text-gray-800">{v.no}</span>
                                    <span className="text-gray-300">·</span>
                                    <span className="text-gray-600">{v.center}</span>
                                    <span className="text-gray-300">·</span>
                                    <span className="text-gray-400">{v.manager_org}</span>
                                </div>
                                {issue?.faultType && (
                                    <div className="mt-0.5 ml-0.5 text-orange-600 font-bold">{issue.faultType}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 도넛 차트 — minAngle={18} : 작은 세그먼트도 둥근 끝 보장
// ─────────────────────────────────────────────────────────
const DonutChart = ({ data, centerValue, centerLabel, customTooltip, ccw }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    return (
    <div className="relative" style={{ height: 220 }}>
        {/* 중앙 텍스트 — z-index 낮게 설정해서 툴팁 위로 올라오지 않도록 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 1 }}>
            <span className="text-3xl font-black text-gray-800 leading-none">{centerValue}</span>
            <span className="text-xs text-gray-400 mt-1">{centerLabel}</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
            <PieChart>
                <Pie
                    data={data.filter(d => d.value > 0)}
                    cx="50%" cy="50%"
                    innerRadius={58} outerRadius={85}
                    startAngle={90} endAngle={ccw ? 450 : -270}
                    dataKey="value"
                    paddingAngle={5}
                    cornerRadius={10}
                    minAngle={18}
                    strokeWidth={0}
                >
                    {data.filter(d => d.value > 0).map((d, i) => (
                        <Cell key={i} fill={d.color} />
                    ))}
                </Pie>
                <Tooltip
                    content={customTooltip
                        ? (props) => React.cloneElement(customTooltip(props) ?? <></>, { total })
                        : (props) => <DefaultDonutTooltip {...props} total={total} />}
                    wrapperStyle={TOOLTIP_WRAPPER}
                />
            </PieChart>
        </ResponsiveContainer>
    </div>
    );
};

// ─────────────────────────────────────────────────────────
// 공통 바 툴팁 (fixed 포지션, 마우스 따라다님)
// ─────────────────────────────────────────────────────────
const BarTooltip = ({ tip }) => {
    if (!tip) return null;
    // 화면 오른쪽 끝 넘지 않도록 보정
    const left = tip.x + 16;
    const top  = tip.y - 10;
    return (
        <div style={{ position: 'fixed', left, top, zIndex: 9999, pointerEvents: 'none' }}
            className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[150px]">
            <p className="text-sm font-black text-gray-800 mb-2">{tip.title}</p>
            {tip.items.map(item => item.value > 0 && (
                <div key={item.name} className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                    <span className="text-xs text-gray-600 flex-1">{item.name}</span>
                    <span className="text-xs font-bold text-gray-800">{item.value}대</span>
                    <span className="text-[10px] text-gray-400">({tip.total > 0 ? Math.round(item.value / tip.total * 100) : 0}%)</span>
                </div>
            ))}
            <div className="border-t border-gray-100 mt-1.5 pt-1.5 flex justify-between items-center">
                <span className="text-xs text-gray-400">합계</span>
                <span className="text-sm font-black text-gray-800">{tip.total}대</span>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 관리주체별 현황 — 가로 스택 바 + 진입 애니메이션
// ─────────────────────────────────────────────────────────
const OrgBarList = ({ orgData }) => {
    const [animated, setAnimated] = useState(false);
    const tipRef = useRef(null);
    useEffect(() => {
        const t = setTimeout(() => setAnimated(true), 60);
        return () => clearTimeout(t);
    }, []);

    // tip 상태를 ref로 관리 → setTip 호출 시 리렌더링 없이 DOM 직접 업데이트
    const handleMouseEnter = useCallback((e, org) => {
        const el = tipRef.current;
        if (!el) return;
        el.style.display = 'block';
        el.style.left = (e.clientX + 16) + 'px';
        el.style.top  = (e.clientY - 10) + 'px';
        // 내용 업데이트
        const items = SHAPE_ORDER
            .filter(s => (org[s] ?? 0) > 0)
            .map(s => {
                const pct = org.total > 0 ? Math.round(org[s] / org.total * 100) : 0;
                return `<div class="flex items-center gap-2 mb-1">
                <span style="width:10px;height:10px;border-radius:50%;background:${SHAPE_COLORS[s]};flex-shrink:0;display:inline-block"></span>
                <span style="font-size:12px;color:#4b5563;flex:1">${s}</span>
                <span style="font-size:12px;font-weight:700;color:#1f2937">${org[s]}대</span>
                <span style="font-size:10px;color:#9ca3af">(${pct}%)</span>
            </div>`;
            }).join('');
        el.innerHTML = `
            <p style="font-size:14px;font-weight:900;color:#1f2937;margin-bottom:8px">${org.name}</p>
            ${items}
            <div style="border-top:1px solid #f1f5f9;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:12px;color:#9ca3af">합계</span>
                <span style="font-size:14px;font-weight:900;color:#1f2937">${org.total}대</span>
            </div>`;
    }, []);

    const handleMouseMove = useCallback((e) => {
        const el = tipRef.current;
        if (!el || el.style.display === 'none') return;
        el.style.left = (e.clientX + 16) + 'px';
        el.style.top  = (e.clientY - 10) + 'px';
    }, []);

    const handleMouseLeave = useCallback(() => {
        const el = tipRef.current;
        if (el) el.style.display = 'none';
    }, []);

    const maxTotal = useMemo(() => Math.max(...orgData.map(o => o.total), 1), [orgData]);

    // 막대 렌더링은 animated 변경 시에만 재계산 (tip 상태 변경과 분리)
    const bars = useMemo(() => orgData.map((org, orgIdx) => {
        const barPct = (org.total / maxTotal) * 100; // 전체 바 너비 비율
        return (
            <div key={org.name}>
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-700">{org.name}</span>
                    <span className="text-xs font-black text-gray-800"
                        style={{
                            opacity: animated ? 1 : 0,
                            transition: `opacity 0.3s ease ${orgIdx * 0.12 + 0.5}s`,
                        }}>
                        {org.total}대
                    </span>
                </div>
                {/* 배경 트랙 */}
                <div className="relative h-4 rounded overflow-hidden bg-gray-100"
                    onMouseEnter={e => handleMouseEnter(e, org)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                >
                    {/* 비율만큼 채워지는 색상 바 */}
                    <div className="absolute left-0 top-0 h-full flex overflow-hidden rounded"
                        style={{
                            width: animated ? `${barPct}%` : '0%',
                            transition: `width 0.65s cubic-bezier(0.34, 1.4, 0.64, 1) ${orgIdx * 0.12}s`,
                        }}>
                        {SHAPE_ORDER.map((shape, shapeIdx) => {
                            const pct = org.total > 0 ? (org[shape] / org.total) * 100 : 0;
                            if (!pct) return null;
                            const delay = orgIdx * 0.12 + shapeIdx * 0.04;
                            return (
                                <div key={shape}
                                    style={{
                                        width: `${pct}%`,
                                        background: SHAPE_COLORS[shape],
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
                <div className="flex gap-2 mt-1 flex-wrap">
                    {SHAPE_ORDER.map(shape => org[shape] > 0 && (
                        <span key={shape} className="text-[10px] font-bold"
                            style={{
                                color: SHAPE_COLORS[shape],
                                opacity: animated ? 1 : 0,
                                transition: `opacity 0.3s ease ${orgIdx * 0.12 + 0.5}s`,
                            }}>
                            {shape} {org[shape]}대
                        </span>
                    ))}
                </div>
            </div>
        );
    }), [orgData, maxTotal, animated, handleMouseEnter, handleMouseMove, handleMouseLeave]);

    return (
        <div className="space-y-3 mt-1">
            {/* ref로 직접 제어하는 툴팁 — React 리렌더링 없이 위치/내용 업데이트 */}
            <div ref={tipRef} style={{
                display: 'none',
                position: 'fixed',
                zIndex: 9999,
                pointerEvents: 'none',
            }} className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[150px]" />
            {bars}
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 관리주체별 가동현황 — 작업완료/운행중/미운행 스택 바
// ─────────────────────────────────────────────────────────
const OP_COLORS = { finished: '#22c55e', inProgress: '#4b89ff', unchecked: '#d1d5db' };
const OP_LABELS = { finished: '작업완료', inProgress: '운행중', unchecked: '미운행' };

const OpOrgBarList = ({ orgs }) => {
    const [animated, setAnimated] = useState(false);
    const tipRef = useRef(null);
    useEffect(() => {
        const t = setTimeout(() => setAnimated(true), 60);
        return () => clearTimeout(t);
    }, []);

    const handleMouseEnter = useCallback((e, org) => {
        const el = tipRef.current;
        if (!el) return;
        el.style.display = 'block';
        el.style.left = (e.clientX + 16) + 'px';
        el.style.top  = (e.clientY - 10) + 'px';
        const rows = ['finished', 'inProgress', 'unchecked'].map(k => {
            const pct = org.total > 0 ? Math.round(org[k] / org.total * 100) : 0;
            return `<div class="flex items-center gap-2 mb-1">
                <span style="width:10px;height:10px;border-radius:50%;background:${OP_COLORS[k]};flex-shrink:0;display:inline-block"></span>
                <span style="font-size:12px;color:#4b5563;flex:1">${OP_LABELS[k]}</span>
                <span style="font-size:12px;font-weight:700;color:#1f2937">${org[k]}대</span>
                <span style="font-size:10px;color:#9ca3af">(${pct}%)</span>
            </div>`;
        }).join('');
        el.innerHTML = `
            <p style="font-size:14px;font-weight:900;color:#1f2937;margin-bottom:8px">${org.name}</p>
            ${rows}
            <div style="border-top:1px solid #f1f5f9;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:12px;color:#9ca3af">합계</span>
                <span style="font-size:14px;font-weight:900;color:#1f2937">${org.total}대</span>
            </div>`;
    }, []);

    const handleMouseMove = useCallback((e) => {
        const el = tipRef.current;
        if (!el || el.style.display === 'none') return;
        el.style.left = (e.clientX + 16) + 'px';
        el.style.top  = (e.clientY - 10) + 'px';
    }, []);

    const handleMouseLeave = useCallback(() => {
        const el = tipRef.current;
        if (el) el.style.display = 'none';
    }, []);

    const bars = useMemo(() => (orgs || []).map((org, i) => {
        const opPct = org.total > 0 ? Math.round((org.finished + org.inProgress) / org.total * 100) : 0;
        return (
            <div key={org.name}>
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-700">{org.name}</span>
                    <span className="text-xs font-black text-gray-800"
                        style={{ opacity: animated ? 1 : 0, transition: `opacity 0.3s ease ${i * 0.12 + 0.5}s` }}>
                        {org.finished + org.inProgress}/{org.total}대
                        <span className="text-[10px] font-bold text-letusBlue ml-1">({opPct}%)</span>
                    </span>
                </div>
                <div className="relative h-4 rounded overflow-hidden bg-gray-100"
                    onMouseEnter={e => handleMouseEnter(e, org)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}>
                    <div className="absolute left-0 top-0 h-full flex overflow-hidden rounded"
                        style={{
                            width: animated ? '100%' : '0%',
                            transition: `width 0.65s cubic-bezier(0.34, 1.4, 0.64, 1) ${i * 0.12}s`,
                        }}>
                        {['finished', 'inProgress', 'unchecked'].map(k => {
                            const pct = org.total > 0 ? (org[k] / org.total) * 100 : 0;
                            if (!pct) return null;
                            return <div key={k} style={{ width: `${pct}%`, background: OP_COLORS[k] }} />;
                        })}
                    </div>
                </div>
            </div>
        );
    }), [orgs, animated, handleMouseEnter, handleMouseMove, handleMouseLeave]);

    return (
        <div className="space-y-3 mt-1">
            <div ref={tipRef} style={{ display: 'none', position: 'fixed', zIndex: 9999, pointerEvents: 'none' }}
                className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[150px]" />
            {bars}
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 센터별 장비 현황 — 바 차트와 표를 하나의 테이블로 정렬
// ─────────────────────────────────────────────────────────
const CenterBarTable = ({ centerGroups }) => {
    const maxTotal = useMemo(
        () => Math.max(...centerGroups.map(g => g.items.length), 1),
        [centerGroups]
    );
    const allItems = useMemo(() => centerGroups.flatMap(g => g.items), [centerGroups]);
    const COL_COUNT = 1 + centerGroups.length + 1;

    // ── 진입 애니메이션: 마운트 직후 animated=true → 높이 0→실제값 트랜지션
    const [animated, setAnimated] = useState(false);
    const [tip, setTip] = useState(null);
    useEffect(() => {
        const t = setTimeout(() => setAnimated(true), 60);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="w-full overflow-x-auto">
            <BarTooltip tip={tip} />
            <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
                <colgroup>
                    {Array.from({ length: COL_COUNT }).map((_, i) => (
                        <col key={i} style={{ width: `${100 / COL_COUNT}%` }} />
                    ))}
                </colgroup>

                <tbody>
                    {/* ── 바 차트 행 */}
                    <tr>
                        {/* 범례 열 */}
                        <td style={{ height: BAR_H, verticalAlign: 'bottom', paddingBottom: 0 }}>
                            <div className="flex flex-col gap-1 justify-end pb-1" style={{ height: BAR_H }}>
                                {SHAPE_ORDER.map(s => (
                                    <div key={s} className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: SHAPE_COLORS[s] }} />
                                        <span className="text-[10px] font-bold text-gray-500 leading-none">{s}</span>
                                    </div>
                                ))}
                            </div>
                        </td>

                        {/* 센터별 바 — colIdx 순서로 딜레이 적용 */}
                        {centerGroups.map(({ label, items }, colIdx) => {
                            const total = items.length;
                            // 센터마다 80ms씩 늦게 올라옴
                            const colDelay = colIdx * 0.08;

                            return (
                                <td key={label}
                                    style={{ height: BAR_H, verticalAlign: 'bottom', textAlign: 'center', paddingBottom: 0, cursor: 'default' }}
                                    onMouseEnter={e => setTip({
                                        x: e.clientX, y: e.clientY,
                                        title: label,
                                        items: SHAPE_ORDER.map(s => ({ name: s, value: items.filter(x => x.shape === s).length, color: SHAPE_COLORS[s] })),
                                        total,
                                    })}
                                    onMouseMove={e => setTip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev)}
                                    onMouseLeave={() => setTip(null)}
                                >
                                    <div style={{ height: BAR_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                                        {/* 합계 숫자 — 바와 함께 페이드인 */}
                                        {total > 0 && (
                                            <span className="text-xs font-black text-gray-600 mb-0.5"
                                                style={{
                                                    opacity: animated ? 1 : 0,
                                                    transition: `opacity 0.3s ease ${colDelay + 0.5}s`,
                                                }}>
                                                {total}
                                            </span>
                                        )}
                                        {/* 스택 바 */}
                                        <div style={{
                                            width: 36,
                                            display: 'flex',
                                            flexDirection: 'column-reverse',
                                            borderRadius: '4px 4px 0 0',
                                            overflow: 'hidden',
                                        }}>
                                            {SHAPE_ORDER.map((shape, shapeIdx) => {
                                                const cnt = items.filter(x => x.shape === shape).length;
                                                if (!cnt) return null;
                                                const targetH = Math.round((cnt / maxTotal) * (BAR_H - 24));
                                                // 각 세그먼트마다 미세하게 딜레이 추가
                                                const segDelay = colDelay + shapeIdx * 0.03;
                                                return (
                                                    <div key={shape}
                                                        style={{
                                                            height: animated ? targetH : 0,
                                                            minHeight: 0,
                                                            background: SHAPE_COLORS[shape],
                                                            // 스프링감 있는 이징
                                                            transition: `height 0.65s cubic-bezier(0.34, 1.4, 0.64, 1) ${segDelay}s`,
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                </td>
                            );
                        })}

                        {/* 합계 열 */}
                        <td style={{ height: BAR_H }} />
                    </tr>

                    {/* ── 구분선 */}
                    <tr>
                        <td colSpan={COL_COUNT}
                            style={{ borderTop: '2px solid #e2e8f0', padding: 0 }} />
                    </tr>

                    {/* ── 헤더 행: 형태 | 센터들 | 합계 */}
                    <tr style={{ background: '#f8fafc' }}>
                        <td className="py-1.5 px-2 text-xs font-bold text-gray-400 text-left">센터</td>
                        {centerGroups.map(({ label }) => (
                            <td key={label} className="py-1.5 px-1 text-xs font-bold text-gray-600 text-center">{label}</td>
                        ))}
                        <td className="py-1.5 px-2 text-xs font-bold text-gray-600 text-center">합계</td>
                    </tr>

                    {/* ── 형태별 행 */}
                    {SHAPE_ORDER.map(shape => {
                        const rowTotal = allItems.filter(x => x.shape === shape).length;
                        return (
                            <tr key={shape} style={{ borderTop: '1px solid #f1f5f9' }}>
                                <td className="py-1.5 px-2 text-xs font-bold text-left"
                                    style={{ color: SHAPE_COLORS[shape] }}>
                                    {shape}
                                </td>
                                {centerGroups.map(({ label, items }) => {
                                    const cnt = items.filter(x => x.shape === shape).length;
                                    return (
                                        <td key={label} className="py-1.5 px-1 text-xs font-bold text-center"
                                            style={{ color: cnt > 0 ? SHAPE_COLORS[shape] : '#d1d5db' }}>
                                            {cnt > 0 ? cnt : '-'}
                                        </td>
                                    );
                                })}
                                <td className="py-1.5 px-2 text-xs font-black text-gray-700 text-center">{rowTotal || '-'}</td>
                            </tr>
                        );
                    })}

                    {/* ── 합계 행 */}
                    <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                        <td className="py-2 px-2 text-xs font-black text-gray-600 text-left">합계</td>
                        {centerGroups.map(({ label, items }) => (
                            <td key={label} className="py-2 px-1 text-xs font-black text-gray-800 text-center">
                                {items.length}
                            </td>
                        ))}
                        <td className="py-2 px-2 text-xs font-black text-gray-800 text-center">{allItems.length}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────
export const ForkliftDashboard = ({ userProfile }) => {
    const [rawData, setData] = useState([]);
    const [issues, setIssues] = useState([]);
    const [todayChecks, setTodayChecks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const todayStr = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();

    useEffect(() => {
        const fetch = async () => {
            setIsLoading(true);
            const [{ data: forklifts }, { data: issuesData }, { data: checksData }] = await Promise.all([
                supabase.from('forklifts').select('*'),
                supabase.from('forklift_issues').select('*'),
                supabase.from('forklift_daily_checks').select('forklift_id, post_op').eq('check_date', todayStr)
            ]);
            setData(forklifts || []);
            setIssues(issuesData || []);
            setTodayChecks(checksData || []);
            setIsLoading(false);
        };
        fetch();
    }, [todayStr]);

    // 반납·매각 제외한 운영 중 데이터만 집계
    const data = useMemo(() => rawData.filter(x => x.status !== '반납' && x.status !== '매각'), [rawData]);

    // 오늘 일일점검 기반 가동 현황
    const opStats = useMemo(() => {
        const checkedIds = new Set(todayChecks.map(c => c.forklift_id));
        const finishedIds = new Set(todayChecks.filter(c => c.post_op && Array.isArray(c.post_op) && c.post_op.length > 0).map(c => c.forklift_id));
        const operating  = data.filter(f => checkedIds.has(f.id)).length;
        const finished   = data.filter(f => finishedIds.has(f.id)).length;
        const unchecked  = data.length - operating;
        const inProgress = operating - finished;

        const ORG_ORDER_OP = ['바로서비스', '하나물류', '에프스토리', '한국사람들', 'IPC', 'J&T'];
        const orgs = [...new Set(data.map(x => x.manager_org))].filter(Boolean);
        const sortedOrgs = [...ORG_ORDER_OP.filter(o => orgs.includes(o)), ...orgs.filter(o => !ORG_ORDER_OP.includes(o))];
        const byOrg = sortedOrgs.map(org => {
            const items = data.filter(x => x.manager_org === org);
            const fin = items.filter(f => finishedIds.has(f.id)).length;
            const inp = items.filter(f => checkedIds.has(f.id) && !finishedIds.has(f.id)).length;
            const unc = items.length - fin - inp;
            return { name: org, total: items.length, finished: fin, inProgress: inp, unchecked: unc };
        });

        return { operating, finished, unchecked, inProgress, byOrg };
    }, [data, todayChecks]);

    const stats = useMemo(() => ({
        total:  data.length,
        own:    data.filter(x => x.own_type === '자가').length,
        rental: data.filter(x => x.own_type === '렌탈').length,
        normal: data.filter(x => x.status   === '정상').length,
        repair: data.filter(x => x.status   === '정비중').length,
        fault:  data.filter(x => x.status   === '고장').length,
    }), [data]);

    const ownDonut = [
        { name: '자가', value: stats.own,    color: '#f58220' },
        { name: '렌탈', value: stats.rental, color: '#4b89ff' },
    ];
    const statusDonut = [
        { name: '정상',   value: stats.normal, color: '#22c55e' },
        { name: '정비중', value: stats.repair, color: '#facc15' },
        { name: '고장',   value: stats.fault,  color: '#ef4444' },
    ];

    const centerGroups = useMemo(() => [
        ...MAIN_CENTERS.map(c => ({ label: c, items: data.filter(x => x.center === c) })),
        { label: LOCAL_LABEL, items: data.filter(x => !MAIN_CENTERS.includes(x.center)) },
    ], [data]);

    const ORG_ORDER = ['바로서비스', '하나물류', '에프스토리', '한국사람들', 'IPC', 'J&T'];
    const orgData = useMemo(() => {
        const orgs = [...new Set(data.map(x => x.manager_org))].filter(Boolean);
        const sorted = [
            ...ORG_ORDER.filter(o => orgs.includes(o)),
            ...orgs.filter(o => !ORG_ORDER.includes(o)),
        ];
        return sorted.map(org => {
            const items = data.filter(x => x.manager_org === org);
            const row = { name: org, total: items.length };
            SHAPE_ORDER.forEach(s => { row[s] = items.filter(x => x.shape === s).length; });
            return row;
        });
    }, [data]);

    // 전체 월 가동률 (최근 6개월, 이번달 오늘치만 실데이터)
    const monthlyOpRate = useMemo(() => {
        const DAILY_SEED = [65,72,80,75,88,70,55,60,78,83,90,68,74,77,82,86,71,69,84,91,73,66,79,85,76,81,87,64,70,78];
        const MONTH_SEED = [76, 81, 85, 79, 88, 83, 78, 90, 84, 80, 86, 91, 74, 82, 87, 77, 83, 89];
        const today = new Date();
        const checkedIds = new Set(todayChecks.map(c => c.forklift_id));
        return Array.from({ length: 6 }, (_, i) => {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() - (5 - i));
            const month = `${d.getMonth()+1}월`;
            if (i === 5) {
                const dayCount = today.getDate();
                let total = 0;
                for (let day = 1; day <= dayCount; day++) {
                    const dd = new Date(today.getFullYear(), today.getMonth(), day);
                    const ds = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
                    if (ds === todayStr) {
                        const doneCount = data.filter(f => checkedIds.has(f.id)).length;
                        total += data.length > 0 ? Math.round(doneCount / data.length * 100) : 0;
                    } else {
                        total += DAILY_SEED[(day - 1) % DAILY_SEED.length];
                    }
                }
                return { month, 가동률: Math.round(total / dayCount) };
            }
            return { month, 가동률: MONTH_SEED[i % MONTH_SEED.length] };
        });
    }, [data, todayStr, todayChecks]);

    const ORG_LINE_COLORS = ['#4b89ff', '#22c55e', '#f58220', '#a855f7', '#eab308', '#ef4444'];
    const orgLineKeys = useMemo(() => {
        const order = ['바로서비스', '하나물류', '에프스토리', '한국사람들', 'IPC', 'J&T'];
        return order.filter(o => data.some(f => f.manager_org === o));
    }, [data]);

    const [lineView, setLineView] = useState('월간');

    // 전체 일간 가동률 (최근 30일, 오늘치만 실데이터)
    const dailyOpRate = useMemo(() => {
        const SEED = [65,72,80,75,88,70,55,60,78,83,90,68,74,77,82,86,71,69,84,91,73,66,79,85,76,81,87,64,70,78];
        const checkedIds = new Set(todayChecks.map(c => c.forklift_id));
        return Array.from({ length: 30 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (29 - i));
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const label = `${d.getMonth()+1}/${d.getDate()}`;
            if (dateStr === todayStr) {
                const doneCount = data.filter(f => checkedIds.has(f.id)).length;
                return { day: label, 가동률: data.length > 0 ? Math.round(doneCount / data.length * 100) : 0 };
            }
            return { day: label, 가동률: SEED[i % SEED.length] };
        });
    }, [data, todayStr, todayChecks]);

    return (
        <div className="h-full overflow-auto custom-scrollbar bg-slate-100">
            <div className="p-6 flex flex-col gap-5">

                {/* ── 1행: 요약 카드 */}
                <div className="grid grid-cols-6 gap-3">
                    <StatCard label="전체"   value={stats.total}        color="text-gray-800" />
                    <StatCard label="가동"   value={opStats.operating}  color="text-letusBlue"
                        sub={`가동률 ${stats.total ? Math.round(opStats.operating / stats.total * 100) : 0}%`} />
                    <StatCard label="비가동" value={opStats.unchecked}  color="text-gray-500"
                        sub={`전체의 ${stats.total ? Math.round(opStats.unchecked / stats.total * 100) : 0}%`} />
                    <StatCard label="정상"   value={stats.normal}       color="text-green-600"
                        sub={`전체의 ${stats.total ? Math.round(stats.normal / stats.total * 100) : 0}%`} />
                    <StatCard label="정비중" value={stats.repair}       color="text-yellow-600"
                        sub={`전체의 ${stats.total ? Math.round(stats.repair / stats.total * 100) : 0}%`} />
                    <StatCard label="고장"   value={stats.fault}        color="text-red-600"
                        sub={`전체의 ${stats.total ? Math.round(stats.fault  / stats.total * 100) : 0}%`} />
                </div>

                {/* ── 2행: 오늘가동현황 | 관리주체별가동현황 | 관리주체별 월 가동률 */}
                <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 2fr 3fr' }}>

                    {/* 오늘 가동 현황 도넛 */}
                    <SectionCard title="오늘 가동 현황" sub={`일일점검 시작 기준 · ${todayStr.slice(2).replace(/-/g, '.')}`}>
                        <div className="mt-10">
                        <DonutChart
                            data={[
                                { name: '작업완료', value: opStats.finished,   color: '#22c55e' },
                                { name: '운행중',   value: opStats.inProgress, color: '#4b89ff' },
                                { name: '미운행',   value: opStats.unchecked,  color: '#d1d5db' },
                            ]}
                            centerValue={`${data.length > 0 ? Math.round(opStats.operating / data.length * 100) : 0}%`}
                            centerLabel="가동률"
                        />
                        </div>
                        <div className="flex justify-center gap-5 mt-1 flex-wrap">
                            <div className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-green-500" />
                                <span className="text-xs font-bold text-gray-500">작업완료</span>
                                <span className="text-sm font-black text-green-600">{opStats.finished}대</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-letusBlue" />
                                <span className="text-xs font-bold text-gray-500">운행중</span>
                                <span className="text-sm font-black text-letusBlue">{opStats.inProgress}대</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full bg-gray-300" />
                                <span className="text-xs font-bold text-gray-500">미운행</span>
                                <span className="text-sm font-black text-gray-500">{opStats.unchecked}대</span>
                            </div>
                        </div>
                    </SectionCard>

                    {/* 관리주체별 가동현황 막대 */}
                    <SectionCard title="관리주체별 가동현황" sub={`일일점검 기준 · ${todayStr.slice(2).replace(/-/g, '.')}`}>
                        <OpOrgBarList orgs={opStats.byOrg} />
                    </SectionCard>

                    {/* 전체 가동률 추이 꺾은선 */}
                    <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-slate-200 p-4 flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <span className="font-black text-gray-800 text-sm">전체 가동률 추이</span>
                                <span className="text-xs text-gray-400 ml-2">
                                    {lineView === '월간' ? '최근 6개월' : '최근 30일'} · 일일점검 시작 기준
                                </span>
                            </div>
                            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-bold">
                                {['일간', '월간'].map(v => (
                                    <button key={v} onClick={() => setLineView(v)}
                                        className={`px-3 py-1 transition-colors ${lineView === v ? 'bg-letusBlue text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={270}>
                            <LineChart
                                data={lineView === '월간' ? monthlyOpRate : dailyOpRate}
                                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                <XAxis
                                    dataKey={lineView === '월간' ? 'month' : 'day'}
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    axisLine={false} tickLine={false}
                                    interval={lineView === '일간' ? 4 : 0}
                                />
                                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`}
                                    tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    formatter={(value) => [`${value}%`, '가동률']}
                                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: 12 }}
                                    labelStyle={{ fontWeight: 900, color: '#1e293b', marginBottom: 4 }}
                                />
                                <Line type="monotone" dataKey="가동률"
                                    stroke="#4b89ff" strokeWidth={2.5}
                                    dot={lineView === '월간' ? { r: 4, fill: '#4b89ff' } : false}
                                    activeDot={{ r: 6, fill: '#4b89ff' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* ── 3행: 장비상태현황 | 자가/렌탈 | 형태별 비율 */}
                <div className="grid grid-cols-3 gap-4">
                    {/* 장비상태 현황 */}
                    <SectionCard title="장비상태 현황">
                        <div className="mt-6">
                        <DonutChart
                            data={statusDonut}
                            centerValue={stats.total}
                            centerLabel="총 대수"
                            customTooltip={(props) => <StatusTooltip {...props} forklifts={data} issues={issues} total={stats.total} />}
                        />
                        </div>
                        <div className="flex justify-center gap-3 mt-1 flex-wrap">
                            {statusDonut.map(d => (
                                <div key={d.name} className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                                    <span className="text-xs font-bold text-gray-500">{d.name}</span>
                                    <span className="text-sm font-black text-gray-800">{d.value}대</span>
                                </div>
                            ))}
                        </div>
                    </SectionCard>

                    {/* 자가 / 렌탈 비율 */}
                    <SectionCard title="자가 / 렌탈 비율">
                        <div className="mt-6">
                        <DonutChart data={ownDonut} centerValue={stats.total} centerLabel="총 대수" ccw />
                        </div>
                        <div className="flex justify-center gap-5 mt-1 flex-wrap">
                            {ownDonut.map(d => (
                                <div key={d.name} className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                                    <span className="text-xs font-bold text-gray-500">{d.name}</span>
                                    <span className="text-sm font-black text-gray-800">{d.value}대</span>
                                </div>
                            ))}
                        </div>
                    </SectionCard>

                    {/* 형태별 비율 */}
                    <SectionCard title="형태별 비율">
                        <div className="mt-6">
                        <DonutChart
                            data={SHAPE_ORDER.map(s => ({
                                name: s,
                                value: data.filter(x => x.shape === s).length,
                                color: SHAPE_COLORS[s],
                            }))}
                            centerValue={stats.total}
                            centerLabel="총 대수"
                        />
                        </div>
                        <div className="flex justify-center gap-3 mt-1 flex-wrap">
                            {SHAPE_ORDER.map(s => {
                                const cnt = data.filter(x => x.shape === s).length;
                                return (
                                    <div key={s} className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 rounded-full" style={{ background: SHAPE_COLORS[s] }} />
                                        <span className="text-xs font-bold text-gray-500">{s}</span>
                                        <span className="text-sm font-black text-gray-800">{cnt}대</span>
                                    </div>
                                );
                            })}
                        </div>
                    </SectionCard>
                </div>

                {/* ── 3행: 센터별 장비현황 | 관리주체별 현황 */}
                <div className="grid gap-4" style={{ gridTemplateColumns: '3fr 2fr' }}>

                    {/* 센터별 장비 현황 */}
                    <SectionCard title="센터별 장비 현황"
                        sub="지방센터 = 대전·대구·광주 외 7개소 합산">
                        <CenterBarTable centerGroups={centerGroups} />
                    </SectionCard>

                    {/* 관리주체별 현황 */}
                    <SectionCard title="관리주체별 현황">
                        <OrgBarList orgData={orgData} />
                    </SectionCard>

                </div>
            </div>
        </div>
    );
};
