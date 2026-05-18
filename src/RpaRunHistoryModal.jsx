import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon, formatDateTime } from './SharedUI.jsx';

// ============================================================
// 📌 RPA 실행 이력 모달
//   특정 봇(rpa_jobs.id)의 최근 rpa_runs 50건을 보여줌.
//   각 run 의 상태/시간/exit code + 펼치면 stdout / stderr 까지.
// ============================================================
export const RpaRunHistoryModal = ({ job, onClose }) => {
    const [runs, setRuns] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState(new Set());

    useEffect(() => {
        if (!job) return;
        fetchRuns();

        // 실시간 갱신 — running 인 run 이 끝나면 자동 반영
        const channel = supabase
            .channel(`rpa_runs_for_${job.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'rpa_runs', filter: `definition_id=eq.${job.id}` },
                () => fetchRuns()
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job?.id]);

    const fetchRuns = async () => {
        try {
            const { data, error } = await supabase
                .from('rpa_runs')
                .select('*')
                .eq('definition_id', job.id)
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            setRuns(data || []);
        } catch (err) {
            console.error('실행 이력 조회 실패:', err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleExpand = (runId) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(runId)) next.delete(runId);
            else next.add(runId);
            return next;
        });
    };

    const getDuration = (run) => {
        if (!run.started_at || !run.finished_at) return '-';
        const ms = new Date(run.finished_at) - new Date(run.started_at);
        const sec = Math.floor(ms / 1000);
        if (sec < 60) return `${sec}s`;
        const min = Math.floor(sec / 60);
        const remSec = sec % 60;
        return `${min}m ${remSec}s`;
    };

    const StatusBadge = ({ status }) => {
        const map = {
            pending: { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-500', label: '⏳ 대기' },
            running: { bg: 'bg-blue-50 border-blue-200', text: 'text-letusBlue animate-pulse', label: '🔄 실행 중' },
            success: { bg: 'bg-green-50 border-green-200', text: 'text-green-600', label: '✅ 성공' },
            failed: { bg: 'bg-red-50 border-red-200', text: 'text-red-600', label: '❌ 실패' },
            timeout: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-600', label: '⏱ 시간초과' },
        };
        const s = map[status] || { bg: 'bg-gray-50', text: 'text-gray-400', label: status || '-' };
        return (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border shadow-sm ${s.bg} ${s.text}`}>
                {s.label}
            </span>
        );
    };

    if (!job) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-5xl slide-up border border-gray-100 overflow-hidden flex flex-col max-h-[85vh]">

                {/* 헤더 */}
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full"></span>
                        <h3 className="font-bold text-sm text-gray-800">
                            실행 이력 — <span className="text-letusBlue">{job.rpa_name}</span>
                        </h3>
                        <span className="text-xs text-gray-400 ml-2">최근 50건</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={fetchRuns} className="text-gray-400 hover:text-letusBlue transition-colors p-1" title="새로고침">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><CloseIcon /></button>
                    </div>
                </div>

                {/* 본문 */}
                <div className="overflow-y-auto flex-1 custom-scrollbar">
                    {isLoading ? (
                        <div className="py-20 text-center">
                            <div className="w-8 h-8 border-4 border-blue-100 border-t-letusBlue rounded-full animate-spin mx-auto"></div>
                            <p className="mt-3 text-gray-500 font-bold text-[13px]">실행 이력을 불러오는 중입니다...</p>
                        </div>
                    ) : runs.length === 0 ? (
                        <div className="py-20 text-center text-gray-400 font-bold">
                            아직 실행 이력이 없습니다.<br />
                            <span className="text-xs text-gray-300 font-medium">▶ 실행 버튼을 누르거나 스케줄이 도래하면 여기에 기록됩니다.</span>
                        </div>
                    ) : (
                        <table className="w-full text-left text-[12px]">
                            <thead className="bg-slate-50 border-b border-gray-200 text-xs text-slate-500 font-bold sticky top-0">
                                <tr>
                                    <th className="p-3 pl-4 w-24">상태</th>
                                    <th className="p-3 w-44">시작 시각</th>
                                    <th className="p-3 w-20 text-right">소요</th>
                                    <th className="p-3 w-20 text-center">trigger</th>
                                    <th className="p-3 w-16 text-center">exit</th>
                                    <th className="p-3">에러 / 메시지</th>
                                    <th className="p-3 w-12 text-center">로그</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700">
                                {runs.map((run) => {
                                    const isExpanded = expandedIds.has(run.id);
                                    const hasLog = (run.stdout_log && run.stdout_log.length > 0) || (run.stderr_log && run.stderr_log.length > 0);
                                    return (
                                        <React.Fragment key={run.id}>
                                            <tr className="hover:bg-blue-50/30 transition-colors">
                                                <td className="p-3 pl-4"><StatusBadge status={run.status} /></td>
                                                <td className="p-3 font-mono text-[11px] text-gray-600">{formatDateTime(run.started_at || run.created_at)}</td>
                                                <td className="p-3 text-right font-mono text-[11px] text-gray-500">{getDuration(run)}</td>
                                                <td className="p-3 text-center text-[10px]">
                                                    <span className={`px-1.5 py-0.5 rounded ${run.triggered_by === 'manual' ? 'bg-purple-50 text-purple-600 border border-purple-200' : 'bg-gray-50 text-gray-500 border border-gray-200'}`}>
                                                        {run.triggered_by === 'manual' ? '🖐️ 수동' : run.triggered_by === 'schedule' ? '⏱️ 자동' : '-'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center font-mono text-[11px]">
                                                    {run.exit_code === null || run.exit_code === undefined ? '-' :
                                                        <span className={run.exit_code === 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{run.exit_code}</span>
                                                    }
                                                </td>
                                                <td className="p-3 text-[11px] text-gray-600 truncate max-w-[280px]" title={run.error_message || ''}>
                                                    {run.error_message || (run.status === 'success' ? '-' : '')}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {hasLog ? (
                                                        <button onClick={() => toggleExpand(run.id)} className="text-letusBlue hover:text-blue-700 transition-colors text-[10px] font-bold">
                                                            {isExpanded ? '닫기' : '보기'}
                                                        </button>
                                                    ) : <span className="text-gray-300">-</span>}
                                                </td>
                                            </tr>
                                            {isExpanded && hasLog && (
                                                <tr className="bg-slate-50/70">
                                                    <td colSpan={7} className="p-4 border-l-4 border-letusBlue">
                                                        {run.stdout_log && (
                                                            <div className="mb-3">
                                                                <div className="text-[10px] font-bold text-gray-500 mb-1">📤 stdout</div>
                                                                <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 p-3 rounded max-h-60 overflow-auto custom-scrollbar whitespace-pre-wrap break-all">{run.stdout_log}</pre>
                                                            </div>
                                                        )}
                                                        {run.stderr_log && (
                                                            <div>
                                                                <div className="text-[10px] font-bold text-red-500 mb-1">⚠️ stderr</div>
                                                                <pre className="text-[11px] font-mono bg-red-50 text-red-700 p-3 rounded max-h-40 overflow-auto custom-scrollbar whitespace-pre-wrap break-all border border-red-200">{run.stderr_log}</pre>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* 푸터 */}
                <div className="p-3 border-t bg-gray-50 flex justify-between items-center shrink-0 text-[11px] text-gray-500">
                    <span>📡 실시간 갱신 활성</span>
                    <button onClick={onClose} className="px-4 py-1.5 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};
