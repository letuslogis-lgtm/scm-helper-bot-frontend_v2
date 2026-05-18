import React, { useState, useMemo, useRef } from 'react';
import { loadXLSX } from './utils.js';

const COLS = [
    { key: '_일자',      label: '일자',    w: '100px', sortKey: '최초 등록 일시' },
    { key: 'OWNER',      label: '브랜드',  w: '90px'  },
    { key: '품목ID',     label: '품목코드', w: '160px' },
    { key: '공급업체명', label: '공급업체', w: '130px' },
    { key: 'CUT수량',    label: '결품수량', w: '90px'  },
];

function weekAgo() {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
}
function todayStr() { return new Date().toISOString().split('T')[0]; }

const initDraft   = () => ({ startDate: weekAgo(), endDate: todayStr(), searchType: '품목ID', searchValue: '' });
const initApplied = () => ({ startDate: weekAgo(), endDate: todayStr(), searchType: '품목ID', searchValue: '' });

function excelDateToStr(val) {
    if (!val) return '';
    if (typeof val === 'string') return val.split('T')[0].slice(0, 10);
    if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return d.toISOString().split('T')[0];
    }
    return '';
}

export const WmsShortageList = () => {
    const [rows, setRows] = useState([]);
    const [fileName, setFileName] = useState('');
    const [uploadedAt, setUploadedAt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [draft, setDraft] = useState(initDraft());
    const [applied, setApplied] = useState(initApplied());
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const fileInputRef = useRef(null);

    const setD = (k, v) => setDraft(p => ({ ...p, [k]: v }));

    const parseFile = async (file) => {
        if (!file) return;
        setIsLoading(true);
        try {
            const XLSX = await loadXLSX();
            const data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const wb = XLSX.read(e.target.result, { type: 'binary' });
                    resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
                };
                reader.readAsBinaryString(file);
            });
            const enriched = data.map((r, i) => ({ ...r, _rowId: i, _일자: excelDateToStr(r['최초 등록 일시']) }));
            setRows(enriched);
            setFileName(file.name);
            setUploadedAt(new Date().toLocaleString('ko-KR'));
            setDraft(initDraft());
            setApplied(initApplied());
            setSortConfig({ key: null, direction: 'none' });
            setSelectedIds(new Set());
        } finally {
            setIsLoading(false);
        }
    };

    const handleFile = (e) => { parseFile(e.target.files[0]); e.target.value = ''; };
    const handleDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f); };

    const handleSearch = () => { setApplied({ ...draft }); setSelectedIds(new Set()); };
    const handleReset  = () => { setDraft(initDraft()); setApplied(initApplied()); setSelectedIds(new Set()); };

    const filtered = useMemo(() => rows.filter(r => {
        if (applied.startDate && r._일자 < applied.startDate) return false;
        if (applied.endDate   && r._일자 > applied.endDate)   return false;
        if (applied.searchValue) {
            const q = applied.searchValue.toLowerCase();
            if (!String(r[applied.searchType] || '').toLowerCase().includes(q)) return false;
        }
        return true;
    }), [rows, applied]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key) {
            if (sortConfig.direction === 'asc') direction = 'desc';
            else if (sortConfig.direction === 'desc') direction = 'none';
        }
        setSortConfig({ key: direction === 'none' ? null : key, direction });
        setSelectedIds(new Set());
    };

    const sorted = useMemo(() => {
        if (!sortConfig.key) return filtered;
        return [...filtered].sort((a, b) => {
            const av = a[sortConfig.key] ?? '';
            const bv = b[sortConfig.key] ?? '';
            if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
            if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filtered, sortConfig]);

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc'
            ? <span className="ml-1 text-letusBlue font-black">↑</span>
            : <span className="ml-1 text-letusBlue font-black">↓</span>;
    };

    const totalCut = useMemo(() => sorted.reduce((s, r) => s + (Number(r['CUT수량']) || 0), 0), [sorted]);

    // 체크박스
    const handleSelectAll = (e) => {
        setSelectedIds(e.target.checked ? new Set(sorted.map(r => r._rowId)) : new Set());
        setLastSelectedId(null);
    };
    const handleSelectOne = (e, id, idx) => {
        if (e.nativeEvent.shiftKey && lastSelectedId !== null) {
            const lastIdx = sorted.findIndex(r => r._rowId === lastSelectedId);
            const min = Math.min(lastIdx, idx);
            const max = Math.max(lastIdx, idx);
            setSelectedIds(prev => {
                const s = new Set(prev);
                sorted.slice(min, max + 1).forEach(r => s.add(r._rowId));
                return s;
            });
        } else {
            setSelectedIds(prev => {
                const s = new Set(prev);
                s.has(id) ? s.delete(id) : s.add(id);
                return s;
            });
            setLastSelectedId(id);
        }
    };

    // 선택실행: 엑셀 추출
    const handleExportExcel = async () => {
        if (selectedIds.size === 0) return alert('항목을 체크해 주세요.');
        const XLSX = await loadXLSX();
        const target = sorted.filter(r => selectedIds.has(r._rowId));
        const excelData = target.map(r => ({
            '일자': r._일자,
            '오더건명': r['오더건명'] || '',
            '브랜드': r['OWNER'] || '',
            '품목코드': r['품목ID'] || '',
            '공급업체': r['공급업체명'] || '',
            '결품수량': r['CUT수량'] ?? '',
        }));
        const ws = XLSX.utils.json_to_sheet(excelData);
        ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 20 }, { wch: 18 }, { wch: 10 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'D-2결품리스트');
        XLSX.writeFile(wb, `D-2결품리스트_${todayStr()}.xlsx`);
    };

    // 선택실행: 삭제
    const handleDeleteSelected = () => {
        if (selectedIds.size === 0) return alert('항목을 체크해 주세요.');
        if (!window.confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return;
        setRows(prev => prev.filter(r => !selectedIds.has(r._rowId)));
        setSelectedIds(new Set());
    };

    return (
        <div
            className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
        >
            {/* ── 검색 구역 ── */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex items-center z-30 shrink-0">
                <div className="flex items-center gap-5 w-full flex-wrap">

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">조회 기간</label>
                        <div className="flex items-center">
                            <input type="date" value={draft.startDate} onChange={e => setD('startDate', e.target.value)}
                                className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] w-[110px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700" />
                            <span className="mx-1 text-gray-400 text-xs font-bold">~</span>
                            <input type="date" value={draft.endDate} onChange={e => setD('endDate', e.target.value)}
                                className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] w-[110px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700" />
                        </div>
                    </div>

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">검색어</label>
                        <div className="flex gap-0 h-[30px]">
                            <select value={draft.searchType} onChange={e => setD('searchType', e.target.value)}
                                className="border border-gray-200 border-r-0 rounded-l-[3px] text-xs px-2 text-gray-700 bg-gray-50 focus:outline-none cursor-pointer h-full">
                                <option value="품목ID">품목코드</option>
                                <option value="공급업체명">공급업체</option>
                            </select>
                            <input type="text" value={draft.searchValue} onChange={e => setD('searchValue', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                placeholder="검색어 입력"
                                className="border border-gray-200 rounded-r-[3px] text-xs px-2.5 w-40 focus:outline-none focus:border-letusOrange h-full" />
                        </div>
                    </div>

                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button onClick={handleReset}
                            className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] text-xs transition-colors">
                            초기화
                        </button>
                        <button onClick={handleSearch}
                            className="bg-letusOrange text-white hover:bg-orange-600 font-bold px-6 h-[30px] rounded-[3px] transition-colors text-xs flex items-center gap-1.5 shadow-sm">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            조회하기
                        </button>
                    </div>
                </div>
            </div>

            {/* ── 액션 바 ── */}
            <div className="flex justify-end w-full px-2 z-30 -mt-1 mb-1 shrink-0 gap-3">

                {/* 업로드 버튼 (AccidentList 스타일) */}
                <button onClick={() => fileInputRef.current?.click()}
                    className="bg-white border border-green-600 text-green-600 px-4 py-[7px] rounded-[3px] text-[11px] font-bold flex items-center cursor-pointer hover:bg-green-50 transition-colors shadow-sm h-[32px]">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M21.17 3.25q.33 0 .59.25q.24.26.24.59v15.82q0 .33-.24.59q-.26.25-.59.25H2.83q-.33 0-.59-.25q-.24-.26-.24-.59V4.09q0-.33.24-.59q.26-.25.59-.25h18.34zm-8.25 10.9l3.52 4.67h2.7l-4.9-6.07 4.65-5.94h-2.65l-3.23 4.48-3.32-4.48H7.07l4.76 5.94-5 6.07h2.72l3.37-4.67z" />
                    </svg>
                    WMS 파일 업로드 (Excel)
                </button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />

                {/* 선택실행 드롭다운 */}
                <div className="relative z-50">
                    <button onClick={() => setIsActionMenuOpen(v => !v)}
                        className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded shadow-sm px-3 py-[7px] hover:bg-gray-50 transition-all min-w-[90px] h-[32px]">
                        선택실행 {selectedIds.size > 0 && `(${selectedIds.size})`}
                        <svg className={`w-3.5 h-3.5 ml-2 text-gray-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isActionMenuOpen && (
                        <>
                            <div className="fixed inset-0" onClick={() => setIsActionMenuOpen(false)}></div>
                            <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 slide-down">
                                <button
                                    onClick={() => { setIsActionMenuOpen(false); handleExportExcel(); }}
                                    className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors flex items-center justify-between ${selectedIds.size > 0 ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 cursor-not-allowed'}`}
                                >
                                    엑셀 추출
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                </button>
                                <div className="h-px bg-gray-100 my-1"></div>
                                <button
                                    onClick={() => { setIsActionMenuOpen(false); handleDeleteSelected(); }}
                                    className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex justify-between items-center ${selectedIds.size > 0 ? 'text-red-600 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'}`}
                                >
                                    삭제
                                    {selectedIds.size > 0 && <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── 테이블 ── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left whitespace-nowrap text-[13px]">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-6 w-10 text-center">
                                    <input type="checkbox"
                                        checked={sorted.length > 0 && selectedIds.size === sorted.length}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                </th>
                                {COLS.map(c => (
                                    <th key={c.key} style={{ width: c.w, minWidth: c.w }}
                                        className="px-3 py-3 text-center cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                        onClick={() => requestSort(c.sortKey || c.key)}>
                                        <div className="flex items-center justify-center">
                                            {c.label}{getSortIcon(c.sortKey || c.key)}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-700">
                            {isLoading ? (
                                <tr><td colSpan={COLS.length + 2} className="py-32 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div>
                                        <p className="text-gray-500 font-bold text-[13px]">파일 분석 중...</p>
                                    </div>
                                </td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={COLS.length + 2} className="py-32 text-center">
                                    <div className="flex flex-col items-center gap-3 text-gray-400">
                                        <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <p className="font-bold text-gray-400">WMS 결품 파일을 업로드해 주세요</p>
                                        <p className="text-xs">우측 상단 <span className="text-green-600 font-bold">WMS 파일 업로드</span> 버튼 또는 여기에 파일을 드래그하세요</p>
                                    </div>
                                </td></tr>
                            ) : sorted.length === 0 ? (
                                <tr><td colSpan={COLS.length + 2} className="py-20 text-center text-gray-400 text-sm">
                                    조건에 맞는 데이터가 없습니다.
                                </td></tr>
                            ) : (
                                sorted.map((row, i) => {
                                    const checked = selectedIds.has(row._rowId);
                                    return (
                                        <tr key={row._rowId} className={`transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-blue-50/40'}`}>
                                            <td className="p-4 pl-6 text-center">
                                                <input type="checkbox" checked={checked}
                                                    onChange={(e) => handleSelectOne(e, row._rowId, i)}
                                                    className="w-4 h-4 accent-letusBlue cursor-pointer" />
                                            </td>
                                            {COLS.map(c => (
                                                <td key={c.key} className="px-3 py-2.5 text-center" style={{ width: c.w }}>
                                                    {c.key === 'CUT수량'
                                                        ? <span className="font-bold text-letusOrange">{row[c.key] ?? '-'}</span>
                                                        : <span>{row[c.key] ?? '-'}</span>
                                                    }
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
