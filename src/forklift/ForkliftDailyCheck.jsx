import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient.js';
import { usePermissions } from '../hooks/usePermissions.js';
import { DateRangeInput } from '../SharedUI.jsx';

const CENTER_ORDER = ['양지1','양지2','양지3','안성','평택','음성','대전','대구','부산','광주','전북','전남','울산','창원','기장','제주','이케아'];
const sortCenters = arr => [...arr].sort((a, b) => { const ia = CENTER_ORDER.indexOf(a); const ib = CENTER_ORDER.indexOf(b); if (ia === -1 && ib === -1) return a.localeCompare(b); if (ia === -1) return 1; if (ib === -1) return -1; return ia - ib; });

// ── 체크리스트 정의 (항목 수 기준)
const CHECK_COUNTS = { exterior: 5, preOp: 8, postOp: 4 };
const TOTAL_PRE  = CHECK_COUNTS.exterior + CHECK_COUNTS.preOp; // 14
const TOTAL_POST = CHECK_COUNTS.postOp;                         // 5
const EXCLUDE_STATUSES = ['반납', '매각'];

// ── 날짜 유틸
const fmtDate = (d) => {
    const [y, m, day] = d.split('-');
    return `${String(y).slice(2)}.${m}.${day}`;
};
const fmtTime = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
const diffHours = (start, end) => {
    if (!start || !end) return null;
    const diff = (new Date(end) - new Date(start)) / 1000 / 60;
    if (diff <= 0) return null;
    const h = Math.floor(diff / 60);
    const m = Math.round(diff % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const toDateStr = (d) => {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// ── 인쇄 HTML 빌더 헬퍼
const pFmt = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
const chkIcon = (val) => val === true ? '<span style="color:#16a34a;font-weight:700">○</span>' : val === false ? '<span style="color:#dc2626;font-weight:700">✕</span>' : '<span style="color:#aaa">-</span>';

const buildPrintHtml = (body, landscape) => `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>지게차 일일점검표</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:13px;color:#111;background:#fff}
.sheet{padding:12mm 14mm;page-break-after:always;page-break-inside:avoid;border-bottom:1px dashed #ccc}
.sheet:last-child{border-bottom:none;page-break-after:auto}
.sheet-daily{width:210mm}
.sheet-monthly{width:${landscape?'297mm':'210mm'}}
h2{font-size:17px;font-weight:700;text-align:center;margin-bottom:12px}
.meta{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:12px;margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid #ccc}
.meta span{color:#555}
.meta strong{color:#111}
.section{margin-bottom:9px}
.section-title{font-size:13px;font-weight:700;background:#f3f4f6;padding:5px 9px;border-left:3px solid #4b89ff;margin-bottom:4px}
.check-table{width:100%;border-collapse:collapse;font-size:12px}
.check-table td{border:0.5px solid #ccc;padding:6px 8px;vertical-align:middle;height:26px}
.check-table td:first-child{width:24px;text-align:center}
.check-table td:last-child{width:52px;text-align:center;font-weight:700}
.sig-row{display:flex;gap:16px;margin-top:12px}
.sig-box{flex:1;border:0.5px solid #ccc;border-radius:4px;padding:10px 14px;min-height:58px;font-size:12px;color:#555}
.sig-box strong{display:block;margin-bottom:10px;color:#111;font-size:14px;font-weight:700}
.sig-val{color:#111;font-size:13px;font-weight:700}
.sig-sub{color:#888;font-size:11px;margin-top:4px}
.mt-table{width:100%;border-collapse:collapse;table-layout:auto}
.mt-table td,.mt-table th{text-align:center;padding:3px 2px;font-size:9px;border:0.5px solid #ccc;height:20px}
.mt-table th{background:#f3f4f6;font-weight:700}
.mt-table .item-col{text-align:left;padding:3px 7px;font-size:8.5px;white-space:nowrap;width:1px}
.mt-table .day-col{width:${landscape?'7.5mm':'5.8mm'}}
.ng-cell{background:#fff0f0 !important;color:#dc2626;font-weight:700}
.ok-cell{color:#16a34a}
.unc-cell{color:#ccc}
.note-section{margin-top:10px;font-size:10px}
.note-item{padding:4px 9px;background:#fffbeb;border-left:2px solid #f59e0b;margin-bottom:3px;font-size:9.5px}
.fault-note-row td{background:#fff8f0 !important;font-size:8.5px;color:#555;text-align:left;padding:3px 8px;border-top:none}
@media print{.sheet{border-bottom:none}${landscape?'@page{size:A4 landscape}':'@page{size:A4 portrait}'}}
</style></head><body>${body}</body></html>`;

const buildDailySheet = (f, record, approval, dateStr, dateLabel) => {
    // record는 Supabase row: pre_exterior, pre_op, post_op 등 snake_case
    const preExterior = record?.pre_exterior || null;
    const preOp       = record?.pre_op       || null;
    const postOp      = record?.post_op      || null;
    const status      = getCheckStatus(record);
    const statusLabel = { done: '완료', inProgress: '운행중', unchecked: '미점검' }[status];

    const driverNote   = record?.notes  || '';
    const managerNote  = approval?.note || '';

    const mkRow = (item, val, isLast) => {
        const isFault = val === false;
        const resultTd = `<td>${val===true?'정상':val===false?'<span style="color:#dc2626">불량</span>':'-'}</td>`;
        const mainRow = `<tr${isFault?' style="background:#fff8f8"':''}><td>${chkIcon(val)}</td><td>${item}</td>${resultTd}</tr>`;
        if (!isFault) return mainRow;
        const noteContent = [
            driverNote   ? `<span style="color:#555"><strong>탑승자 메모:</strong> ${driverNote}</span>`   : '',
            managerNote  ? `<span style="color:#166534;margin-left:16px"><strong>관리자 조치:</strong> ${managerNote}</span>` : '',
        ].filter(Boolean).join('');
        return mainRow + (noteContent
            ? `<tr class="fault-note-row"><td></td><td colspan="2">${noteContent}</td></tr>`
            : '');
    };

    const extRows  = EXTERIOR_ITEMS.map((item, i) => mkRow(item, preExterior?.[i]?.checked)).join('');
    const preRows  = PREOP_ITEMS.map((item, i)    => mkRow(item, preOp?.[i]?.checked)).join('');
    const postRows = POSTOP_ITEMS.map((item, i)   => mkRow(item, postOp?.[i]?.checked)).join('');

    const driverName   = record?.checker_name || '-';
    const endDatetime  = record?.post_op ? `${dateLabel} ${pFmt(record.updated_at)}` : dateLabel;
    const approverName = record?.approved_by || '';
    const approveTime  = record?.approved_at ? `${dateLabel} ${pFmt(record.approved_at)}` : '';

    return `<div class="sheet sheet-daily">
<h2>지게차 일일점검표 (산업안전보건법 제38조)</h2>
<div class="meta">
  <span><strong>일자</strong> ${dateLabel}</span>
  <span><strong>장비번호</strong> ${f.no}</span>
  <span><strong>센터</strong> ${f.center}</span>
  <span><strong>관리주체</strong> ${f.manager_org}</span>
  <span><strong>탑승자</strong> ${driverName}</span>
  <span><strong>점검상태</strong> ${statusLabel}</span>
</div>

<div class="section">
<div class="section-title">① 외관점검 (운행 전)</div>
<table class="check-table"><tbody>${extRows}</tbody></table>
</div>

<div class="section">
<div class="section-title">② 운행 전 점검</div>
<table class="check-table"><tbody>${preRows}</tbody></table>
</div>

<div class="section">
<div class="section-title">③ 작업 완료 후 점검</div>
<table class="check-table"><tbody>${record?.post_op ? postRows : '<tr><td colspan="3" style="text-align:center;color:#aaa;padding:10px">미완료</td></tr>'}</tbody></table>
</div>

${record?.notes ? `<div style="margin:8px 0;padding:6px 9px;background:#fffbeb;border:0.5px solid #fbbf24;border-radius:4px;font-size:11px;color:#555"><strong style="color:#92400e">특이사항:</strong> ${record.notes}</div>` : ''}
${managerNote ? `<div style="margin:8px 0;padding:6px 9px;background:#f0fdf4;border:0.5px solid #86efac;border-radius:4px;font-size:11px;color:#555"><strong style="color:#166534">조치사항:</strong> ${managerNote}</div>` : ''}

<div style="border:0.5px solid #ccc;border-radius:4px;padding:8px 12px;margin-top:12px;min-height:52px">
  <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:6px">관리자 메모</div>
  <div style="min-height:36px"></div>
</div>
<div class="sig-row">
  <div class="sig-box">
    <strong>운전자 확인</strong>
    <div class="sig-val">${driverName}</div>
    <div class="sig-sub">${endDatetime}</div>
  </div>
  <div class="sig-box">
    <strong>관리자 확인</strong>
  </div>
</div>
</div>`;
};

// null 반환 시 출력 제외 (데이터 없는 장비)
const buildMonthlySheet = (f, dates, allChecks, monthLabel) => {
    const [y, m] = monthLabel.split('-');

    // 날짜별 데이터 수집
    const dayData = dates.map(dateStr => {
        const record   = allChecks.find(c => c.forklift_id === f.id && c.check_date === dateStr) || null;
        const preExterior = record?.pre_exterior || null;
        const preOp       = record?.pre_op       || null;
        const postOp      = record?.post_op      || null;
        const dayNum = parseInt(dateStr.split('-')[2], 10);
        return { dateStr, dayNum, preExterior, preOp, postOp, record };
    });

    // 이 장비의 해당 월 점검 데이터가 하나도 없으면 null (빈 시트 방지)
    if (!dayData.some(d => d.record)) return null;

    // 탑승자 목록 집계 (중복 제거)
    const drivers = [...new Set(
        dayData.filter(d => d.record?.checker_name && d.record.checker_name !== '-')
               .map(d => d.record.checker_name)
    )].join(', ') || (f.driver_day || '-');

    // 헤더: 날짜만
    const thCells = dayData.map(({ dayNum }) =>
        `<th class="day-col">${dayNum}</th>`
    ).join('');

    // 각 점검 항목별 행 생성
    const mkItemRow = (label, vals) => {
        const cells = vals.map((val, di) => {
            if (val === true)  return `<td class="ok-cell day-col">○</td>`;
            if (val === false) {
                const d = dayData[di];
                const dNote = d.record?.notes || '';
                const mNote = d.record?.approved_by ? `승인: ${d.record.approved_by}` : '';
                const tip   = [dNote&&`탑승자:${dNote}`, mNote&&`관리자:${mNote}`].filter(Boolean).join(' / ');
                return `<td class="ng-cell day-col" title="${tip}">✕</td>`;
            }
            return `<td class="unc-cell day-col">-</td>`;
        }).join('');
        return `<tr><td class="item-col">${label}</td>${cells}</tr>`;
    };

    const extRows  = EXTERIOR_ITEMS.map((item, i) => mkItemRow(item, dayData.map(d => d.preExterior?.[i]?.checked))).join('');
    const preRows  = PREOP_ITEMS.map((item, i)    => mkItemRow(item, dayData.map(d => d.preOp?.[i]?.checked))).join('');
    const postRows = POSTOP_ITEMS.map((item, i)   => mkItemRow(item, dayData.map(d => d.postOp?.[i]?.checked))).join('');

    // 조치사항 — 발생한 날짜만
    const noteItems = dayData
        .filter(d => d.record?.notes || d.record?.approved_by)
        .map(d => {
            const driverNameDay = d.record?.checker_name || f.driver_day || '-';
            const approverName  = d.record?.approved_by || '-';
            const dNote = d.record?.notes || '';
            const nameRow = `<span style="font-weight:700;color:#111">${driverNameDay} / ${approverName}</span>`;
            const bodyRows = dNote ? `<span style="color:#92400e">탑승자: ${dNote}</span>` : '';
            return `<div class="note-item"><strong>${d.dayNum}일</strong> ${nameRow}${bodyRows ? `<br><span style="margin-left:4px">${bodyRows}</span>` : ''}</div>`;
        })
        .join('');

    // 관리자 서명 (우측 상단, 크게)
    const sigHtml = `<div style="position:absolute;top:12mm;right:14mm;border:1px solid #ccc;border-radius:6px;padding:8px 18px;min-width:100px;min-height:52px;font-size:12px;text-align:center">
<div style="font-weight:700;font-size:13px;border-bottom:0.5px solid #ddd;padding-bottom:5px;margin-bottom:20px">관리자</div>
</div>`;

    return `<div class="sheet sheet-monthly" style="position:relative">
${sigHtml}
<h2 style="padding-right:130px;margin-bottom:16px">지게차 월간 일일점검 이력 (${y}년 ${parseInt(m,10)}월)</h2>
<div class="meta" style="padding-right:130px">
  <span><strong>장비번호</strong> ${f.no}</span>
  <span><strong>센터</strong> ${f.center}</span>
  <span><strong>관리주체</strong> ${f.manager_org}</span>
  <span><strong>형태</strong> ${f.shape||'-'}</span>
  <span><strong>탑승자</strong> ${drivers}</span>
</div>
<table class="mt-table">
<thead>
  <tr><th class="item-col">점검 항목</th>${thCells}</tr>
</thead>
<tbody>
  <tr><td class="item-col" style="background:#eef2ff;font-weight:700" colspan="${dates.length+1}">▪ 외관점검 (운행 전)</td></tr>
  ${extRows}
  <tr><td class="item-col" style="background:#eef2ff;font-weight:700" colspan="${dates.length+1}">▪ 운행 전 점검</td></tr>
  ${preRows}
  <tr><td class="item-col" style="background:#eef2ff;font-weight:700" colspan="${dates.length+1}">▪ 작업 완료 후 점검</td></tr>
  ${postRows}
</tbody>
</table>
${noteItems ? `<div class="note-section"><strong style="font-size:10px;display:block;margin-bottom:3px">▪ 불량 발생 조치사항</strong>${noteItems}</div>` : ''}
</div>`;
};

// ── 출력용 체크리스트 항목 (모달과 공유)
const EXTERIOR_ITEMS = [
    '차량 외부 청소 상태 및 파손 여부 확인',
    '포크, 체인, 마스트에 휨/균열/파손 등 이상이 없는지 확인',
    '타이어 공기압, 마모 및 휠 볼트 풀림 상태 확인',
    '유압유(작동유) 누유 및 바닥 누유 흔적 확인',
    '경광등, 전조등 파손 등 외관 이상 유무 확인',
];
const PREOP_ITEMS = [
    '좌식안전띠 및 안전모 등 장구류 착용 상태 확인',
    '탑승 전 계기판(배터리 잔량, 에러코드) 및 내부 보고사항 확인',
    '사내 안전수칙 숙지 (위험요소 전파, 제한속도 준수, 휴대폰 사용 금지)',
    '하역장치(포크 상/하, 틸트 전/후) 작동 이상 유무 확인',
    '경음기(클락션) 및 후진 경보기(부저) 정상 작동 확인',
    '조향핸들 및 전/후진 레버 작동 상태 확인',
    '주차브레이크 및 풋브레이크 정상 작동(밀림) 확인',
    '전조등 및 후미등 정상 점등 상태 확인',
];
const POSTOP_ITEMS = [
    '지정된 주차공간 주차 및 사이드 브레이크 체결 여부',
    '포크 발 끝부분을 바닥면에 완전히 밀착시켰는지 확인',
    '배터리 충전 플러그 연결 상태 및 충전기 정상 작동 확인',
    '화재 예방: 충전 구역 주변 가연성 물질(박스, 비닐 등) 제거 상태',
];

// ── 점검 상태 계산 (Supabase row 기준)
// post_op가 있으면 '완료', pre_exterior만 있으면 '운행중', 없으면 '미점검'
const getCheckStatus = (record) => {
    if (!record)             return 'unchecked'; // 미점검
    if (!record.post_op)     return 'inProgress'; // 운행중
    return 'done';                                // 완료
};

const STATUS_META = {
    done:       { label: '완료',   bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
    inProgress: { label: '운행중', bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
    unchecked:  { label: '미점검', bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-300'   },
};

const sectionFaults = (record) => [
    ...(record?.pre_exterior || []).map(item => item.checked),
    ...(record?.pre_op       || []).map(item => item.checked),
    ...(record?.post_op      || []).map(item => item.checked),
];

const hasFault = (record) => {
    if (!record) return false;
    return sectionFaults(record).some(v => v === false);
};

const faultCount = (record) => {
    if (!record) return 0;
    return sectionFaults(record).filter(v => v === false).length;
};

// ── 상태 뱃지
const StatusBadge = ({ status }) => {
    const m = STATUS_META[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${m.bg} ${m.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
            {m.label}
        </span>
    );
};

const useCountUp = (target) => {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        if (target === 0) { setDisplay(0); return; }
        const steps = 40;
        const interval = 500 / steps;
        let step = 0;
        const timer = setInterval(() => {
            step++;
            setDisplay(Math.round(target * (step / steps)));
            if (step >= steps) clearInterval(timer);
        }, interval);
        return () => clearInterval(timer);
    }, [target]);
    return display;
};

const SummaryCard = ({ label, value, sub, labelClass, valueClass, borderClass, onClick, active }) => {
    const display = useCountUp(value);
    return (
        <div onClick={onClick}
            className={`bg-white rounded-xl border p-4 flex flex-col justify-center transition-all border-b-4 ${borderClass} ${onClick ? 'cursor-pointer' : ''} ${active ? 'shadow-lg -translate-y-0.5 border-slate-300' : 'shadow-sm border-slate-200 hover:shadow-md'}`}>
            <span className={`text-xs font-bold mb-1 ${labelClass}`}>{label}</span>
            <span className={`text-2xl font-black ${valueClass}`}>
                {display} <span className="text-sm font-bold opacity-30 ml-0.5">건</span>
            </span>
            {sub && <span className="text-[10px] text-gray-400 mt-0.5">{sub}</span>}
        </div>
    );
};

// ── 점검 상세 모달
const CheckDetailModal = ({ record, forklift, onClose }) => {
    if (!record) return null;
    const preExterior = record.pre_exterior;
    const preOp       = record.pre_op;
    const postOp      = record.post_op;

    const CheckRow = ({ text, val }) => (
        <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg
            ${val === false ? 'bg-red-50' : 'bg-gray-50'}`}>
            <span className="text-xs text-gray-700 flex-1">{text}</span>
            <span className={`text-[11px] font-black ml-3 shrink-0
                ${val === true ? 'text-green-600' : val === false ? 'text-red-500' : 'text-gray-300'}`}>
                {val === true ? '정상' : val === false ? '불량' : '-'}
            </span>
        </div>
    );

    const Section = ({ title, color, items, answers }) => (
        <div>
            <p className={`text-xs font-black mb-1.5 px-1 ${color}`}>{title}</p>
            <div className="space-y-1">
                {items.map((text, i) => (
                    <CheckRow key={i} text={text} val={answers?.[i]?.checked ?? null} />
                ))}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
                {/* 헤더 */}
                <div className="px-5 py-4 border-b shrink-0 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-black text-gray-800">{record.forklift_id} 점검 상세</p>
                        <p className="text-xs text-gray-400">{fmtDate(record.check_date)} · {record.checker_name} · {record.overall_status}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 시간 요약 */}
                <div className="px-5 py-3 bg-gray-50 border-b shrink-0 flex gap-6 text-sm">
                    <div><span className="text-xs text-gray-400 mr-1">시작</span><span className="font-black text-gray-700">{fmtTime(record?.created_at)}</span></div>
                    <div><span className="text-xs text-gray-400 mr-1">종료</span><span className="font-black text-gray-700">{fmtTime(record?.updated_at)}</span></div>
                    {record?.created_at && record?.updated_at && postOp && (
                        <div><span className="text-xs text-gray-400 mr-1">작업</span><span className="font-black text-letusBlue">{diffHours(record.created_at, record.updated_at)}</span></div>
                    )}
                    {hasFault(record) && <div><span className="font-black text-red-500">불량 {faultCount(record)}건</span></div>}
                </div>

                {/* 점검 내용 */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {preExterior ? (
                        <>
                            <Section title="외관점검" color="text-blue-600" items={EXTERIOR_ITEMS} answers={preExterior} />
                            <Section title="운행 전 점검" color="text-purple-600" items={PREOP_ITEMS} answers={preOp} />
                            {record.notes && <p className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">특이사항: {record.notes}</p>}
                        </>
                    ) : <p className="text-sm text-gray-400 text-center py-8">운행 전 점검 미제출</p>}

                    {postOp ? (
                        <>
                            <div className="border-t border-gray-100 pt-4">
                                <Section title="작업완료 후 점검" color="text-amber-600" items={POSTOP_ITEMS} answers={postOp} />
                            </div>
                        </>
                    ) : preExterior && <p className="text-xs text-gray-400 text-center py-3 border-t border-gray-100 mt-4">작업완료 후 점검 미제출 (운행 중)</p>}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────
// 메인 — 일일점검 관리자 화면
// ─────────────────────────────────────────────────────────
const DEFAULT_COLUMNS_DAILYCHECK = [
    { label: '관리번호',    key: 'no',          w: 100 },
    { label: '센터',        key: 'center',      w: 80  },
    { label: '관리주체',    key: 'manager_org', w: 90  },
    { label: '탑승자',      key: 'driver_day',  w: 80  },
    { label: '점검상태',    key: 'status',      w: 80  },
    { label: '외관점검',    key: null,          w: 80  },
    { label: '운행 전',     key: null,          w: 80  },
    { label: '완료 후',     key: null,          w: 80  },
    { label: '시작',        key: 'startTime',   w: 70  },
    { label: '종료',        key: 'endTime',     w: 70  },
    { label: '작업시간',    key: null,          w: 70  },
    { label: '불량',        key: 'faultCnt',    w: 60  },
    { label: '관리자 승인', key: 'approved',    w: 110 },
    { label: '점검내용',    key: null,          w: 150 },
    { label: '상세',        key: null,          w: 60  },
    { label: '점검일자',    key: 'checkDate',   w: 100 },
];

const LabeledSelect = ({ label, options, value, onChange }) => (
    <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-gray-600 whitespace-nowrap">{label}</span>
        <select value={value} onChange={e => onChange(e.target.value)}
            className="text-[11px] font-bold text-gray-700 border border-gray-200 rounded-[3px] px-2.5 h-[30px] bg-white focus:outline-none focus:border-letusBlue min-w-[80px] cursor-pointer">
            <option value="전체">전체</option>
            {options.map(o => <option key={o}>{o}</option>)}
        </select>
    </div>
);

const CheckboxDropdown = ({ label, options, selected, onChange, labelFn }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const allSelected = selected.length === 0;
    const getLabel = labelFn || (opt => opt);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const toggle = (opt) => {
        if (selected.includes(opt)) onChange(selected.filter(x => x !== opt));
        else onChange([...selected, opt]);
    };

    const displayLabel = allSelected ? '전체' : selected.length === 1 ? getLabel(selected[0]) : `${selected.length}개 선택`;

    return (
        <div className="relative flex items-center gap-2" ref={ref}>
            <span className="text-[11px] font-bold text-gray-600 whitespace-nowrap">{label}</span>
            <button onClick={() => setOpen(v => !v)}
                className={`flex items-center gap-1 text-[11px] font-bold border rounded-[3px] px-2.5 h-[30px] min-w-[80px] bg-white hover:border-letusBlue transition-colors ${open ? 'border-letusBlue text-letusBlue' : 'border-gray-200 text-gray-700'}`}>
                <span className="flex-1 text-left">{displayLabel}</span>
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-[3px] shadow-lg z-50 min-w-[130px] py-1">
                    <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={allSelected} onChange={() => onChange([])}
                            className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                        <span className="text-xs font-bold text-gray-700">전체</span>
                    </label>
                    <div className="border-t border-gray-100 my-0.5" />
                    {options.map(opt => (
                        <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)}
                                className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                            <span className="text-xs text-gray-700">{getLabel(opt)}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

export const ForkliftDailyCheck = ({ userProfile }) => {
    const { can } = usePermissions(userProfile);
    const [startDate,      setStartDate]      = useState(toDateStr(new Date()));
    const [endDate,        setEndDate]        = useState(toDateStr(new Date()));
    const [filterOrg,      setFilterOrg]      = useState('전체');
    const [filterCenter,   setFilterCenter]   = useState([]);
    const [filterStatus,   setFilterStatus]   = useState('전체');
    const [filterFaultOnly, setFilterFaultOnly] = useState(false);
    const [searchField,    setSearchField]    = useState('관리번호');
    const [searchQ,        setSearchQ]        = useState('');
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [checks,         setChecks]         = useState([]); // Supabase rows 배열
    const [forklifts,      setForklifts]      = useState([]); // Supabase forklifts 배열
    const [detailRecord,   setDetailRecord]   = useState(null);
    const [selectedIds,    setSelectedIds]    = useState([]);
    const [approvalModal,  setApprovalModal]  = useState(false);
    const [approvalNotes,  setApprovalNotes]  = useState({}); // { forkliftId: '조치사항 텍스트' }
    const [sortConfig,     setSortConfig]     = useState({ key: 'no', dir: 'asc' });
    const [printModal,     setPrintModal]     = useState(false);
    const [printMode,      setPrintMode]      = useState('daily'); // 'daily' | 'monthly'
    const [printMonth,     setPrintMonth]     = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    });
    const [printOrg,       setPrintOrg]       = useState('전체');
    const [printCenter,    setPrintCenter]    = useState('전체');
    const [printFaultOnly, setPrintFaultOnly] = useState(true);

    const [colOrder,     setColOrder]     = useState(DEFAULT_COLUMNS_DAILYCHECK.map((_, i) => i));
    const [colWidths,    setColWidths]    = useState(DEFAULT_COLUMNS_DAILYCHECK.map(c => c.w));
    const [dragOverIdx,  setDragOverIdx]  = useState(null);
    const resizingRef   = useRef(null);
    const dragSrcRef    = useRef(null);
    const wasDraggedRef = useRef(false);

    // ── forklifts 로딩 (반납·매각 제외)
    useEffect(() => {
        const loadForklifts = async () => {
            const { data } = await supabase
                .from('forklifts')
                .select('id, no, model, center, manager_org, status, shape, driver_day')
                .order('no');
            setForklifts((data || []).filter(f => f.status !== '반납' && f.status !== '매각'));
        };
        loadForklifts();
    }, []);

    const isRange = !!endDate && startDate !== endDate;

    // ── 일일점검 기록 로딩 (날짜 변경 시)
    useEffect(() => {
        const loadChecks = async () => {
            const { data } = await supabase
                .from('forklift_daily_checks')
                .select('*')
                .gte('check_date', startDate)
                .lte('check_date', endDate || startDate);
            setChecks(data || []);
        };
        loadChecks();
    }, [startDate, endDate]);

    // 단일/범위 모드 전환 시 카드 필터 초기화
    useEffect(() => { setFilterStatus('전체'); setFilterFaultOnly(false); }, [isRange]);

    // 날짜/필터 바뀌면 체크박스 초기화
    useEffect(() => { setSelectedIds([]); }, [startDate, endDate, filterOrg, filterCenter]);

    useEffect(() => {
        if (!userProfile?.id) return;
        try {
            const saved = JSON.parse(localStorage.getItem(`letus_dailycheck_col_${userProfile.id}`));
            if (saved?.order?.length === DEFAULT_COLUMNS_DAILYCHECK.length) setColOrder(saved.order);
            if (saved?.widths?.length === DEFAULT_COLUMNS_DAILYCHECK.length) setColWidths(saved.widths);
        } catch {}
    }, [userProfile?.id]);

    useEffect(() => {
        if (!userProfile?.id) return;
        localStorage.setItem(`letus_dailycheck_col_${userProfile.id}`, JSON.stringify({ order: colOrder, widths: colWidths }));
    }, [colOrder, colWidths, userProfile?.id]);

    const resetColSettings = () => {
        setColOrder(DEFAULT_COLUMNS_DAILYCHECK.map((_, i) => i));
        setColWidths(DEFAULT_COLUMNS_DAILYCHECK.map(c => c.w));
        if (userProfile?.id) localStorage.removeItem(`letus_dailycheck_col_${userProfile.id}`);
    };

    const ORGS    = useMemo(() => [...new Set(forklifts.map(f => f.manager_org).filter(Boolean))], [forklifts]);
    const CENTERS = useMemo(() => sortCenters([...new Set(forklifts.map(f => f.center).filter(Boolean))]), [forklifts]);
    const filteredCenters      = useMemo(() => filterOrg === '전체' ? CENTERS : sortCenters([...new Set(forklifts.filter(f => f.manager_org === filterOrg).map(f => f.center).filter(Boolean))]), [forklifts, filterOrg, CENTERS]);
    const printFilteredCenters = useMemo(() => printOrg  === '전체' ? ['전체', ...CENTERS] : ['전체', ...sortCenters([...new Set(forklifts.filter(f => f.manager_org === printOrg).map(f => f.center).filter(Boolean))])],  [forklifts, printOrg,  CENTERS]);

    // 날짜별 점검 레코드 조인 (단일: 장비 기준, 범위: 점검 기록 기준)
    const rows = useMemo(() => {
        if (!isRange) {
            return forklifts.map(f => {
                const record = checks.find(c => c.forklift_id === f.id) || null;
                return { forklift: f, record, status: getCheckStatus(record), fault: hasFault(record), faultCnt: faultCount(record), checkDate: startDate };
            });
        } else {
            return checks.map(c => {
                const forklift = forklifts.find(f => f.id === c.forklift_id);
                if (!forklift) return null;
                return { forklift, record: c, status: getCheckStatus(c), fault: hasFault(c), faultCnt: faultCount(c), checkDate: c.check_date };
            }).filter(Boolean);
        }
    }, [forklifts, checks, isRange, startDate]);

    // 승인 처리
    const handleApprove = useCallback(async () => {
        const approverName = userProfile?.name || userProfile?.email || '관리자';
        const now = new Date().toISOString();

        const approvableRows = rows.filter(r => selectedIds.includes(r.forklift.id) && r.status !== 'inProgress' && r.record);

        await Promise.all(approvableRows.map(r =>
            supabase.from('forklift_daily_checks').update({
                approved_at: now,
                approved_by: approverName,
            }).eq('id', r.record.id)
        ));

        // 화면 반영: checks 상태 업데이트
        setChecks(prev => prev.map(c => {
            const matched = approvableRows.find(r => r.record?.id === c.id);
            if (!matched) return c;
            return { ...c, approved_at: now, approved_by: approverName };
        }));

        setSelectedIds([]);
        setApprovalNotes({});
        setApprovalModal(false);
    }, [rows, selectedIds, startDate, userProfile, approvalNotes]);

    // 승인 취소
    const handleRevokeApproval = useCallback(async (checkId) => {
        await supabase.from('forklift_daily_checks').update({
            approved_at: null,
            approved_by: null,
        }).eq('id', checkId);
        setChecks(prev => prev.map(c =>
            c.id === checkId ? { ...c, approved_at: null, approved_by: null } : c
        ));
    }, []);

    // ── 출력 실행
    const runPrint = useCallback(async () => {
        const targetForklifts = forklifts.filter(f => {
            if (printOrg    !== '전체' && f.manager_org !== printOrg)    return false;
            if (printCenter !== '전체' && f.center      !== printCenter) return false;
            return true;
        });

        let html = '';

        if (printMode === 'daily') {
            const targets = targetForklifts
                .map(f => {
                    const record = checks.find(c => c.forklift_id === f.id) || null;
                    return { f, record, fault: hasFault(record), status: getCheckStatus(record) };
                })
                .filter(({ record, fault }) => {
                    if (printFaultOnly) return fault;
                    return record !== null;
                });

            const dateLabel = startDate.replace(/-/g, '.');
            html = targets.map(({ f, record }) => buildDailySheet(f, record, null, startDate, dateLabel)).join('');
            if (!html) { alert('출력할 데이터가 없습니다.'); return; }

        } else {
            // 월별: 해당 월 전체 데이터 조회
            const [y, m] = printMonth.split('-').map(Number);
            const daysInMonth = new Date(y, m, 0).getDate();
            const dates = Array.from({ length: daysInMonth }, (_, i) =>
                `${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`
            );
            const startDate = `${y}-${String(m).padStart(2,'0')}-01`;
            const endDate   = `${y}-${String(m).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`;

            const { data: monthChecks } = await supabase
                .from('forklift_daily_checks')
                .select('*')
                .gte('check_date', startDate)
                .lte('check_date', endDate);

            html = targetForklifts.map(f => buildMonthlySheet(f, dates, monthChecks || [], printMonth)).filter(Boolean).join('');
            if (!html) { alert('출력할 데이터가 없습니다.'); return; }
        }

        const win = window.open('', '_blank');
        win.document.write(buildPrintHtml(html, printMode === 'monthly'));
        win.document.close();
        setTimeout(() => { win.focus(); win.print(); }, 400);
        setPrintModal(false);
    }, [forklifts, checks, printMode, printOrg, printCenter, printFaultOnly, startDate, printMonth]);

    // 승인 버튼 클릭 → 조치사항 초기화 후 모달 열기
    const openApprovalModal = useCallback(() => {
        setApprovalNotes({});
        setApprovalModal(true);
    }, []);

    // 정렬 요청
    const requestSort = useCallback((key) => {
        setSortConfig(prev =>
            prev.key === key && prev.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' }
        );
    }, []);
    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return <span className="text-letusBlue font-black text-[10px] ml-0.5">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>;
    };

    const handleResizeStart = (e, visualIdx) => {
        e.preventDefault(); e.stopPropagation();
        const origIdx = colOrder[visualIdx];
        resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const onMove = (ev) => {
            if (!resizingRef.current) return;
            const { origIdx, startX, startW } = resizingRef.current;
            setColWidths(prev => { const n = [...prev]; n[origIdx] = Math.max(50, startW + (ev.clientX - startX)); return n; });
        };
        const onUp = () => { resizingRef.current = null; el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
    };
    const handleDragStart = (e, visualIdx) => { dragSrcRef.current = visualIdx; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver  = (e, visualIdx) => { e.preventDefault(); setDragOverIdx(visualIdx); };
    const handleDrop = (e, visualIdx) => {
        e.preventDefault(); setDragOverIdx(null);
        if (dragSrcRef.current === null || dragSrcRef.current === visualIdx) return;
        wasDraggedRef.current = true;
        const newOrder = [...colOrder]; const [moved] = newOrder.splice(dragSrcRef.current, 1); newOrder.splice(visualIdx, 0, moved);
        setColOrder(newOrder); dragSrcRef.current = null;
    };
    const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

    // 카드 필터 제외한 기준 집합 (요약 카드 수치에 반영)
    const statsBase = useMemo(() => {
        let r = rows;
        if (filterOrg !== '전체')      r = r.filter(row => row.forklift.manager_org === filterOrg);
        if (filterCenter.length > 0)   r = r.filter(row => filterCenter.includes(row.forklift.center));
        if (searchQ) {
            const q = searchQ.toLowerCase();
            if (searchField === '관리번호') r = r.filter(row => row.forklift.no?.toLowerCase().includes(q));
            else                           r = r.filter(row => row.forklift.driver_day?.toLowerCase().includes(q));
        }
        return r;
    }, [rows, filterOrg, filterCenter, searchQ, searchField]);

    // 필터 + 정렬 적용
    const filtered = useMemo(() => {
        let r = statsBase;
        if (filterStatus !== '전체') r = r.filter(row => row.status === filterStatus);
        if (filterFaultOnly)         r = r.filter(row => row.fault);

        const { key, dir } = sortConfig;
        if (key) {
            r = [...r].sort((a, b) => {
                let av, bv;
                if (['no','center','manager_org','driver_day'].includes(key)) {
                    av = a.forklift[key] ?? '';
                    bv = b.forklift[key] ?? '';
                } else if (key === 'status') {
                    const ORDER = { done: 0, inProgress: 1, unchecked: 2 };
                    av = ORDER[a.status] ?? 9;
                    bv = ORDER[b.status] ?? 9;
                } else if (key === 'faultCnt') {
                    av = a.faultCnt;
                    bv = b.faultCnt;
                } else if (key === 'approved') {
                    av = a.record?.approved_at ? 0 : 1;
                    bv = b.record?.approved_at ? 0 : 1;
                } else if (key === 'startTime') {
                    av = a.record?.created_at ?? '';
                    bv = b.record?.created_at ?? '';
                } else if (key === 'endTime') {
                    av = a.record?.updated_at ?? '';
                    bv = b.record?.updated_at ?? '';
                } else if (key === 'checkDate') {
                    av = a.checkDate ?? '';
                    bv = b.checkDate ?? '';
                } else {
                    av = ''; bv = '';
                }
                if (av < bv) return dir === 'asc' ? -1 : 1;
                if (av > bv) return dir === 'asc' ?  1 : -1;
                return 0;
            });
        }
        return r;
    }, [statsBase, filterStatus, filterFaultOnly, sortConfig]);

    // 요약 통계 (카드 필터 미적용 statsBase 기준)
    const stats = useMemo(() => ({
        total:      statsBase.length,
        done:       statsBase.filter(r => r.status === 'done').length,
        inProgress: statsBase.filter(r => r.status === 'inProgress').length,
        unchecked:  statsBase.filter(r => r.status === 'unchecked').length,
        faults:     statsBase.filter(r => r.fault).length,
    }), [statsBase]);

    // 점검율 계산
    const checkRate = stats.total > 0 ? Math.round((stats.done + stats.inProgress) / stats.total * 100) : 0;

    const renderCell = (origIdx, row) => {
        const { forklift: f, record, status, fault, faultCnt } = row;
        const preExterior = record?.pre_exterior;
        const preOp       = record?.pre_op;
        const postOp      = record?.post_op;
        const worked = postOp ? diffHours(record?.created_at, record?.updated_at) : null;

        switch (origIdx) {
            case 0: // 관리번호
                return <td key={origIdx} className="p-4 font-bold text-letusBlue">{f.no}</td>;
            case 1: // 센터
                return <td key={origIdx} className="p-4 text-gray-600">{f.center}</td>;
            case 2: // 관리주체
                return <td key={origIdx} className="p-4 text-gray-600">{f.manager_org}</td>;
            case 3: // 탑승자
                return <td key={origIdx} className="p-4 text-gray-700">{f.driver_day || '-'}</td>;
            case 4: // 점검상태
                return <td key={origIdx} className="px-3 py-2"><StatusBadge status={status} /></td>;
            case 5: // 외관점검
                return (
                    <td key={origIdx} className="p-4 text-center">
                        {preExterior ? (() => {
                            const cnt = preExterior.filter(item => item.checked === false).length;
                            return (
                                <span className={`font-bold ${cnt > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                    {cnt > 0 ? `불량 ${cnt}건` : '이상없음'}
                                </span>
                            );
                        })() : <span className="text-gray-300">-</span>}
                    </td>
                );
            case 6: // 운행 전
                return (
                    <td key={origIdx} className="p-4 text-center">
                        {preOp ? (() => {
                            const cnt = preOp.filter(item => item.checked === false).length;
                            return (
                                <span className={`font-bold ${cnt > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                    {cnt > 0 ? `불량 ${cnt}건` : '이상없음'}
                                </span>
                            );
                        })() : <span className="text-gray-300">-</span>}
                    </td>
                );
            case 7: // 완료 후
                return (
                    <td key={origIdx} className="p-4 text-center">
                        {postOp ? (
                            <span className={`font-bold ${
                                postOp.filter(item => item.checked === false).length > 0
                                    ? 'text-red-500' : 'text-green-600'}`}>
                                {postOp.filter(item => item.checked === false).length > 0
                                    ? `불량 ${postOp.filter(item => item.checked === false).length}건`
                                    : '이상없음'}
                            </span>
                        ) : <span className="text-gray-300">-</span>}
                    </td>
                );
            case 8: // 시작
                return <td key={origIdx} className="p-4 text-center text-gray-600">{fmtTime(record?.created_at)}</td>;
            case 9: // 종료
                return <td key={origIdx} className="p-4 text-center text-gray-600">{postOp ? fmtTime(record?.updated_at) : '-'}</td>;
            case 10: // 작업시간
                return (
                    <td key={origIdx} className="p-4 text-center">
                        {worked
                            ? <span className="font-bold text-letusBlue">{worked}</span>
                            : <span className="text-gray-300">-</span>}
                    </td>
                );
            case 11: // 불량
                return (
                    <td key={origIdx} className="p-4 text-center">
                        {faultCnt > 0
                            ? <span className="font-black text-red-500">{faultCnt}</span>
                            : <span className="text-gray-300">-</span>}
                    </td>
                );
            case 12: // 관리자 승인
                return (
                    <td key={origIdx} className="p-4 text-center">
                        {record?.approved_at ? (
                            <div className="flex flex-col items-center gap-0.5">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    {record.approved_by}
                                </span>
                                <span className="text-[10px] text-gray-400">{fmtTime(record.approved_at)}</span>
                            </div>
                        ) : <span className="text-gray-300">-</span>}
                    </td>
                );
            case 13: // 점검내용
                return (
                    <td key={origIdx} className="p-4 text-center max-w-[160px]">
                        {record?.notes
                            ? <span className="text-[11px] text-gray-700 break-words">{record.notes}</span>
                            : <span className="text-gray-300">-</span>}
                    </td>
                );
            case 14: // 상세
                return (
                    <td key={origIdx} className="p-4 text-center">
                        {record ? (
                            <button onClick={() => setDetailRecord(record)}
                                className="text-[11px] font-bold text-letusBlue border border-letusBlue/30 bg-blue-50 rounded px-2 py-0.5 hover:bg-blue-100 transition-colors">
                                보기
                            </button>
                        ) : <span className="text-gray-300">-</span>}
                    </td>
                );
            case 15: // 점검일자
                return (
                    <td key={origIdx} className="p-4 text-center text-gray-600 text-[12px]">
                        {row.checkDate || '-'}
                    </td>
                );
            default: return null;
        }
    };

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100">

            {/* ━━━ 요약 카드 ━━━ */}
            <div className="grid grid-cols-5 gap-4 shrink-0">
                <SummaryCard label="전체 장비" value={stats.total}
                    labelClass="text-gray-500" valueClass="text-gray-700" borderClass="border-b-gray-400"
                    active={filterStatus === '전체' && !filterFaultOnly}
                    onClick={() => { setFilterStatus('전체'); setFilterFaultOnly(false); }} />
                <SummaryCard label="점검 완료" value={stats.done}
                    labelClass="text-green-500" valueClass="text-green-600" borderClass="border-b-green-400"
                    active={filterStatus === 'done' && !filterFaultOnly}
                    onClick={() => { setFilterStatus('done'); setFilterFaultOnly(false); }} />
                <SummaryCard label="운행 중" value={stats.inProgress}
                    labelClass="text-blue-500" valueClass="text-letusBlue" borderClass="border-b-blue-400"
                    active={filterStatus === 'inProgress' && !filterFaultOnly}
                    onClick={() => { setFilterStatus('inProgress'); setFilterFaultOnly(false); }} />
                <SummaryCard label="미점검" value={stats.unchecked}
                    labelClass="text-gray-400" valueClass="text-gray-500" borderClass="border-b-gray-300"
                    active={filterStatus === 'unchecked' && !filterFaultOnly}
                    onClick={() => { setFilterStatus('unchecked'); setFilterFaultOnly(false); }} />
                <SummaryCard label="불량 발생" value={stats.faults}
                    labelClass="text-red-500" valueClass="text-red-600" borderClass="border-b-red-400"
                    active={filterFaultOnly}
                    onClick={() => { setFilterFaultOnly(v => !v); setFilterStatus('전체'); }} />
            </div>

            {/* ━━━ 점검율 세그먼트 바 ━━━ */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-5 py-3 shrink-0">
                <div className="flex h-2 rounded overflow-hidden gap-0.5 mb-2">
                    {stats.total > 0 && <>
                        <div className="bg-green-500 rounded-sm transition-all duration-[875ms]"
                            style={{ width: `${stats.done / stats.total * 100}%` }} />
                        <div className="bg-blue-500 rounded-sm transition-all duration-[875ms]"
                            style={{ width: `${stats.inProgress / stats.total * 100}%` }} />
                        <div className="bg-slate-200 rounded-sm transition-all duration-[875ms]"
                            style={{ width: `${stats.unchecked / stats.total * 100}%` }} />
                    </>}
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <div className="w-2 h-2 rounded-sm bg-green-500" />
                            점검 완료 {stats.done}건
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <div className="w-2 h-2 rounded-sm bg-blue-500" />
                            운행 중 {stats.inProgress}건
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <div className="w-2 h-2 rounded-sm bg-slate-300" />
                            미점검 {stats.unchecked}건
                        </div>
                    </div>
                    <span className="text-[11px] font-bold text-green-600">점검율 {checkRate}%</span>
                </div>
            </div>

            {/* ━━━ 필터 카드 ━━━ */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex flex-col z-30 shrink-0">
                {/* 필터 */}
                <div className="flex items-center gap-5 flex-wrap">
                    {/* 조회일자 */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-600 whitespace-nowrap">조회일자</span>
                        <DateRangeInput
                            startDate={startDate}
                            endDate={endDate}
                            onChange={(s, e) => { if (s) setStartDate(s); setEndDate(e || s); }}
                        />
                    </div>
                    <LabeledSelect label="관리주체" options={ORGS} value={filterOrg} onChange={v => { setFilterOrg(v); setFilterCenter([]); }} />
                    <CheckboxDropdown label="센터" options={filteredCenters} selected={filterCenter} onChange={setFilterCenter} />
                    {/* 점검상태 */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-600 whitespace-nowrap">점검상태</span>
                        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setFilterFaultOnly(false); }}
                            className="text-[11px] font-bold text-gray-700 border border-gray-200 rounded-[3px] px-2.5 h-[30px] bg-white focus:outline-none focus:border-letusBlue cursor-pointer">
                            <option value="전체">전체</option>
                            <option value="done">완료</option>
                            <option value="inProgress">운행중</option>
                            {!isRange && <option value="unchecked">미점검</option>}
                        </select>
                    </div>
                    {/* 검색 */}
                    <div className="flex items-center gap-0 h-[30px]">
                        <select value={searchField} onChange={e => setSearchField(e.target.value)}
                            className="border border-gray-200 border-r-0 rounded-l-[3px] text-[11px] px-2 text-gray-700 bg-gray-50 focus:outline-none cursor-pointer h-full font-bold">
                            <option>관리번호</option>
                            <option>탑승자</option>
                        </select>
                        <input type="text" placeholder="검색어 입력"
                            value={searchQ} onChange={e => setSearchQ(e.target.value)}
                            className="border border-gray-200 rounded-r-[3px] text-[11px] px-2.5 w-36 focus:outline-none focus:border-letusBlue h-full" />
                    </div>
                </div>
            </div>

            {/* ━━━ 칼럼 초기화 + 선택실행 ━━━ */}
            <div className="flex justify-end items-center gap-2 shrink-0 -mt-2 z-30 relative">
                <button onClick={resetColSettings}
                    className="flex items-center gap-1 text-xs font-bold text-gray-500 border border-gray-300 bg-white rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 hover:text-gray-700 transition-colors"
                    title="칼럼 너비·순서를 기본값으로 초기화">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    칼럼 초기화
                </button>
                <div className="relative">
                    <button
                        onClick={() => setIsActionMenuOpen(v => !v)}
                        className="flex items-center justify-between gap-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 h-[32px] hover:bg-gray-50 transition-colors min-w-[110px]">
                        선택실행{selectedIds.length > 0 && ` (${selectedIds.length})`}
                        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {isActionMenuOpen && (
                        <>
                            <div className="fixed inset-0" onClick={() => setIsActionMenuOpen(false)} />
                            <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">
                                <button
                                    onClick={() => { setPrintModal(true); setIsActionMenuOpen(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    출력
                                </button>
                                <button
                                    onClick={() => { if (selectedIds.length > 0 && can('forklift_check', 'approve')) { openApprovalModal(); setIsActionMenuOpen(false); } }}
                                    disabled={selectedIds.length === 0 || !can('forklift_check', 'approve')}
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                                        selectedIds.length > 0 && can('forklift_check', 'approve')
                                            ? 'text-green-700 hover:bg-green-50'
                                            : 'text-gray-300 cursor-not-allowed'
                                    }`}>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    관리자 승인{selectedIds.length > 0 && ` (${selectedIds.length}건)`}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ━━━ 테이블 ━━━ */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="p-0 overflow-auto flex-1 custom-scrollbar outline-none">
                    <table className="w-full text-left whitespace-nowrap table-fixed">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 w-8 shrink-0">
                                    <input type="checkbox"
                                        checked={filtered.length > 0 && filtered.every(r => selectedIds.includes(r.forklift.id))}
                                        onChange={e => setSelectedIds(e.target.checked ? filtered.map(r => r.forklift.id) : [])}
                                        className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                                </th>
                                {colOrder.map((origIdx, visualIdx) => {
                                    const col = DEFAULT_COLUMNS_DAILYCHECK[origIdx];
                                    return (
                                        <th key={origIdx}
                                            className={`relative p-4 text-center select-none transition-colors cursor-grab active:cursor-grabbing ${col.key ? 'hover:bg-gray-100' : ''} ${dragOverIdx === visualIdx ? 'bg-blue-100' : ''}`}
                                            style={{ width: colWidths[origIdx] }}
                                            draggable
                                            onClick={() => !wasDraggedRef.current && col.key && requestSort(col.key)}
                                            onDragStart={e => handleDragStart(e, visualIdx)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={e => handleDragOver(e, visualIdx)}
                                            onDrop={e => handleDrop(e, visualIdx)}
                                            onDragLeave={() => setDragOverIdx(null)}
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                {col.label}
                                                {col.key && getSortIcon(col.key)}
                                            </div>
                                            <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-letusBlue/40 z-10"
                                                onPointerDown={e => handleResizeStart(e, visualIdx)} onClick={e => e.stopPropagation()} />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-xs">
                            {filtered.length === 0 && (
                                <tr><td colSpan={colOrder.length + 1} className="text-center py-12 text-gray-400">데이터가 없습니다</td></tr>
                            )}
                            {filtered.map(({ forklift: f, record, status, fault, faultCnt }) => {
                                const isSelected = selectedIds.includes(f.id);
                                return (
                                    <tr key={f.id}
                                        className={`hover:bg-blue-50/30 transition-colors
                                            ${fault ? 'bg-red-50/40' : ''}
                                            ${isSelected ? 'bg-blue-50/60' : ''}`}>
                                        <td className="px-3 py-2">
                                            <label className="flex items-center justify-center cursor-pointer px-1">
                                                <input type="checkbox" checked={isSelected}
                                                    onChange={e => setSelectedIds(prev =>
                                                        e.target.checked ? [...prev, f.id] : prev.filter(x => x !== f.id)
                                                    )}
                                                    className="w-3.5 h-3.5 accent-letusBlue cursor-pointer" />
                                            </label>
                                        </td>
                                        {colOrder.map(origIdx => renderCell(origIdx, { forklift: f, record, status, fault, faultCnt }))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-gray-400 mt-2">총 {filtered.length}건 표시</p>
            </div>

            {/* 상세 모달 */}
            {detailRecord && (
                <CheckDetailModal
                    record={detailRecord}
                    onClose={() => setDetailRecord(null)}
                />
            )}

            {/* 출력 모달 */}
            {printModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                <span className="font-black text-gray-800">점검표 출력</span>
                            </div>
                            <button onClick={() => setPrintModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-5">
                            {/* 출력 유형 */}
                            <div>
                                <p className="text-xs font-bold text-gray-500 mb-2">출력 유형</p>
                                <div className="flex gap-2">
                                    {[
                                        { value: 'daily',   label: '일별 출력', desc: '불량·이슈 발생 건 즉시 출력' },
                                        { value: 'monthly', label: '월별 출력', desc: '1대당 월간 점검 이력 1페이지' },
                                    ].map(({ value, label, desc }) => (
                                        <button key={value}
                                            onClick={() => setPrintMode(value)}
                                            className={`flex-1 text-left px-4 py-3 rounded-xl border transition-all ${
                                                printMode === value
                                                    ? 'border-letusBlue bg-blue-50 text-letusBlue'
                                                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                            }`}>
                                            <p className="text-xs font-black">{label}</p>
                                            <p className="text-[10px] mt-0.5 opacity-70">{desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 일별 옵션 */}
                            {printMode === 'daily' && (
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs font-bold text-gray-500 mb-1.5">출력 날짜</p>
                                        <input type="date" value={startDate}
                                            onChange={e => { setStartDate(e.target.value); setEndDate(e.target.value); }}
                                            className="text-xs font-bold border border-gray-300 rounded-lg px-3 h-[32px] w-full focus:outline-none focus:border-letusBlue" />
                                        <p className="text-[10px] text-gray-400 mt-1">현재 선택된 날짜와 동기화됩니다</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="faultOnly" checked={printFaultOnly}
                                            onChange={e => setPrintFaultOnly(e.target.checked)}
                                            className="w-3.5 h-3.5 accent-letusBlue" />
                                        <label htmlFor="faultOnly" className="text-xs text-gray-700 cursor-pointer">
                                            <span className="font-bold text-red-500">불량 발생 건만</span> 출력 (미체크 시 전체 출력)
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* 월별 옵션 */}
                            {printMode === 'monthly' && (
                                <div>
                                    <p className="text-xs font-bold text-gray-500 mb-1.5">출력 월</p>
                                    <input type="month" value={printMonth}
                                        onChange={e => setPrintMonth(e.target.value)}
                                        className="text-xs font-bold border border-gray-300 rounded-lg px-3 h-[32px] w-full focus:outline-none focus:border-letusBlue" />
                                </div>
                            )}

                            {/* 공통: 관리주체 / 센터 */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs font-bold text-gray-500 mb-1.5">관리주체</p>
                                    <select value={printOrg} onChange={e => { setPrintOrg(e.target.value); setPrintCenter('전체'); }}
                                        className="text-xs border border-gray-300 rounded-lg px-2.5 h-[32px] w-full bg-white focus:outline-none focus:border-letusBlue">
                                        {ORGS.map(o => <option key={o}>{o}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-gray-500 mb-1.5">센터</p>
                                    <select value={printCenter} onChange={e => setPrintCenter(e.target.value)}
                                        className="text-xs border border-gray-300 rounded-lg px-2.5 h-[32px] w-full bg-white focus:outline-none focus:border-letusBlue">
                                        {printFilteredCenters.map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* 안내 */}
                            <div className="bg-blue-50 rounded-xl px-4 py-3 text-[11px] text-blue-700">
                                {printMode === 'daily'
                                    ? '선택된 조건에 맞는 장비별 점검표가 출력됩니다. 브라우저 인쇄 창에서 PDF로 저장하거나 바로 인쇄할 수 있습니다.'
                                    : '선택된 조건의 장비 1대당 1페이지로 월간 점검 이력이 출력됩니다.'}
                            </div>
                        </div>

                        <div className="flex gap-2 px-6 pb-5">
                            <button onClick={() => setPrintModal(false)}
                                className="flex-1 py-2.5 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                                취소
                            </button>
                            <button onClick={runPrint}
                                className="flex-1 py-2.5 text-sm font-bold text-white bg-letusBlue hover:bg-blue-600 rounded-xl transition-colors flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                미리보기 / 인쇄
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 관리자 승인 확인 모달 */}
            {approvalModal && (() => {
                // 선택된 행 분류
                const selectedRows  = rows.filter(r => selectedIds.includes(r.forklift.id));
                const blockedRows    = selectedRows.filter(r => r.status === 'inProgress'); // 운행중만 불가
                const approvableRows = selectedRows.filter(r => r.status !== 'inProgress');
                const normalRows    = approvableRows.filter(r => !r.fault && r.status !== 'unchecked');
                const issueRows     = approvableRows.filter(r => r.fault || r.status === 'unchecked');
                // 조치사항 미입력 건 확인
                const missingNotes  = issueRows.filter(r => !(approvalNotes[r.forklift.id] || '').trim());
                const canApprove    = approvableRows.length > 0 && missingNotes.length === 0;

                return (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
                            {/* 헤더 */}
                            <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b border-gray-100">
                                <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </span>
                                <div>
                                    <span className="font-black text-gray-800 text-base">관리자 승인</span>
                                    <span className="text-xs text-gray-400 ml-2">
                                        {userProfile?.name || userProfile?.email || '관리자'} · {isRange ? `${startDate} ~ ${endDate}` : startDate}
                                    </span>
                                </div>
                            </div>

                            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
                                {/* 승인 불가 건 (운행중·미점검) */}
                                {blockedRows.length > 0 && (
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                        <p className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728" />
                                            </svg>
                                            승인 불가 — 점검 미완료 ({blockedRows.length}건)
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {blockedRows.map(r => (
                                                <span key={r.forklift.id} className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400 bg-gray-200 rounded-full px-2.5 py-1">
                                                    {r.forklift.no}
                                                    <span className="text-gray-300">·</span>
                                                    {r.status === 'unchecked' ? '미점검' : '운행중'}
                                                </span>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-2">완료 후 점검까지 마쳐야 승인 가능합니다. (운행중 → 점검 완료 후 재선택)</p>
                                    </div>
                                )}

                                {/* 이상없음 건 */}
                                {normalRows.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold text-green-600 mb-2 flex items-center gap-1">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                            이상없음 — 즉시 승인 ({normalRows.length}건)
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {normalRows.map(r => (
                                                <span key={r.forklift.id} className="text-[11px] font-bold text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">
                                                    {r.forklift.no}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 불량/미점검 건 — 조치사항 필수 */}
                                {issueRows.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold text-red-500 mb-2 flex items-center gap-1">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                            </svg>
                                            조치사항 필수 입력 ({issueRows.length}건)
                                        </p>
                                        <div className="space-y-3">
                                            {issueRows.map(r => {
                                                const issueType = r.fault
                                                    ? `불량 ${r.faultCnt}건`
                                                    : '미점검(미운행)';
                                                const hasNote = (approvalNotes[r.forklift.id] || '').trim().length > 0;
                                                return (
                                                    <div key={r.forklift.id} className={`rounded-xl border p-3 ${hasNote ? 'border-green-200 bg-green-50/40' : 'border-red-200 bg-red-50/30'}`}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-black text-gray-800">{r.forklift.no}</span>
                                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                                                r.fault ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                                                            }`}>{issueType}</span>
                                                        </div>
                                                        <textarea
                                                            rows={2}
                                                            placeholder="조치사항을 입력하세요 (필수)"
                                                            value={approvalNotes[r.forklift.id] || ''}
                                                            onChange={e => setApprovalNotes(prev => ({ ...prev, [r.forklift.id]: e.target.value }))}
                                                            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-letusBlue resize-none"
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 푸터 */}
                            <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex items-center justify-between">
                                <span className="text-xs font-bold">
                                    {approvableRows.length === 0
                                        ? <span className="text-gray-400">승인 가능한 건이 없습니다</span>
                                        : missingNotes.length > 0
                                            ? <span className="text-red-400">조치사항 미입력 {missingNotes.length}건</span>
                                            : <span className="text-green-500">승인 준비 완료 ({approvableRows.length}건)</span>
                                    }
                                </span>
                                <div className="flex gap-2">
                                    <button onClick={() => setApprovalModal(false)}
                                        className="px-4 py-2 text-sm font-bold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                                        취소
                                    </button>
                                    <button onClick={handleApprove} disabled={!canApprove}
                                        className={`px-4 py-2 text-sm font-bold text-white rounded-xl transition-colors ${
                                            canApprove ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-300 cursor-not-allowed'
                                        }`}>
                                        승인 확인 ({approvableRows.length}건)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
