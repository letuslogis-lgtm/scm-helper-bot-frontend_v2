import React, { useState, useMemo, useRef } from 'react';
import { loadXLSX } from './utils.js';

const COLS = [
    { key: 'WAVE명',     label: 'WAVE명',    w: '180px' },
    { key: 'WAVE 타입',  label: 'WAVE 타입', w: '110px' },
    { key: '오더번호',   label: '오더번호',  w: '160px' },
    { key: '오더건명',   label: '오더건명',  w: '220px' },
    { key: 'OWNER',      label: 'OWNER',     w: '80px'  },
    { key: '유통채널',   label: '유통채널',  w: '130px' },
    { key: '품목ID',     label: '품목ID',    w: '150px' },
    { key: '제품구분',   label: '제품구분',  w: '100px' },
    { key: '공급업체명', label: '공급업체명',w: '120px' },
    { key: 'CUT수량',    label: 'CUT수량',   w: '80px'  },
    { key: '피킹여부',   label: '피킹여부',  w: '80px'  },
    { key: '미출여부',   label: '미출여부',  w: '80px'  },
    { key: '조치사항',   label: '조치사항',  w: '180px' },
    { key: '매출여부',   label: '매출여부',  w: '80px'  },
    { key: '취소대상여부', label: '취소대상', w: '80px' },
];

const FLAG_COLS = new Set(['피킹여부', '미출여부', '매출여부', '취소대상여부']);

const today = () => new Date().toISOString().split('T')[0];
const INIT_DRAFT = { startDate: '', endDate: '', searchType: '공급업체명', searchValue: '' };
const INIT_APPLIED = { startDate: '', endDate: '', searchType: '공급업체명', searchValue: '' };

function FlagBadge({ value }) {
    const v = String(value || '').toUpperCase();
    if (v === 'Y') return <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">Y</span>;
    if (v === 'N') return <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600">N</span>;
    return <span className="text-gray-400 text-xs">-</span>;
}

// 엑셀 날짜 직렬번호 → YYYY-MM-DD 변환
function excelDateToStr(val) {
    if (!val) return '';
    if (typeof val === 'string' && val.includes('-')) return val.split('T')[0];
    if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return d.toISOString().split('T')[0];
    }
    return String(val).split('T')[0];
}

