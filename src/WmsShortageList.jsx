import React, { useState, useCallback, useMemo, useRef } from 'react';
import { loadXLSX } from './utils.js';

const COLS = [
    { key: 'WAVE명', label: 'WAVE명', width: 'min-w-[180px]' },
    { key: 'WAVE 타입', label: 'WAVE 타입', width: 'min-w-[110px]' },
    { key: '오더번호', label: '오더번호', width: 'min-w-[160px]' },
    { key: '오더건명', label: '오더건명', width: 'min-w-[220px]' },
    { key: 'OWNER', label: 'OWNER', width: 'min-w-[80px]' },
    { key: '유통채널', label: '유통채널', width: 'min-w-[130px]' },
    { key: '품목ID', label: '품목ID', width: 'min-w-[140px]' },
    { key: '제품구분', label: '제품구분', width: 'min-w-[100px]' },
    { key: '공급업체명', label: '공급업체명', width: 'min-w-[110px]' },
    { key: 'CUT수량', label: 'CUT수량', width: 'min-w-[80px]' },
    { key: '피킹여부', label: '피킹여부', width: 'min-w-[80px]' },
    { key: '미출여부', label: '미출여부', width: 'min-w-[80px]' },
    { key: '조치사항', label: '조치사항', width: 'min-w-[160px]' },
    { key: '매출여부', label: '매출여부', width: 'min-w-[80px]' },
    { key: '취소대상여부', label: '취소대상', width: 'min-w-[80px]' },
];

const FLAG_COLS = new Set(['피킹여부', '미출여부', '매출여부', '취소대상여부']);

function FlagBadge({ value }) {
    const v = String(value || '').toUpperCase();
    if (v === 'Y') return <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">Y</span>;
    if (v === 'N') return <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600">N</span>;
    return <span className="text-gray-400 text-xs">-</span>;
}

