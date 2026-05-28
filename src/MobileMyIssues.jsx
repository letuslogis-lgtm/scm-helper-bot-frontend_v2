import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient.js';
import { MobileDateRangeSheet } from './MobileUI.jsx';

const BRANDS = ['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소'];
const ISSUE_TYPE_GROUPS = [
    { group: '계획·수량', items: ['계획 없음/누락', '수량 부족 (계획>실물)', '과입고 (계획<실물)', '미입고'] },
    { group: '품질·포장',  items: ['파손·불량', '바코드 오류', '포장 불량·혼적', '표기·규격 미흡'] },
    { group: '반송·오입고', items: ['반송품 처리', '오반품·오입고'] },
    { group: '전산·시스템', items: ['전산-실물 불일치', 'WMS·전산 오류'] },
    { group: '기타',       items: ['기타 특이사항'] },
];

const STATUS_STYLE = {
    '조치대기': 'bg-yellow-50 text-yellow-600 border-yellow-200',
    '이관 중':  'bg-orange-50 text-orange-600 border-orange-200',
    '처리 중':  'bg-blue-50 text-blue-600 border-blue-200',
    '조치완료': 'bg-green-50 text-green-600 border-green-200',
};

const TABS = ['전체', '조치대기', '이관 중', '처리 중', '조치완료'];

