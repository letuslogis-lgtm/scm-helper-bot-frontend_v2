// ===========================================================================
// IPC (도급사1) 파서
//   엑셀 가로형 양식: 날짜 행 / 인원 행 / 연장시간 행 / 공제시간 행
//   주말·휴일 데이터는 임시 누적했다가 다음 평일에 합산한다. (원 양식 규칙)
//   근무자는 'IPC_통합' 단일 합산 인원으로 기록.
// ===========================================================================
import { safeParse, ensureWorker } from './shared.js';

export function parseIPC({ data, isTextFile, XLSX, ctx }) {
  if (isTextFile) return { records: [], count: 0, error: 'IPC는 엑셀 양식만 지원' };

  const wb = XLSX.read(data, { type: 'binary' });
  const sheetName = wb.SheetNames[0];
  const raw2D = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' });

  const dateRowArr = raw2D.find(arr => arr.some(v => String(v).includes('월') && String(v).includes('일')));
  const manpowerRowArr = raw2D.find(arr => arr.some(v => String(v).replace(/\s/g, '') === '인원'));
  const overtimeRowArr = raw2D.find(arr => arr.some(v => String(v).replace(/\s/g, '') === '연장시간'));
  const deductionRowArr = raw2D.find(arr => arr.some(v => String(v).replace(/\s/g, '') === '공제시간'));

  if (!dateRowArr || !manpowerRowArr) {
    return { records: [], count: 0, error: 'IPC 날짜/인원 행을 찾을 수 없음' };
  }

  const records = [];
  let count = 0;
  let nonWorkingTemp = null;

  dateRowArr.forEach((dateStr, colIdx) => {
    const val = String(dateStr).replace(/\s+/g, '');
    const match = val.match(/(\d+)월(\d+)일/);
    if (!match) return;

    const manpower = safeParse(manpowerRowArr[colIdx]);
    const overtime = overtimeRowArr ? safeParse(overtimeRowArr[colIdx]) : 0;
    const deduction = deductionRowArr ? safeParse(deductionRowArr[colIdx]) : 0;

    if (manpower === 0 && overtime === 0) return;

    const m = parseInt(match[1], 10);
    const d = parseInt(match[2], 10);
    const dateObj = new Date(ctx.currentYear, m - 1, d);
    const dayOfWeek = dateObj.getDay();
    const formattedDate = `${ctx.currentYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    const isNonWorkingDay = (dayOfWeek === 6 || dayOfWeek === 0 || ctx.holidayList.includes(formattedDate));

    if (isNonWorkingDay) {
      if (!nonWorkingTemp) {
        nonWorkingTemp = { manpower, overtime, deduction, date: formattedDate };
      } else {
        nonWorkingTemp.manpower += manpower;
        nonWorkingTemp.overtime += overtime;
        nonWorkingTemp.deduction += deduction;
      }
      return;
    }

    let finalManpower = manpower;
    let finalOvertime = overtime;
    let finalDeduction = deduction;

    if (nonWorkingTemp) {
      finalManpower += nonWorkingTemp.manpower;
      finalOvertime += nonWorkingTemp.overtime;
      finalDeduction += nonWorkingTemp.deduction;
      nonWorkingTemp = null;
    }

    const n_hours = (finalManpower * 8) - finalDeduction;
    const o_hours = finalOvertime;

    ensureWorker('IPC_통합', 'IPC_통합', ctx);

    records.push({
      work_date: formattedDate,
      company_type: ctx.companyType,
      vendor_name: ctx.vendor,
      worked_vendor: ctx.vendor,
      worker_name: 'IPC_통합',
      start_time: '08:30',
      end_time: o_hours > 0 ? 'OT발생' : '17:30',
      work_hours: n_hours + o_hours,
      normal_hours: n_hours,
      overtime_hours: o_hours,
      weighted_hours: n_hours + (o_hours * 1.5),
      remark: `총 ${finalManpower}명 투입 (공제 ${finalDeduction}H 적용)`,
    });
    count++;
  });

  if (count === 0) return { records: [], count: 0, error: '데이터 0건' };
  return { records, count, error: null };
}
