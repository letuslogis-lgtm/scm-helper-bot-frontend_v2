import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient.js';

// --- 1. 상차 구역 일괄 업로드 모달 ---
const MapBulkUploadModal = ({ onClose, onReload, currentWarehouse }) => {
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStats, setUploadStats] = useState(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleDownloadTemplate = () => {
        const headers = ["구역코드(필수)", "표시이름(별칭)", "그리드X(필수)", "그리드Y(필수)", "가로병합(SpanX)", "세로병합(SpanY)", "배경색(HEX)", "글자색(HEX)", "시공팀명"];
        const sample = ["A01-1", "1번도크", "1", "1", "2", "1", "#ffffff", "#000000", "이동훈"];
        const csvContent = headers.join(",") + "\n" + sample.join(",");
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `상차도면_일괄등록양식_${currentWarehouse}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileChange = (e) => {
        const selected = e.target.files[0];
        if (selected && selected.name.includes('.csv')) setFile(selected);
        else { alert('CSV 파일(.csv)만 업로드 가능합니다.'); e.target.value = null; }
    };

    const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = () => setIsDragging(false);
    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const selected = e.dataTransfer.files[0];
        if (selected && selected.name.includes('.csv')) setFile(selected);
        else { alert('CSV 파일(.csv)만 업로드 가능합니다.'); }
    };

    const handleUpload = async () => {
        if (!file) return alert('업로드할 파일을 선택해 주세요.');
        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                let stats = { insert: 0, fail: 0, logs: [] };
                await supabase.from('construction_teams').update({ assigned_zone_id: null }).eq('warehouse', currentWarehouse);
                await supabase.from('loading_zones').delete().eq('warehouse', currentWarehouse);
                const text = e.target.result;
                const rows = text.split('\n').filter(row => row.trim() !== '');
                const delimiter = rows[0].includes('\t') ? '\t' : ',';
                for (let i = 1; i < rows.length; i++) {
                    const cols = rows[i].split(delimiter).map(c => c.trim());
                    if (cols.length < 4) continue;
                    const payload = {
                        warehouse: currentWarehouse, zone_code: cols[0], display_name: cols[1] || null,
                        grid_x: parseInt(cols[2]), grid_y: parseInt(cols[3]),
                        span_x: parseInt(cols[4]) || 1, span_y: parseInt(cols[5]) || 1,
                        bg_color: cols[6] || "#ffffff", text_color: cols[7] || "#000000"
                    };
                    try {
                        const { data: zData, error: zError } = await supabase.from('loading_zones').insert([payload]).select();
                        if (zError) throw zError;
                        if (cols[8]) {
                            const teamName = cols[8];
                            const { data: existingTeam } = await supabase.from('construction_teams').select('id').eq('team_name', teamName).eq('warehouse', currentWarehouse);
                            if (existingTeam && existingTeam.length > 0) {
                                await supabase.from('construction_teams').update({ assigned_zone_id: zData[0].id }).eq('id', existingTeam[0].id);
                            } else {
                                await supabase.from('construction_teams').insert([{ team_name: teamName, assigned_zone_id: zData[0].id, manager: '미지정', warehouse: currentWarehouse }]);
                            }
                        }
                        stats.insert++;
                    } catch (err) {
                        stats.fail++;
                        stats.logs.push(`${i + 1}행 [${cols[0]}]: ${err.message}`);
                    }
                }
                setUploadStats(stats);
                if (stats.insert > 0) onReload();
            } catch (err) { alert('에러 발생: ' + err.message); }
            finally { setIsUploading(false); }
        };
        reader.readAsText(file, 'euc-kr');
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200] backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[500px] overflow-hidden flex flex-col font-sans">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center">
                        <span className="w-1.5 h-3.5 bg-blue-500 rounded-full mr-2"></span>도면 일괄 등록 [{currentWarehouse}]
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
                </div>
                <div className="p-6 bg-slate-50 flex-1 overflow-y-auto max-h-[70vh]">
                    {!uploadStats ? (
                        <div className="space-y-4">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs font-medium text-gray-600 space-y-1">
                                <p className="font-bold text-letusBlue mb-2">💡 업로드 안내</p>
                                <p>- 현재 선택된 <span className="font-bold text-red-500">[{currentWarehouse}]</span>의 도면만 초기화됩니다.</p>
                            </div>
                            <button onClick={handleDownloadTemplate} className="w-full flex justify-center items-center gap-2 py-2.5 border border-green-500 text-green-600 text-xs font-bold rounded-lg hover:bg-green-50 transition-colors">등록 양식 다운로드 (.csv)</button>
                            
                            {/* 🌟 드래그 앤 드롭 영역 */}
                            <div
                                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                                className={`relative border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center transition-all min-h-[140px] ${isDragging ? 'border-letusBlue bg-blue-50/50 scale-[1.02]' : 'border-gray-300 bg-white hover:border-gray-400'}`}
                            >
                                <input type="file" accept=".csv" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                {file ? (
                                    <div className="flex flex-col items-center text-letusBlue font-bold text-sm z-20 pointer-events-none">
                                        <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span>{file.name}</span>
                                        <span className="text-[10px] text-gray-400 mt-1">(클릭하여 다른 파일 선택)</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-gray-500 text-sm font-bold z-20 pointer-events-none">
                                        <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        <span>CSV 파일을 이곳으로 드래그 하세요</span>
                                        <span className="text-[10px] text-gray-400 mt-1.5 bg-gray-100 px-2 py-1 rounded">또는 클릭하여 파일 선택</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 rounded-lg border bg-white border-gray-200">
                                <h4 className="font-bold text-gray-800 mb-2 text-center text-sm">업로드 처리 결과</h4>
                                <div className="flex justify-center gap-4 text-sm font-bold">
                                    <span className="text-green-600">✨ 등록: {uploadStats.insert}</span>
                                    <span className="text-red-500">❌ 실패: {uploadStats.fail}</span>
                                </div>
                            </div>
                            {uploadStats.logs.length > 0 && (
                                <div className="bg-red-50 border border-red-100 rounded-lg p-3 max-h-32 overflow-auto text-[11px] text-red-500 font-mono">
                                    {uploadStats.logs.map((l, i) => <p key={i}>- {l}</p>)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t bg-white flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 text-[11px] font-bold rounded hover:bg-gray-50">닫기</button>
                    {!uploadStats && <button onClick={handleUpload} disabled={isUploading || !file} className="px-5 py-2 bg-letusBlue text-white text-[11px] font-bold rounded hover:bg-blue-600 shadow-md">데이터 적용</button>}
                </div>
            </div>
        </div>
    );
};

// 🌟 React.memo를 사용한 개별 그리드 셀 컴포넌트 (성능 최적화)
const ZoneCell = React.memo(({ zone, isEditMode, searchQuery, onCellClick }) => {
    if (zone.isEmpty) {
        return <div onClick={() => onCellClick(zone.grid_x, zone.grid_y, null)} className={`border-r border-b border-slate-200 ${isEditMode ? 'hover:bg-slate-200 cursor-crosshair' : ''}`} />;
    }

    const isFixed = /^[A-B]\d{2}$/.test(zone.zone_code) || ['Core', '입/출구', 'RT/물류'].includes(zone.zone_code);
    const spanX = zone.span_x || 1;
    const spanY = zone.span_y || 1;
    const isVertical = spanY > spanX;
    const dynamicFontSize = isVertical ? (spanY >= 4 ? 'text-[clamp(9px,1.2vh,11px)]' : 'text-[clamp(8px,1.0vh,10px)]') : (spanX >= 4 ? 'text-[clamp(9px,1.2vh,11px)]' : 'text-[clamp(8px,0.9vh,9px)]');
    const verticalStyle = isVertical ? { writingMode: 'vertical-rl', textOrientation: 'upright', letterSpacing: '0px', lineHeight: '1.2' } : {};

    const isMatched = searchQuery && (
        (zone.zone_code?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (zone.display_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (zone.team_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div onClick={() => onCellClick(zone.grid_x, zone.grid_y, zone)}
            style={{
                gridColumn: `${zone.grid_x} / span ${spanX}`, gridRow: `${zone.grid_y} / span ${spanY}`,
                backgroundColor: zone.bg_color || (isFixed ? '#0f172a' : '#ffffff'), color: zone.text_color || (isFixed ? '#ffffff' : '#64748b')
            }}
            className={`relative border-r border-b border-gray-300 flex items-center justify-center transition-all overflow-hidden 
                ${isEditMode ? 'cursor-pointer hover:bg-slate-100/50 z-30' : ''}
                ${isMatched ? 'ring-2 ring-red-500 z-50 shadow-md scale-[1.01]' : ''}
            `}
        >
            <span className={`font-normal text-center leading-none pointer-events-none ${dynamicFontSize}`} style={verticalStyle}>
                {zone.display_name || zone.zone_code}
            </span>
        </div>
    );
});

// --- 2. 메인 관리 페이지 ---
export const LoadingMap = () => {
    const GRID_COLS = 66;
    const GRID_ROWS = 28;

    const [isLoading, setIsLoading] = useState(true);
    const [isEditMode, setIsEditMode] = useState(false);
    const [showSidebar, setShowSidebar] = useState(false);
    const [zones, setZones] = useState([]);
    const [unassignedTeams, setUnassignedTeams] = useState([]);
    const [filterWarehouse, setFilterWarehouse] = useState('양지1센터');
    const [searchQuery, setSearchQuery] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState({ x: 1, y: 1, code: '', displayName: '', useAlias: false, spanX: 1, spanY: 1, bgColor: '#ffffff', textColor: '#000000' });
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    useEffect(() => { fetchMapData(); }, [filterWarehouse]);

    const fetchMapData = async () => {
        setIsLoading(true);
        try {
            const [{ data: zonesData }, { data: teamsData }] = await Promise.all([
                supabase.from('loading_zones').select('*').eq('warehouse', filterWarehouse),
                supabase.from('construction_teams').select('*').eq('warehouse', filterWarehouse)
            ]);

            const occupied = new Set();
            const validZoneIds = new Set(zonesData?.map(z => z.id) || []);

            zonesData?.forEach(zone => {
                for (let dy = 0; dy < (zone.span_y || 1); dy++) {
                    for (let dx = 0; dx < (zone.span_x || 1); dx++) {
                        occupied.add(`${zone.grid_x + dx}-${zone.grid_y + dy}`);
                    }
                }
            });

            const fullGrid = [];
            for (let y = 1; y <= GRID_ROWS; y++) {
                for (let x = 1; x <= GRID_COLS; x++) {
                    const existingZone = zonesData?.find(z => z.grid_x === x && z.grid_y === y);
                    if (existingZone) {
                        const team = teamsData?.find(t => t.assigned_zone_id === existingZone.id);
                        fullGrid.push({ ...existingZone, team_id: team?.id, team_name: team?.team_name });
                    } else if (!occupied.has(`${x}-${y}`)) {
                        fullGrid.push({ id: `empty-${x}-${y}`, grid_x: x, grid_y: y, isEmpty: true });
                    }
                }
            }
            setZones(fullGrid);
            setUnassignedTeams(teamsData?.filter(t => !t.assigned_zone_id || !validZoneIds.has(t.assigned_zone_id)) || []);
        } catch (e) { console.error(e); } finally { setIsLoading(false); }
    };

    const handleCellClick = useCallback((x, y, zone) => {
        if (!isEditMode) return;
        if (zone && !zone.isEmpty) {
            if (window.confirm(`[${zone.zone_code}] 구역을 삭제하시겠습니까?`)) {
                supabase.from('loading_zones').delete().eq('id', zone.id).then(() => fetchMapData());
            }
        } else {
            setModalData({ x, y, code: '', displayName: '', useAlias: false, spanX: 1, spanY: 1, bgColor: '#ffffff', textColor: '#000000' });
            setIsModalOpen(true);
        }
    }, [isEditMode, fetchMapData]);

    const handleModalSave = async () => {
        if (!modalData.code) return alert("구역 코드는 필수입니다.");
        const payload = {
            warehouse: filterWarehouse, zone_code: modalData.code, display_name: modalData.useAlias ? modalData.displayName : null,
            grid_x: modalData.x, grid_y: modalData.y, span_x: modalData.spanX, span_y: modalData.spanY,
            bg_color: modalData.bgColor, text_color: modalData.textColor
        };
        const { error } = await supabase.from('loading_zones').insert([payload]);
        if (!error) { setIsModalOpen(false); fetchMapData(); }
    };

    return (
        <div className="h-full w-full bg-slate-50 p-6 flex flex-col gap-4 overflow-hidden select-none font-sans">
            <div className="w-full bg-white rounded-lg shadow-sm border border-slate-200 px-6 py-3 flex items-center z-30 shrink-0">
                <div className="flex items-center gap-5 w-full flex-wrap">
                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">창고</label>
                        <select
                            value={filterWarehouse}
                            onChange={e => setFilterWarehouse(e.target.value)}
                            className="border border-gray-200 rounded-[3px] text-xs px-2.5 h-[30px] focus:outline-none focus:border-letusOrange w-32 cursor-pointer text-gray-700 font-normal"
                        >
                            <option value="양지1센터">양지1센터</option>
                            <option value="양지2센터">양지2센터</option>
                            <option value="양지3센터">양지3센터</option>
                            <option value="안성센터">안성센터</option>
                            <option value="평택센터">평택센터</option>
                            <option value="음성센터">음성센터</option>
                        </select>
                    </div>

                    <div className="flex items-center shrink-0">
                        <label className="text-[11px] font-bold text-gray-600 mr-2 whitespace-nowrap">검색</label>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="구역/별칭/팀명 검색..."
                            className="border border-gray-200 rounded-[3px] text-xs px-3 h-[30px] focus:outline-none focus:border-letusOrange w-48 text-gray-700 shadow-sm"
                        />
                    </div>

                    <div className="ml-auto shrink-0 flex items-center gap-2">
                        <button onClick={() => setShowSidebar(!showSidebar)} className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-bold px-4 h-[30px] rounded-[3px] text-xs transition-colors">
                            {showSidebar ? '닫기 ❯' : '❮ 팀 리스트'}
                        </button>
                        {isEditMode && (
                            <button onClick={() => setIsUploadModalOpen(true)} className="border border-blue-200 text-letusBlue bg-blue-50 hover:bg-blue-100 font-bold px-4 h-[30px] rounded-[3px] text-xs flex items-center gap-1 shadow-sm">
                                📁 일괄 등록
                            </button>
                        )}
                        <button onClick={() => setIsEditMode(!isEditMode)} className={`font-bold px-4 h-[30px] rounded-[3px] text-xs border transition-colors shadow-sm ${isEditMode ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-slate-600 border-gray-300 hover:bg-gray-50'}`}>
                            {isEditMode ? '🔴 도면 편집 켜짐' : '✏️ 도면 편집 켜기'}
                        </button>
                        <button onClick={fetchMapData} className="bg-letusOrange text-white hover:bg-orange-600 font-bold px-6 h-[30px] rounded-[3px] text-xs shadow-md transition-colors">
                            조회
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex gap-3 min-h-0 relative">
                <div className="flex-1 bg-white rounded-lg shadow-sm border border-slate-300 overflow-hidden p-1 flex flex-col min-h-0">
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))`, width: '100%', height: '100%' }} className="bg-slate-50 flex-1 relative min-h-0">
                        {zones.map(zone => (
                            <ZoneCell
                                key={zone.id}
                                zone={zone}
                                isEditMode={isEditMode}
                                searchQuery={searchQuery}
                                onCellClick={handleCellClick}
                            />
                        ))}
                    </div>
                </div>

                {showSidebar && (
                    <div className="w-[180px] shrink-0 bg-white rounded-lg border border-slate-300 flex flex-col overflow-hidden shadow-sm">
                        <div className="p-3 bg-slate-50 border-b flex justify-between items-center text-xs font-black text-slate-700 shrink-0">
                            미배정 팀 <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[10px]">{unassignedTeams.length}</span>
                        </div>
                        <div className="p-2 flex-1 overflow-y-auto flex flex-col gap-2 bg-slate-50/50 min-h-0">
                            {unassignedTeams.map(team => (
                                <div key={team.id} className="p-2.5 bg-white border border-slate-200 rounded shadow-sm">
                                    <div className="text-[11px] font-semibold text-slate-800 break-keep tracking-tight leading-tight mb-1">{team.team_name}</div>
                                    <div className="text-[9px] text-slate-500 break-keep opacity-80">{team.manager || '미지정'}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {isUploadModalOpen && <MapBulkUploadModal onClose={() => setIsUploadModalOpen(false)} onReload={fetchMapData} currentWarehouse={filterWarehouse} />}

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-[400px] flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white">
                            <h3 className="text-sm font-bold text-gray-800">구역 수동 설정 ({modalData.x}, {modalData.y})</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
                        </div>
                        <div className="p-6 bg-slate-50 flex-1 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">구역 코드 (DB용)</label>
                                <input type="text" className="w-full border border-gray-300 p-2.5 rounded-lg text-sm" value={modalData.code} onChange={e => setModalData({ ...modalData, code: e.target.value })} />
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <input type="checkbox" id="useAlias" checked={modalData.useAlias} onChange={e => setModalData({ ...modalData, useAlias: e.target.checked })} />
                                    <label htmlFor="useAlias" className="text-xs font-bold text-gray-700 cursor-pointer">별칭 표시</label>
                                </div>
                                {modalData.useAlias && <input type="text" className="w-full border border-gray-300 p-2 rounded text-sm" value={modalData.displayName} onChange={e => setModalData({ ...modalData, displayName: e.target.value })} placeholder="예: 통로" />}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className="block text-xs font-bold text-gray-700 mb-1">Span X</label><input type="number" className="w-full border border-gray-300 p-2.5 rounded-lg text-sm" value={modalData.spanX} onChange={e => setModalData({ ...modalData, spanX: parseInt(e.target.value) })} /></div>
                                <div><label className="block text-xs font-bold text-gray-700 mb-1">Span Y</label><input type="number" className="w-full border border-gray-300 p-2.5 rounded-lg text-sm" value={modalData.spanY} onChange={e => setModalData({ ...modalData, spanY: parseInt(e.target.value) })} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <div><label className="block text-xs font-bold text-gray-700 mb-1">배경색</label><input type="color" className="w-full h-8" value={modalData.bgColor} onChange={e => setModalData({ ...modalData, bgColor: e.target.value })} /></div>
                                <div><label className="block text-xs font-bold text-gray-700 mb-1">글씨색</label><input type="color" className="w-full h-8" value={modalData.textColor} onChange={e => setModalData({ ...modalData, textColor: e.target.value })} /></div>
                            </div>
                        </div>
                        <div className="p-4 border-t bg-white flex justify-end gap-2">
                            <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 border border-gray-300 text-gray-600 text-[11px] font-bold rounded hover:bg-gray-50">취소</button>
                            <button onClick={handleModalSave} className="px-6 py-2 bg-letusBlue text-white text-[11px] font-bold rounded hover:bg-blue-600">저장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};