// ===========================================================================
// 입고 실적 파일 업로드 모달
// ===========================================================================
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient.js';
import { loadXLSX } from '../utils.js';
import { CloseIcon } from '../SharedUI.jsx';
import { FILE_TYPES, FILE_TYPE_MAP } from './constants.js';
import { parseFile, getTableName, matchBrands } from './parsers.js';

const today = () => new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];

export const InboundUploadModal = ({ onClose, onReload, userProfile, existingWarehouses = [] }) => {
  const [fileType, setFileType]         = useState('입고실적');
  const [businessDate, setBusinessDate] = useState(today());
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseInput, setWarehouseInput] = useState('');
  const [showWarehouses, setShowWarehouses] = useState(false);
  const [file, setFile]                 = useState(null);
  const [isDragging, setIsDragging]     = useState(false);
  const [isUploading, setIsUploading]   = useState(false);
  const [result, setResult]             = useState(null); // { ok, msg }
  const fileInputRef                    = useRef(null);

  const needsWarehouse = FILE_TYPE_MAP[fileType]?.needsWarehouse;

  // 파일 유형 바뀌면 창고명 초기화
  useEffect(() => {
    if (!needsWarehouse) { setWarehouseInput(''); setWarehouseName(''); }
  }, [fileType, needsWarehouse]);

  const filteredWarehouses = existingWarehouses.filter(
    w => w && w.toLowerCase().includes(warehouseInput.toLowerCase())
  );

  const onFileSelect = (f) => {
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith('.xls') && !name.endsWith('.xlsx')) {
      setResult({ ok: false, msg: 'Excel 파일(.xls, .xlsx)만 업로드 가능합니다.' });
      return;
    }
    setFile(f);
    setResult(null);
  };

  const onDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files[0]) onFileSelect(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) { setResult({ ok: false, msg: '파일을 선택해 주세요.' }); return; }
    if (needsWarehouse && !warehouseName.trim()) {
      setResult({ ok: false, msg: '창고명을 입력해 주세요.' }); return;
    }
    if (!businessDate) { setResult({ ok: false, msg: '기준일을 선택해 주세요.' }); return; }

    setIsUploading(true);
    setResult(null);

    try {
      const XLSX = await loadXLSX();
      const binaryData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsBinaryString(file);
      });

      const parsed = parseFile(XLSX, binaryData, {
        file_type: fileType,
        business_date: businessDate,
        warehouse_name: warehouseName.trim() || null,
      });

      if (parsed.length === 0) {
        setResult({ ok: false, msg: '파싱된 데이터가 0건입니다. 파일 형식을 확인해 주세요.' });
        setIsUploading(false);
        return;
      }

      // 브랜드 매칭
      const withBrands = await matchBrands(supabase, parsed);

      // 배치 생성
      const { data: batch, error: batchErr } = await supabase
        .from('inbound_upload_batches')
        .insert({
          file_type: fileType,
          business_date: businessDate,
          warehouse_name: warehouseName.trim() || null,
          row_count: withBrands.length,
          uploaded_by: userProfile?.id || null,
        })
        .select('id')
        .single();
      if (batchErr) throw batchErr;

      // 데이터 행 삽입 (200행 청크)
      const tableName = getTableName(fileType);
      const rows = withBrands.map(r => ({ ...r, batch_id: batch.id }));
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase.from(tableName).insert(rows.slice(i, i + CHUNK));
        if (error) throw error;
      }

      setResult({ ok: true, msg: `${withBrands.length.toLocaleString()}건 업로드 완료` });
      onReload();
    } catch (err) {
      console.error(err);
      setResult({ ok: false, msg: err.message || '업로드 중 오류가 발생했습니다.' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-black text-gray-800">입고 실적 파일 업로드</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><CloseIcon /></button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* 파일 유형 선택 */}
          <div>
            <label className="block text-xs font-black text-gray-600 mb-2">파일 유형</label>
            <div className="grid grid-cols-5 gap-1.5">
              {FILE_TYPES.map(t => (
                <button key={t.id}
                  onClick={() => setFileType(t.id)}
                  className={`py-2 px-1 rounded-lg text-[10px] font-bold border transition-all text-center leading-tight ${
                    fileType === t.id
                      ? 'bg-letusBlue text-white border-letusBlue shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">{FILE_TYPE_MAP[fileType]?.desc}</p>
          </div>

          {/* 기준일 */}
          <div>
            <label className="block text-xs font-black text-gray-600 mb-2">기준일</label>
            <input
              type="date" value={businessDate}
              onChange={e => setBusinessDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/40"
            />
          </div>

          {/* 창고명 (needsWarehouse만 표시) */}
          {needsWarehouse && (
            <div className="relative">
              <label className="block text-xs font-black text-gray-600 mb-2">창고명 (사업장)</label>
              <input
                type="text"
                value={warehouseInput}
                onChange={e => { setWarehouseInput(e.target.value); setWarehouseName(e.target.value); setShowWarehouses(true); }}
                onFocus={() => setShowWarehouses(true)}
                onBlur={() => setTimeout(() => setShowWarehouses(false), 150)}
                placeholder="예: 퍼시스충주1공장"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-letusBlue/40"
              />
              {showWarehouses && filteredWarehouses.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-36 overflow-y-auto">
                  {filteredWarehouses.map(w => (
                    <button key={w} className="w-full px-3 py-2 text-sm text-left hover:bg-blue-50 text-gray-700"
                      onMouseDown={() => { setWarehouseInput(w); setWarehouseName(w); setShowWarehouses(false); }}>
                      {w}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 파일 드롭존 */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-letusBlue bg-blue-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".xls,.xlsx" className="hidden"
              onChange={e => e.target.files[0] && onFileSelect(e.target.files[0])} />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold text-green-700">{file.name}</span>
                <button className="text-gray-400 hover:text-red-500 ml-1"
                  onClick={e => { e.stopPropagation(); setFile(null); }}>✕</button>
              </div>
            ) : (
              <div className="text-gray-400">
                <svg className="w-8 h-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-xs font-bold">파일을 드래그하거나 클릭해서 선택</p>
                <p className="text-[10px] mt-0.5">.xls, .xlsx 지원</p>
              </div>
            )}
          </div>

          {/* 결과 메시지 */}
          {result && (
            <div className={`text-sm font-bold px-4 py-3 rounded-lg ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {result.ok ? '✅ ' : '❌ '}{result.msg}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            닫기
          </button>
          {!result?.ok && (
            <button onClick={handleUpload} disabled={isUploading || !file}
              className={`px-5 py-2 text-sm font-black rounded-lg transition-colors ${
                isUploading || !file
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-letusBlue text-white hover:bg-blue-700'
              }`}>
              {isUploading ? '업로드 중...' : '업로드'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