function SummaryCard({ label, value, sub, color = 'text-letusBlue' }) {
    return (
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-col gap-1 min-w-[130px]">
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-2xl font-bold ${color}`}>{value}</span>
            {sub && <span className="text-xs text-gray-400">{sub}</span>}
        </div>
    );
}

export const WmsShortageList = () => {
    const [rows, setRows] = useState([]);
    const [fileName, setFileName] = useState('');
    const [uploadDate, setUploadDate] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [filters, setFilters] = useState({ owner: '전체', waveType: '전체', picked: '전체', unshipped: '전체', search: '' });
    const fileInputRef = useRef(null);

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
            setUploadDate(new Date().toLocaleString('ko-KR'));
            setFilters({ owner: '전체', waveType: '전체', picked: '전체', unshipped: '전체', search: '' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFile = (e) => { parseFile(e.target.files[0]); e.target.value = ''; };

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) parseFile(file);
        else alert('.xlsx 또는 .xls 파일만 업로드 가능합니다.');
    }, []);

    const owners = useMemo(() => ['전체', ...new Set(rows.map(r => r['OWNER']).filter(Boolean))], [rows]);
    const waveTypes = useMemo(() => ['전체', ...new Set(rows.map(r => r['WAVE 타입']).filter(Boolean))], [rows]);

    const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));

    const filtered = useMemo(() => rows.filter(r => {
        if (filters.owner !== '전체' && r['OWNER'] !== filters.owner) return false;
        if (filters.waveType !== '전체' && r['WAVE 타입'] !== filters.waveType) return false;
        if (filters.picked !== '전체' && String(r['피킹여부'] || '').toUpperCase() !== filters.picked) return false;
        if (filters.unshipped !== '전체' && String(r['미출여부'] || '').toUpperCase() !== filters.unshipped) return false;
        if (filters.search) {
            const q = filters.search.toLowerCase();
            return ['WAVE명', '오더건명', '품목ID', '공급업체명', '오더번호'].some(k =>
                String(r[k] || '').toLowerCase().includes(q)
            );
        }
        return true;
    }), [rows, filters]);

    const totalCut = useMemo(() => filtered.reduce((s, r) => s + (Number(r['CUT수량']) || 0), 0), [filtered]);

    const ownerStats = useMemo(() => {
        const m = {};
        filtered.forEach(r => { const o = r['OWNER'] || '-'; m[o] = (m[o] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    }, [filtered]);

    const hasData = rows.length > 0;

    return (
        <div className="p-6 flex flex-col gap-4 animate-fade-in w-full h-[calc(100vh-64px)] slide-up bg-slate-100 overflow-auto">

            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-5 bg-letusOrange rounded-full"></span>
                    <h1 className="text-lg font-bold text-gray-800">D-2 결품 리스트</h1>
                    {hasData && (
                        <span className="text-xs text-gray-400 ml-2">{fileName} · {uploadDate} 기준</span>
                    )}
                </div>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-letusOrange text-white rounded-lg text-sm font-semibold hover:bg-orange-500 transition-colors shadow-sm"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {hasData ? 'WMS 파일 재업로드' : 'WMS 파일 업로드'}
                </button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            </div>

            {/* 업로드 영역 (데이터 없을 때) */}
            {!hasData && (
                <div
                    className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl transition-colors cursor-pointer
                        ${isDragging ? 'border-letusOrange bg-orange-50' : 'border-gray-300 bg-white hover:border-letusBlue hover:bg-blue-50'}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {isLoading ? (
                        <div className="flex flex-col items-center gap-3 text-letusBlue">
                            <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            <span className="font-semibold">파일 분석 중...</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3 text-gray-400 select-none">
                            <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-base font-semibold text-gray-500">WMS 결품 엑셀 파일을 여기에 드래그하거나 클릭하여 업로드</p>
                            <p className="text-sm">.xlsx / .xls 형식 지원</p>
                        </div>
                    )}
                </div>
            )}

            {/* 데이터 있을 때 */}
            {hasData && (
                <>
                    {/* 요약 카드 */}
                    <div className="flex flex-wrap gap-3">
                        <SummaryCard label="총 결품 건수" value={filtered.length.toLocaleString()} sub={`전체 ${rows.length}건`} color="text-letusBlue" />
                        <SummaryCard label="총 CUT 수량" value={totalCut.toLocaleString()} sub="EA" color="text-letusOrange" />
                        {ownerStats.map(([owner, cnt]) => (
                            <SummaryCard key={owner} label={owner} value={cnt.toLocaleString()} sub="건" color="text-gray-700" />
                        ))}
                    </div>

                    {/* 필터 바 */}
                    <div className="bg-white rounded-xl shadow-sm p-3 flex flex-wrap gap-3 items-center">
                        {/* 검색 */}
                        <div className="relative flex-1 min-w-[200px]">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="WAVE명, 오더건명, 품목ID, 공급업체명 검색..."
                                value={filters.search}
                                onChange={e => setFilter('search', e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-letusBlue"
                            />
                        </div>

                        <FilterSelect label="OWNER" value={filters.owner} options={owners} onChange={v => setFilter('owner', v)} />
                        <FilterSelect label="WAVE 타입" value={filters.waveType} options={waveTypes} onChange={v => setFilter('waveType', v)} />
                        <FilterSelect label="피킹여부" value={filters.picked} options={['전체', 'Y', 'N']} onChange={v => setFilter('picked', v)} />
                        <FilterSelect label="미출여부" value={filters.unshipped} options={['전체', 'Y', 'N']} onChange={v => setFilter('unshipped', v)} />

                        {/* 필터 초기화 */}
                        {(filters.owner !== '전체' || filters.waveType !== '전체' || filters.picked !== '전체' || filters.unshipped !== '전체' || filters.search) && (
                            <button
                                onClick={() => setFilters({ owner: '전체', waveType: '전체', picked: '전체', unshipped: '전체', search: '' })}
                                className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                초기화
                            </button>
                        )}

                        <span className="ml-auto text-sm text-gray-500 font-medium">{filtered.length}건</span>
                    </div>

                    {/* 테이블 */}
                    <div className="flex-1 bg-white rounded-xl shadow-sm overflow-auto">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-40 text-letusBlue font-semibold">파일 분석 중...</div>
                        ) : filtered.length === 0 ? (
                            <div className="flex items-center justify-center h-40 text-gray-400">조건에 맞는 결품 데이터가 없습니다.</div>
                        ) : (
                            <table className="w-full text-sm border-collapse">
                                <thead className="sticky top-0 z-10 bg-slate-50 text-gray-600 text-xs">
                                    <tr>
                                        <th className="px-3 py-2.5 text-center font-semibold border-b border-gray-200 min-w-[40px]">No.</th>
                                        {COLS.map(c => (
                                            <th key={c.key} className={`px-3 py-2.5 text-left font-semibold border-b border-gray-200 ${c.width} whitespace-nowrap`}>
                                                {c.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((row, i) => (
                                        <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors">
                                            <td className="px-3 py-2 text-center text-gray-400 text-xs">{i + 1}</td>
                                            {COLS.map(c => (
                                                <td key={c.key} className={`px-3 py-2 ${c.width} whitespace-nowrap`}>
                                                    {FLAG_COLS.has(c.key) ? (
                                                        <FlagBadge value={row[c.key]} />
                                                    ) : c.key === 'CUT수량' ? (
                                                        <span className="font-bold text-letusOrange">{row[c.key] ?? '-'}</span>
                                                    ) : c.key === '조치사항' ? (
                                                        <span className="text-gray-600 whitespace-normal break-words max-w-[200px] block">{row[c.key] || '-'}</span>
                                                    ) : (
                                                        <span className="text-gray-700">{row[c.key] ?? '-'}</span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

function FilterSelect({ label, value, options, onChange }) {
    return (
        <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 whitespace-nowrap">{label}</span>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:border-letusBlue bg-white"
            >
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}
