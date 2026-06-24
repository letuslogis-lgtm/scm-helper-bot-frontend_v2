import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';

const SECTIONS = [
    {
        label: '① 외관점검 (운행 전)',
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        dot: 'bg-blue-500',
        items: [
            '차량 외부 청소 상태 및 파손 여부 확인',
            '포크, 체인, 마스트에 휨/균열/파손 등 이상이 없는지 확인',
            '타이어 공기압, 마모 및 휠 볼트 풀림 상태 확인',
            '유압유(작동유) 누유 및 바닥 누유 흔적 확인',
            '경광등, 전조등 파손 등 외관 이상 유무 확인',
        ],
    },
    {
        label: '② 운행 전 점검',
        color: 'text-purple-600',
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        dot: 'bg-purple-500',
        items: [
            '좌식안전띠 및 안전모 등 장구류 착용 상태 확인',
            '탑승 전 계기판(배터리 잔량, 에러코드) 및 내부 보고사항 확인',
            '사내 안전수칙 숙지 (위험요소 전파, 제한속도 준수, 휴대폰 사용 금지)',
            '하역장치(포크 상/하, 틸트 전/후) 작동 이상 유무 확인',
            '경음기(클락션) 및 후진 경보기(부저) 정상 작동 확인',
            '조향핸들 및 전/후진 레버 작동 상태 확인',
            '주차브레이크 및 풋브레이크 정상 작동(밀림) 확인',
            '전조등 및 후미등 정상 점등 상태 확인',
        ],
    },
    {
        label: '③ 작업 완료 후 점검',
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
        items: [
            '지정된 주차공간 주차 및 사이드 브레이크 체결 여부',
            '포크 발 끝부분을 바닥면에 완전히 밀착시켰는지 확인',
            '배터리 충전 플러그 연결 상태 및 충전기 정상 작동 확인',
            '화재 예방: 충전 구역 주변 가연성 물질(박스, 비닐 등) 제거 상태',
        ],
    },
];

