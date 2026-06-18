import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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

// 평탄화: [{ sectionIdx, itemIdx, label, sectionMeta }]
const FLAT_ITEMS = SECTIONS.flatMap((sec, si) =>
    sec.items.map((label, ii) => ({ sectionIdx: si, itemIdx: ii, label, sec }))
);
const TOTAL = FLAT_ITEMS.length;

const Spinner = () => (
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
);

// ── 시작 화면
const StartScreen = ({ onStart }) => {
    const [forkliftNo, setForkliftNo] = useState('');
    return (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
            <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center mb-5 text-3xl">🏗️</div>
            <h2 className="text-xl font-black text-slate-800 mb-1">일일 지게차 점검</h2>
            <p className="text-slate-400 text-sm mb-8 text-center">총 {TOTAL}개 항목을 순서대로 점검합니다.<br/>지게차 번호를 입력하고 시작해 주세요.</p>

            <div className="w-full max-w-sm space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1.5 block">지게차 번호 <span className="text-red-400">*</span></label>
                    <input
                        type="text"
                        value={forkliftNo}
                        onChange={e => setForkliftNo(e.target.value)}
                        placeholder="예: F-001"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue transition-all"
                    />
                </div>
                <button
                    onClick={() => forkliftNo.trim() && onStart(forkliftNo.trim())}
                    disabled={!forkliftNo.trim()}
                    className={`w-full py-4 rounded-xl font-black text-base transition-all shadow-md ${
                        forkliftNo.trim()
                            ? 'bg-letusBlue text-white active:scale-[0.98] shadow-blue-200'
                            : 'bg-slate-200 text-slate-400'
                    }`}
                >
                    점검 시작하기
                </button>
            </div>
        </div>
    );
};

