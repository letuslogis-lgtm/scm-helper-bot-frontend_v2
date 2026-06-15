// ===========================================================================
// 근무자 근태 관리 — 날짜 유틸
// ===========================================================================

const pad = (n) => n.toString().padStart(2, '0');
export const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 이번 달 1일
export const monthStart = () => {
  const n = new Date();
  return formatDate(new Date(n.getFullYear(), n.getMonth(), 1));
};
// 이번 달 말일
export const monthEnd = () => {
  const n = new Date();
  return formatDate(new Date(n.getFullYear(), n.getMonth() + 1, 0));
};

// 빠른 기간 선택(D/W/M) → {start, end}. CUSTOM은 호출부에서 별도 처리.
export const getFilterDates = (type, fallbackStart, fallbackEnd) => {
  const now = new Date();
  if (type === 'D') {
    const today = formatDate(now);
    return { start: today, end: today };
  }
  if (type === 'W') {
    const day = now.getDay();
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now); monday.setDate(diffToMonday);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { start: formatDate(monday), end: formatDate(sunday) };
  }
  if (type === 'M') {
    return { start: monthStart(), end: monthEnd() };
  }
  return { start: fallbackStart, end: fallbackEnd };
};

// work_date(문자열)가 [start, end] 범위 안에 있는지
export const isDateInRange = (dateStr, start, end) => {
  if (!dateStr || !start || !end) return true;
  const dTime = new Date(dateStr).setHours(0, 0, 0, 0);
  const sTime = new Date(start).setHours(0, 0, 0, 0);
  const eTime = new Date(end).setHours(23, 59, 59, 999);
  return dTime >= sTime && dTime <= eTime;
};
