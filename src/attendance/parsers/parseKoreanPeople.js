// ===========================================================================
// 한국사람들 (도급사2) 파서
//   '주간'/'야간' 시트만 순회. 헤더 위치를 동적 스캔(셀 병합 대응).
//   토/일 또는 비고에 '휴일' → 전 시간을 연장근무로 처리.
// ===========================================================================
import { safeParse, ensureWorker, resolveWorkedVendor } from './shared.js';

export function parseKoreanPeople({ data, isTextFile, XLSX, ctx }) {
  if (isTextFile) return { records: [], count: 0, error: '한국사람들은 엑셀 양식만 지원합니다' };

  const wb = XLSX.read(data, { type: 'binary' });
  const targetSheets = wb.SheetNames.filter(n => n.includes('주간') || n.includes('야간'));

  if (targetSheets.length === 0) {
    return { records: [], count: 0, error: "'주간' 또는 '야간' 시트를 찾을 수 없습니다" };
  }

  const records = [];
  let count = 0;

  targetSheets.forEach(sheetName => {
    const isNight = sheetName.includes('야간');
    const raw2D = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' });

    // 상단 15줄 내에서 핵심 컬럼 위치를 동적으로 스캔
    let colIdx = { date: -1, day: -1, name: -1, normal: -1, extra: -1, remark: -1 };
    let startRow = -1;

    for (let r = 0; r < Math.min(raw2D.length, 15); r++) {
      const row = raw2D[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').replace(/\s/g, '');
        if (cell.includes('일자')) colIdx.date = c;
        if (cell.includes('요일')) colIdx.day = c;
        if (cell.includes('성명')) colIdx.name = c;
        if (cell.includes('정상근무')) colIdx.normal = c;
        if (cell.includes('잔업')) colIdx.extra = c;
        if (cell.includes('비고')) colIdx.remark = c;
      }
      if (colIdx.date !== -1 && colIdx.name !== -1 && colIdx.normal !== -1) {
        startRow = r + 1;
        break;
      }
    }

    if (startRow === -1) return;

    for (let r = startRow; r < raw2D.length; r++) {
      const row = raw2D[r];
      if (!row || !row[colIdx.name]) continue;

      const nameVal = String(row[colIdx.name]).trim();
      const dateStr = String(row[colIdx.date]).trim();
      const dayStr = colIdx.day !== -1 ? String(row[colIdx.day]).trim() : '';
      const remarkStr = colIdx.remark !== -1 ? String(row[colIdx.remark]).trim() : '';

      if (!dateStr || nameVal === '' || nameVal.includes('계') || nameVal === '성명') continue;

      const match = dateStr.replace(/\s+/g, '').match(/(\d+)월(\d+)일/);
      if (!match) continue;

      const m = parseInt(match[1], 10);
      const d = parseInt(match[2], 10);
      const formattedDate = `${ctx.currentYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      const rawNormal = safeParse(row[colIdx.normal]);
      const rawExtra = safeParse(row[colIdx.extra]);

      if (rawNormal === 0 && rawExtra === 0) continue;

      // 토/일 또는 비고 '휴일' → 전부 연장근무
      const isHoliday = dayStr === '토' || dayStr === '일' || remarkStr.includes('휴일');

      let n_hours = 0;
      let o_hours = 0;
      if (isHoliday) {
        n_hours = 0;
        o_hours = rawNormal + rawExtra;
      } else {
        n_hours = rawNormal;
        o_hours = rawExtra;
      }

      const cleanName = nameVal.replace(/\s/g, '');
      const masterInfo = ensureWorker(cleanName, nameVal, ctx);
      const actualWorkedVendor = resolveWorkedVendor(masterInfo, ctx.vendor);
      const assignedBrand = masterInfo.brand || '';

      const finalRemark = [];
      if (isNight) finalRemark.push('[야간]');
      if (assignedBrand) finalRemark.push(`[${assignedBrand}]`);
      if (remarkStr) finalRemark.push(remarkStr);

      records.push({
        work_date: formattedDate,
        company_type: ctx.companyType,
        vendor_name: ctx.vendor,
        worked_vendor: actualWorkedVendor,
        worker_name: nameVal,
        start_time: '',
        end_time: '',
        work_hours: n_hours + o_hours,
        normal_hours: n_hours,
        overtime_hours: o_hours,
        weighted_hours: n_hours + (o_hours * 1.5),
        remark: finalRemark.join(' ').trim(),
      });
      count++;
    }
  });

  if (count === 0) return { records: [], count: 0, error: '유효한 근무 데이터가 없습니다' };
  return { records, count, error: null };
}
