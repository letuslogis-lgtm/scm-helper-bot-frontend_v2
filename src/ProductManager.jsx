import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, adminSupabase } from './supabaseClient.js';



// --- ⚙️ 마스터 데이터 수동 업데이트 (ProductManager) ---
const ProductManager = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [resultStats, setResultStats] = useState(null);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsLoading(true);
        setResultStats(null);

        try {
            // 1. 엑셀 데이터 로드
            const rawData = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const wb = XLSX.read(e.target.result, { type: 'binary' });
                    resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
                };
                reader.readAsBinaryString(file);
            });

            if (rawData.length === 0) {
                alert('엑셀 파일에 데이터가 없습니다.');
                setIsLoading(false);
                return;
            }

            const clean = (val) => val ? String(val).trim() : '';

            // 2. 엑셀 파일 내부 자체 중복 제거 (같은 코드가 여러 개면 마지막 줄 기준)
            const uniqueMap = new Map();
            rawData.forEach(excelRow => {
                const itemCode = clean(excelRow['단품코드']);
                const itemColor = clean(excelRow['단품컬러']);
                if (itemCode) {
                    uniqueMap.set(`${itemCode}_${itemColor}`, excelRow);
                }
            });
            const uniqueData = Array.from(uniqueMap.values());

            let insertResult = 0;
            let updateResult = 0;
            let skipCount = 0;

            // 3. Supabase API 1000건 제한 극복을 위한 300개 단위 청크(Chunk) 처리
            const chunkSize = 300;

            for (let i = 0; i < uniqueData.length; i += chunkSize) {
                const chunk = uniqueData.slice(i, i + chunkSize);

                // 현재 청크의 단품코드 리스트만 추출
                const chunkItemCodes = [...new Set(chunk.map(r => clean(r['단품코드'])))];

                // DB에서 해당 단품코드들만 정확히 핀셋 검색
                const { data: existingData, error: fetchError } = await supabase
                    .from('products')
                    .select('id, item_code, item_color, brand_category, company_division, vendor, production_line')
                    .in('item_code', chunkItemCodes);

                if (fetchError) throw fetchError;

                // 검색된 기존 데이터 매핑
                const existingDBMap = new Map();
                existingData.forEach(row => {
                    const key = `${row.item_code}_${row.item_color || ''}`.trim();
                    existingDBMap.set(key, row);
                });

                const toInsert = [];
                const toUpdate = [];

                chunk.forEach(excelRow => {
                    const itemCode = clean(excelRow['단품코드']);
                    const itemColor = clean(excelRow['단품컬러']);
                    const brand = clean(excelRow['브랜드구분']);
                    const companyDiv = clean(excelRow['사별회사구분']);
                    const vendor = clean(excelRow['공급업체']);
                    const prodLine = clean(excelRow['생산지창고']);

                    const key = `${itemCode}_${itemColor}`;
                    const existingRow = existingDBMap.get(key);

                    if (!existingRow) {
                        // DB에 진짜 없는 경우 신규 등록
                        toInsert.push({
                            item_code: itemCode, item_color: itemColor, brand_category: brand,
                            company_division: companyDiv, vendor: vendor, production_line: prodLine
                        });
                    } else {
                        // 기존 데이터가 있으면 변경점 체크
                        const isBrandChanged = existingRow.brand_category !== brand;
                        const isCompanyDivChanged = existingRow.company_division !== companyDiv;
                        const isVendorChanged = existingRow.vendor !== vendor;
                        const isProdLineChanged = existingRow.production_line !== prodLine;

                        if (isBrandChanged || isCompanyDivChanged || isVendorChanged || isProdLineChanged) {
                            toUpdate.push({
                                id: existingRow.id, item_code: itemCode, item_color: itemColor,
                                brand_category: brand, company_division: companyDiv, vendor: vendor, production_line: prodLine
                            });
                        } else {
                            skipCount++;
                        }
                    }
                });

                // 청크 단위로 즉시 DB 꽂아넣기
                if (toInsert.length > 0) {
                    const { error } = await supabase.from('products').insert(toInsert);
                    if (error) throw error;
                    insertResult += toInsert.length;
                }

                if (toUpdate.length > 0) {
                    const { error } = await supabase.from('products').upsert(toUpdate, { onConflict: 'id' });
                    if (error) throw error;
                    updateResult += toUpdate.length;
                }
            }

            setResultStats({ total: rawData.length, inserted: insertResult, updated: updateResult, skipped: skipCount });
            alert(`✅ 마스터 데이터 업데이트 완료!\n신규 등록: ${insertResult}건\n정보 수정: ${updateResult}건`);

        } catch (error) {
            console.error(error);
            alert('업데이트 중 오류 발생: ' + error.message);
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
    };

    return (
        <div className="p-6 bg-slate-100 min-h-[calc(100vh-64px)] slide-up flex flex-col gap-5">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <span className="w-1.5 h-5 bg-green-500 rounded-full"></span>
                    <h2 className="font-bold text-gray-800 text-lg">마스터 데이터 수동 업데이트 (임시)</h2>
                </div>

                <p className="text-sm text-gray-600 mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                    💡 <strong>안내:</strong> 엑셀 데이터를 업로드하면 기존 DB와 전체 내용을 1:1로 비교합니다.<br />
                    코드가 없으면 <strong>신규 등록</strong>, 정보가 다르면 <strong>수정</strong>, 내용이 완전히 같으면 <strong>무시(Skip)</strong> 처리됩니다.<br />
                    <span className="inline-block mt-2 font-bold text-letusBlue bg-blue-100/50 px-2 py-1 rounded">
                        📥 추출 경로: {"[ERP > 단품정보추출 > 번호/단품코드/단품컬러/브랜드구분/사별회사구분/공급업체/생산지창고]"}
                    </span>
                </p>

                <div className="flex items-center gap-4">
                    <label className={`cursor-pointer px-6 py-3 rounded-lg font-bold text-sm shadow-sm transition-all flex items-center gap-2 ${isLoading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        {isLoading ? '데이터 대조 및 반영 중...' : '마스터 엑셀 업로드'}
                        <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={isLoading} className="hidden" />
                    </label>
                </div>

                {resultStats && (
                    <div className="mt-8 grid grid-cols-4 gap-4 animate-fade-in-up">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col items-center">
                            <span className="text-slate-500 text-xs font-bold mb-1">총 스캔 데이터</span>
                            <span className="text-2xl font-black text-slate-700">{resultStats.total}</span>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 flex flex-col items-center">
                            <span className="text-blue-500 text-xs font-bold mb-1">✨ 신규 등록 (Insert)</span>
                            <span className="text-2xl font-black text-blue-600">{resultStats.inserted}</span>
                        </div>
                        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 flex flex-col items-center">
                            <span className="text-orange-500 text-xs font-bold mb-1">🔄 정보 수정 (Update)</span>
                            <span className="text-2xl font-black text-orange-600">{resultStats.updated}</span>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col items-center opacity-70">
                            <span className="text-gray-500 text-xs font-bold mb-1">⏭️ 변경 없음 (Skip)</span>
                            <span className="text-2xl font-black text-gray-500">{resultStats.skipped}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export { ProductManager };