// ── 시작 화면 (NFC 3트랙: 자동스캔 / 수동버튼 / 텍스트 입력)
const StartScreen = ({ onStart, isLoading, error }) => {
    const [forkliftNo, setForkliftNo] = useState('');
    const [nfcStatus, setNfcStatus] = useState('checking');
    const [forkliftList, setForkliftList] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const abortRef = useRef(null);

    const doScan = async () => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const reader = new window.NDEFReader();
            await reader.scan({ signal: controller.signal });
            reader.onreading = (e) => {
                const rec = e.message.records[0];
                if (!rec) return;
                const text = new TextDecoder(rec.encoding || 'utf-8').decode(rec.data).trim();
                setForkliftNo(text);
                setNfcStatus('success');
                controller.abort();
            };
            reader.onerror = () => setNfcStatus('error');
        } catch (err) {
            if (err.name !== 'AbortError') setNfcStatus('error');
        }
    };

    useEffect(() => {
        if (!('NDEFReader' in window)) {
            setNfcStatus('unsupported');
            return;
        }
        setNfcStatus('auto-scanning');
        doScan();
        return () => abortRef.current?.abort();
    }, []);

    useEffect(() => {
        supabase.from('forklifts').select('no').order('no')
            .then(({ data }) => { if (data) setForkliftList(data.map(f => f.no)); });
    }, []);

    const filtered = forkliftNo.trim()
        ? forkliftList.filter(no => no.toLowerCase().includes(forkliftNo.toLowerCase()))
        : forkliftList;

    const renderHighlight = (text, query) => {
        if (!query) return text;
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return text;
        return <>{text.slice(0, idx)}<span className="text-blue-600 font-black">{text.slice(idx, idx + query.length)}</span>{text.slice(idx + query.length)}</>;
    };

    const handleRescan = () => {
        setForkliftNo('');
        setNfcStatus('scanning');
        doScan();
    };

    const isScanning = nfcStatus === 'auto-scanning' || nfcStatus === 'scanning';
    const nfcVisible = nfcStatus !== 'unsupported' && nfcStatus !== 'checking';

    return (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
            <div className="w-full max-w-sm space-y-5">
                {nfcVisible && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col items-center gap-4 shadow-sm">
                        <div className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 ${
                            nfcStatus === 'success' ? 'bg-green-50 border-2 border-green-300' :
                            nfcStatus === 'error'   ? 'bg-red-50 border-2 border-red-300' :
                                                      'bg-blue-50 border-2 border-blue-200'
                        }`}>
                            {isScanning && (
                                <>
                                    <span className="absolute inset-0 rounded-full border-2 border-blue-300 animate-ping opacity-40" />
                                    <span className="absolute rounded-full border border-blue-200 animate-ping opacity-20"
                                          style={{ inset: '-10px', animationDelay: '0.35s' }} />
                                </>
                            )}
                            <span className="text-4xl select-none">
                                {nfcStatus === 'success' ? '✅' : nfcStatus === 'error' ? '❌' : '📶'}
                            </span>
                        </div>

                        <div className="text-center">
                            {nfcStatus === 'auto-scanning' && (
                                <>
                                    <p className="font-bold text-slate-700 text-sm">NFC 자동 인식 대기 중</p>
                                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                        지게차에 부착된 NFC 스티커에<br/>기기를 가져다 대세요
                                    </p>
                                </>
                            )}
                            {nfcStatus === 'scanning' && (
                                <>
                                    <p className="font-bold text-slate-700 text-sm">스캔 중...</p>
                                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">기기를 스티커에 가까이 대주세요</p>
                                </>
                            )}
                            {nfcStatus === 'success' && (
                                <>
                                    <p className="font-bold text-green-600 text-sm">인식 완료!</p>
                                    <p className="text-xs text-slate-400 mt-1">지게차 번호가 자동 입력됐어요</p>
                                </>
                            )}
                            {nfcStatus === 'error' && (
                                <>
                                    <p className="font-bold text-red-500 text-sm">인식 실패</p>
                                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                        다시 시도하거나 아래에 직접 입력해 주세요
                                    </p>
                                </>
                            )}
                        </div>

                        {(nfcStatus === 'success' || nfcStatus === 'error') && (
                            <button
                                onClick={handleRescan}
                                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-bold active:bg-slate-200 transition-colors"
                            >
                                🔄 다시 스캔
                            </button>
                        )}
                    </div>
                )}

                {nfcVisible && (
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-slate-200" />
                        <span className="text-xs text-slate-400">또는 직접 입력</span>
                        <div className="flex-1 h-px bg-slate-200" />
                    </div>
                )}

                <div className="relative">
                    {nfcStatus === 'unsupported' && (
                        <p className="text-xs text-slate-400 mb-3 text-center">지게차 번호를 입력하고 시작해 주세요.</p>
                    )}
                    <label className="text-xs font-bold text-slate-500 mb-1.5 block">
                        지게차 번호 <span className="text-red-400">*</span>
                    </label>
                    <input
                        type="text"
                        value={forkliftNo}
                        onChange={e => { setForkliftNo(e.target.value); setShowDropdown(true); }}
                        onFocus={() => setShowDropdown(true)}
                        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                        placeholder="예: 양지-001"
                        className={`w-full rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none transition-all border ${
                            nfcStatus === 'success'
                                ? 'bg-green-50 border-green-300 focus:border-green-400 focus:ring-1 focus:ring-green-300'
                                : 'bg-slate-50 border-slate-200 focus:border-letusBlue focus:ring-1 focus:ring-letusBlue'
                        }`}
                    />
                    {showDropdown && filtered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-blue-300 rounded-2xl shadow-lg overflow-y-auto max-h-[240px]">
                            {filtered.map(no => (
                                <button
                                    key={no}
                                    onClick={() => { setForkliftNo(no); setShowDropdown(false); }}
                                    className="w-full flex items-center px-4 py-3.5 text-left border-b border-slate-100 last:border-0 active:bg-blue-50 transition-colors"
                                >
                                    <span className="text-sm font-bold text-slate-800">{renderHighlight(no, forkliftNo)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* 오류 메시지 */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <p className="text-sm text-red-600 font-bold">{error}</p>
                    </div>
                )}

                <button
                    onClick={() => forkliftNo.trim() && onStart(forkliftNo.trim())}
                    disabled={!forkliftNo.trim() || isLoading}
                    className={`w-full py-4 rounded-xl font-black text-base transition-all shadow-md ${
                        forkliftNo.trim() && !isLoading
                            ? 'bg-letusBlue text-white active:scale-[0.98] shadow-blue-200'
                            : 'bg-slate-200 text-slate-400'
                    }`}
                >
                    {isLoading ? '확인 중...' : '점검 시작하기'}
                </button>
            </div>
        </div>
    );
};

// ── 점검 완료 화면
const DoneScreen = ({ forkliftNo, checkType, checkSeq, answers, notes }) => {
    const activeSections = checkType === 'first' ? SECTIONS.slice(0, 2) : SECTIONS.slice(2);
    const activeItems = activeSections.flatMap(sec => sec.items.map(label => ({ label, sec })));
    const faultItems = activeItems.filter(item => answers[item.label] === false);
    const okCount = activeItems.filter(item => answers[item.label] === true).length;

    return (
        <div className="flex-1 overflow-y-auto px-4 pt-6 pb-28">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4 text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl ${
                    faultItems.length > 0 ? 'bg-red-100' : 'bg-green-100'
                }`}>
                    {faultItems.length > 0 ? '⚠️' : '✅'}
                </div>
                <p className="text-xs text-slate-400 font-bold mb-1">
                    {forkliftNo} · {checkSeq}차 점검 ({checkType === 'first' ? '운행 전' : '작업 완료 후'})
                </p>
                <h2 className="text-xl font-black text-slate-800 mb-3">
                    {faultItems.length > 0 ? '불량 항목 발생' : '전 항목 이상없음'}
                </h2>
                <div className="flex justify-center gap-4">
                    <div className="text-center">
                        <p className="text-2xl font-black text-green-600">{okCount}</p>
                        <p className="text-[11px] text-slate-400 font-bold">정상</p>
                    </div>
                    <div className="w-px bg-slate-100" />
                    <div className="text-center">
                        <p className="text-2xl font-black text-red-500">{faultItems.length}</p>
                        <p className="text-[11px] text-slate-400 font-bold">불량</p>
                    </div>
                    <div className="w-px bg-slate-100" />
                    <div className="text-center">
                        <p className="text-2xl font-black text-slate-700">{activeItems.length}</p>
                        <p className="text-[11px] text-slate-400 font-bold">전체</p>
                    </div>
                </div>
            </div>

            {faultItems.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden mb-4">
                    <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                        <p className="text-sm font-black text-red-600">불량 발생 항목</p>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {faultItems.map(item => (
                            <div key={item.label} className="px-4 py-3">
                                <p className="text-xs font-bold text-slate-400 mb-0.5">{item.sec.label}</p>
                                <p className="text-sm text-slate-700">{item.label}</p>
                                {notes[item.label] && (
                                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-1.5">
                                        메모: {notes[item.label]}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeSections.map((sec, si) => (
                <div key={si} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden mb-2">
                    <div className={`px-4 py-2.5 ${sec.bg} border-b ${sec.border}`}>
                        <p className={`text-xs font-black ${sec.color}`}>{sec.label}</p>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {sec.items.map(label => {
                            const val = answers[label];
                            return (
                                <div key={label} className="px-4 py-2.5 flex items-center justify-between">
                                    <p className="text-xs text-slate-600 flex-1 pr-3">{label}</p>
                                    <span className={`text-xs font-black shrink-0 ${val ? 'text-green-600' : 'text-red-500'}`}>
                                        {val ? '정상' : '불량'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

// ── 메인 컴포넌트
export const MobileForkliftDailyCheck = ({ userProfile }) => {
    const navigate = useNavigate();
    const [phase, setPhase] = useState('start');
    const [forkliftNo, setForkliftNo] = useState('');
    const [forkliftId, setForkliftId] = useState(null);       // forklifts.id (uuid)
    const [existingCheckId, setExistingCheckId] = useState(null); // 오늘 기존 레코드 id (N차용)
    const [checkType, setCheckType] = useState('first');       // 'first' | 'subsequent'
    const [checkSeq, setCheckSeq] = useState(1);
    const [maxStep, setMaxStep] = useState(0);
    const [activeStep, setActiveStep] = useState(0);
    const [answers, setAnswers] = useState({});
    const [notes, setNotes] = useState({});
    const [pendingNote, setPendingNote] = useState('');
    const [pendingFault, setPendingFault] = useState(false);
    const [startLoading, setStartLoading] = useState(false);
    const [startError, setStartError] = useState('');
    const [saveLoading, setSaveLoading] = useState(false);
    const [choiceLoading, setChoiceLoading] = useState(false);

    const activeSections = checkType === 'first' ? SECTIONS.slice(0, 2) : SECTIONS.slice(2);
    const activeItems = activeSections.flatMap((sec, si) =>
        sec.items.map((label, ii) => ({ sectionIdx: si, itemIdx: ii, label, sec }))
    );
    const activeTotal = activeItems.length;

    const toJsonb = (sectionItems) =>
        sectionItems.map(label => ({
            item: label,
            checked: answers[label] === true ? true : answers[label] === false ? false : null,
            memo: notes[label] || '',
        }));

    const handleStart = async (no) => {
        setStartLoading(true);
        setStartError('');
        try {
            // forklifts 테이블에서 no → id 조회
            const { data: forklift } = await supabase
                .from('forklifts')
                .select('id, no')
                .eq('no', no)
                .maybeSingle();

            if (!forklift) {
                setStartError('등록되지 않은 지게차 번호입니다. 관리자에게 문의하세요.');
                return;
            }

            // 오늘 점검 이력 확인
            const today = new Date().toISOString().split('T')[0];
            const { data: existing } = await supabase
                .from('forklift_daily_checks')
                .select('id, post_op')
                .eq('forklift_id', forklift.id)
                .eq('check_date', today)
                .maybeSingle();

            if (existing?.post_op) {
                setStartError('오늘 이 지게차의 점검이 이미 완료됐습니다.');
                return;
            }

            setForkliftId(forklift.id);
            setExistingCheckId(existing?.id || null);
            setForkliftNo(no);
            setMaxStep(0);
            setActiveStep(0);
            setAnswers({});
            setNotes({});
            setPendingFault(false);
            setPendingNote('');
            if (existing && !existing.post_op) {
                setPhase('choice');
            } else {
                setCheckType('first');
                setCheckSeq(1);
                setPhase('check');
            }
        } catch {
            setStartError('서버 오류가 발생했습니다. 다시 시도해 주세요.');
        } finally {
            setStartLoading(false);
        }
    };

    const handleCheckComplete = async () => {
        setSaveLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            if (checkType === 'first') {
                if (existingCheckId) {
                    await supabase.from('forklift_daily_checks').update({
                        pre_exterior: toJsonb(SECTIONS[0].items),
                        pre_op: toJsonb(SECTIONS[1].items),
                        updated_at: new Date().toISOString(),
                    }).eq('id', existingCheckId);
                } else {
                    await supabase.from('forklift_daily_checks').insert({
                        forklift_id: forkliftId,
                        check_date: today,
                        checker_name: userProfile?.name || '',
                        pre_exterior: toJsonb(SECTIONS[0].items),
                        pre_op: toJsonb(SECTIONS[1].items),
                    });
                }
            } else {
                await supabase.from('forklift_daily_checks').update({
                    post_op: toJsonb(SECTIONS[2].items),
                    updated_at: new Date().toISOString(),
                }).eq('id', existingCheckId);
            }

            setPhase('done');
        } catch {
            // 저장 실패해도 완료 화면은 보여줌 (재시도 안내는 추후)
            setPhase('done');
        } finally {
            setSaveLoading(false);
        }
    };

    const handleChoiceEdit = async () => {
        setChoiceLoading(true);
        try {
            const { data } = await supabase
                .from('forklift_daily_checks')
                .select('pre_exterior, pre_op')
                .eq('id', existingCheckId)
                .single();
            const loadedAnswers = {};
            const loadedNotes = {};
            [...(data?.pre_exterior || []), ...(data?.pre_op || [])].forEach(row => {
                if (row.checked !== null) loadedAnswers[row.item] = row.checked;
                if (row.memo) loadedNotes[row.item] = row.memo;
            });
            setAnswers(loadedAnswers);
            setNotes(loadedNotes);
        } catch {
            setAnswers({});
            setNotes({});
        } finally {
            setChoiceLoading(false);
        }
        setCheckType('first');
        setCheckSeq(1);
        setMaxStep(0);
        setActiveStep(0);
        setPhase('check');
    };

    const handleChoiceSubsequent = () => {
        setCheckType('subsequent');
        setCheckSeq(2);
        setMaxStep(0);
        setActiveStep(0);
        setPhase('check');
    };

    const advance = (label, isOk, note) => {
        setAnswers(prev => ({ ...prev, [label]: isOk }));
        if (note !== undefined) setNotes(prev => ({ ...prev, [label]: note }));
        setPendingFault(false);
        setPendingNote('');

        if (activeStep < maxStep) {
            setActiveStep(maxStep);
        } else {
            if (activeStep + 1 >= activeTotal) {
                handleCheckComplete();
            } else {
                setMaxStep(s => s + 1);
                setActiveStep(s => s + 1);
            }
        }
    };

    const handleOk = (label) => advance(label, true);
    const handleFaultSelect = () => { setPendingFault(true); setPendingNote(''); };
    const handleFaultConfirm = (label) => advance(label, false, pendingNote);

    const handleReEdit = (idx) => {
        setActiveStep(idx);
        setPendingFault(false);
        setPendingNote('');
    };

    const progressPct = activeTotal > 0 ? Math.round((maxStep / activeTotal) * 100) : 0;

    const sectionStartIdxs = new Set();
    let acc = 0;
    activeSections.forEach(sec => { sectionStartIdxs.add(acc); acc += sec.items.length; });

    const resetAll = () => {
        setPhase('start');
        setMaxStep(0);
        setActiveStep(0);
        setAnswers({});
        setNotes({});
        setForkliftNo('');
        setForkliftId(null);
        setExistingCheckId(null);
        setPendingFault(false);
        setPendingNote('');
        setStartError('');
    };

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 to-yellow-600" />
                <div className="px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (phase === 'start') navigate(-1);
                            else if (phase === 'choice') setPhase('start');
                            else if (phase === 'done') resetAll();
                        }}
                        className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1">
                        <h1 className="text-slate-800 font-black text-base leading-none">일일 지게차 점검</h1>
                        {phase === 'choice' && (
                            <p className="text-slate-400 text-[11px] mt-0.5">{forkliftNo} · 점검 유형 선택</p>
                        )}
                        {phase === 'check' && (
                            <p className="text-slate-400 text-[11px] mt-0.5">
                                {forkliftNo} · {checkSeq}차 점검 · {checkType === 'first' ? '운행 전' : '작업 완료 후'}
                            </p>
                        )}
                        {phase === 'done' && (
                            <p className="text-slate-400 text-[11px] mt-0.5">{forkliftNo} · 점검 완료</p>
                        )}
                    </div>
                    {phase === 'check' && (
                        <span className="text-xs font-black text-letusBlue bg-blue-50 px-2.5 py-1 rounded-full">
                            {progressPct}%
                        </span>
                    )}
                </div>

                {phase === 'check' && (
                    <div className="h-1.5 bg-slate-100">
                        <div className="h-full bg-letusBlue transition-all duration-300" style={{ width: `${progressPct}%` }} />
                    </div>
                )}
            </header>

            {phase === 'start' && (
                <StartScreen
                    onStart={handleStart}
                    isLoading={startLoading}
                    error={startError}
                />
            )}

            {phase === 'choice' && (
                <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
                    <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mb-4 text-3xl">📋</div>
                    <h2 className="text-xl font-black text-slate-800 mb-1">{forkliftNo}</h2>
                    <p className="text-slate-500 text-sm mb-1 text-center font-bold">오늘 1차 점검이 이미 완료됐습니다.</p>
                    <p className="text-slate-400 text-xs mb-8 text-center">어떤 작업을 진행하시겠습니까?</p>

                    <div className="w-full max-w-sm space-y-3">
                        <button
                            onClick={handleChoiceEdit}
                            disabled={choiceLoading}
                            className="w-full bg-white rounded-2xl border-2 border-blue-200 shadow-sm p-5 text-left active:bg-blue-50 transition-colors disabled:opacity-50"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl shrink-0">✏️</div>
                                <div>
                                    <p className="font-black text-slate-800 text-base">기존 점검 내용 수정</p>
                                    <p className="text-slate-400 text-xs mt-0.5">외관점검 및 운행 전 점검 내용 수정</p>
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={handleChoiceSubsequent}
                            disabled={choiceLoading}
                            className="w-full bg-white rounded-2xl border-2 border-amber-200 shadow-sm p-5 text-left active:bg-amber-50 transition-colors disabled:opacity-50"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-2xl shrink-0">🏁</div>
                                <div>
                                    <p className="font-black text-slate-800 text-base">운행 완료 점검</p>
                                    <p className="text-slate-400 text-xs mt-0.5">작업 완료 후 점검 항목 입력</p>
                                </div>
                            </div>
                        </button>
                    </div>

                    {choiceLoading && (
                        <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            데이터 불러오는 중...
                        </div>
                    )}
                </div>
            )}

            {phase === 'check' && (
                <div className="flex-1 overflow-y-auto px-4 pt-4 pb-10 space-y-2">
                    {saveLoading && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-center">
                            <p className="text-sm text-blue-600 font-bold">저장 중...</p>
                        </div>
                    )}
                    {activeItems.map((item, idx) => {
                        const isCompleted = idx < maxStep && idx !== activeStep;
                        const isCurrent   = idx === activeStep;
                        const isPending   = idx > maxStep;
                        const val         = answers[item.label];
                        const showSection = sectionStartIdxs.has(idx);
                        const { sec } = item;

                        return (
                            <React.Fragment key={idx}>
                                {showSection && (
                                    <div className={`flex items-center gap-2 ${idx === 0 ? '' : 'pt-3'} pb-1`}>
                                        <span className={`w-2 h-2 rounded-full ${sec.dot}`} />
                                        <p className={`text-xs font-black ${sec.color}`}>{sec.label}</p>
                                    </div>
                                )}

                                {isCompleted && (
                                    <button
                                        onClick={() => handleReEdit(idx)}
                                        className={`w-full bg-white rounded-xl border flex items-center px-4 py-3 gap-3 active:bg-slate-50 transition-colors text-left ${
                                            val ? 'border-slate-100' : 'border-red-100 bg-red-50/30'
                                        }`}
                                    >
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-sm ${
                                            val ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
                                        }`}>
                                            {val ? '✓' : '✕'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-slate-500 leading-snug">{item.label}</p>
                                            {!val && notes[item.label] && (
                                                <p className="text-[10px] text-amber-600 mt-0.5">메모: {notes[item.label]}</p>
                                            )}
                                        </div>
                                        <span className={`text-[11px] font-black shrink-0 ${val ? 'text-green-600' : 'text-red-500'}`}>
                                            {val ? '정상' : '불량'}
                                        </span>
                                    </button>
                                )}

                                {isCurrent && (
                                    <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${sec.border}`}>
                                        <div className={`px-4 py-3 ${sec.bg} border-b ${sec.border}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-black ${sec.color} shrink-0`}>{idx + 1}</span>
                                                <p className="text-sm font-bold text-slate-700 leading-snug">{item.label}</p>
                                            </div>
                                        </div>

                                        {!pendingFault && (
                                            <div className="p-3 flex gap-2">
                                                <button
                                                    onClick={() => handleOk(item.label)}
                                                    className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 active:scale-[0.97] text-white font-black text-sm transition-all shadow-sm"
                                                >
                                                    ✓ 정상
                                                </button>
                                                <button
                                                    onClick={handleFaultSelect}
                                                    className="flex-1 py-2.5 rounded-xl bg-red-50 border-2 border-red-200 active:scale-[0.97] text-red-500 font-black text-sm transition-all"
                                                >
                                                    ✕ 불량
                                                </button>
                                            </div>
                                        )}

                                        {pendingFault && (
                                            <div className="p-4 space-y-3">
                                                <div className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2">
                                                    <span className="text-red-500 font-black text-sm">✕ 불량 선택됨</span>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 mb-1.5 block">
                                                        메모 <span className="text-slate-300 font-normal">(선택)</span>
                                                    </label>
                                                    <textarea
                                                        value={pendingNote}
                                                        onChange={e => setPendingNote(e.target.value)}
                                                        placeholder="불량 내용을 간략히 기록하세요"
                                                        rows={2}
                                                        autoFocus
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-red-400 resize-none"
                                                    />
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setPendingFault(false)}
                                                        className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:bg-slate-200 transition-colors"
                                                    >
                                                        취소
                                                    </button>
                                                    <button
                                                        onClick={() => handleFaultConfirm(item.label)}
                                                        className="flex-[2] py-3 rounded-xl bg-red-500 text-white font-bold text-sm active:bg-red-600 transition-colors"
                                                    >
                                                        확인 후 다음으로
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isPending && (
                                    <div className="bg-white rounded-xl border border-slate-100 flex items-center px-4 py-3 gap-3 opacity-35">
                                        <div className="w-6 h-6 rounded-full border-2 border-slate-200 shrink-0 flex items-center justify-center">
                                            <span className="text-[10px] font-black text-slate-300">{idx + 1}</span>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-snug">{item.label}</p>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {phase === 'done' && (
                <>
                    <DoneScreen
                        forkliftNo={forkliftNo}
                        checkType={checkType}
                        checkSeq={checkSeq}
                        answers={answers}
                        notes={notes}
                    />
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/95 to-transparent pt-8">
                        <button
                            onClick={resetAll}
                            className="w-full py-4 rounded-xl font-black text-base bg-letusBlue text-white shadow-md active:scale-[0.98] transition-all shadow-blue-200"
                        >
                            + 새 점검 시작
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