const formatDate = (dt) => {
    const d = new Date(dt);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const today = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
const daysAgo = (n) => {
    const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().split('T')[0];
};


const IssueDetailSheet = ({ issue, onClose, onRespond, onEdit, userProfile }) => {
    if (!issue) return null;
    const canEdit = issue.status === '조치대기' && issue.reporter === userProfile?.name;
    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[80svh] overflow-y-auto overscroll-contain">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>
                <div className="px-5 pb-10 pt-3 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-slate-400 text-xs font-mono">{issue.reception_no}</p>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_STYLE[issue.status] || 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            {issue.status}
                        </span>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-full bg-letusBlue/10 text-letusBlue text-xs font-bold border border-letusBlue/20">
                            {issue.brand}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
                            {issue.issue_type}
                        </span>
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

                    <div className="h-px bg-slate-100" />

                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">접수 내용</p>
                        <p className="text-slate-700 text-sm leading-relaxed">
                            {issue.request_content || '(내용 없음)'}
                        </p>
                    </div>

                    {issue.status === '조치완료' && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div>
                                <p className="text-[11px] font-bold text-green-500 uppercase tracking-widest mb-1.5">조치 내용</p>
                                <p className="text-slate-700 text-sm leading-relaxed">
                                    {issue.action_content || '(내용 없음)'}
                                </p>
                                {(issue.final_handler || issue.resolved_at) && (
                                    <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-400">
                                        {issue.final_handler && (
                                            <span>담당자: <span className="font-bold text-slate-500">{issue.final_handler}</span></span>
                                        )}
                                        {issue.resolved_at && <span>{formatDate(issue.resolved_at)}</span>}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {issue.status === '이관 중' && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
                                <p className="text-orange-600 text-sm font-bold">담당 부서에 이관되었습니다</p>
                                <p className="text-orange-400 text-xs mt-0.5">담당 부서 확인 후 조치가 진행됩니다.</p>
                            </div>
                        </>
                    )}
                    {issue.status === '처리 중' && (
                        <>
                            <div className="h-px bg-slate-100" />
                            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                                <p className="text-blue-600 text-sm font-bold">담당자가 직접 처리 중입니다</p>
                                <p className="text-blue-400 text-xs mt-0.5">조치가 완료되면 알림을 보내드립니다.</p>
                            </div>
                        </>
                    )}

                    {issue.status === '조치완료' && issue.is_notified && (
                        <>
                            <div className="h-px bg-slate-100" />
                            {issue.worker_responded_at ? (
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <p className="text-[11px] font-bold text-blue-500 uppercase tracking-widest">작업자 조치 결과</p>
                                        <span className="text-[10px] text-slate-400">{formatDate(issue.worker_responded_at)}</span>
                                    </div>
                                    {issue.worker_response && (
                                        <p className="text-slate-700 text-sm leading-relaxed">{issue.worker_response}</p>
                                    )}
                                    {issue.worker_response_photos && (
                                        <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
                                            {issue.worker_response_photos.split(',').filter(Boolean).map((url, idx) => (
                                                <a key={idx} href={url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                                                    <img src={url} alt={`조치사진 ${idx + 1}`} className="w-20 h-20 rounded-xl object-cover border border-slate-200" />
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => onRespond?.(issue)}
                                    className="w-full py-3.5 rounded-xl bg-green-50 border border-green-200 text-green-700 font-bold text-sm active:bg-green-100 transition-colors flex items-center justify-center gap-2"
                                >
                                    <span>📤</span>
                                    조치 결과 전달하기
                                </button>
                            )}
                        </>
                    )}

                    {canEdit && (
                        <button
                            onClick={() => onEdit?.(issue)}
                            className="w-full py-3.5 rounded-xl bg-letusOrange text-white font-bold text-sm active:bg-orange-600 transition-colors flex items-center justify-center gap-2"
                        >
                            <span>✏️</span>
                            수정하기
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="w-full py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:bg-slate-200 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </>
    );
};

const WorkerResponseSheet = ({ issue, onClose, onSubmitted }) => {
    const [photos, setPhotos] = useState([]);
    const [responseText, setResponseText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileRef = useRef(null);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const compressImage = (file) =>
        new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = Math.min(1024 / img.width, 1024 / img.height, 1);
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
            };
            img.src = URL.createObjectURL(file);
        });

    const handlePhotoCapture = (e) => {
        const files = Array.from(e.target.files || []);
        const newPhotos = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
        setPhotos(prev => [...prev, ...newPhotos].slice(0, 3));
        e.target.value = '';
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            let photoUrls = '';
            if (photos.length > 0) {
                const urlList = await Promise.all(photos.map(async (p) => {
                    const base64 = await compressImage(p.file);
                    const byteStr = atob(base64);
                    const arr = new Uint8Array(byteStr.length);
                    for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
                    const blob = new Blob([arr], { type: 'image/jpeg' });
                    const fileName = `worker-response/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
                    const { error: uploadErr } = await supabase.storage
                        .from('issue_images')
                        .upload(fileName, blob, { contentType: 'image/jpeg' });
                    if (uploadErr) throw uploadErr;
                    return supabase.storage.from('issue_images').getPublicUrl(fileName).data.publicUrl;
                }));
                photoUrls = urlList.join(',');
            }
            const { error } = await supabase.from('logistics_issues').update({
                worker_response: responseText || null,
                worker_response_photos: photoUrls || null,
                worker_responded_at: new Date().toISOString(),
            }).eq('id', issue.id);
            if (error) throw error;
            onSubmitted();
        } catch (err) {
            alert('전달 중 오류가 발생했습니다: ' + (err.message || ''));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl shadow-2xl max-h-[85svh] overflow-y-auto overscroll-contain">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>
                <div className="px-5 pb-10 pt-3 space-y-4">
                    <div className="flex items-center gap-2">
                        <p className="text-slate-800 font-black text-base flex-1">조치 결과 전달</p>
                        <span className="text-xs font-mono text-slate-400">{issue.reception_no}</span>
                    </div>

                    <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                        <p className="text-[11px] font-bold text-green-600 mb-1">관리자 조치 내용</p>
                        <p className="text-sm text-green-800">{issue.action_content || '(내용 없음)'}</p>
                    </div>

                    <div>
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">조치 결과 메모</label>
                        <textarea
                            value={responseText}
                            onChange={e => setResponseText(e.target.value)}
                            placeholder="예) 반송 PLT 입구 우측 보관구역에 배치 완료"
                            rows={3}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue resize-none"
                        />
                    </div>

                    <div>
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">조치 결과 사진 (최대 3장)</label>
                        <div className="grid grid-cols-3 gap-2.5">
                            {photos.map((p, idx) => (
                                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200">
                                    <img src={p.preview} alt={`사진${idx + 1}`} className="w-full h-full object-cover" />
                                    <button
                                        onClick={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center"
                                    >✕</button>
                                </div>
                            ))}
                            {photos.length < 3 && (
                                <button
                                    onClick={() => fileRef.current?.click()}
                                    className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 text-slate-400 active:bg-slate-50 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span className="text-[10px] font-bold">사진 추가</span>
                                </button>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture} className="hidden" />
                    </div>

                    <div className="flex gap-2.5">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:bg-slate-200 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || (!responseText.trim() && photos.length === 0)}
                            className="flex-[2] py-3.5 rounded-xl bg-letusOrange text-white font-bold text-sm active:bg-orange-600 transition-colors disabled:bg-slate-200 disabled:text-slate-400"
                        >
                            {isSubmitting ? '전달 중...' : '전달하기'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

const EditIssueSheet = ({ issue, onClose, onSaved }) => {
    const [brand, setBrand] = useState(issue.brand || '');
    const [issueType, setIssueType] = useState(issue.issue_type || '');
    const [productCode, setProductCode] = useState(issue.product_code || '');
    const [requestContent, setRequestContent] = useState(issue.request_content || '');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const handleSave = async () => {
        if (!brand) return alert('브랜드를 선택해주세요.');
        if (!issueType) return alert('이슈 유형을 선택해주세요.');
        setIsSaving(true);
        try {
            const { error } = await supabase.from('logistics_issues').update({
                brand,
                issue_type: issueType,
                product_code: productCode.trim() || null,
                request_content: requestContent.trim() || null,
            }).eq('id', issue.id);
            if (error) throw error;
            onSaved();
        } catch (err) {
            alert('저장 중 오류가 발생했습니다: ' + (err.message || ''));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
            <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl shadow-2xl max-h-[90svh] overflow-y-auto overscroll-contain">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-200" />
                </div>
                <div className="px-5 pb-10 pt-3 space-y-5">
                    {/* 헤더 */}
                    <div className="flex items-center gap-2">
                        <p className="text-slate-800 font-black text-base flex-1">접수 내용 수정</p>
                        <span className="text-xs font-mono text-slate-400">{issue.reception_no}</span>
                    </div>

                    {/* 브랜드 선택 */}
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            브랜드 <span className="text-red-400">*</span>
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                            {BRANDS.map(b => (
                                <button
                                    key={b}
                                    onClick={() => setBrand(b)}
                                    className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                                        brand === b
                                            ? 'bg-letusBlue text-white border-letusBlue'
                                            : 'bg-slate-50 text-slate-600 border-slate-200 active:bg-slate-100'
                                    }`}
                                >
                                    {b}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 이슈 유형 선택 */}
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            이슈 유형 <span className="text-red-400">*</span>
                        </p>
                        {issueType && (
                            <p className="mb-2 text-xs text-letusOrange font-bold bg-orange-50 px-3 py-1.5 rounded-lg">
                                선택됨: {issueType}
                            </p>
                        )}
                        <div className="space-y-3">
                            {ISSUE_TYPE_GROUPS.map(({ group, items }) => (
                                <div key={group}>
                                    <p className="text-[10px] font-bold text-slate-400 mb-1.5 px-1">{group}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {items.map(label => (
                                            <button
                                                key={label}
                                                onClick={() => setIssueType(label)}
                                                className={`py-2.5 px-3 rounded-xl text-xs font-bold border text-left transition-colors ${
                                                    issueType === label
                                                        ? 'bg-letusOrange text-white border-letusOrange'
                                                        : 'bg-slate-50 text-slate-600 border-slate-200 active:bg-slate-100'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 품목코드 */}
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">품목코드 (선택)</p>
                        <input
                            type="text"
                            value={productCode}
                            onChange={e => setProductCode(e.target.value)}
                            placeholder="예) A1234567"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-mono focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue"
                        />
                    </div>

                    {/* 접수 내용 */}
                    <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">접수 내용 (선택)</p>
                        <textarea
                            value={requestContent}
                            onChange={e => setRequestContent(e.target.value)}
                            placeholder="특이사항을 상세히 입력해주세요"
                            rows={4}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-letusBlue focus:ring-1 focus:ring-letusBlue resize-none"
                        />
                    </div>

                    {/* 버튼 */}
                    <div className="flex gap-2.5">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm active:bg-slate-200 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving || !brand || !issueType}
                            className="flex-[2] py-3.5 rounded-xl bg-letusOrange text-white font-bold text-sm active:bg-orange-600 transition-colors disabled:bg-slate-200 disabled:text-slate-400"
                        >
                            {isSaving ? '저장 중...' : '저장하기'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export const MobileMyIssues = ({ userProfile, onNotificationsRead }) => {
    const navigate = useNavigate();
    const [issues, setIssues] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIssue, setSelectedIssue] = useState(null);
    const [activeTab, setActiveTab] = useState('전체');
    const [dateRange, setDateRange] = useState({ start: daysAgo(3), end: today() });
    const [showDateSheet, setShowDateSheet] = useState(false);
    const [respondingIssue, setRespondingIssue] = useState(null);
    const [editingIssue, setEditingIssue] = useState(null);

    const fetchIssues = async (range = dateRange) => {
        if (!userProfile?.name) return;
        setIsLoading(true);
        try {
            let reporterNames = [userProfile.name];
            if (userProfile.team) {
                const { data: teammates } = await supabase
                    .from('profiles')
                    .select('name')
                    .eq('team', userProfile.team)
                    .eq('status', '재직');
                if (teammates?.length) reporterNames = teammates.map(p => p.name);
            }

            let query = supabase
                .from('logistics_issues')
                .select('id, reception_no, brand, issue_type, status, created_at, request_content, product_code, reporter, action_content, final_handler, resolved_at, is_notified, worker_response, worker_response_photos, worker_responded_at')
                .in('reporter', reporterNames)
                .order('created_at', { ascending: false })
                .limit(200);

            if (range.start) query = query.gte('created_at', range.start);
            if (range.end)   query = query.lte('created_at', range.end + 'T23:59:59');

            const { data, error } = await query;
            if (error) throw error;
            setIssues(data || []);
        } catch (err) {
            console.error('이력 조회 실패:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (userProfile?.name) {
            fetchIssues();
            onNotificationsRead?.();
        }
    }, [userProfile]);

    const handleDateApply = (range) => {
        setDateRange(range);
        setShowDateSheet(false);
        fetchIssues(range);
    };

    const filteredIssues = activeTab === '전체'
        ? issues
        : issues.filter(i => i.status === activeTab);

    const countByStatus = (status) => issues.filter(i => i.status === status).length;
    const hasDateFilter = dateRange.start && dateRange.end;

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1">
                        <p className="text-slate-800 font-black text-base leading-none">입고 특이사항 조회</p>
                        {userProfile?.team && (
                            <p className="text-slate-400 text-xs mt-0.5">{userProfile.team}</p>
                        )}
                    </div>
                    {/* 날짜 필터 버튼 */}
                    <button
                        onClick={() => setShowDateSheet(true)}
                        className="relative p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                    >
                        <svg className={`w-5 h-5 ${hasDateFilter ? 'text-letusOrange' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {hasDateFilter && (
                            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-letusOrange" />
                        )}
                    </button>
                    {/* 새로고침 버튼 */}
                    <button
                        onClick={() => fetchIssues()}
                        className="p-2 rounded-lg bg-slate-100 active:bg-slate-200 transition-colors"
                    >
                        <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* 날짜 필터 표시 */}
                {hasDateFilter && (
                    <div className="px-4 pb-2 flex items-center gap-2">
                        <span className="text-xs text-letusOrange font-bold">
                            {dateRange.start} ~ {dateRange.end}
                        </span>
                        <button
                            onClick={() => handleDateApply({ start: '', end: '' })}
                            className="text-[11px] text-slate-400 font-bold underline"
                        >
                            해제
                        </button>
                    </div>
                )}

                {/* 상태 탭 */}
                <div className="flex border-t border-slate-100">
                    {TABS.map(tab => {
                        const count = tab === '전체' ? issues.length : countByStatus(tab);
                        const isActive = activeTab === tab;
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-2.5 text-xs font-bold transition-colors relative ${isActive ? 'text-letusOrange' : 'text-slate-400'}`}
                            >
                                {tab}
                                {count > 0 && (
                                    <span className={`ml-1 text-[10px] font-black ${isActive ? 'text-letusOrange' : 'text-slate-300'}`}>
                                        {count}
                                    </span>
                                )}
                                {isActive && (
                                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-letusOrange rounded-t-full" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </header>

            {/* 목록 */}
            <div className="flex-1 px-4 py-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-letusOrange rounded-full animate-spin" />
                        <p className="text-slate-500 text-sm font-bold mt-3">불러오는 중...</p>
                    </div>
                ) : filteredIssues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mb-4">
                            <span className="text-3xl">📋</span>
                        </div>
                        <p className="text-slate-700 font-bold text-base">
                            {activeTab === '전체' ? '등록 이력이 없습니다' : `${activeTab} 항목이 없습니다`}
                        </p>
                        {activeTab === '전체' && !hasDateFilter && (
                            <>
                                <p className="text-slate-400 text-sm mt-1">입고 특이사항을 등록하면<br />여기에 표시됩니다.</p>
                                <button
                                    onClick={() => navigate('/mobile/register')}
                                    className="mt-6 bg-letusOrange hover:bg-orange-500 active:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm shadow-sm"
                                >
                                    지금 등록하기
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {filteredIssues.map(issue => (
                            <button
                                key={issue.id}
                                onClick={() => setSelectedIssue(issue)}
                                className="w-full bg-white rounded-xl shadow-sm border border-slate-100 p-4 text-left active:scale-[0.99] transition-transform"
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex gap-1.5 flex-wrap">
                                        <span className="px-2 py-0.5 rounded-full bg-letusBlue/10 text-letusBlue text-xs font-bold border border-letusBlue/20">
                                            {issue.brand}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">
                                            {issue.issue_type}
                                        </span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border flex-shrink-0 ${STATUS_STYLE[issue.status] || 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                                        {issue.status}
                                    </span>
                                </div>
                                {issue.product_code && (
                                    <p className="text-xs text-slate-400 font-mono mb-1">{issue.product_code}</p>
                                )}
                                <p className="text-slate-700 text-sm leading-snug line-clamp-2">
                                    {issue.request_content || '(내용 없음)'}
                                </p>
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <p className="text-slate-300 text-[11px] font-mono">{issue.reception_no}</p>
                                        {issue.reporter !== userProfile?.name && (
                                            <span className="text-[11px] text-slate-400 font-bold">{issue.reporter}</span>
                                        )}
                                    </div>
                                    <p className="text-slate-400 text-xs">{formatDate(issue.created_at)}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {showDateSheet && (
                <MobileDateRangeSheet
                    value={dateRange}
                    onApply={handleDateApply}
                    onClose={() => setShowDateSheet(false)}
                />
            )}
            <IssueDetailSheet
                issue={selectedIssue}
                onClose={() => setSelectedIssue(null)}
                onRespond={(issue) => setRespondingIssue(issue)}
                onEdit={(issue) => setEditingIssue(issue)}
                userProfile={userProfile}
            />
            {respondingIssue && (
                <WorkerResponseSheet
                    issue={respondingIssue}
                    onClose={() => setRespondingIssue(null)}
                    onSubmitted={() => {
                        setRespondingIssue(null);
                        setSelectedIssue(null);
                        fetchIssues();
                    }}
                />
            )}
            {editingIssue && (
                <EditIssueSheet
                    issue={editingIssue}
                    onClose={() => setEditingIssue(null)}
                    onSaved={() => {
                        setEditingIssue(null);
                        setSelectedIssue(null);
                        fetchIssues();
                    }}
                />
            )}
        </div>
    );
};