export const WmsShortageList = () => {
    const [rows, setRows] = useState([]);
    const [fileName, setFileName] = useState('');
    const [uploadedAt, setUploadedAt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [draft, setDraft] = useState({ ...INIT_DRAFT });
    const [applied, setApplied] = useState({ ...INIT_APPLIED });
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'none' });
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
            setRows(data);
            setFileName(file.name);
            setUploadedAt(new Date().toLocaleString('ko-KR'));
            setDraft({ ...INIT_DRAFT });
            setApplied({ ...INIT_APPLIED });
            setSortConfig({ key: null, direction: 'none' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFile = (e) => { parseFile(e.target.files[0]); e.target.value = ''; };
    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) parseFile(file);
    };

    const handleSearch = () => setApplied({ ...draft });
    const handleReset = () => { setDraft({ ...INIT_DRAFT }); setApplied({ ...INIT_APPLIED }); };

    const filtered = useMemo(() => rows.filter(r => {
        if (applied.startDate || applied.endDate) {
            const rowDate = excelDateToStr(r['최초 등록 일시']);
            if (applied.startDate && rowDate < applied.startDate) return false;
            if (applied.endDate && rowDate > applied.endDate) return false;
        }
        if (applied.searchValue) {
            const q = applied.searchValue.toLowerCase();
            const target = String(r[applied.searchType] || '').toLowerCase();
            if (!target.includes(q)) return false;
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
        if (sortConfig.direction === 'asc') return <span className="ml-1 text-letusBlue font-black">↑</span>;
        if (sortConfig.direction === 'desc') return <span className="ml-1 text-letusBlue font-black">↓</span>;
        return null;
    };

    const totalCut = useMemo(() => sorted.reduce((s, r) => s + (Number(r['CUT수량']) || 0), 0), [sorted]);

    return (
        <div
            className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
        >
            {/* ── 검색 구역 ── */}
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex items-center z-30 shrink-0">
                <div className="flex items-center gap-5 w-full flex-wrap">

                    {/* 조회 기간 */}
                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">조회 기간</label>
                        <div className="flex items-center">
                            <input
                                type="date" value={draft.startDate}
                                onChange={e => setD('startDate', e.target.value)}
                                className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] w-[110px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700"
                            />
                            <span className="mx-1 text-gray-400 text-xs font-bold">~</span>
                            <input
                                type="date" value={draft.endDate}
                                onChange={e => setD('endDate', e.target.value)}
                                className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] w-[110px] focus:outline-none focus:border-letusOrange cursor-pointer text-gray-700"
                            />
                        </div>
                    </div>

                    {/* 검색어 */}
                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">검색어</label>
                        <div className="flex gap-0 h-[30px]">
                            <select
                                value={draft.searchType}
                                onChange={e => setD('searchType', e.target.value)}
                                className="border border-gray-200 border-r-0 rounded-l-[3px] text-xs px-2 text-gray-700 bg-gray-50 focus:outline-none cursor-pointer h-full"
                            >
                                <option value="공급업체명">공급업체</option>
                                <option value="품목ID">품목코드</option>
                                <option value="WAVE명">WAVE명</option>
                                <option value="오더건명">오더건명</option>
                            </select>
                            <input
                                type="text" value={draft.searchValue}
                                onChange={e => setD('searchValue', e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                placeholder="검색어 입력"
                                className="border border-gray-200 rounded-r-[3px] text-xs px-2.5 w-40 focus:outline-none focus:border-letusOrange h-full"
                            />
                        </div>
                    </div>

                    {/* 버튼 */}
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleReset}
                            className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] text-xs transition-colors"
                        >
                            초기화
                        </button>
                        <button
                            onClick={handleSearch}
                            className="bg-letusOrange text-white hover:bg-orange-600 font-bold px-6 h-[30px] rounded-[3px] transition-colors text-xs flex items-center gap-1.5 shadow-sm"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            조회하기
                        </button>
                    </div>
                </div>
            </div>

            {/* ── 액션 바 ── */}
            <div className="flex items-center justify-between w-full shrink-0">
                {/* 파일 정보 */}
                <div className="flex items-center gap-2">
                    {fileName ? (
                        <>
                            <span className="text-xs text-gray-500">📄 {fileName}</span>
                            <span className="text-xs text-gray-400">· {uploadedAt} 업로드</span>
                            {rows.length > 0 && (
                                <span className="ml-2 text-xs font-bold text-letusBlue">
                                    {sorted.length.toLocaleString()}건 / CUT {totalCut.toLocaleString()} EA
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="text-xs text-gray-400">WMS 결품 파일을 업로드하면 데이터가 표시됩니다.</span>
                    )}
                </div>

                {/* 업로드 버튼 */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 bg-letusBlue text-white text-xs font-bold px-4 h-[32px] rounded-[3px] hover:bg-blue-600 transition-colors shadow-sm"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    WMS 파일 업로드
                </button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            </div>

            {/* ── 테이블 ── */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col flex-1 overflow-hidden z-20 min-h-0">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left whitespace-nowrap" style={{ minWidth: '1800px' }}>
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-4 py-3 text-center w-10 text-gray-400">No.</th>
                                {COLS.map(c => (
                                    <th
                                        key={c.key}
                                        style={{ width: c.w, minWidth: c.w }}
                                        className="px-3 py-3 text-center cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                        onClick={() => requestSort(c.key)}
                                    >
                                        <div className="flex items-center justify-center">
                                            {c.label}{getSortIcon(c.key)}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-[13px] text-gray-700">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={COLS.length + 1} className="py-32 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin"></div>
                                            <p className="text-gray-500 font-bold text-[13px]">파일 분석 중...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={COLS.length + 1} className="py-32 text-center">
                                        <div className="flex flex-col items-center gap-3 text-gray-400">
                                            <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <p className="font-bold text-gray-400">WMS 결품 파일을 업로드해 주세요</p>
                                            <p className="text-xs">우측 상단 <span className="text-letusBlue font-bold">WMS 파일 업로드</span> 버튼 또는 여기에 파일을 드래그하세요</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : sorted.length === 0 ? (
                                <tr>
                                    <td colSpan={COLS.length + 1} className="py-20 text-center text-gray-400 text-sm">
                                        조건에 맞는 데이터가 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                sorted.map((row, i) => (
                                    <tr key={i} className="hover:bg-blue-50/40 transition-colors">
                                        <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{i + 1}</td>
                                        {COLS.map(c => (
                                            <td key={c.key} className="px-3 py-2.5 text-center" style={{ width: c.w }}>
                                                {FLAG_COLS.has(c.key) ? (
                                                    <FlagBadge value={row[c.key]} />
                                                ) : c.key === 'CUT수량' ? (
                                                    <span className="font-bold text-letusOrange">{row[c.key] ?? '-'}</span>
                                                ) : c.key === '조치사항' ? (
                                                    <span className="text-left block text-gray-600 whitespace-normal">{row[c.key] || '-'}</span>
                                                ) : (
                                                    <span>{row[c.key] ?? '-'}</span>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
