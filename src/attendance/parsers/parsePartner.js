// ===========================================================================
// 사내협력사 (바로서비스·하나물류·에프스토리) + 기타 도급사(JNT) 파서
//   세로형 명부 양식(엑셀/CSV/TXT/HTML표). 사내협력사는 분 단위 항목으로
//   정상/연장/가중 시간을 상세 계산한다.
// ===========================================================================
import { safeParse, ensureWorker, resolveWorkedVendor } from './shared.js';

export function parsePartner({ data, isTextFile, XLSX, ctx }) {
  let rows = [];

  if (isTextFile) {
    const lines = data.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length > 0) {
      const separator = lines[0].includes('\t') ? '\t' : ',';
      const headers = lines[0].split(separator).map(h => h.replace(/["\s]/g, ''));
      for (let j = 1; j < lines.length; j++) {
        const values = lines[j].split(separator);
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] ? values[idx].replace(/"/g, '').trim() : ''; });
        rows.push(row);
      }
    }
  } else {
    let wb = XLSX.read(data, { type: 'binary' });
    for (let j = 0; j < wb.SheetNames.length; j++) {
      const tempRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[j]], { defval: '', raw: false });
      if (tempRows.length > 0) { rows = tempRows; break; }
    }
    if (rows.length === 0 && (data.includes('<table') || data.includes('<TABLE'))) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(data, 'text/html');
      const table = doc.querySelector('table');
      if (table) {
        wb = XLSX.utils.table_to_book(table);
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      }
    }
  }

  if (rows.length === 0) return { records: [], count: 0, error: '데이터 없음' };

  const records = [];
  let count = 0;

  rows.forEach(rawRow => {
    const row = {};
    for (const key in rawRow) row[key.replace(/\s/g, '')] = rawRow[key];

    const dateVal = row['근무일자'] || row['날짜'] || '';
    const nameVal = row['사원명'] || row['근로자명'] || row['구분'] || '';
    if (!nameVal || nameVal === '계') return;

    const cleanName = nameVal.replace(/\s/g, '');
    const masterInfo = ensureWorker(cleanName, nameVal, ctx);
    const actualWorkedVendor = resolveWorkedVendor(masterInfo, ctx.vendor);
    const assignedBrand = masterInfo.brand || '';

    if (!dateVal) return;

    let startTime = row['출근시간'] || row['출근'] || '';
    let endTime = row['퇴근시간'] || row['퇴근'] || '';
    let remarkStr = row['이상유무'] || row['비고'] || '';

    let w_hours = 8, n_hours = 8, o_hours = 0, weight_hours = 8;

    if (ctx.companyType === '사내협력사') {
      const gubun = row['구분'] || '정상';
      remarkStr = remarkStr ? `${gubun} / ${remarkStr}` : gubun;

      const parseMinToHour = (v) => safeParse(v) / 60;
      const calcDiff = (start, end) => {
        if (!start || !end) return 0;
        const [sH, sM] = start.split(':').map(Number);
        const [eH, eM] = end.split(':').map(Number);
        if (isNaN(sH) || isNaN(eH)) return 0;
        return Math.max(0, ((eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0))) / 60);
      };

      const p_over = parseMinToHour(row['평일연장근무'] || row['평일연장시간'] || row['평일연장']);
      const p_night = parseMinToHour(row['평일심야근무'] || row['평일심야시간'] || row['평일심야']);
      const h_work = parseMinToHour(row['휴일근무'] || row['휴일근무시간']);
      const h_over = parseMinToHour(row['휴일연장근무'] || row['휴일연장시간'] || row['휴일연장']);
      const h_night = parseMinToHour(row['휴일심야근무'] || row['휴일심야시간'] || row['휴일심야']);
      const early = parseMinToHour(row['조기출근시간'] || row['조기출근']);
      const lunch = parseMinToHour(row['점심근무시간'] || row['점심근무']);
      const late = parseMinToHour(row['지각시간'] || row['지각']);
      const leave = parseMinToHour(row['조퇴시간'] || row['조퇴']);
      const out = parseMinToHour(row['외출시간'] || row['외출']);

      if (!startTime && !endTime) {
        w_hours = 0; n_hours = 0; o_hours = 0; weight_hours = 0;
      } else {
        if (gubun === '정상') {
          n_hours = Math.max(0, 8 - late - leave - out);
          o_hours = p_over + p_night + h_work + h_over + h_night + early;
          w_hours = n_hours + o_hours;
        } else {
          const baseTime = calcDiff('08:30', endTime);
          let lunchDeduction = 1;
          if (lunch > 0) {
            lunchDeduction = Math.max(0, 1 - lunch);
          } else if (endTime < '13:00' || remarkStr.includes('점심미휴게') || remarkStr.includes('식사안함') || remarkStr.includes('휴게없음')) {
            lunchDeduction = 0;
          }
          w_hours = Math.max(0, baseTime + early - lunchDeduction - late - leave - out);
          n_hours = 0;
          o_hours = w_hours;
        }
        weight_hours = n_hours + (o_hours * 1.5);
      }
    }

    const isRealStart = startTime && String(startTime).trim() !== ':';
    const isRealEnd = endTime && String(endTime).trim() !== ':';

    if (isRealStart || isRealEnd || w_hours > 0) {
      records.push({
        work_date: dateVal.replace(/\./g, '-'),
        company_type: ctx.companyType,
        vendor_name: ctx.vendor,
        worked_vendor: actualWorkedVendor,
        worker_name: nameVal,
        start_time: startTime === ':' ? '' : startTime,
        end_time: endTime === ':' ? '' : endTime,
        work_hours: w_hours,
        normal_hours: n_hours,
        overtime_hours: o_hours,
        weighted_hours: weight_hours,
        remark: assignedBrand ? `[${assignedBrand}] ${remarkStr}` : remarkStr,
      });
    }
    count++;
  });

  if (count === 0) return { records: [], count: 0, error: '양식 불일치' };
  return { records, count, error: null };
}
