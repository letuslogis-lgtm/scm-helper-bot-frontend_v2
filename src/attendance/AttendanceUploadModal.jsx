// ===========================================================================
// 근태 데이터 통합 업로드 모달 (UI)
//   파일 파싱 로직은 parsers/ 모듈에 위임하고, 이 컴포넌트는
//   파일 선택 UI / 업체 인식 / DB 저장 흐름만 담당한다.
// ===========================================================================
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js';
import { loadXLSX } from '../utils.js';
import { CloseIcon } from '../SharedUI.jsx';
import { VENDOR_DEFS, detectVendorId, vendorDisplay, vendorCompanyType } from './constants.js';
import { parseVendorFile } from './parsers/index.js';
import { notifySuccess, notifyError, logError } from './notify.js';

export const AttendanceUploadModal = ({ onClose, onReload }) => {
  const [files, setFiles] = useState([]);
  const [manualVendor, setManualVendor] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [holidayList, setHolidayList] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('company_holidays').select('holiday_date');
        if (data) setHolidayList(data.map(h => h.holiday_date));
      } catch (err) {
        logError('휴일 데이터를 불러오지 못했습니다', err);
      }
    })();
  }, []);

  const processFiles = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const validFiles = Array.from(fileList).filter(f => {
      const name = f.name.toLowerCase();
      return name.includes('.xls') || name.includes('.csv') || name.includes('.txt');
    });

    if (validFiles.length === 0) return notifyError('엑셀(.xlsx, .xls) 또는 텍스트(.csv, .txt) 파일만 가능합니다.');

    setFiles(prev => {
      const newArray = [...prev, ...validFiles];
      if (newArray.length === 1) setManualVendor(detectVendorId(newArray[0].name));
      else setManualVendor('');
      return newArray;
    });
  };

  const removeFile = (indexToRemove) => {
    setFiles(prev => {
      const newArray = prev.filter((_, i) => i !== indexToRemove);
      if (newArray.length === 1) setManualVendor(detectVendorId(newArray[0].name));
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

  const handleUpload = async () => {
    if (files.length === 0) return notifyError('업로드할 파일을 추가해 주세요.');
    setIsUploading(true);

    const allStandardData = [];
    const successFiles = [];
    const failedFiles = [];

    try {
      const XLSX = await loadXLSX();

      // 근무자 마스터 로드 (이름 → 지원상태/브랜드)
      const { data: workerMaster } = await supabase
        .from('workers')
        .select('name, support_status, managed_brand');

      const workerMap = {};
      if (workerMaster) {
        workerMaster.forEach(w => {
          workerMap[w.name.replace(/\s/g, '')] = {
            supportStatus: w.support_status,
            brand: w.managed_brand || '',
          };
        });
      }

      const newWorkersMap = new Map();
      const currentYear = new Date().getFullYear();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const vendorId = (files.length === 1 && manualVendor) ? manualVendor : detectVendorId(file.name);

        if (!vendorId) {
          failedFiles.push(`${file.name} (업체 인식 불가)`);
          continue;
        }

        const { data, isTextFile } = await readFileAsync(file);

        const ctx = {
          workerMap,
          newWorkersMap,
          holidayList,
          companyType: vendorCompanyType(vendorId),
          vendor: vendorDisplay(vendorId),
          currentYear,
        };

        const { records, error } = parseVendorFile({ vendorId, data, isTextFile, XLSX, ctx });

        if (error) {
          failedFiles.push(`${file.name} (${error})`);
          continue;
        }

        allStandardData.push(...records);
        successFiles.push(file.name);
      }

      if (allStandardData.length === 0) throw new Error('추출된 데이터가 0건입니다. 엑셀 파일 형식을 확인해 주세요.');

      const newWorkersArray = Array.from(newWorkersMap.values());
      let generatedWorkerCount = 0;
      if (newWorkersArray.length > 0) {
        const { error: workerInsertError } = await supabase.from('workers').insert(newWorkersArray);
        if (workerInsertError) throw new Error('신규 근무자 임시 생성 중 오류: ' + workerInsertError.message);
        generatedWorkerCount = newWorkersArray.length;
      }

      const { error } = await supabase.from('worker_attendance').insert(allStandardData);
      if (error) throw error;

      let resultMsg = `🎉 총 ${allStandardData.length}건의 데이터가 일괄 등록되었습니다!\n\n`;
      if (generatedWorkerCount > 0) {
        resultMsg += `📝 (자동 생성) 미등록 인원 ${generatedWorkerCount}명이 마스터 DB에 추가되었습니다.\n`;
      }
      resultMsg += `✅ 성공: ${successFiles.length}개 파일\n`;
      if (failedFiles.length > 0) resultMsg += `❌ 실패: ${failedFiles.length}개 파일\n(${failedFiles.join(', ')})`;

      notifySuccess(resultMsg);
      if (onReload) onReload();
      onClose();
    } catch (err) {
      notifyError('업로드 오류: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const activeVendors = files.length === 1 && manualVendor
    ? [manualVendor]
    : files.map(f => detectVendorId(f.name)).filter(Boolean);

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
            {VENDOR_DEFS.map(vendor => {
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
