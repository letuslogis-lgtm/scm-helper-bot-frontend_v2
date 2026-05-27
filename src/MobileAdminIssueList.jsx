import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

const BRANDS = ['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소'];
const STATUS_TABS = ['전체', '조치대기', '처리 중', '조치완료'];
const ISSUE_TYPES = [
    '계획 없음/누락', '수량 부족 (계획>실물)', '과입고 (계획<실물)', '미입고',
    '파손·불량', '바코드 오류', '포장 불량·혼적', '표기·규격 미흡',
    '반송품 처리', '오반품·오입고',
    '전산-실물 불일치', 'WMS·전산 오류', '기타 특이사항',
];

const STATUS_STYLE = {
    '조치대기': 'bg-amber-50 text-amber-600 border-amber-200',
    '처리 중':  'bg-blue-50 text-blue-600 border-blue-200',
    '조치완료': 'bg-green-50 text-green-600 border-green-200',
};

const todayStr = () => new Date().toISOString().split('T')[0];

const formatDate = (dt) => {
    if (!dt) return '';
    const d = new Date(dt);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDateLabel = (d) => {
    if (!d) return '';
    const [, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}`;
};

const parseImageUrls = (urlString) => {
    if (!urlString) return [];
    return urlString.split(',').map(s => s.trim()).filter(Boolean);
};

// ─── 날짜 선택 시트 ────────────────────────────────────────────────────────
const DateFilterSheet = ({ dateFilter, onApply, onClose }) => {
    const [start, setStart] = useState(dateFilter.start);
    const [end, setEnd] = useState(dateFilter.end);
    const endRef = useRef(null);

    const handleStartChange = (e) => {
        setStart(e.target.value);
        setTimeout(() => endRef.current?.focus(), 100);
    };

    const today = todayStr();
    const presets = [
        { label: '오늘',    s: today,   e: today },
        { label: '3일',     s: (() => { const d = new Date(); d.setDate(d.getDate() - 3); return d.toISOString().split('T')[0]; })(), e: today },
        { label: '이번 달', s: (() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; })(), e: today },
        { label: '한 달',   s: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; })(), e: today },
    ];

    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>
                <div className="px-5 pb-10 pt-3 space-y-4">
                    <p className="text-slate-800 font-black text-base">조회 기간 설정</p>

                    {/* 빠른 선택 */}
                    <div className="flex gap-2">
                        {presets.map(({ label, s, e }) => (
                            <button key={label}
                                onClick={() => { setStart(s); setEnd(e); }}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
                                    start === s && end === e
                                        ? 'bg-letusBlue text-white'
                                        : 'bg-slate-100 text-slate-600 active:bg-slate-200'
                                }`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* 날짜 직접 입력 */}
                    <div className="flex gap-3 items-center">
                        <div className="flex-1">
                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">시작일</label>
                            <input type="date" value={start} max={end || today}
                                onChange={handleStartChange}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue" />
                        </div>
                        <span className="text-slate-300 font-bold mt-5">~</span>
                        <div className="flex-1">
                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">종료일</label>
                            <input ref={endRef} type="date" value={end} min={start} max={today}
                                onChange={e => setEnd(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue" />
                        </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex gap-2.5">
                        <button onClick={() => onApply({ start: '', end: '' })}
                            className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm active:bg-slate-200 transition-colors">
                            전체 기간
                        </button>
                        <button onClick={() => onApply({ start, end })} disabled={!start || !end}
                            className="flex-[2] py-3.5 rounded-xl bg-letusOrange text-white font-bold text-sm active:bg-orange-600 transition-colors disabled:bg-slate-200 disabled:text-slate-400">
                            조회
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

// ─── 이슈 상세 + 조치 시트 ────────────────────────────────────────────────
const IssueDetailSheet = ({ issue, onClose, onReload, userProfile }) => {
    const [mode, setMode] = useState('view'); // 'view' | 'relay' | 'action'
    const [relayText, setRelayText] = useState('');
    const [actionText, setActionText] = useState('');
    const [issueType, setIssueType] = useState(issue.issue_type || '');
    const [isSaving, setIsSaving] = useState(false);
    const [currentImg, setCurrentImg] = useState(0);

    const isWaiting = issue.status === '조치대기';
    const isProcessing = issue.status === '처리 중';
    const isDone = issue.status === '조치완료';
    const imageUrls = parseImageUrls(issue.image_url);

    const handleTransfer = async () => {
        if (!relayText.trim()) return alert('이관 메시지를 입력해주세요.');
        setIsSaving(true);
        try {
            const { error } = await supabase.from('logistics_issues').update({
                relay_content: relayText,
                status: '처리 중',
            }).eq('id', issue.id);
            if (error) throw error;
            await onReload();
            onClose();
        } catch {
            alert('오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleComplete = async () => {
        if (!actionText.trim()) return alert('조치 내용을 입력해주세요.');
        setIsSaving(true);
        try {
            const nowIso = new Date().toISOString();
            const { error } = await supabase.from('logistics_issues').update({
                action_content: actionText,
                issue_type: issueType,
                status: '조치완료',
                final_handler: userProfile?.name || '관리자',
                resolved_at: nowIso,
                is_notified: true,
                feedback_sent_at: nowIso,
            }).eq('id', issue.id);
            if (error) throw error;
            await onReload();
            onClose();
        } catch {
            alert('오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[88svh] flex flex-col">
                <div className="flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>

                <div className="px-5 pb-3 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-slate-400">{issue.reception_no}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_STYLE[issue.status] || 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            {issue.status}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-1 text-slate-400 active:text-slate-700">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4 space-y-4">
                    <div className="flex gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-full bg-letusBlue/10 text-letusBlue text-xs font-bold border border-letusBlue/20">{issue.brand}</span>
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">{issue.issue_type}</span>
                    </div>

                    {issue.product_code && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-400">품목코드</span>
                            <span className="text-sm font-mono font-bold text-slate-700">{issue.product_code}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>등록자</span>
                        <span className="font-bold text-slate-600">{issue.reporter}</span>
                        <span className="text-slate-300">·</span>
                        <span>{formatDate(issue.created_at)}</span>
                    </div>

                    {/* 현장 사진 */}
                    {imageUrls.length > 0 && (
                        <div>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">현장 사진</p>
                            <div className="relative bg-slate-50 rounded-xl overflow-hidden">
                                <a href={imageUrls[currentImg]} target="_blank" rel="noopener noreferrer">
                                    <img src={imageUrls[currentImg]} alt={`현장 사진 ${currentImg + 1}`}
                                        className="w-full max-h-52 object-contain" />
                                </a>
                                {imageUrls.length > 1 && (
                                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                                        {imageUrls.map((_, i) => (
                                            <button key={i} onClick={() => setCurrentImg(i)}
                                                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentImg ? 'bg-letusBlue' : 'bg-slate-300'}`} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="h-px bg-slate-100" />

                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">접수 내용</p>
                        <p className="text-slate-700 text-sm leading-relaxed">{issue.request_content || '(내용 없음)'}</p>
                    </div>

                    {issue.relay_content && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div>
                                <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mb-1.5">이관 메시지</p>
                                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                                    <p className="text-blue-800 text-sm leading-relaxed">{issue.relay_content}</p>
                                </div>
                            </div>
                        </>
                    )}

                    {issue.purchase_response && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div>
                                <p className="text-[11px] font-bold text-purple-400 uppercase tracking-widest mb-1.5">유관부서 회신</p>
                                <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
                                    <p className="text-purple-800 text-sm leading-relaxed">{issue.purchase_response}</p>
                                </div>
                            </div>
                        </>
                    )}

                    {isDone && issue.action_content && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div>
                                <p className="text-[11px] font-bold text-green-500 uppercase tracking-widest mb-1.5">조치 내용</p>
                                <p className="text-slate-700 text-sm leading-relaxed">{issue.action_content}</p>
                                <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                                    {issue.final_handler && <span>담당자: <span className="font-bold text-slate-500">{issue.final_handler}</span></span>}
                                    {issue.resolved_at && <span>{formatDate(issue.resolved_at)}</span>}
                                </div>
                            </div>
                        </>
                    )}

                    {mode === 'relay' && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div>
                                <p className="text-[11px] font-bold text-blue-500 uppercase tracking-widest mb-2">이관 메시지 작성</p>
                                <textarea value={relayText} onChange={e => setRelayText(e.target.value)}
                                    placeholder="구매·생산팀에 전달할 내용을 입력해주세요."
                                    rows={4} autoFocus
                                    className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue resize-none" />
                            </div>
                        </>
                    )}

                    {mode === 'action' && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div className="space-y-3">
                                <p className="text-[11px] font-bold text-green-500 uppercase tracking-widest">조치 내용 등록</p>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1.5 block">이슈 유형 확정</label>
                                    <select value={issueType} onChange={e => setIssueType(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500">
                                        <option value="">-- 유형 선택 --</option>
                                        {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1.5 block">조치 내용</label>
                                    <textarea value={actionText} onChange={e => setActionText(e.target.value)}
                                        placeholder="처리 결과 및 조치 내용을 상세히 입력해주세요."
                                        rows={4} autoFocus
                                        className="w-full bg-green-50/50 border border-green-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 resize-none" />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="px-5 pb-8 pt-3 border-t border-slate-100 shrink-0">
                    {isDone ? (
                        <button onClick={onClose} className="w-full py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:bg-slate-200">닫기</button>
                    ) : mode === 'view' ? (
                        <div className="flex gap-2.5">
                            {isWaiting && (
                                <>
                                    <button onClick={() => setMode('relay')}
                                        className="flex-1 py-3.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 font-bold text-sm active:bg-blue-100">
                                        이관
                                    </button>
                                    <button onClick={() => setMode('action')}
                                        className="flex-1 py-3.5 rounded-xl bg-amber-500 text-white font-bold text-sm active:bg-amber-600">
                                        직접 조치
                                    </button>
                                </>
                            )}
                            {isProcessing && (
                                <button onClick={() => setMode('action')}
                                    className="w-full py-3.5 rounded-xl bg-green-500 text-white font-bold text-sm active:bg-green-600">
                                    조치완료 처리
                                </button>
                            )}
                        </div>
                    ) : mode === 'relay' ? (
                        <div className="flex gap-2.5">
                            <button onClick={() => setMode('view')} disabled={isSaving}
                                className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:bg-slate-200 disabled:opacity-50">취소</button>
                            <button onClick={handleTransfer} disabled={isSaving}
                                className="flex-[2] py-3.5 rounded-xl bg-blue-500 text-white font-bold text-sm active:bg-blue-600 disabled:opacity-60">
                                {isSaving ? '처리 중...' : '이관 확정'}
                            </button>
                        </div>
                    ) : mode === 'action' ? (
                        <div className="flex gap-2.5">
                            <button onClick={() => setMode('view')} disabled={isSaving}
                                className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:bg-slate-200 disabled:opacity-50">취소</button>
                            <button onClick={handleComplete} disabled={isSaving}
                                className="flex-[2] py-3.5 rounded-xl bg-green-500 text-white font-bold text-sm active:bg-green-600 disabled:opacity-60">
                                {isSaving ? '저장 중...' : '조치완료'}
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </>
    );
};

// ─── 이슈 카드 ────────────────────────────────────────────────────────────
const IssueCard = ({ issue, onSelect }) => (
    <button onClick={() => onSelect(issue)}
        className="w-full bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-left active:scale-[0.98] transition-transform">
        <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono text-slate-400">{issue.reception_no}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLE[issue.status] || 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                    {issue.status}
                </span>
            </div>
            <span className="text-[11px] text-slate-400 shrink-0">{formatDate(issue.created_at)}</span>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-2">
            <span className="px-2 py-0.5 rounded-md bg-letusBlue/10 text-letusBlue text-[11px] font-bold">{issue.brand}</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[11px] font-bold">{issue.issue_type}</span>
        </div>
        {issue.product_code && <p className="text-xs font-mono text-slate-500 mb-1.5">📦 {issue.product_code}</p>}
        <p className="text-slate-600 text-xs leading-relaxed line-clamp-2">{issue.request_content || '(내용 없음)'}</p>
        <div className="mt-2 text-[11px] text-slate-400">
            등록자: <span className="font-bold text-slate-500">{issue.reporter}</span>
        </div>
    </button>
);

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────
export const MobileAdminIssueList = ({ userProfile }) => {
    const navigate = useNavigate();
    const location = useLocation();

    // ── 상태 ──
    const [activeTab, setActiveTab] = useState(location.state?.initialTab || '전체');
    const [dateFilter, setDateFilter] = useState({ start: todayStr(), end: todayStr() });
    const [selectedBrands, setSelectedBrands] = useState([]); // 다중 선택
    const [searchText, setSearchText] = useState('');
    const [issues, setIssues] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIssue, setSelectedIssue] = useState(null);
    const [showDateSheet, setShowDateSheet] = useState(false);

    // dateFilter를 ref로도 유지 (realtime 핸들러에서 항상 최신값 참조)
    const dateFilterRef = useRef(dateFilter);
    useEffect(() => { dateFilterRef.current = dateFilter; }, [dateFilter]);

    // ── managed_brands 자동 선택 ──
    useEffect(() => {
        if (!userProfile?.managed_brands) return;
        const brands = userProfile.managed_brands
            .split(',').map(s => s.trim()).filter(s => BRANDS.includes(s));
        if (brands.length > 0) setSelectedBrands(brands);
    }, [userProfile?.managed_brands]);

    // ── 데이터 fetch ──
    const fetchIssues = useCallback(async (opts = {}) => {
        const { start, end } = opts;
        setIsLoading(true);
        try {
            let query = supabase
                .from('logistics_issues')
                .select('id, reception_no, status, brand, issue_type, product_code, reporter, request_content, relay_content, purchase_response, action_content, final_handler, resolved_at, created_at, image_url, image_url_hq, is_notified')
                .order('created_at', { ascending: false })
                .limit(500);
            if (start) query = query.gte('created_at', `${start}T00:00:00`);
            if (end)   query = query.lte('created_at', `${end}T23:59:59`);
            const { data, error } = await query;
            if (error) throw error;
            setIssues(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // 날짜 변경 시 re-fetch
    useEffect(() => {
        fetchIssues(dateFilter);
    }, [dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    // Realtime 구독 (날짜 변경 무관하게 1회 구독, ref로 현재 날짜 참조)
    useEffect(() => {
        const channel = supabase
            .channel('admin_mobile_issue_list')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logistics_issues' }, () => {
                fetchIssues(dateFilterRef.current);
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [fetchIssues]);

    // ── 브랜드 토글 ──
    const toggleBrand = useCallback((brand) => {
        if (brand === '전체') {
            setSelectedBrands([]);
        } else {
            setSelectedBrands(prev =>
                prev.includes(brand)
                    ? prev.filter(b => b !== brand)
                    : [...prev, brand]
            );
        }
    }, []);

    // ── 클라이언트 필터 ──
    const filtered = useMemo(() => {
        let result = issues;
        if (activeTab !== '전체') result = result.filter(i => i.status === activeTab);
        if (selectedBrands.length > 0) result = result.filter(i => selectedBrands.includes(i.brand));
        if (searchText.trim()) {
            const q = searchText.trim().toLowerCase();
            result = result.filter(i =>
                (i.reception_no || '').toLowerCase().includes(q) ||
                (i.reporter || '').toLowerCase().includes(q) ||
                (i.product_code || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [issues, activeTab, selectedBrands, searchText]);

    // ── 탭별 건수 ──
    const counts = useMemo(() => {
        const base = activeTab === '전체' ? issues : issues;
        // 탭 배지는 날짜·브랜드 필터 반영 (searchText 제외)
        const inDateAndBrand = issues.filter(i =>
            selectedBrands.length === 0 || selectedBrands.includes(i.brand)
        );
        const c = { '전체': inDateAndBrand.length };
        ['조치대기', '처리 중', '조치완료'].forEach(s => {
            c[s] = inDateAndBrand.filter(i => i.status === s).length;
        });
        return c;
    }, [issues, selectedBrands]);

    const handleReload = useCallback(async () => {
        await fetchIssues(dateFilterRef.current);
    }, [fetchIssues]);

    // ── 날짜 라벨 ──
    const dateLabel = (() => {
        const { start, end } = dateFilter;
        if (!start && !end) return '전체 기간';
        if (start === end) return formatDateLabel(start);
        return `${formatDateLabel(start)} ~ ${formatDateLabel(end)}`;
    })();

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* ── 헤더 ── */}
            <div className="bg-white shadow-sm sticky top-0 z-20">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button onClick={() => navigate('/mobile')} className="p-1.5 -ml-1 text-slate-500 active:text-slate-800">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h1 className="text-base font-black text-slate-800 flex-1">특이사항 현황</h1>
                    <button onClick={() => fetchIssues(dateFilter)} disabled={isLoading}
                        className="p-1.5 text-slate-400 hover:text-slate-600 active:text-slate-800 disabled:opacity-40">
                        <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* ── 상태 탭 ── */}
                <div className="flex border-b border-slate-200 overflow-x-auto">
                    {STATUS_TABS.map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`flex-shrink-0 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
                                activeTab === tab ? 'border-letusOrange text-letusOrange' : 'border-transparent text-slate-400'
                            }`}>
                            {tab}
                            {counts[tab] > 0 && (
                                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    activeTab === tab ? 'bg-letusOrange text-white' : 'bg-slate-100 text-slate-500'
                                }`}>
                                    {counts[tab]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── 필터 바 ── */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-2.5 sticky top-[97px] z-10">
                {/* 검색 */}
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                        placeholder="접수번호 · 등록자 · 품목코드"
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-letusBlue" />
                </div>

                {/* 브랜드 다중 선택 */}
                <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
                    {/* 전체 칩 */}
                    <button onClick={() => toggleBrand('전체')}
                        className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition-colors border ${
                            selectedBrands.length === 0
                                ? 'bg-letusBlue text-white border-letusBlue'
                                : 'bg-white text-slate-500 border-slate-200 active:bg-slate-100'
                        }`}>
                        전체
                    </button>
                    {BRANDS.map(b => (
                        <button key={b} onClick={() => toggleBrand(b)}
                            className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition-colors border ${
                                selectedBrands.includes(b)
                                    ? 'bg-letusBlue text-white border-letusBlue'
                                    : 'bg-white text-slate-500 border-slate-200 active:bg-slate-100'
                            }`}>
                            {b}
                        </button>
                    ))}
                </div>

                {/* 날짜 필터 */}
                <div className="flex gap-2 items-center">
                    <button onClick={() => setShowDateSheet(true)}
                        className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-left active:bg-slate-100 transition-colors">
                        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className={`text-xs font-bold ${dateFilter.start ? 'text-letusBlue' : 'text-slate-500'}`}>
                            {dateLabel}
                        </span>
                    </button>
                    {(dateFilter.start || dateFilter.end) && (
                        <button onClick={() => setDateFilter({ start: '', end: '' })}
                            className="text-[11px] font-bold text-slate-400 px-2.5 py-1.5 rounded-lg bg-slate-100 active:bg-slate-200 whitespace-nowrap">
                            전체 기간
                        </button>
                    )}
                </div>
            </div>

            {/* 결과 수 */}
            <div className="px-4 pt-3 pb-1">
                <p className="text-[11px] font-bold text-slate-400">
                    {isLoading ? '불러오는 중...' : `총 ${filtered.length}건`}
                    {selectedBrands.length > 0 && (
                        <span className="ml-2 text-letusBlue">
                            ({selectedBrands.join('·')} 필터 적용)
                        </span>
                    )}
                </p>
            </div>

            {/* ── 이슈 리스트 ── */}
            <div className="flex-1 px-4 pb-6 space-y-2">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="text-slate-400 text-sm font-medium animate-pulse">불러오는 중...</div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <span className="text-4xl">📭</span>
                        <p className="text-slate-400 text-sm font-medium">해당하는 특이사항이 없습니다</p>
                    </div>
                ) : (
                    filtered.map(issue => (
                        <IssueCard key={issue.id} issue={issue} onSelect={setSelectedIssue} />
                    ))
                )}
            </div>

            {/* ── 이슈 상세 시트 ── */}
            {selectedIssue && (
                <IssueDetailSheet
                    issue={selectedIssue}
                    onClose={() => setSelectedIssue(null)}
                    onReload={handleReload}
                    userProfile={userProfile}
                />
            )}

            {/* ── 날짜 선택 시트 ── */}
            {showDateSheet && (
                <DateFilterSheet
                    dateFilter={dateFilter}
                    onApply={(range) => { setDateFilter(range); setShowDateSheet(false); }}
                    onClose={() => setShowDateSheet(false)}
                />
            )}
        </div>
    );
};
