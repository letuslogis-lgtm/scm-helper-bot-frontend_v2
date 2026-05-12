import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { loadXLSX } from './utils.js';
import { CloseIcon } from './SharedUI.jsx';

const supabaseClient = window.supabase;

const AttendanceUploadModal = ({ onClose, onReload }) => {
  const [files, setFiles] = useState([]);
  const [manualVendor, setManualVendor] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [holidayList, setHolidayList] = useState([]);

  React.useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const { data, error } = await supabaseClient.from('company_holidays').select('holiday_date');
        if (data) setHolidayList(data.map(h => h.holiday_date));
      } catch (err) {
        console.error("휴일 데이터를 불러오지 못했습니다.", err);
      }
    };
    fetchHolidays();
  }, []);

  const detectVendor = (fileName) => {
    const nameClean = fileName.toLowerCase().replace(/\s/g, '');
    if (nameClean.includes('바로')) return '협력사_바로서비스';
    if (nameClean.includes('하나')) return '협력사_하나물류';
    if (nameClean.includes('에프스토리') || nameClean.includes('fstory')) return '협력사_에프스토리';
    if (nameClean.includes('도급사1') || nameClean.includes('ipc')) return '도급사1';
    if (nameClean.includes('도급사2') || nameClean.includes('한국사람들')) return '도급사2';
    return '';
  };

  const processFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const validFiles = Array.from(fileList).filter(f => {
      const name = f.name.toLowerCase();
      return name.includes('.xls') || name.includes('.csv') || name.includes('.txt');
    });

    if (validFiles.length === 0) return alert('엑셀(.xlsx, .xls) 또는 텍스트(.csv, .txt) 파일만 가능합니다.');

    setFiles(prev => {
      const newArray = [...prev, ...validFiles];
      if (newArray.length === 1) setManualVendor(detectVendor(newArray[0].name));
      else setManualVendor('');
      return newArray;
    });
  };

  const removeFile = (indexToRemove) => {
    setFiles(prev => {
      const newArray = prev.filter((_, i) => i !== indexToRemove);
      if (newArray.length === 1) setManualVendor(detectVendor(newArray[0].name));
      else setManualVendor('');
      return newArray;
    });
  };

  const clearAllFiles = () => {
    setFiles([]);
    setManualVendor('');
  };

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const readFileAsync = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isTextFile = file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt');
    reader.onload = e => resolve({ data: e.target.result, isTextFile });
    reader.onerror = e => reject(e);
    if (isTextFile) reader.readAsText(file, 'euc-kr');
    else reader.readAsBinaryString(file);
  });

  const safeParse = (val) => {
    if (!val || val === '-' || String(val).trim() === '') return 0;
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const handleUpload = async () => {
    if (files.length === 0) return alert('업로드할 파일을 추가해 주세요.');
    setIsUploading(true);

    let allStandardData = [];
    let successFiles = [];
    let failedFiles = [];

    try {
      const XLSX = await loadXLSX();
      const { data: workerMaster, error: masterError } = await supabaseClient
        .from('workers')
        .select('name, support_status, managed_brand');

      const workerMap = {};
      if (workerMaster) {
        workerMaster.forEach(w => {
          workerMap[w.name.replace(/\s/g, '')] = {
            supportStatus: w.support_status,
            brand: w.managed_brand || ''
          };
        });
      }

      const newWorkersMap = new Map();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const vendorType = (files.length === 1 && manualVendor) ? manualVendor : detectVendor(file.name);

        if (!vendorType) {
          failedFiles.push(`${file.name} (업체 인식 불가)`);
          continue;
        }

        const { data, isTextFile } = await readFileAsync(file);

        // 🚩 [수정] 내부 코드(도급사1, 2)를 실제 화면용 예쁜 이름표로 변환해 줍니다!
        let exactVendor = vendorType.replace('협력사_', '');
        if (exactVendor === '도급사1') exactVendor = 'IPC';
        if (exactVendor === '도급사2') exactVendor = '한국사람들';
        if (exactVendor === '도급사3') exactVendor = 'JNT'; // (혹시 모를 도급사3 대비용)

        const companyType = vendorType.startsWith('협력사_') ? '사내협력사' : '외주도급사';

        // ---------------------------------------------------------
        // 1️⃣ 도급사1 (IPC) 전용 로직
        // ---------------------------------------------------------
        if (vendorType === '도급사1' || vendorType === 'IPC') {
          if (isTextFile) {
            failedFiles.push(`${file.name} (IPC는 엑셀 양식만 지원)`);
            continue;
          }

          let wb = XLSX.read(data, { type: 'binary' });
          let sheetName = wb.SheetNames[0];
          const raw2D = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' });

          const dateRowArr = raw2D.find(arr => arr.some(v => String(v).includes('월') && String(v).includes('일')));
          const manpowerRowArr = raw2D.find(arr => arr.some(v => String(v).replace(/\s/g, '') === '인원'));
          const overtimeRowArr = raw2D.find(arr => arr.some(v => String(v).replace(/\s/g, '') === '연장시간'));
          const deductionRowArr = raw2D.find(arr => arr.some(v => String(v).replace(/\s/g, '') === '공제시간'));

          if (!dateRowArr || !manpowerRowArr) {
            failedFiles.push(`${file.name} (IPC 날짜/인원 행을 찾을 수 없음)`);
            continue;
          }

          let parsedCountInFile = 0;
          let nonWorkingTemp = null;

          dateRowArr.forEach((dateStr, colIdx) => {
            const val = String(dateStr).replace(/\s+/g, '');
            const match = val.match(/(\d+)월(\d+)일/);
            if (!match) return;

            const manpower = safeParse(manpowerRowArr[colIdx]);
            const overtime = overtimeRowArr ? safeParse(overtimeRowArr[colIdx]) : 0;
            const deduction = deductionRowArr ? safeParse(deductionRowArr[colIdx]) : 0;

            if (manpower === 0 && overtime === 0) return;

            const currYear = new Date().getFullYear();
            const m = parseInt(match[1], 10);
            const d = parseInt(match[2], 10);
            const dateObj = new Date(currYear, m - 1, d);
            const dayOfWeek = dateObj.getDay();
            const formattedDate = `${currYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            const isNonWorkingDay = (dayOfWeek === 6 || dayOfWeek === 0 || holidayList.includes(formattedDate));

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

            if (!workerMap['IPC_통합']) {
              if (!newWorkersMap.has('IPC_통합')) {
                newWorkersMap.set('IPC_통합', {
                  name: 'IPC_통합', phone: '', company_type: companyType, vendor_name: exactVendor,
                  employment_type: '현장직', workplace: '', managed_brand: '', task: '', support_status: '미지원', status: '재직'
                });
              }
              workerMap['IPC_통합'] = { supportStatus: '미지원', brand: '' };
            }

            allStandardData.push({
              work_date: formattedDate,
              company_type: companyType,
              vendor_name: exactVendor,
              worked_vendor: exactVendor,
              worker_name: 'IPC_통합',
              start_time: '08:30',
              end_time: o_hours > 0 ? 'OT발생' : '17:30',
              work_hours: n_hours + o_hours,
              normal_hours: n_hours,
              overtime_hours: o_hours,
              weighted_hours: n_hours + (o_hours * 1.5),
              remark: `총 ${finalManpower}명 투입 (공제 ${finalDeduction}H 적용)`
            });
            parsedCountInFile++;
          });

          if (parsedCountInFile > 0) successFiles.push(file.name);
          else failedFiles.push(`${file.name} (데이터 0건)`);

          continue;
        }

        // ---------------------------------------------------------
        // 2️⃣ 🚩[신규 반영] 도급사2 (한국사람들) 전용 로직
        // ---------------------------------------------------------
        if (vendorType === '도급사2' || vendorType === '한국사람들') {
          if (isTextFile) {
            failedFiles.push(`${file.name} (한국사람들은 엑셀 양식만 지원합니다)`);
            continue;
          }

          let wb = XLSX.read(data, { type: 'binary' });
          // 💡 주간, 야간 시트만 필터링하여 순회 (다른 시트는 자동 무시)
          const targetSheets = wb.SheetNames.filter(n => n.includes('주간') || n.includes('야간'));

          if (targetSheets.length === 0) {
            failedFiles.push(`${file.name} ('주간' 또는 '야간' 시트를 찾을 수 없습니다)`);
            continue;
          }

          let parsedCountInFile = 0;

          targetSheets.forEach(sheetName => {
            const isNight = sheetName.includes('야간');
            const raw2D = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' });

            // 셀 병합에 구애받지 않도록 15번째 줄 안에서 핵심 컬럼의 위치(인덱스)를 동적으로 스캔
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
                startRow = r + 1; // 헤더 발견 시, 다음 줄부터 데이터 파싱 시작
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

              const currYear = new Date().getFullYear();
              const m = parseInt(match[1], 10);
              const d = parseInt(match[2], 10);
              const formattedDate = `${currYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

              let rawNormal = safeParse(row[colIdx.normal]);
              let rawExtra = safeParse(row[colIdx.extra]);

              if (rawNormal === 0 && rawExtra === 0) continue; // 데이터가 0인 날짜는 무시

              // 💡 핵심 룰 1, 2, 3: 요일이 토/일 이거나 비고에 '휴일'이 있으면 무조건 연장근무로!
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
              let masterInfo = workerMap[cleanName];

              if (!masterInfo) {
                if (!newWorkersMap.has(cleanName)) {
                  newWorkersMap.set(cleanName, {
                    name: nameVal, phone: '', company_type: companyType, vendor_name: exactVendor,
                    employment_type: '현장직', workplace: '', managed_brand: '', task: '', support_status: '미지원', status: '재직'
                  });
                }
                masterInfo = { supportStatus: '미지원', brand: '' };
                workerMap[cleanName] = masterInfo;
              }

              const statusVal = masterInfo.supportStatus ? String(masterInfo.supportStatus).trim() : '미지원';
              const actualWorkedVendor = (statusVal !== '미지원' && statusVal !== '') ? statusVal : exactVendor;
              const assignedBrand = masterInfo.brand || '';

              const finalRemark = [];
              if (isNight) finalRemark.push('[야간]');
              if (assignedBrand) finalRemark.push(`[${assignedBrand}]`);
              if (remarkStr) finalRemark.push(remarkStr);

              allStandardData.push({
                work_date: formattedDate,
                company_type: companyType,
                vendor_name: exactVendor,
                worked_vendor: actualWorkedVendor,
                worker_name: nameVal,
                start_time: '',
                end_time: '',
                work_hours: n_hours + o_hours,
                normal_hours: n_hours,
                overtime_hours: o_hours,
                weighted_hours: n_hours + (o_hours * 1.5),
                remark: finalRemark.join(' ').trim()
              });

              parsedCountInFile++;
            }
          });

          if (parsedCountInFile > 0) successFiles.push(file.name);
          else failedFiles.push(`${file.name} (유효한 근무 데이터가 없습니다)`);

          continue;
        }

        // ---------------------------------------------------------
        // 3️⃣ 기본 사내 협력사 (바로서비스, 하나물류, 에프스토리)
        // ---------------------------------------------------------
        let rows = [];
        if (isTextFile) {
          const lines = data.split(/\r?\n/).filter(line => line.trim() !== '');
          if (lines.length > 0) {
            const separator = lines[0].includes('\t') ? '\t' : ',';
            const headers = lines[0].split(separator).map(h => h.replace(/["\s]/g, ''));
            for (let j = 1; j < lines.length; j++) {
              const values = lines[j].split(separator);
              const row = {};
              headers.forEach((h, idx) => row[h] = values[idx] ? values[idx].replace(/"/g, '').trim() : '');
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

        if (rows.length === 0) {
          failedFiles.push(`${file.name} (데이터 없음)`);
          continue;
        }

        let parsedCount = 0;
        rows.forEach(rawRow => {
          const row = {};
          for (let key in rawRow) row[key.replace(/\s/g, '')] = rawRow[key];

          const dateVal = row['근무일자'] || row['날짜'] || '';
          const nameVal = row['사원명'] || row['근로자명'] || row['구분'] || '';
          if (!nameVal || nameVal === '계') return;

          const cleanName = nameVal.replace(/\s/g, '');
          let masterInfo = workerMap[cleanName];

          if (!masterInfo) {
            if (!newWorkersMap.has(cleanName)) {
              newWorkersMap.set(cleanName, {
                name: nameVal, phone: '', company_type: companyType, vendor_name: exactVendor,
                employment_type: '현장직', workplace: '', managed_brand: '', task: '', support_status: '미지원', status: '재직'
              });
            }
            masterInfo = { supportStatus: '미지원', brand: '' };
            workerMap[cleanName] = masterInfo;
          }

          const statusVal = masterInfo.supportStatus ? String(masterInfo.supportStatus).trim() : '미지원';
          const actualWorkedVendor = (statusVal !== '미지원' && statusVal !== '')
            ? statusVal
            : exactVendor;

          const assignedBrand = masterInfo.brand || '';

          if (dateVal) {
            let startTime = row['출근시간'] || row['출근'] || '';
            let endTime = row['퇴근시간'] || row['퇴근'] || '';
            let remarkStr = row['이상유무'] || row['비고'] || '';

            let w_hours = 8, n_hours = 8, o_hours = 0, weight_hours = 8;

            if (companyType === '사내협력사') {
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
              allStandardData.push({
                work_date: dateVal.replace(/\./g, '-'),
                company_type: companyType,
                vendor_name: exactVendor,
                worked_vendor: actualWorkedVendor,
                worker_name: nameVal,
                start_time: startTime === ':' ? '' : startTime,
                end_time: endTime === ':' ? '' : endTime,
                work_hours: w_hours,
                normal_hours: n_hours,
                overtime_hours: o_hours,
                weighted_hours: weight_hours,
                remark: assignedBrand ? `[${assignedBrand}] ${remarkStr}` : remarkStr
              });
            }
            parsedCount++;
          }
        });

        if (parsedCount > 0) successFiles.push(file.name);
        else failedFiles.push(`${file.name} (양식 불일치)`);
      }

      if (allStandardData.length === 0) throw new Error('추출된 데이터가 0건입니다. 엑셀 파일 형식을 확인해 주세요.');

      const newWorkersArray = Array.from(newWorkersMap.values());
      let generatedWorkerCount = 0;
      if (newWorkersArray.length > 0) {
        const { error: workerInsertError } = await supabaseClient.from('workers').insert(newWorkersArray);
        if (workerInsertError) throw new Error('신규 근무자 임시 생성 중 오류: ' + workerInsertError.message);
        generatedWorkerCount = newWorkersArray.length;
      }

      const { error } = await supabaseClient.from('worker_attendance').insert(allStandardData);
      if (error) throw error;

      let resultMsg = `🎉 총 ${allStandardData.length}건의 데이터가 일괄 등록되었습니다!\n\n`;
      if (generatedWorkerCount > 0) {
        resultMsg += `📝 (자동 생성) 미등록 인원 ${generatedWorkerCount}명이 마스터 DB에 추가되었습니다.\n`;
      }
      resultMsg += `✅ 성공: ${successFiles.length}개 파일\n`;
      if (failedFiles.length > 0) resultMsg += `❌ 실패: ${failedFiles.length}개 파일\n(${failedFiles.join(', ')})`;

      alert(resultMsg);
      if (onReload) onReload();
      onClose();

    } catch (err) { alert('업로드 오류: ' + err.message); }
    finally { setIsUploading(false); }
  };

  const activeVendors = files.length === 1 && manualVendor
    ? [manualVendor]
    : files.map(f => detectVendor(f.name)).filter(Boolean);

  const vendorList = [
    { id: '협력사_바로서비스', label: '바로서비스' },
    { id: '협력사_하나물류', label: '하나물류' },
    { id: '협력사_에프스토리', label: '에프스토리' },
    { id: '도급사1', label: 'IPC' },
    { id: '도급사2', label: '한국사람들' },
    { id: '도급사3', label: '도급사3' }
  ];

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl z-10 w-full max-w-[600px] flex flex-col overflow-hidden slide-up">

        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-bold text-gray-800 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-green-500 rounded-full"></span>근태 데이터 통합 업로드
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors"><CloseIcon /></button>
        </div>

        <div className="p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar max-h-[80vh]">
          <div className="bg-[#f8faff] border border-blue-100/60 rounded-xl p-5">
            <p className="text-sm font-bold text-gray-800 mb-2.5 flex items-center gap-1.5">
              <span className="text-yellow-500 text-base">💡</span> 파일 업로드 가이드
            </p>
            <ul className="text-xs text-gray-600 space-y-2 list-disc list-inside ml-1">
              <li>협력사 및 도급사 근태 데이터를 <span className="font-bold text-gray-800">다중 업로드</span> 할 수 있습니다.</li>
              <li>ERP 엑셀 다운로드 파일 오류 시, <span className="font-bold text-blue-600">CSV 또는 TXT 형식</span>을 권장합니다.</li>
              <li>파일 이름에 <span className="font-bold text-blue-600">바로서비스, 하나, IPC, 한국사람들</span> 등 업체명이 포함되어야 자동 인식됩니다.</li>
            </ul>
          </div>

          <div
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            className={`relative border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center transition-all min-h-[160px] ${isDragging ? 'border-letusBlue bg-blue-50/50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-gray-400'}`}
          >
            <input type="file" multiple accept=".xlsx, .xls, .csv, .txt" onChange={(e) => processFiles(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />

            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4">
                <svg className="w-8 h-8 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-[13px] font-bold text-gray-700">업로드할 파일들을 이곳으로 드래그 하세요</p>
              </div>
            ) : (
              <div className="w-full flex flex-col h-full z-20">
                <div className="flex justify-between items-center mb-3 px-1">
                  <span className="text-[12px] font-bold text-letusBlue">총 {files.length}개 파일 선택됨</span>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[150px] custom-scrollbar space-y-2 relative z-30 pr-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex justify-between items-center bg-white border border-gray-200 px-4 py-2.5 rounded-lg shadow-sm text-xs group hover:border-letusBlue/50 transition-colors">
                      <span className="truncate w-[90%] font-bold text-gray-700 flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        {f.name}
                      </span>
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeFile(i); }} className="text-gray-400 hover:text-red-500 transition-colors"><CloseIcon /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {vendorList.map(vendor => {
              const isActive = activeVendors.includes(vendor.id);
              return (
                <div
                  key={vendor.id}
                  onClick={() => { if (files.length === 1) setManualVendor(vendor.id); }}
                  className={`relative flex items-center justify-center py-3 rounded-lg border text-[12px] font-bold transition-all ${files.length === 1 ? 'cursor-pointer hover:border-blue-300' : ''} ${isActive ? 'bg-white border-letusBlue text-letusBlue shadow-[0_0_0_1px_rgba(59,130,246,1)]' : 'bg-gray-50/50 border-gray-200 text-gray-400'}`}
                >
                  {vendor.label}
                  {isActive && (
                    <svg className="w-4 h-4 text-letusBlue ml-1.5 animate-fade-in" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
          {files.length === 1 && <p className="text-[10px] text-gray-400 font-bold text-right -mt-4">* 단일 파일 업로드 시 업체 수동 변경 가능</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center shrink-0">
          <button
            onClick={clearAllFiles}
            disabled={files.length === 0}
            className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${files.length > 0 ? 'text-gray-500 hover:text-gray-800' : 'text-transparent cursor-default'}`}
          >
            {files.length > 0 && (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                파일 목록 비우기
              </>
            )}
          </button>

          <div className="flex gap-2">
            <button onClick={onClose} className="px-6 py-2.5 border border-gray-300 bg-white text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors">닫기</button>
            <button onClick={handleUpload} disabled={isUploading || files.length === 0} className="px-6 py-2.5 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center gap-1.5">
              {isUploading ? '데이터 분석 중...' : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  분석 및 DB 저장
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- ✏️ 2. 근태/생산성: 선택 항목 일괄 수정 모달 ---

export { AttendanceUploadModal };
