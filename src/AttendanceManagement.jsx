import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, adminSupabase } from './supabaseClient.js';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line, ComposedChart, Area, AreaChart } from 'recharts';
;





const supabaseClient = window.supabase;


// ✖️ 공통으로 사용할 닫기 아이콘 컴포넌트
const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

// --- 📥 1. 근태 데이터 통합 업로드 모달 ---
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
                            const masterInfo = workerMap[cleanName] || {};
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
                    const masterInfo = workerMap[cleanName] || {};

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

            const { error } = await supabaseClient.from('worker_attendance').insert(allStandardData);
            if (error) throw error;

            let resultMsg = `🎉 총 ${allStandardData.length}건의 데이터가 일괄 등록되었습니다!\n\n`;
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
const AttendanceBulkEditModal = ({ selectedIds, onClose, onReload }) => {
    const [workedVendor, setWorkedVendor] = useState('');
    const [remark, setRemark] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!workedVendor && !remark) return alert('변경할 투입 업체나 비고 내용을 입력해 주세요.');
        if (!window.confirm(`선택하신 ${selectedIds.length}명의 근무 데이터를 일괄 수정하시겠습니까?\n(지원/파견 처리)`)) return;

        setIsSaving(true);
        try {
            const updateData = {};
            if (workedVendor) updateData.worked_vendor = workedVendor;
            if (remark) updateData.remark = remark;

            const { error } = await supabaseClient.from('worker_attendance').update(updateData).in('id', selectedIds);
            if (error) throw error;

            alert(`🎉 총 ${selectedIds.length}명의 데이터가 일괄 수정되었습니다.`);
            onReload();
            onClose();
        } catch (err) {
            alert('일괄 저장 중 오류 발생: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-md slide-up overflow-hidden border border-gray-100 flex flex-col">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-letusOrange rounded-full"></span>
                        선택 인원 일괄 수정 (지원/파견)
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm font-bold text-letusBlue text-center">
                        현재 <span className="text-lg mx-1">{selectedIds.length}</span>명의 근무 데이터가 선택되었습니다.
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-[12px] font-bold text-gray-700 mb-2">실제 투입 업체 (지원/파견 변경 시)</label>
                            <select value={workedVendor} onChange={e => setWorkedVendor(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue transition-all cursor-pointer bg-white">
                                <option value="">변경 안 함 (기존 소속 유지)</option>
                                <option value="바로서비스">바로서비스</option>
                                <option value="하나물류">하나물류</option>
                                <option value="에프스토리">에프스토리</option>
                                <option value="IPC">IPC</option>
                                <option value="한국사람들">한국사람들</option>
                                <option value="JNT">JNT</option>
                            </select>
                            <p className="text-[10px] text-gray-400 mt-1.5 font-medium">* 선택 시 원 소속과 무관하게 해당 업체의 생산성(UPH)으로 집계됩니다.</p>
                        </div>

                        <div>
                            <label className="block text-[12px] font-bold text-gray-700 mb-2">특이사항 (비고) 일괄 적용</label>
                            <input type="text" value={remark} onChange={e => setRemark(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue transition-all placeholder:text-gray-300" placeholder="예: IPC 물량 증가로 인한 오후 지원" />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors shadow-sm">취소</button>
                    <button onClick={handleSave} disabled={isSaving || (!workedVendor && !remark)} className={`px-6 py-2 bg-letusBlue text-white text-sm font-bold rounded-lg shadow hover:bg-blue-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}>
                        {isSaving ? '일괄 적용 중...' : '확인 및 일괄 적용'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- 👥 3. 근무자 근태 관리 대시보드 (메인 화면) ---
// --- 👥 3. 근무자 근태 관리 대시보드 (메인 화면) ---
const AttendanceManagement = () => {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('summary');
    const [expandedGroups, setExpandedGroups] = useState([]);

    const [selectedIds, setSelectedIds] = useState([]);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);

    const [sortConfig, setSortConfig] = useState(null);

    // 날짜 상태
    const [tempStartDate, setTempStartDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
    const [tempEndDate, setTempEndDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()}`);
    const [startDate, setStartDate] = useState(tempStartDate);
    const [endDate, setEndDate] = useState(tempEndDate);

    const [tempChartStartDate, setTempChartStartDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
    const [tempChartEndDate, setTempChartEndDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()}`);
    const [chartStartDate, setChartStartDate] = useState(tempChartStartDate);
    const [chartEndDate, setChartEndDate] = useState(tempChartEndDate);

    // 필터 상태
    const [inputValue, setInputValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [workerTypeFilter, setWorkerTypeFilter] = useState('현장직');
    const [locationFilter, setLocationFilter] = useState('메인센터');
    const [selectedVendor, setSelectedVendor] = useState('전체');

    // 🚩 [신규] 집계 화면 뷰 모드 (업체별 vs 브랜드별)
    const [summaryViewMode, setSummaryViewMode] = useState('vendor');

    const [workerMasterMap, setWorkerMasterMap] = useState({});
    const [attendanceData, setAttendanceData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [filterType, setFilterType] = useState('D');
    const [chartFilterType, setChartFilterType] = useState('M');

    React.useEffect(() => {
        const fetchWorkerMaster = async () => {
            try {
                // 🚩 브랜드명(managed_brand) 추가 로드
                const { data, error } = await supabaseClient.from('workers').select('name, employment_type, work_location, managed_brand');
                if (data) {
                    const masterMap = {};
                    data.forEach(w => {
                        masterMap[w.name.replace(/\s/g, '')] = {
                            type: w.employment_type,
                            location: w.work_location,
                            brand: w.managed_brand || '미지정/공통' // 브랜드 정보 저장
                        };
                    });
                    setWorkerMasterMap(masterMap);
                }
            } catch (err) { console.error("마스터 정보 로드 실패", err); }
        };
        fetchWorkerMaster();
    }, []);

    React.useEffect(() => {
        const timer = setTimeout(() => setSearchTerm(inputValue), 300);
        return () => clearTimeout(timer);
    }, [inputValue]);

    const getFilterDates = (type) => {
        const now = new Date();
        const pad = n => n.toString().padStart(2, '0');
        const format = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        if (type === 'D') {
            const today = format(now); return { start: today, end: today };
        } else if (type === 'W') {
            const day = now.getDay(); const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(now); monday.setDate(diffToMonday);
            const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
            return { start: format(monday), end: format(sunday) };
        } else if (type === 'M') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { start: format(firstDay), end: format(lastDay) };
        }
        return { start: tempStartDate, end: tempEndDate };
    };

    React.useEffect(() => {
        if (filterType !== 'CUSTOM') {
            const { start, end } = getFilterDates(filterType);
            setStartDate(start); setEndDate(end); setTempStartDate(start); setTempEndDate(end);
        } else { setStartDate(tempStartDate); setEndDate(tempEndDate); }
    }, [filterType]);

    React.useEffect(() => {
        if (chartFilterType !== 'CUSTOM') {
            const { start, end } = getFilterDates(chartFilterType);
            setChartStartDate(start); setChartEndDate(end); setTempChartStartDate(start); setTempChartEndDate(end);
        } else { setChartStartDate(tempChartStartDate); setChartEndDate(tempChartEndDate); }
    }, [chartFilterType]);

    const fetchAttendance = async () => {
        setIsLoading(true);
        try {
            let allData = []; let hasMore = true; let page = 0; const pageSize = 1000;
            while (hasMore) {
                const { data, error } = await supabaseClient.from('worker_attendance').select('*').order('work_date', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
                if (error) throw error;
                if (data && data.length > 0) { allData = [...allData, ...data]; page++; if (data.length < pageSize) hasMore = false; } else { hasMore = false; }
            }
            const cleanData = allData.filter(row => {
                const validStart = row.start_time && String(row.start_time).trim() !== '' && String(row.start_time).trim() !== ':';
                const validEnd = row.end_time && String(row.end_time).trim() !== '' && String(row.end_time).trim() !== ':';
                return validStart || validEnd || Number(row.work_hours) > 0;
            });
            setAttendanceData(cleanData);
        } catch (err) { console.error('근태 조회 실패:', err.message); } finally { setIsLoading(false); }
    };

    React.useEffect(() => { fetchAttendance(); }, []);

    // 상세 내역 및 차트 공통 필터 로직 (날짜 제외)
    const baseFilterLogic = (row) => {
        if (selectedVendor !== '전체' && row.company_type !== selectedVendor) return false;
        if (searchTerm) {
            const matchName = row.worker_name?.includes(searchTerm);
            const matchVendor = row.vendor_name?.includes(searchTerm) || row.worked_vendor?.includes(searchTerm);
            if (!matchName && !matchVendor) return false;
        }

        const cleanName = row.worker_name?.replace(/\s/g, '') || '';
        const masterInfo = workerMasterMap[cleanName] || {};

        const wType = masterInfo.type === '사무직' ? '사무직' : '현장직';
        if (workerTypeFilter === '현장직' && wType === '사무직') return false;
        if (workerTypeFilter === '사무직' && wType !== '사무직') return false;

        const loc = masterInfo.location || '';
        const isRegional = (loc === '동부센터' || loc === '서부센터');
        if (locationFilter === '메인센터' && isRegional) return false;
        if (locationFilter === '지방센터' && !isRegional) return false;

        return true;
    };

    const filteredDetailData = useMemo(() => {
        return attendanceData.filter(row => {
            if (row.work_date < startDate || row.work_date > endDate) return false;
            return baseFilterLogic(row);
        });
    }, [attendanceData, startDate, endDate, selectedVendor, searchTerm, workerTypeFilter, locationFilter, workerMasterMap]);

    const filteredChartData = useMemo(() => {
        return attendanceData.filter(row => {
            if (!row.work_date || row.work_date < chartStartDate || row.work_date > chartEndDate) return false;
            return baseFilterLogic(row);
        });
    }, [attendanceData, chartStartDate, chartEndDate, selectedVendor, searchTerm, workerTypeFilter, locationFilter, workerMasterMap]);

    const sortedDetailData = React.useMemo(() => {
        let sortableItems = [...filteredDetailData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key]; let bValue = b[sortConfig.key];
                if (sortConfig.key === 'work_date' || sortConfig.key === 'go_work_time' || sortConfig.key === 'leave_work_time') {
                    aValue = new Date(aValue || 0).getTime() || 0; bValue = new Date(bValue || 0).getTime() || 0;
                } else if (sortConfig.key === 'normal_hours' || sortConfig.key === 'overtime_hours' || sortConfig.key === 'work_hours') {
                    aValue = Number(aValue) || 0; bValue = Number(bValue) || 0;
                } else {
                    aValue = (aValue || '').toString().toLowerCase(); bValue = (bValue || '').toString().toLowerCase();
                }
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [filteredDetailData, sortConfig]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    // 🚩 [핵심] 집계 로직: 뷰 모드에 따라 그룹핑 기준을 완벽하게 스위칭!
    const { summaryDataList, chartDataList, totalSummary } = useMemo(() => {
        const groupSummaryMap = {};
        const chartDataMap = {};

        filteredChartData.forEach(row => {
            const monthStr = row.work_date ? row.work_date.substring(0, 7) : '미상';
            const actualVendor = row.worked_vendor || '미분류';

            let groupKey = '';
            let groupType = '';
            let subGroupKey = '';

            if (summaryViewMode === 'vendor') {
                // 🏢 [업체별 보기]
                groupKey = actualVendor; // 대분류: 실투입 업체명
                const isPartner = ['바로서비스', '하나물류', '에프스토리'].includes(groupKey);
                groupType = isPartner ? '사내협력사' : '외주도급사';
                subGroupKey = monthStr;  // 중분류: 월별 추이
            } else {
                // 🏷️ [브랜드별 보기]
                const cleanName = row.worker_name?.replace(/\s/g, '') || '';
                const masterInfo = workerMasterMap[cleanName] || {};

                // 1순위: 마스터 DB의 브랜드, 2순위: 비고란의 [브랜드] 태그 파싱
                let brandName = (masterInfo.brand && masterInfo.brand !== '미지정/공통') ? masterInfo.brand : null;
                if (!brandName && row.remark) {
                    const match = row.remark.match(/\[(.*?)\]/);
                    // [야간] 같은 예외 태그 방어
                    if (match && match[1] !== '야간' && match[1] !== '전체') {
                        brandName = match[1];
                    } else if (row.remark.includes('[전체]')) {
                        brandName = '전체(공통)';
                    }
                }

                groupKey = brandName || '미지정/공통'; // 대분류: 브랜드명
                groupType = '브랜드';                 // 구분명
                subGroupKey = actualVendor;          // 🚩 중분류: 실투입 업체명!!
            }

            if (!groupSummaryMap[groupKey]) {
                groupSummaryMap[groupKey] = { type: groupType, name: groupKey, normal: 0, overtime: 0, total: 0, weighted: 0, subMap: {} };
            }
            const gMap = groupSummaryMap[groupKey];
            const normalH = Number(row.normal_hours) || 0; const overH = Number(row.overtime_hours) || 0;
            const totalH = Number(row.work_hours) || 0; const weightedH = Number(row.weighted_hours) || 0;

            gMap.normal += normalH; gMap.overtime += overH; gMap.total += totalH; gMap.weighted += weightedH;

            // 🚩 중분류 데이터 합산 (서브맵에 저장)
            if (!gMap.subMap[subGroupKey]) gMap.subMap[subGroupKey] = { subName: subGroupKey, normal: 0, overtime: 0, total: 0, weighted: 0 };
            gMap.subMap[subGroupKey].normal += normalH; gMap.subMap[subGroupKey].overtime += overH;
            gMap.subMap[subGroupKey].total += totalH; gMap.subMap[subGroupKey].weighted += weightedH;

            // 차트는 뷰 모드 상관없이 항상 '월별' 누적으로 표시
            if (!chartDataMap[monthStr]) chartDataMap[monthStr] = { name: monthStr, normal: 0, overtime: 0, total: 0 };
            chartDataMap[monthStr].normal += normalH; chartDataMap[monthStr].overtime += overH; chartDataMap[monthStr].total += totalH;
        });

        // 객체를 배열로 변환하고 정렬
        const sortedSummary = Object.values(groupSummaryMap).map(v => ({
            ...v,
            subItems: Object.values(v.subMap).sort((a, b) => a.subName.localeCompare(b.subName)) // 서브 항목 배열화
        })).sort((a, b) => {
            if (a.type === '사내협력사' && b.type !== '사내협력사') return -1;
            if (a.type !== '사내협력사' && b.type === '사내협력사') return 1;
            return a.name.localeCompare(b.name);
        });

        const sortedChart = Object.values(chartDataMap).sort((a, b) => a.name.localeCompare(b.name));
        const totals = sortedSummary.reduce((acc, curr) => {
            acc.normal += curr.normal; acc.overtime += curr.overtime; acc.total += curr.total; acc.weighted += curr.weighted; return acc;
        }, { normal: 0, overtime: 0, total: 0, weighted: 0 });

        return { summaryDataList: sortedSummary, chartDataList: sortedChart, totalSummary: totals };
    }, [filteredChartData, summaryViewMode, workerMasterMap]);

    const toggleGroup = (name) => setExpandedGroups(prev => prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]);
    const handleSelectAll = (e) => setSelectedIds(e.target.checked ? filteredDetailData.map(i => i.id) : []);
    const handleSelectOne = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const currentStats = useMemo(() => {
        const targetData = activeTab === 'summary' ? filteredChartData : filteredDetailData;
        return targetData.reduce((acc, curr) => {
            let actualHeadcount = 1;
            if (curr.worker_name === 'IPC_통합') {
                const match = curr.remark?.match(/총 (\d+)명/);
                if (match) actualHeadcount = parseInt(match[1], 10);
            }

            const isPartner = ['바로서비스', '하나물류', '에프스토리'].includes(curr.worked_vendor);
            if (isPartner) acc.partnerCount += actualHeadcount;
            else acc.contractorCount += actualHeadcount;

            acc.normalHours += (Number(curr.normal_hours) || 0);
            acc.overtimeHours += (Number(curr.overtime_hours) || 0);
            acc.totalHours += (Number(curr.work_hours) || 0);

            return acc;
        }, { partnerCount: 0, contractorCount: 0, normalHours: 0, overtimeHours: 0, totalHours: 0 });
    }, [activeTab, filteredChartData, filteredDetailData]);

    return (
        <div className="p-6 bg-slate-100 min-h-[calc(100vh-64px)] slide-up flex flex-col gap-6 max-w-[1600px] mx-auto">

            <div className="sticky top-0 z-40 bg-slate-100 pb-4 pt-6 -mt-6 -mx-6 px-6 shadow-[0_4px_6px_-6px_rgba(0,0,0,0.1)]">
                <div className="flex justify-between items-center shrink-0 mb-6">
                    <div>
                        <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
                            <span className="text-letusOrange">👥</span> 근무자 근태 관리
                        </h2>
                        <p className="text-sm text-gray-500 font-medium mt-1">협력사 및 도급사의 일일 근태를 통합 관리하고 리포트를 산출합니다.</p>
                    </div>
                    <button
                        onClick={() => setIsUploadModalOpen(true)}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        근태 엑셀 업로드
                    </button>
                </div>

                <div className="grid grid-cols-5 gap-4 shrink-0">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-blue-400">
                        <span className="text-xs font-bold text-blue-500 mb-1">조회 기간 협력사 투입</span>
                        <span className="text-2xl font-black text-blue-600">{currentStats.partnerCount.toLocaleString()} <span className="text-sm font-bold text-blue-300 ml-1">명</span></span>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-orange-400">
                        <span className="text-xs font-bold text-orange-500 mb-1">조회 기간 도급사 투입</span>
                        <span className="text-2xl font-black text-orange-600">{currentStats.contractorCount.toLocaleString()} <span className="text-sm font-bold text-orange-300 ml-1">명</span></span>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-emerald-400">
                        <span className="text-xs font-bold text-emerald-500 mb-1">조회 기간 정상근무</span>
                        <span className="text-2xl font-black text-emerald-600">{currentStats.normalHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-sm font-bold text-emerald-300 ml-1">H</span></span>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-purple-400">
                        <span className="text-xs font-bold text-purple-500 mb-1">조회 기간 연장근무</span>
                        <span className="text-2xl font-black text-purple-600">{currentStats.overtimeHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-sm font-bold text-purple-300 ml-1">H</span></span>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-center transition-all hover:shadow-md border-b-4 border-b-red-400">
                        <span className="text-xs font-bold text-red-500 mb-1">조회 기간 총 근무시간</span>
                        <span className="text-2xl font-black text-red-600">{currentStats.totalHours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-sm font-bold text-red-300 ml-1">H</span></span>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20">
                <div className="flex border-b border-gray-200 bg-gray-50/50 px-4 pt-4 shrink-0">
                    <button onClick={() => { setActiveTab('summary'); setSelectedIds([]); }} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'summary' ? 'border-letusBlue text-letusBlue bg-white' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 rounded-t-lg'}`}>
                        📊 기간별 집계 현황
                    </button>
                    <button onClick={() => { setActiveTab('detail'); setSelectedIds([]); }} className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'detail' ? 'border-letusBlue text-letusBlue bg-white' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 rounded-t-lg'}`}>
                        📋 일별 상세 내역 (지원/파견 관리)
                    </button>
                </div>

                <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between bg-white shrink-0 gap-y-3 min-h-[70px]">
                    <div className="flex flex-wrap items-center w-full min-w-0 md:w-auto md:flex-1 gap-4">

                        {/* 공통 필터 영역 (사무직/현장직, 메인/지방센터) */}
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <select value={workerTypeFilter} onChange={(e) => setWorkerTypeFilter(e.target.value)} className={`appearance-none pl-3 pr-7 py-[7px] text-xs font-bold rounded-lg border outline-none transition-colors cursor-pointer ${workerTypeFilter === '현장직' ? 'bg-white border-gray-200 text-gray-600' : 'bg-blue-50 border-blue-200 text-letusBlue'}`}>
                                    <option value="현장직">현장직</option>
                                    <option value="사무직">사무직</option>
                                    <option value="전체">전체</option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"><svg className="fill-current h-3 w-3" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg></div>
                            </div>
                            <div className="relative">
                                <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={`appearance-none pl-3 pr-7 py-[7px] text-xs font-bold rounded-lg border outline-none transition-colors cursor-pointer ${locationFilter === '메인센터' ? 'bg-white border-gray-200 text-gray-600' : 'bg-orange-50 border-orange-200 text-letusOrange'}`}>
                                    <option value="메인센터">메인센터</option>
                                    <option value="지방센터">지방(동/서부)</option>
                                    <option value="전체">근무지</option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"><svg className="fill-current h-3 w-3" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg></div>
                            </div>
                        </div>
                        <div className="h-6 w-px bg-gray-200 hidden md:block"></div>

                        {activeTab === 'summary' ? (
                            <>
                                {/* 🚩 집계 현황 탭 전용: 뷰 모드 스위치 */}
                                <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner">
                                    <button onClick={() => setSummaryViewMode('vendor')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all flex items-center gap-1.5 ${summaryViewMode === 'vendor' ? 'bg-white text-letusBlue shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}>🏢 업체별 보기</button>
                                    <button onClick={() => setSummaryViewMode('brand')} className={`px-4 py-1.5 text-xs font-bold rounded transition-all flex items-center gap-1.5 ${summaryViewMode === 'brand' ? 'bg-white text-letusOrange shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}>🏷️ 브랜드별 보기</button>
                                </div>
                                <div className="flex items-center justify-end flex-1 gap-2">
                                    {chartFilterType === 'CUSTOM' && (
                                        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 animate-fade-in shadow-sm h-[38px]">
                                            <input type="date" value={tempChartStartDate} onChange={(e) => setTempChartStartDate(e.target.value)} className="bg-transparent text-xs text-gray-700 font-bold focus:outline-none cursor-pointer px-1 w-[110px]" />
                                            <span className="text-gray-400 text-xs mx-1">~</span>
                                            <input type="date" value={tempChartEndDate} onChange={(e) => setTempChartEndDate(e.target.value)} className="bg-transparent text-xs text-gray-700 font-bold focus:outline-none cursor-pointer px-1 w-[110px]" />
                                            <button onClick={() => { setChartStartDate(tempChartStartDate); setChartEndDate(tempChartEndDate); }} className="bg-orange-500 text-white font-bold px-3 h-full rounded text-[11px] shadow hover:bg-orange-600 transition-colors ml-1 tracking-tight">조회</button>
                                        </div>
                                    )}
                                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner h-[38px] items-center">
                                        {[{ id: 'D', name: '당일' }, { id: 'W', name: '주간' }, { id: 'M', name: '월간' }, { id: 'CUSTOM', name: '직접지정' }].map(btn => (
                                            <button key={btn.id} onClick={() => setChartFilterType(btn.id)} className={`px-3 h-full text-xs font-bold rounded-md transition-all ${chartFilterType === btn.id ? 'bg-white text-gray-800 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}>{btn.name}</button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* 상세 내역 탭 전용: 검색 및 데이터 필터 */}
                                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-1">
                                    {['전체', '사내협력사', '외주도급사'].map(type => (
                                        <button key={type} onClick={() => setSelectedVendor(type)} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${selectedVendor === type ? 'bg-white text-letusBlue shadow-sm ring-1 ring-letusBlue/20' : 'text-gray-500 hover:bg-gray-100'}`}>{type}</button>
                                    ))}
                                </div>
                                <div className="relative">
                                    <input type="text" placeholder="사원/업체 검색..." value={inputValue} onChange={(e) => setInputValue(e.target.value)} className="border border-gray-200 rounded-lg pl-8 pr-3 py-[7px] text-xs font-bold text-gray-700 outline-none focus:border-letusBlue w-40" />
                                    <svg className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                                <div className="flex items-center justify-end flex-1 gap-2">
                                    {filterType === 'CUSTOM' && (
                                        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 animate-fade-in shadow-sm h-[38px]">
                                            <input type="date" value={tempStartDate} onChange={(e) => setTempStartDate(e.target.value)} className="bg-transparent text-xs text-gray-700 font-bold focus:outline-none cursor-pointer px-1 w-[110px]" />
                                            <span className="text-gray-400 text-xs mx-0.5">~</span>
                                            <input type="date" value={tempEndDate} onChange={(e) => setTempEndDate(e.target.value)} className="bg-transparent text-xs text-gray-700 font-bold focus:outline-none cursor-pointer px-1 w-[110px]" />
                                            <button onClick={() => { setStartDate(tempStartDate); setEndDate(tempEndDate); }} className="bg-orange-500 text-white font-bold px-3 py-1.5 h-full rounded text-[11px] shadow-sm hover:bg-blue-600 transition-colors ml-1">조회</button>
                                        </div>
                                    )}
                                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-inner h-[38px] items-center">
                                        {[{ id: 'D', name: '당일' }, { id: 'W', name: '주간' }, { id: 'M', name: '월간' }, { id: 'CUSTOM', name: '직접지정' }].map(btn => (
                                            <button key={btn.id} onClick={() => setFilterType(btn.id)} className={`px-3 h-full text-xs font-bold rounded-md transition-all ${filterType === btn.id ? 'bg-white text-gray-800 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800'}`}>{btn.name}</button>
                                        ))}
                                    </div>
                                    <div className="relative z-50 ml-1">
                                        <button onClick={() => setIsActionMenuOpen(!isActionMenuOpen)} className="flex items-center text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded px-3 py-1.5 h-[38px] hover:bg-slate-50 min-w-[100px] justify-between shadow-sm transition-all">
                                            <span>선택실행 {selectedIds.length > 0 && `(${selectedIds.length})`}</span>
                                            <svg className={`w-3.5 h-3.5 ml-2 text-slate-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                        {isActionMenuOpen && (
                                            <>
                                                <div className="fixed inset-0" onClick={() => setIsActionMenuOpen(false)}></div>
                                                <div className="absolute right-0 top-[110%] w-[140px] bg-white border border-slate-200 rounded-md shadow-xl p-1.5 flex flex-col gap-0.5 slide-down z-50">
                                                    <button onClick={() => { setIsActionMenuOpen(false); if (selectedIds.length === 0) return alert('항목을 체크해 주세요.'); setIsBulkEditModalOpen(true); }} className={`w-full text-left px-2.5 py-2 font-bold rounded text-[11px] transition-colors ${selectedIds.length > 0 ? 'text-letusBlue hover:bg-blue-50' : 'text-gray-300 cursor-not-allowed'}`}>
                                                        일괄 수정 (지원/파견)
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="overflow-auto flex-1 custom-scrollbar bg-slate-50/30 relative">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                            <svg className="animate-spin w-8 h-8 mb-4 text-letusBlue" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                            <p className="font-bold text-sm">DB에서 데이터를 불러오고 있습니다...</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'summary' && (
                                <div className="p-6 flex flex-col gap-6">
                                    {window.Recharts && chartDataList.length > 0 && (
                                        <div className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm h-72">
                                            <h4 className="text-xs font-bold text-gray-500 mb-4">월별 총 근무시간 추이 ({summaryViewMode === 'vendor' ? '업체별' : '브랜드별'} 누적)</h4>
                                            <window.Recharts.ResponsiveContainer width="100%" height="100%">
                                                <window.Recharts.BarChart data={chartDataList} margin={{ top: 0, right: 0, left: -20, bottom: 25 }}>
                                                    <window.Recharts.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                                    <window.Recharts.XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} dy={10} />
                                                    <window.Recharts.YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                                                    <window.Recharts.Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px', padding: '8px 12px' }} />
                                                    <window.Recharts.Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', color: '#4b5563', paddingTop: '15px' }} />
                                                    <window.Recharts.Bar dataKey="normal" name="정상근무" stackId="a" fill="#4b89ff" radius={[0, 0, 4, 4]} barSize={30} />
                                                    <window.Recharts.Bar dataKey="overtime" name="연장근무" stackId="a" fill="#f58220" radius={[4, 4, 0, 0]} />
                                                </window.Recharts.BarChart>
                                            </window.Recharts.ResponsiveContainer>
                                        </div>
                                    )}

                                    {summaryDataList.length === 0 ? (
                                        <div className="text-center py-10 text-gray-400 font-bold">집계할 데이터가 없습니다.</div>
                                    ) : (
                                        <table className="w-full text-center whitespace-nowrap bg-white border border-gray-200 shadow-sm">
                                            <thead className="bg-gray-100 border-b-2 border-gray-300 text-xs font-black text-gray-700">
                                                <tr>
                                                    <th className="p-3 border-r border-gray-200 w-32">구분</th>
                                                    <th className="p-3 border-r border-gray-200 w-56 text-left pl-6">
                                                        {/* 🚩 헤더 텍스트 동적 변경 */}
                                                        {summaryViewMode === 'vendor' ? '업체명 (클릭 시 월별 상세)' : '운영 브랜드 (클릭 시 실투입 업체별 상세)'}
                                                    </th>
                                                    <th className="p-3 border-r border-gray-200">정상근무</th>
                                                    <th className="p-3 border-r border-gray-200">연장근무</th>
                                                    <th className="p-3 border-r border-gray-200 bg-blue-50/50">총 시간 합계</th>
                                                    <th className="p-3 bg-orange-50/50">정산 가중시간</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-[13px] text-gray-800">
                                                {summaryDataList.map((row) => {
                                                    const isExpanded = expandedGroups.includes(row.name);
                                                    return (
                                                        <React.Fragment key={row.name}>
                                                            <tr onClick={() => toggleGroup(row.name)} className={`border-b border-gray-200 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-blue-50/20'}`}>
                                                                <td className="p-3 border-r border-gray-200 font-black text-gray-600 bg-gray-50/30">{row.type}</td>
                                                                <td className="p-3 border-r border-gray-200 font-bold text-left pl-6 flex items-center gap-2"><span className="text-[10px] text-letusBlue w-3">{isExpanded ? '▼' : '▶'}</span>{row.name}</td>
                                                                <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono text-gray-700 font-medium">{row.normal === 0 ? '-' : row.normal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                                <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono text-gray-700 font-medium">{row.overtime === 0 ? '-' : row.overtime.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                                <td className="p-3 border-r border-gray-200 text-right pr-6 font-mono font-bold text-letusBlue bg-blue-50/10">{row.total === 0 ? '-' : row.total.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                                <td className="p-3 text-right pr-6 font-mono font-bold text-red-500 bg-orange-50/10">{row.weighted === 0 ? '-' : row.weighted.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                            </tr>

                                                            {/* 🚩 서브 메뉴 렌더링 (월 또는 실투입 업체) */}
                                                            {isExpanded && row.subItems.map((sub, idx) => (
                                                                <tr key={`${row.name}-${sub.subName}`} className="bg-slate-50 border-b border-gray-100 text-gray-500 animate-fade-in">
                                                                    <td className="p-2 border-r border-gray-100 bg-slate-100/50"></td>
                                                                    <td className="p-2 border-r border-gray-100 text-left pl-10 font-bold text-[11px] flex items-center gap-2"><span className="text-gray-400">└</span> {sub.subName}</td>
                                                                    <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono text-[12px]">{sub.normal === 0 ? '-' : sub.normal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                                    <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono text-[12px]">{sub.overtime === 0 ? '-' : sub.overtime.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                                    <td className="p-2 border-r border-gray-100 text-right pr-6 font-mono font-bold text-[12px] text-blue-400">{sub.total === 0 ? '-' : sub.total.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                                    <td className="p-2 text-right pr-6 font-mono font-bold text-[12px] text-red-400">{sub.weighted === 0 ? '-' : sub.weighted.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                                </tr>
                                                            ))}
                                                        </React.Fragment>
                                                    );
                                                })}
                                                <tr className="bg-gray-200 border-t-2 border-gray-400 font-black text-gray-900">
                                                    <td colSpan="2" className="p-4 border-r border-gray-300 text-center tracking-widest">전체 총 합계</td>
                                                    <td className="p-4 border-r border-gray-300 text-right pr-6 font-mono text-[14px]">{totalSummary.normal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                    <td className="p-4 border-r border-gray-300 text-right pr-6 font-mono text-[14px]">{totalSummary.overtime.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                    <td className="p-4 border-r border-gray-300 text-right pr-6 font-mono text-[14px] text-blue-700">{totalSummary.total.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                    <td className="p-4 text-right pr-6 font-mono text-[14px] text-red-700">{totalSummary.weighted.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {activeTab === 'detail' && (
                                <div className="flex flex-col gap-4 mt-2 p-4">
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left whitespace-nowrap">
                                                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-bold sticky top-0 z-10">
                                                    <tr>
                                                        <th className="p-3 w-12 text-center border-r border-slate-100">
                                                            <input type="checkbox" checked={selectedIds.length === sortedDetailData.length && sortedDetailData.length > 0} onChange={handleSelectAll} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                                        </th>
                                                        {[
                                                            { key: 'work_date', label: '근무 일자' },
                                                            { key: 'company_type', label: '구분' },
                                                            { key: 'vendor_name', label: '원 소속 업체', isBorder: true },
                                                            { key: 'worked_vendor', label: '실 투입 (생산성 기준)', color: 'text-blue-600' },
                                                            { key: 'worker_name', label: '근무자명' },
                                                            { key: 'go_work_time', label: '출근' },
                                                            { key: 'leave_work_time', label: '퇴근', isBorder: true },
                                                            { key: 'normal_hours', label: '정상근무', color: 'text-emerald-600', isBold: true },
                                                            { key: 'overtime_hours', label: '연장근무', color: 'text-orange-500', isBold: true },
                                                            { key: 'work_hours', label: '총 시간', color: 'text-blue-600', isBorder: true, isBold: true },
                                                            { key: 'remark', label: '특이사항(비고)', align: 'left' }
                                                        ].map(col => (
                                                            <th
                                                                key={col.key}
                                                                onClick={() => requestSort(col.key)}
                                                                className={`p-3 ${col.align === 'left' ? 'text-left' : 'text-center'} cursor-pointer hover:bg-slate-100 transition-colors select-none ${col.isBorder ? 'border-r border-slate-100' : ''} ${col.color || ''} ${col.isBold ? 'font-black' : ''}`}
                                                            >
                                                                <div className={`flex items-center gap-1 ${col.align === 'left' ? 'justify-start' : 'justify-center'}`}>
                                                                    {col.label}
                                                                    {sortConfig && sortConfig.key === col.key && (
                                                                        <span className="text-blue-500 text-[14px] font-black">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                                                    )}
                                                                </div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700 bg-white">
                                                    {sortedDetailData.length === 0 ? (
                                                        <tr><td colSpan="12" className="text-center py-10 text-gray-400 font-bold">조건에 맞는 데이터가 없습니다.</td></tr>
                                                    ) : (
                                                        sortedDetailData.map((row) => {
                                                            const isSelected = selectedIds.includes(row.id);
                                                            const isDispatched = row.vendor_name !== row.worked_vendor;
                                                            return (
                                                                <tr key={row.id} onClick={() => handleSelectOne(row.id)} className={`transition-colors cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-blue-50/30'}`}>
                                                                    <td className="p-3 text-center border-r border-gray-50" onClick={e => e.stopPropagation()}>
                                                                        <input type="checkbox" checked={isSelected} onChange={() => handleSelectOne(row.id)} className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                                                    </td>
                                                                    <td className="p-3 font-mono text-gray-500 text-center">{row.work_date}</td>
                                                                    <td className="p-3 text-center">
                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.company_type === '사내협력사' ? 'bg-blue-50 text-letusBlue border border-blue-100' : 'bg-orange-50 text-letusOrange border border-orange-100'}`}>
                                                                            {row.company_type}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-3 font-bold text-gray-500 border-r border-gray-50 text-center">{row.vendor_name}</td>
                                                                    <td className={`p-3 font-black flex justify-center items-center gap-1.5 ${isDispatched ? 'text-red-500 bg-red-50/30' : 'text-gray-800'}`}>
                                                                        {isDispatched && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200 shrink-0 tracking-tighter">지원 파견</span>}
                                                                        {row.worked_vendor}
                                                                    </td>
                                                                    <td className="p-3 font-black text-gray-900 text-center">{row.worker_name}</td>
                                                                    <td className="p-3 text-center font-bold text-gray-600">{row.start_time || '-'}</td>
                                                                    <td className="p-3 text-center font-bold text-gray-600 border-r border-gray-50">{row.end_time || '-'}</td>
                                                                    <td className="p-3 text-center font-bold text-green-600 bg-green-50/20">{Number(row.normal_hours).toFixed(1)}H</td>
                                                                    <td className="p-3 text-center font-bold text-orange-500 bg-orange-50/20">{Number(row.overtime_hours).toFixed(1)}H</td>
                                                                    <td className="p-3 text-center font-black text-letusBlue border-r border-gray-50 bg-blue-50/20">{Number(row.work_hours).toFixed(1)}H</td>
                                                                    <td className={`p-3 truncate max-w-[200px] text-xs ${isDispatched ? 'text-red-500 font-bold' : 'text-gray-500'}`}>{row.remark}</td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            {isUploadModalOpen && <AttendanceUploadModal onClose={() => setIsUploadModalOpen(false)} onReload={fetchAttendance} />}
            {isBulkEditModalOpen && <AttendanceBulkEditModal selectedIds={selectedIds} onClose={() => { setIsBulkEditModalOpen(false); setSelectedIds([]); }} onReload={fetchAttendance} />}
        </div>
    );
};

export { AttendanceUploadModal };
export { AttendanceBulkEditModal };
export { AttendanceManagement };