// ── 점검 완료 화면
const DoneScreen = ({ forkliftNo, answers, notes, onReset }) => {
    const faultItems = FLAT_ITEMS.filter(item => answers[item.label] === false);
    const okCount = FLAT_ITEMS.filter(item => answers[item.label] === true).length;
    return (
        <div className="flex-1 overflow-y-auto px-4 pt-6 pb-28">
            {/* 결과 헤더 */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4 text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl ${
                    faultItems.length > 0 ? 'bg-red-100' : 'bg-green-100'
                }`}>
                    {faultItems.length > 0 ? '⚠️' : '✅'}
                </div>
                <p className="text-xs text-slate-400 font-bold mb-1">지게차 {forkliftNo}</p>
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
                        <p className="text-2xl font-black text-slate-700">{TOTAL}</p>
                        <p className="text-[11px] text-slate-400 font-bold">전체</p>
                    </div>
                </div>
            </div>

            {/* 불량 항목 목록 */}
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

            {/* 전체 결과 */}
            {SECTIONS.map((sec, si) => (
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
export const MobileForkliftDailyCheck = () => {
    const navigate = useNavigate();
    const [phase, setPhase] = useState('start'); // 'start' | 'check' | 'done'
    const [forkliftNo, setForkliftNo] = useState('');
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState({});   // { label: true/false }
    const [notes, setNotes] = useState({});        // { label: '메모' }
    const [pendingNote, setPendingNote] = useState('');
    const [pendingFault, setPendingFault] = useState(false); // 현재 항목 불량 선택 중

    const handleStart = (no) => {
        setForkliftNo(no);
        setPhase('check');
    };

    const advance = (label, isOk, note) => {
        setAnswers(prev => ({ ...prev, [label]: isOk }));
        if (note !== undefined) setNotes(prev => ({ ...prev, [label]: note }));
        setPendingFault(false);
        setPendingNote('');
        if (currentStep + 1 >= TOTAL) {
            setPhase('done');
        } else {
            setCurrentStep(s => s + 1);
        }
    };

    const handleOk = (label) => advance(label, true);

    const handleFaultSelect = () => {
        setPendingFault(true);
        setPendingNote('');
    };

    const handleFaultConfirm = (label) => advance(label, false, pendingNote);

    const progressPct = TOTAL > 0 ? Math.round((currentStep / TOTAL) * 100) : 0;

    // 섹션 구분 헤더가 필요한 인덱스 계산
    const sectionStartIdxs = new Set();
    let acc = 0;
    SECTIONS.forEach(sec => { sectionStartIdxs.add(acc); acc += sec.items.length; });

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 to-yellow-600" />
                <div className="px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => phase === 'start' ? navigate(-1) : phase === 'done' ? setPhase('start') : null}
                        className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1">
                        <h1 className="text-slate-800 font-black text-base leading-none">일일 지게차 점검</h1>
                        {phase === 'check' && (
                            <p className="text-slate-400 text-[11px] mt-0.5">{forkliftNo} · {currentStep + 1} / {TOTAL}</p>
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

                {/* 진행률 바 */}
                {phase === 'check' && (
                    <div className="h-1.5 bg-slate-100">
                        <div
                            className="h-full bg-letusBlue transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                )}
            </header>

            {/* 시작 화면 */}
            {phase === 'start' && <StartScreen onStart={handleStart} />}

            {/* 점검 화면 */}
            {phase === 'check' && (
                <div className="flex-1 overflow-y-auto px-4 pt-4 pb-10 space-y-2">
                    {FLAT_ITEMS.map((item, idx) => {
                        const isCompleted = idx < currentStep;
                        const isCurrent   = idx === currentStep;
                        const isPending   = idx > currentStep;
                        const val         = answers[item.label];
                        const showSection = sectionStartIdxs.has(idx);
                        const { sec } = item;

                        return (
                            <React.Fragment key={idx}>
                                {/* 섹션 구분 헤더 */}
                                {showSection && (
                                    <div className={`flex items-center gap-2 pt-${idx === 0 ? '0' : '3'} pb-1`}>
                                        <span className={`w-2 h-2 rounded-full ${sec.dot}`} />
                                        <p className={`text-xs font-black ${sec.color}`}>{sec.label}</p>
                                    </div>
                                )}

                                {/* 완료 항목 */}
                                {isCompleted && (
                                    <div className={`bg-white rounded-xl border flex items-center px-4 py-3 gap-3 ${
                                        val ? 'border-slate-100' : 'border-red-100 bg-red-50/30'
                                    }`}>
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
                                    </div>
                                )}

                                {/* 현재 항목 — 펼쳐진 아코디언 */}
                                {isCurrent && (
                                    <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${sec.border}`}>
                                        {/* 항목 헤더 */}
                                        <div className={`px-4 py-3 ${sec.bg} border-b ${sec.border}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-black ${sec.color} shrink-0`}>
                                                    {idx + 1}
                                                </span>
                                                <p className="text-sm font-bold text-slate-700 leading-snug">
                                                    {item.label}
                                                </p>
                                            </div>
                                        </div>

                                        {/* 정상 / 불량 선택 */}
                                        {!pendingFault && (
                                            <div className="p-4 flex gap-3">
                                                <button
                                                    onClick={() => handleOk(item.label)}
                                                    className="flex-1 py-4 rounded-xl bg-green-500 hover:bg-green-600 active:scale-[0.97] text-white font-black text-base transition-all shadow-sm"
                                                >
                                                    ✓ 정상
                                                </button>
                                                <button
                                                    onClick={handleFaultSelect}
                                                    className="flex-1 py-4 rounded-xl bg-red-50 border-2 border-red-200 active:scale-[0.97] text-red-500 font-black text-base transition-all"
                                                >
                                                    ✕ 불량
                                                </button>
                                            </div>
                                        )}

                                        {/* 불량 선택 후 — 메모 입력 */}
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

                                {/* 미완료 항목 */}
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

            {/* 완료 화면 */}
            {phase === 'done' && (
                <>
                    <DoneScreen
                        forkliftNo={forkliftNo}
                        answers={answers}
                        notes={notes}
                        onReset={() => {
                            setPhase('start');
                            setCurrentStep(0);
                            setAnswers({});
                            setNotes({});
                            setForkliftNo('');
                        }}
                    />
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/95 to-transparent pt-8">
                        <button
                            onClick={() => {
                                setPhase('start');
                                setCurrentStep(0);
                                setAnswers({});
                                setNotes({});
                                setForkliftNo('');
                                setPendingFault(false);
                                setPendingNote('');
                            }}
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
