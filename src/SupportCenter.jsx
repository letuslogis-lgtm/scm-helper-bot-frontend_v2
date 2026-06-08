import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon, ImageSlider, formatDateTime } from './SharedUI.jsx';




// 🛠️ 고객지원 전용 모달들
const SuggestionModal = ({ item, onClose, onReload, userProfile }) => {
 const isAdmin = userProfile?.role?.includes('관리자');
 const isAuthor = userProfile?.name === item.user_name;
 const [answer, setAnswer] = useState(item.answer || '');
 const [status, setStatus] = useState(item.status || '대기중');
 const [isSaving, setIsSaving] = useState(false);
 const [isDeleting, setIsDeleting] = useState(false);

 const handleSave = async () => {
 setIsSaving(true);
 try {
 const { error } = await supabase.from('suggestions').update({ answer: answer, status: status }).eq('id', item.id);
 if (error) throw error;
 alert('답변 및 상태가 성공적으로 저장되었습니다.');
 onReload();
 onClose();
 } catch (error) {
 alert('저장 실패: ' + error.message);
 } finally {
 setIsSaving(false);
 }
 };

 const handleDelete = async () => {
 if (!window.confirm('이 건의사항을 정말 삭제하시겠습니까?\n삭제된 데이터는 영구적으로 복구할 수 없습니다.')) return;
 setIsDeleting(true);
 try {
 const { error } = await supabase.from('suggestions').delete().eq('id', item.id);
 if (error) throw error;
 alert('건의사항이 삭제되었습니다.');
 onReload();
 onClose();
 } catch (error) {
 alert('삭제 실패: ' + error.message);
 } finally {
 setIsDeleting(false);
 }
 };

 return (
 <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
 <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
 <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-2xl slide-up border border-gray-100 overflow-hidden flex flex-col">
 <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
 <h3 className="font-bold text-gray-900 flex items-center gap-2">
 <span className="text-[10px] font-black bg-gray-200 text-gray-600 px-2 py-0.5 rounded uppercase tracking-wider">{item.request_type}</span>
 건의사항 상세 내역
 </h3>
 <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><CloseIcon /></button>
 </div>
 <div className="p-6 bg-white space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
 <div>
 <div className="flex justify-between items-end mb-2">
 <h4 className="text-lg font-bold text-gray-800">{item.title}</h4>
 <span className="text-xs font-medium text-gray-400">{new Date(item.created_at).toLocaleString()} | 작성자: <span className="font-bold text-gray-600">{item.user_name}</span></span>
 </div>
 <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 min-h-[100px] whitespace-pre-wrap border border-gray-100 leading-relaxed">
 {item.content}
 </div>
 </div>
 <div className="border-t border-gray-100 pt-5">
 <div className="flex justify-between items-center mb-3">
 <h4 className="text-sm font-bold text-letusBlue flex items-center gap-1.5">
 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
 관리자 피드백
 </h4>
 {isAdmin ? (
 <div className="flex items-center gap-2">
 <span className="text-xs font-bold text-gray-500">진행 상태:</span>
 <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs font-bold text-gray-700 focus:border-letusBlue outline-none cursor-pointer">
 <option value="대기중">대기중</option>
 <option value="검토중">검토중</option>
 <option value="반영완료">반영완료</option>
 <option value="반려">반려</option>
 </select>
 </div>
 ) : (
 <span className={`text-[11px] font-bold px-2.5 py-1 rounded shadow-sm border ${status === '반영완료' ? 'bg-green-50 text-green-600 border-green-200' : status === '검토중' ? 'bg-blue-50 text-blue-600 border-blue-200' : status === '반려' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{status}</span>
 )}
 </div>
 {isAdmin ? (
 <textarea
 value={answer}
 onChange={(e) => setAnswer(e.target.value)}
 placeholder="건의사항에 대한 답변이나 조치 결과를 작성해 주세요."
 className="w-full border border-blue-200 bg-blue-50/30 rounded-lg p-4 text-sm text-gray-800 focus:ring-2 focus:ring-letusBlue focus:border-letusBlue outline-none resize-none h-32 transition-shadow"
 ></textarea>
 ) : (
 <div className="bg-blue-50/50 p-4 rounded-lg text-sm text-gray-800 min-h-[80px] whitespace-pre-wrap border border-blue-100 leading-relaxed">
 {answer ? answer : <span className="text-gray-400 italic">아직 등록된 답변이 없습니다. 담당자가 내용을 꼼꼼히 검토 중입니다.</span>}
 </div>
 )}
 </div>
 </div>
 <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
 <div>
 {(isAdmin || isAuthor) && (
 <button onClick={handleDelete} disabled={isDeleting || isSaving} className={`px-4 py-2 border border-red-200 text-red-500 bg-red-50 text-sm font-bold rounded hover:bg-red-100 transition-colors shadow-sm flex items-center gap-1.5 ${isDeleting ? 'opacity-70 cursor-not-allowed' : ''}`}>
 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
 {isDeleting ? '삭제 중...' : '삭제'}
 </button>
 )}
 </div>
 <div className="flex gap-2 items-center">
 <button onClick={onClose} disabled={isSaving || isDeleting} className="px-5 py-2 border border-gray-300 text-gray-600 text-sm font-bold rounded hover:bg-gray-100 transition-colors bg-white">
 {isAdmin ? '취소' : '닫기'}
 </button>
 {isAdmin && (
 <button onClick={handleSave} disabled={isSaving || isDeleting} className={`px-6 py-2 bg-letusBlue text-white text-sm font-bold rounded shadow hover:bg-blue-600 transition-colors flex items-center gap-2 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
 {isSaving ? '저장 중...' : '답변 저장'}
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};


const FaqAddModal = ({ onClose, onReload }) => {
 const [category, setCategory] = useState('시스템 설정');
 const [question, setQuestion] = useState('');
 const [answer, setAnswer] = useState('');
 const [isSaving, setIsSaving] = useState(false);

 const handleSave = async (e) => {
 e.preventDefault();
 if (!question.trim() || !answer.trim()) {
 alert('질문과 답변을 모두 입력해 주세요.');
 return;
 }

 setIsSaving(true);
 try {
 const { error } = await supabase.from('faqs').insert([{ category, question, answer }]);
 if (error) throw error;
 alert('새로운 FAQ가 성공적으로 등록되었습니다.');
 onReload();
 onClose();
 } catch (error) {
 alert('등록 실패: ' + error.message);
 } finally {
 setIsSaving(false);
 }
 };

 return (
 <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
 <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
 <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-lg slide-up border border-gray-100 overflow-hidden flex flex-col">
 <div className="p-5 border-b border-gray-100 bg-white flex justify-between items-center">
 <h3 className="font-bold text-gray-900 flex items-center gap-2">
 <span className="w-1.5 h-3.5 bg-letusOrange rounded-full"></span>
 새 FAQ (자주 묻는 질문) 등록
 </h3>
 <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><CloseIcon /></button>
 </div>
 <div className="p-6 bg-slate-50">
 <form id="faqForm" onSubmit={handleSave} className="space-y-5">
 <div className="flex flex-col gap-1.5">
 <label className="text-xs font-bold text-gray-700">카테고리 분류 <span className="text-letusOrange">*</span></label>
 <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-gray-300 rounded-[4px] px-3.5 py-2.5 text-sm focus:outline-none focus:border-letusBlue bg-white text-gray-800 cursor-pointer">
 <option>시스템 설정</option>
 <option>계정/권한</option>
 <option>입고 관리</option>
 <option>특이사항 처리</option>
 <option>기타</option>
 </select>
 </div>
 <div className="flex flex-col gap-1.5">
 <label className="text-xs font-bold text-gray-700">질문 (Question) <span className="text-letusOrange">*</span></label>
 <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} required placeholder="예) 특이사항 알림이 오지 않습니다." className="border border-gray-300 rounded-[4px] px-3.5 py-2.5 text-sm focus:outline-none focus:border-letusBlue bg-white text-gray-800" />
 </div>
 <div className="flex flex-col gap-1.5">
 <label className="text-xs font-bold text-gray-700">답변 (Answer) <span className="text-letusOrange">*</span></label>
 <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} required rows={5} placeholder="사용자에게 보여질 상세한 해결 방법을 적어주세요." className="border border-gray-300 rounded-[4px] px-3.5 py-3 text-sm focus:outline-none focus:border-letusBlue bg-white text-gray-800 resize-none leading-relaxed"></textarea>
 </div>
 </form>
 </div>
 <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-2 shrink-0">
 <button type="button" onClick={onClose} disabled={isSaving} className="px-5 py-2 border border-gray-300 text-gray-600 text-sm font-bold rounded-[3px] hover:bg-gray-50 transition-colors shadow-sm">
 취소
 </button>
 <button onClick={handleSave} disabled={isSaving} className={`px-6 py-2 bg-letusOrange text-white text-sm font-bold rounded-[3px] shadow-sm hover:bg-orange-600 transition-colors flex items-center gap-2 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
 {isSaving ? '등록 중...' : 'FAQ 등록'}
 </button>
 </div>
 </div>
 </div>
 );
};

const autoResize = (el) => {
 if (!el) return;
 el.style.height = 'auto';
 el.style.height = el.scrollHeight + 'px';
};

// levenshtein 함수는 find-similar-codes Edge Function으로 이관
function levenshtein_unused(a, b) {
 const m = a.length, n = b.length;
 const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
 for (let j = 0; j <= n; j++) dp[0][j] = j;
 for (let i = 1; i <= m; i++)
  for (let j = 1; j <= n; j++)
   dp[i][j] = a[i - 1] === b[j - 1]
    ? dp[i - 1][j - 1]
    : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
 return dp[m][n];
}

const RequestModal = ({ row, onClose, onReload, userProfile, onDirectHandle }) => {
 const [relayText, setRelayText] = useState(row.relay_content || '');
 const [isSaving, setIsSaving] = useState(false);
 const relayRef = React.useRef(null);
 React.useEffect(() => { autoResize(relayRef.current); }, []);

 // 바코드 오류 유사 코드 추천
 const [codeSuggestions, setCodeSuggestions] = useState(null); // null=미조회, []=결과없음
 const [suggestionsLoading, setSuggestionsLoading] = useState(false);
 const [confirmedCode, setConfirmedCode] = useState(null);

 // 품목코드 직접 입력 (product_code가 없는 경우)
 const [showCodeInput, setShowCodeInput] = useState(false);
 const [manualCode, setManualCode] = useState('');
 const [isSavingCode, setIsSavingCode] = useState(false);
 const [savedCode, setSavedCode] = useState(null);

 const handleFindSimilar = () => {
  if (!row.product_code || !row.brand) return;
  setSuggestionsLoading(true);
  supabase.functions.invoke('find-similar-codes', {
   body: { scanned_code: row.product_code, brand: row.brand },
  }).then(({ data, error }) => {
   if (error) { console.error('[유사코드] 오류:', error.message); setCodeSuggestions([]); return; }
   setCodeSuggestions(data?.candidates ?? []);
  }).finally(() => setSuggestionsLoading(false));
 };

 // 품목코드 직접 등록 (product_code가 null인 경우)
 const handleSaveCode = async () => {
  const code = manualCode.trim().toUpperCase();
  if (!code) return alert('품목코드를 입력해주세요.');
  setIsSavingCode(true);
  try {
   const { error } = await supabase.from('logistics_issues')
    .update({ product_code: code })
    .eq('id', row.id);
   if (error) throw error;
   setSavedCode(code);
   setShowCodeInput(false);
   await onReload();
  } catch (e) {
   alert('저장 중 오류가 발생했습니다.');
  } finally {
   setIsSavingCode(false);
  }
 };

 // 유사 코드 선택 → 이관 메시지에 내용 자동 입력 (품목코드 직접 수정 X)
 const handleSelectCode = (s) => {
  const fullCode = s.item_color ? `${s.item_code}-${s.item_color}` : s.item_code;
  const planInfo = s.has_plan
   ? `입고계획 ${s.plan_date}${s.planned_qty ? ` / ${s.planned_qty.toLocaleString()}개` : ''}${s.plan_vendor ? ` / ${s.plan_vendor}` : ''}`
   : '입고계획 없음';
  const msg = `[바코드 오류] AI 인식 코드: ${row.product_code} → 유사 코드: ${fullCode} (${planInfo})`;
  setRelayText(prev => prev ? `${prev}\n${msg}` : msg);
  autoResize(relayRef.current);
 };
 const isAdmin = userProfile?.role !== '사용자';
 const isWaiting = row.status === '조치대기';
 const isRelaying = row.status === '이관 중';
 const isProcessing = row.status === '처리 중';
 const isDone = row.status === '조치완료';
 const hasPurchaseResponse = !!(row.purchase_response);

 const handleTransfer = async () => {
 if (!row.vendor) return alert('공급업체 정보가 없어 이관할 수 없습니다.\n품목코드를 확인하거나 담당자에게 문의하세요.');
 if (!relayText.trim()) return alert('이관 메시지를 입력해주세요.');
 setIsSaving(true);
 try {
 const { error } = await supabase.from('logistics_issues').update({
 relay_content: relayText,
 status: '이관 중',
 }).eq('id', row.id);
 if (error) throw error;
 await onReload(); onClose();
 } catch (e) { alert(`오류: ${e.message}`); } finally { setIsSaving(false); }
 };

 const handleDirectAction = async () => {
 setIsSaving(true);
 try {
 const { error } = await supabase.from('logistics_issues').update({
 status: '처리 중',
 }).eq('id', row.id);
 if (error) throw error;
 await onReload();
 onDirectHandle?.({ ...row, status: '처리 중' });
 } catch (e) { alert(`오류: ${e.message}`); } finally { setIsSaving(false); }
 };


 const stepStyle = (active, done) =>
 active ? 'text-orange-500 font-black' : done ? 'text-green-500 font-bold' : 'text-gray-300';

 return (
 <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
 <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
 <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-4xl slide-up border border-gray-100 overflow-hidden flex flex-col">
 <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
 <div>
 <h3 className="font-bold text-gray-900">
   현장 특이사항 접수/이관 ({row.reception_no}
   {row.product_code && (
     <span className="ml-1 text-gray-400 font-normal text-sm">/ {row.product_code}</span>
   )}
   )
 </h3>
 <div className="flex items-center gap-1 mt-1 text-[11px]">
 <span className={stepStyle(isWaiting, !isWaiting)}>① 접수</span>
 <span className="text-gray-300">›</span>
 <span className={stepStyle(isRelaying, hasPurchaseResponse || isDone)}>② 이관</span>
 <span className="text-gray-300">›</span>
 <span className={stepStyle(hasPurchaseResponse && !isDone, isDone)}>③ 구매/생산 확인</span>
 <span className="text-gray-300">›</span>
 <span className={stepStyle(isProcessing, isDone)}>④ 담당자 조치</span>
 <span className="text-gray-300">›</span>
 <span className={stepStyle(false, row.is_notified)}>⑤ 피드백</span>
 </div>
 </div>
 <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><CloseIcon /></button>
 </div>

 <div className="p-5 bg-white overflow-y-auto max-h-[70vh]">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
 <div className="flex flex-col">
 <h4 className="text-sm font-bold text-gray-700 mb-2">📸 현장 사진</h4>
 <ImageSlider imageUrlString={row.image_url} imageUrlHqString={row.image_url_hq} />
 </div>

 <div className="flex flex-col space-y-4">
 {/* 현장 원본 접수 내용 — 관리자(조치대기)만 참고용으로 표시 */}
 {isAdmin && isWaiting && (
 <div className="flex flex-col">
 <h4 className="text-sm font-bold text-gray-700 mb-2">📋 현장 원본 접수 내용 (참고용)</h4>
 <div className="w-full border border-gray-100 bg-gray-50 rounded-lg p-3 text-sm text-gray-400 min-h-[100px]">
 {row.request_content || '(내용 없음)'}
 </div>
 </div>
 )}

 {/* 바코드 오류 — 유사 코드 추천 */}
 {row.issue_type === '바코드 오류' && (
  <div className="flex flex-col">
   <div className="flex items-center justify-between mb-2">
    <h4 className="text-sm font-bold text-gray-700">🔍 유사 코드 추천</h4>
    <button
     onClick={handleFindSimilar}
     disabled={suggestionsLoading}
     className="text-xs font-bold px-2.5 py-1 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
    >
     {suggestionsLoading ? '조회 중...' : '📋 입고계획 조회'}
    </button>
   </div>
   <div className="text-xs text-gray-500 mb-2">
    스캔된 코드: <span className="font-mono font-bold text-gray-800">{row.product_code || '(없음)'}</span>
    {confirmedCode && <span className="ml-2 text-green-600 font-bold">→ {confirmedCode} ✅ 수정됨</span>}
   </div>
   {suggestionsLoading ? (
    <div className="text-xs text-gray-400 py-1 animate-pulse">유사 코드 검색 중...</div>
   ) : codeSuggestions === null ? (
    <div className="text-xs text-gray-300 py-1">조회 버튼을 눌러 입고계획 포함 유사 코드를 확인하세요.</div>
   ) : codeSuggestions.length > 0 ? (
    <div className="flex flex-col gap-1">
     {codeSuggestions.slice(0, 3).map((s) => {
      const fullCode = s.item_color ? `${s.item_code}-${s.item_color}` : s.item_code;
      const vendor = s.plan_vendor || s.vendor || null;
      const tooltip = [
       s.item_name,
       vendor && `공급업체: ${vendor}`,
       s.has_plan && `📅 ${s.plan_date}`,
       s.has_plan && s.planned_qty && `📦 ${s.planned_qty.toLocaleString()}개`,
      ].filter(Boolean).join(' · ');
      return (
       <button
        key={s.item_code}
        onClick={() => handleSelectCode(s)}
        title={tooltip}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors text-left w-full ${s.has_plan ? 'bg-green-50 border-green-300 hover:bg-green-100' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
       >
        {s.has_plan && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500 text-white shrink-0">입고계획 ✓</span>}
        <span className="font-mono font-bold text-gray-800 shrink-0">{fullCode}</span>
        {vendor && <span className="text-xs text-gray-500 truncate min-w-0">{vendor}</span>}
        <span className="text-xs text-amber-600 font-bold shrink-0 bg-amber-100 px-1.5 py-0.5 rounded-full ml-auto">{s.dist}자</span>
       </button>
      );
     })}
    </div>
   ) : (
    <div className="text-xs text-gray-400 py-1">유사한 코드를 찾지 못했습니다.</div>
   )}
  </div>
 )}

 {/* 품목코드 미인식 — 관리자 직접 입력 */}
 {!row.product_code && isAdmin && isWaiting && (
  <div className="flex flex-col">
   <div className="flex items-center justify-between mb-2">
    <h4 className="text-sm font-bold text-red-600">⚠️ 품목코드 미인식</h4>
    {!showCodeInput && !savedCode && (
     <button
      onClick={() => setShowCodeInput(true)}
      className="text-xs font-bold px-2.5 py-1 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
     >
      ✏️ 직접 입력
     </button>
    )}
   </div>
   {savedCode ? (
    <div className="text-xs text-green-600 font-bold py-1 bg-green-50 border border-green-200 rounded-lg px-3">
     ✅ 품목코드 등록 완료: <span className="font-mono">{savedCode}</span>
    </div>
   ) : showCodeInput ? (
    <div className="flex gap-2 items-center">
     <input
      type="text"
      value={manualCode}
      onChange={e => setManualCode(e.target.value.toUpperCase())}
      placeholder="품목코드 입력 (예: LFXX2003004-WW)"
      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono text-gray-800 outline-none focus:ring-2 focus:ring-letusBlue focus:border-letusBlue"
     />
     <button
      onClick={handleSaveCode}
      disabled={isSavingCode || !manualCode.trim()}
      className="px-3 py-1.5 bg-letusBlue text-white text-xs font-bold rounded hover:bg-blue-600 disabled:opacity-50 transition-colors shrink-0"
     >
      {isSavingCode ? '저장 중...' : '등록'}
     </button>
     <button
      onClick={() => { setShowCodeInput(false); setManualCode(''); }}
      className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs font-bold rounded hover:bg-gray-100 transition-colors shrink-0"
     >
      취소
     </button>
    </div>
   ) : (
    <div className="text-xs text-gray-400 py-1">
     AI가 품목코드를 인식하지 못했습니다. 직접 입력 버튼으로 코드를 등록할 수 있습니다.
    </div>
   )}
  </div>
 )}

 {/* 이관 메시지 — 관리자 입력 / 이관팀에 표시 */}
 <div className="flex flex-col">
 <h4 className="text-sm font-bold text-gray-700 mb-2">① 이관 메시지</h4>
 {isWaiting ? (
 <textarea
 ref={relayRef}
 value={relayText}
 onChange={e => { setRelayText(e.target.value); autoResize(e.target); }}
 placeholder="구매/생산팀에 전달할 요청 내용을 정리해서 입력해주세요."
 disabled={!isAdmin}
 className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-800 outline-none overflow-hidden focus:ring-2 focus:ring-letusBlue focus:border-letusBlue min-h-[80px]"
 />
 ) : (
 <div className="w-full border border-gray-200 bg-gray-100 rounded-lg p-3 text-sm text-gray-600 min-h-[60px]">
 {row.relay_content || '(내용 없음)'}
 </div>
 )}
 </div>

 {row.purchase_response && (
 <div className="flex flex-col">
 <h4 className="text-sm font-bold text-purple-600 mb-2">③ 유관부서 회신 내용</h4>
 <div className="w-full border border-purple-100 bg-purple-50 rounded-lg p-3 text-sm text-purple-800 min-h-[60px]">
 {row.purchase_response}
 </div>
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-2">
 <div>
 {isDone && <span className="text-gray-500 font-bold text-sm">✅ 조치가 완료되어 수정할 수 없습니다.</span>}
 </div>
 <div className="flex gap-2">
 <button onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 text-sm font-bold rounded hover:bg-gray-100 transition-colors bg-white">
 {isDone ? '닫기' : '취소'}
 </button>
 {isWaiting && isAdmin && (
 <>
 <button onClick={handleDirectAction} disabled={isSaving}
 className={`px-6 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded shadow transition-colors ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
 {isSaving ? '처리 중...' : '직접 조치'}
 </button>
 <button onClick={handleTransfer} disabled={isSaving}
 className={`px-6 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-bold rounded shadow transition-colors ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
 {isSaving ? '처리 중...' : '② 이관'}
 </button>
 </>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};

const HANDLE_ISSUE_TYPES = [
    '계획 없음/누락', '수량 부족 (계획>실물)', '과입고 (계획<실물)', '미입고',
    '파손·불량', '바코드 오류', '포장 불량·혼적', '표기·규격 미흡',
    '반송품 처리', '오반품·오입고',
    '전산-실물 불일치', 'WMS·전산 오류', '기타 특이사항',
];

const HandleModal = ({ row, onClose, onReload, userProfile }) => {
 const [actionText, setActionText] = useState(row.action_content || '');
 const [issueType, setIssueType] = useState(row.issue_type || '');
 const [isSaving, setIsSaving] = useState(false);
 const isDone = row.status === '조치완료';
 const actionRef = React.useRef(null);
 React.useEffect(() => { autoResize(actionRef.current); }, []);

 // 추가 확인 요청
 const [additionalReqText, setAdditionalReqText] = useState('');
 const [showReqInput, setShowReqInput] = useState(false);
 const [isSendingReq, setIsSendingReq] = useState(false);

 // 아코디언: 상태값 기준 기본 열림 결정
 const hasRelay = !!row.relay_content;
 const hasReply = !!row.purchase_response;
 const [openS1, setOpenS1] = useState(!hasRelay);                        // ① 접수내용: relay 없을 때만 기본 열림
 const [openS2, setOpenS2] = useState(hasRelay && !hasReply);             // ② 이관메시지: relay 있고 회신 없을 때
 const [openS3, setOpenS3] = useState(hasReply);                          // ③ 유관부서 회신: 회신 있을 때

 const AccordionSection = ({ label, isOpen, onToggle, labelColor = 'text-gray-700', children }) => (
  <div className="border border-gray-200 rounded-lg overflow-hidden">
   <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
    <h4 className={`text-sm font-bold ${labelColor}`}>{label}</h4>
    <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
   </button>
   {isOpen && <div className="p-3">{children}</div>}
  </div>
 );

 const handleSendAdditionalRequest = async () => {
  if (!additionalReqText.trim()) return alert('요청 내용을 입력해주세요.');
  setIsSendingReq(true);
  try {
   const { error } = await supabase.from('logistics_issues').update({
    additional_request: additionalReqText.trim(),
    additional_request_at: new Date().toISOString(),
    additional_feedback: null,
    additional_feedback_at: null,
   }).eq('id', row.id);
   if (error) throw error;
   // 작업자 푸시 알림 (실패해도 무시)
   supabase.functions.invoke('send-push-notification', {
    body: {
     mode: 'direct',
     user_name: row.reporter,
     title: '📋 추가 확인 요청',
     body: additionalReqText.trim(),
     url: '/mobile/my-issues',
    },
   }).catch(() => {});
   setShowReqInput(false);
   setAdditionalReqText('');
   await onReload();
  } catch (e) {
   alert('전송 중 오류가 발생했습니다.');
  } finally {
   setIsSendingReq(false);
  }
 };

 const handleComplete = async () => {
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
 }).eq('id', row.id);
 if (error) throw error;
 // 작업자 푸시 알림 (실패해도 무시)
 supabase.functions.invoke('send-push-notification', {
  body: {
   mode: 'direct',
   user_name: row.reporter,
   title: '✅ 이슈가 조치완료 되었습니다',
   body: `${row.reception_no} 건이 처리되었습니다. 조치 내용을 확인해주세요.`,
   url: '/mobile/my-issues',
  },
 }).catch(() => {});
 await onReload(); onClose();
 } catch (e) {
 console.error('Update error:', e);
 alert('상태 업데이트 중 오류가 발생했습니다.');
 } finally { setIsSaving(false); }
 };

 return (
 <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
 <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
 <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-4xl slide-up border border-gray-100 overflow-hidden flex flex-col">
 <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
 <h3 className="font-bold text-gray-900">{row.status === '이관부서 확인' ? '회신 확인 및 조치 등록' : '현장 특이사항 조치 등록'} ({row.reception_no})</h3>
 <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><CloseIcon /></button>
 </div>

 <div className="p-5 bg-white overflow-y-auto max-h-[80vh]">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
 <div className="flex flex-col">
 <h4 className="text-sm font-bold text-gray-700 mb-2">📸 현장 사진</h4>
 <ImageSlider imageUrlString={row.image_url} imageUrlHqString={row.image_url_hq} />
 </div>

 <div className="flex flex-col space-y-3">
  {/* ① 접수 내용 — 아코디언 */}
  <AccordionSection label="① 접수 내용" isOpen={openS1} onToggle={() => setOpenS1(v => !v)}>
   <p className="text-sm text-gray-600">{row.request_content || '(내용 없음)'}</p>
  </AccordionSection>

  {/* ② 이관 메시지 — relay 있을 때만 표시 */}
  {hasRelay && (
   <AccordionSection label="② 이관 메시지" isOpen={openS2} onToggle={() => setOpenS2(v => !v)}>
    <p className="text-sm text-blue-800">{row.relay_content}</p>
   </AccordionSection>
  )}

  {/* ③ 유관부서 회신 — 회신 있을 때만 표시 */}
  {hasReply && (
   <AccordionSection label="③ 유관부서 회신 내용" isOpen={openS3} onToggle={() => setOpenS3(v => !v)} labelColor="text-purple-600">
    <p className="text-sm text-purple-800">{row.purchase_response}</p>
   </AccordionSection>
  )}

  {/* 추가 확인 요청 */}
  {!isDone && (
   <div className="border border-gray-200 rounded-lg overflow-hidden">
    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
     <h4 className="text-sm font-bold text-gray-700">🔔 추가 확인 요청</h4>
     {!showReqInput && !row.additional_request && (
      <button
       onClick={() => setShowReqInput(true)}
       className="text-xs font-bold px-2.5 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
      >
       요청 작성
      </button>
     )}
    </div>
    <div className="p-3 space-y-2">
     {row.additional_request ? (
      <>
       <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <p className="text-[10px] font-bold text-blue-400 mb-0.5">요청 내용</p>
        <p className="text-sm text-blue-800">{row.additional_request}</p>
       </div>
       {row.additional_feedback ? (
        <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
         <p className="text-[10px] font-bold text-green-500 mb-0.5">작업자 피드백</p>
         <p className="text-sm text-green-800">{row.additional_feedback}</p>
        </div>
       ) : (
        <p className="text-xs text-gray-400 text-center py-1">작업자 피드백 대기 중...</p>
       )}
      </>
     ) : showReqInput ? (
      <div className="flex flex-col gap-2">
       <textarea
        value={additionalReqText}
        onChange={e => setAdditionalReqText(e.target.value)}
        placeholder="작업자에게 추가로 확인할 내용을 입력하세요."
        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 min-h-[70px] resize-none"
       />
       <div className="flex gap-2 justify-end">
        <button
         onClick={() => { setShowReqInput(false); setAdditionalReqText(''); }}
         className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs font-bold rounded hover:bg-gray-100 transition-colors"
        >
         취소
        </button>
        <button
         onClick={handleSendAdditionalRequest}
         disabled={isSendingReq || !additionalReqText.trim()}
         className="px-3 py-1.5 bg-letusBlue text-white text-xs font-bold rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
         {isSendingReq ? '전송 중...' : '전송'}
        </button>
       </div>
      </div>
     ) : (
      <p className="text-xs text-gray-400 text-center py-1">요청이 없습니다.</p>
     )}
    </div>
   </div>
  )}

  {/* ④ 이슈 유형 확정 + 조치 내용 입력 */}
  <div className="flex flex-col gap-2">
   <h4 className="text-sm font-bold text-green-600">④ 담당자 조치 내용</h4>
   <div>
    <p className="text-xs text-gray-500 mb-1">이슈 유형 확정</p>
    <select
     value={issueType}
     onChange={e => setIssueType(e.target.value)}
     disabled={isDone}
     className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-800 outline-none ${isDone ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500'}`}
    >
     {HANDLE_ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
   </div>
   <textarea
    ref={actionRef}
    value={actionText}
    onChange={e => { setActionText(e.target.value); autoResize(e.target); }}
    disabled={isDone}
    placeholder="현장 작업자에게 전달할 조치 결과를 입력해주세요."
    className={`w-full border rounded-lg p-3 text-sm text-gray-800 outline-none overflow-hidden transition-shadow min-h-[100px] ${isDone ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500'}`}
   />
  </div>
 </div>
 </div>

 {row.worker_responded_at && (
 <div className="border-t border-gray-100 pt-4 mt-4">
 <h4 className="text-sm font-bold text-blue-600 mb-3">
 📤 작업자 조치 결과
 <span className="text-xs font-normal text-gray-400 ml-2">{formatDateTime(row.worker_responded_at)}</span>
 </h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {row.worker_response && (
 <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 leading-relaxed">
 {row.worker_response}
 </div>
 )}
 {row.worker_response_photos && (
 <ImageSlider imageUrlString={row.worker_response_photos} />
 )}
 </div>
 </div>
 )}
 </div>

 <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-2">
 <div>
 {isDone && <span className="text-green-600 font-bold text-sm">✅ 조치가 완료되어 수정할 수 없습니다.</span>}
 </div>
 <div className="flex gap-2">
 <button onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 text-sm font-bold rounded hover:bg-gray-100 transition-colors bg-white">
 {isDone ? '닫기' : '취소'}
 </button>
 {!isDone && (
 <button onClick={handleComplete} disabled={isSaving}
 className={`px-6 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded shadow transition-colors flex items-center gap-2 ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
 {isSaving ? '진행 중...' : '④ 조치완료 (피드백 자동 전송)'}
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};

// 🎧 메인 지원센터 컴포넌트
const SupportCenter = ({ userProfile }) => {
 const [activeTab, setActiveTab] = useState('faq');
 const [openFaqId, setOpenFaqId] = useState(null);
 const [activeModalItem, setActiveModalItem] = useState(null);
 const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);

 const [faqs, setFaqs] = useState([]);
 const [suggestions, setSuggestions] = useState([]);
 const [mySuggestions, setMySuggestions] = useState([]);
 const [isLoading, setIsLoading] = useState(false);

 const [sugType, setSugType] = useState('기능 개선 (UI/UX)');
 const [sugTitle, setSugTitle] = useState('');
 const [sugContent, setSugContent] = useState('');
 const [isSubmitting, setIsSubmitting] = useState(false);

 const fetchData = async () => {
 setIsLoading(true);
 try {
 const { data: faqData } = await supabase.from('faqs').select('*').order('id', { ascending: true });
 if (faqData) setFaqs(faqData);

 if (userProfile?.role?.includes('관리자')) {
 const { data: sugData } = await supabase.from('suggestions').select('*').order('created_at', { ascending: false });
 if (sugData) setSuggestions(sugData);
 }

 if (userProfile?.name) {
 const { data: myData } = await supabase.from('suggestions').select('*').eq('user_name', userProfile.name).order('created_at', { ascending: false });
 if (myData) setMySuggestions(myData);
 }
 } catch (error) {
 console.error("Fetch error:", error);
 } finally {
 setIsLoading(false);
 }
 };

 useEffect(() => {
 fetchData();
 }, [activeTab, userProfile]);

 const handleSubmitSuggestion = async (e) => {
 e.preventDefault();
 setIsSubmitting(true);
 try {
 const { error } = await supabase.from('suggestions').insert([{
 user_name: userProfile?.name || '알수없음',
 request_type: sugType,
 title: sugTitle,
 content: sugContent
 }]);
 if (error) throw error;

 alert('건의사항이 성공적으로 접수되었습니다.\n하단의 "나의 건의 내역"에서 답변을 확인하실 수 있습니다.');
 setSugTitle(''); setSugContent('');
 fetchData();
 } catch (error) {
 alert('오류가 발생했습니다: ' + error.message);
 } finally {
 setIsSubmitting(false);
 }
 };

 return (
 <div className="p-6 bg-slate-100 min-h-[calc(100vh-64px)] slide-up">
 <div className="w-full">
 <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
 <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white flex justify-between items-center">
 <div>
 <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
 <svg className="w-6 h-6 text-letusBlue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
 지원센터
 </h2>
 <p className="text-sm text-gray-500 mt-1">시스템 이용 중 궁금한 점이나 개선 사항을 남겨주세요.</p>
 </div>
 </div>
 <div className="flex px-2 pt-2 bg-gray-50/50 border-b border-gray-100">
 <button onClick={() => setActiveTab('faq')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'faq' ? 'border-letusBlue text-letusBlue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
 자주 묻는 질문 (FAQ)
 </button>
 <button onClick={() => setActiveTab('suggestion')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'suggestion' ? 'border-letusBlue text-letusBlue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
 시스템 건의사항 접수
 </button>
 {userProfile?.role?.includes('관리자') && (
 <button onClick={() => setActiveTab('admin')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ml-auto flex items-center gap-1 ${activeTab === 'admin' ? 'border-orange-500 text-orange-600' : 'border-transparent text-orange-400 hover:text-orange-600'}`}>
 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
 관리자 전용
 </button>
 )}
 </div>
 </div>

 {activeTab === 'faq' && (
 <div className="space-y-3 animate-fade-in">
 {isLoading ? <p className="text-center text-gray-500 py-10">FAQ 불러오는 중...</p> : faqs.length === 0 ? <p className="text-center text-gray-500 py-10">등록된 FAQ가 없습니다.</p> : faqs.map((faq) => (
 <div key={faq.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
 <button onClick={() => setOpenFaqId(openFaqId === faq.id ? null : faq.id)} className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 focus:outline-none">
 <div className="flex items-center gap-3 w-full overflow-hidden">
 <span className="w-[96px] flex-shrink-0 text-[10px] font-black text-letusOrange bg-orange-50 border border-orange-100 py-1 px-1 rounded text-center tracking-tight truncate">
 {faq.category}
 </span>
 <span className={`font-bold text-[14px] truncate flex-1 ${openFaqId === faq.id ? 'text-letusBlue' : 'text-gray-800'}`}>Q. {faq.question}</span>
 </div>
 <svg className={`w-5 h-5 flex-shrink-0 text-gray-400 transition-transform ${openFaqId === faq.id ? 'rotate-180 text-letusBlue' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
 </button>
 {openFaqId === faq.id && (
 <div className="px-5 pb-5 pt-2 border-t border-gray-100 bg-gray-50/50">
 <div className="flex gap-3 text-gray-600 text-sm leading-relaxed whitespace-pre-wrap mt-2">
 <span className="font-black text-gray-300 text-lg">A.</span>
 <div className="flex-1 mt-0.5">{faq.answer}</div>
 </div>
 </div>
 )}
 </div>
 ))}
 </div>
 )}

 {activeTab === 'suggestion' && (
 <div className="space-y-6 animate-fade-in">
 <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
 <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
 <span className="w-1 h-3.5 bg-letusBlue rounded-full"></span>
 새로운 건의사항 등록
 </h3>
 <form onSubmit={handleSubmitSuggestion} className="space-y-5">
 <div className="grid grid-cols-2 gap-5">
 <div className="flex flex-col gap-1.5">
 <label className="text-xs font-bold text-gray-700">작성자</label>
 <input type="text" value={userProfile?.name || ''} disabled className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
 </div>
 <div className="flex flex-col gap-1.5">
 <label className="text-xs font-bold text-gray-700">건의 유형 <span className="text-letusOrange">*</span></label>
 <select value={sugType} onChange={e => setSugType(e.target.value)} className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-letusBlue bg-white text-gray-800 outline-none">
 <option>기능 개선 (UI/UX)</option>
 <option>신규 기능 추가 요청</option>
 <option>오류 및 버그 신고</option>
 <option>기타</option>
 </select>
 </div>
 </div>
 <div className="flex flex-col gap-1.5">
 <label className="text-xs font-bold text-gray-700">제목 <span className="text-letusOrange">*</span></label>
 <input type="text" value={sugTitle} onChange={e => setSugTitle(e.target.value)} required placeholder="건의사항의 제목을 입력해 주세요." className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:border-letusBlue bg-white outline-none" />
 </div>
 <div className="flex flex-col gap-1.5">
 <label className="text-xs font-bold text-gray-700">상세 내용 <span className="text-letusOrange">*</span></label>
 <textarea value={sugContent} onChange={e => setSugContent(e.target.value)} required rows={4} placeholder="개선이 필요한 부분을 상세히 적어주시면 시스템 고도화에 큰 도움이 됩니다." className="border border-gray-300 rounded-lg px-4 py-3 text-sm focus:border-letusBlue bg-white resize-none outline-none"></textarea>
 </div>
 <div className="pt-2 flex justify-end">
 <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-letusBlue text-white text-sm font-bold rounded-lg shadow-md hover:bg-blue-600 transition-colors flex items-center gap-2">
 {isSubmitting ? '전송 중...' : '건의사항 등록'}
 </button>
 </div>
 </form>
 </div>

 <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
 <div className="p-4 border-b border-gray-100 bg-gray-50 font-bold text-sm text-gray-800">
 나의 건의 내역 확인
 </div>
 <div className="p-0 overflow-auto max-h-[300px] custom-scrollbar">
 <table className="w-full text-left whitespace-nowrap text-sm">
 <thead className="bg-white border-b border-gray-200 text-xs font-bold text-gray-500 sticky top-0">
 <tr>
 <th className="p-3 pl-5">접수일시</th>
 <th className="p-3">유형</th>
 <th className="p-3">제목 (클릭시 답변 확인)</th>
 <th className="p-3 text-center">진행 상태</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100">
 {mySuggestions.length === 0 ? (
 <tr><td colSpan="4" className="p-8 text-center text-gray-400">아직 등록하신 건의사항이 없습니다.</td></tr>
 ) : mySuggestions.map((sug) => (
 <tr key={sug.id} className="hover:bg-blue-50/30 cursor-pointer transition-colors" onClick={() => setActiveModalItem(sug)}>
 <td className="p-3 pl-5 text-gray-500 text-xs">{new Date(sug.created_at).toLocaleDateString()}</td>
 <td className="p-3 text-xs"><span className="bg-gray-100 px-2 py-1 rounded text-gray-600">{sug.request_type}</span></td>
 <td className="p-3 text-gray-800 font-medium truncate max-w-[300px] hover:text-letusBlue">{sug.title}</td>
 <td className="p-3 text-center"><span className={`text-[11px] font-bold border px-2 py-0.5 rounded shadow-sm ${sug.status === '반영완료' ? 'bg-green-50 text-green-600 border-green-200' : sug.status === '검토중' ? 'bg-blue-50 text-blue-600 border-blue-200' : sug.status === '반려' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>{sug.status}</span></td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 )}

 {activeTab === 'admin' && userProfile?.role?.includes('관리자') && (
 <div className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden animate-fade-in">
 <div className="bg-orange-50 px-5 py-4 border-b border-orange-100 font-bold text-sm text-orange-700 flex justify-between items-center">
 <span>접수된 전체 건의사항 내역</span>
 <button
 onClick={() => setIsFaqModalOpen(true)}
 className="bg-white border border-orange-300 text-orange-600 px-3 py-1.5 text-xs font-bold rounded shadow-sm hover:bg-orange-100 transition-colors flex items-center gap-1"
 >
 <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
 FAQ 새 글 쓰기
 </button>
 </div>
 <div className="p-0 overflow-auto max-h-[500px] custom-scrollbar">
 <table className="w-full text-left whitespace-nowrap text-sm">
 <thead className="bg-white border-b border-orange-100 text-xs font-bold text-gray-500 sticky top-0">
 <tr>
 <th className="p-3 pl-5">접수일시</th>
 <th className="p-3">작성자</th>
 <th className="p-3">유형</th>
 <th className="p-3">제목 (클릭시 답변 작성)</th>
 <th className="p-3 text-center">진행 상태</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100">
 {suggestions.length === 0 ? (
 <tr><td colSpan="5" className="p-10 text-center text-gray-400">접수된 건의사항이 없습니다.</td></tr>
 ) : suggestions.map((sug) => (
 <tr key={sug.id} className="hover:bg-orange-50/50 cursor-pointer transition-colors" onClick={() => setActiveModalItem(sug)}>
 <td className="p-3 pl-5 text-gray-500 text-xs">{new Date(sug.created_at).toLocaleDateString()}</td>
 <td className="p-3 font-semibold text-gray-700">{sug.user_name}</td>
 <td className="p-3 text-xs"><span className="bg-orange-50/50 border border-orange-100 px-2 py-1 rounded text-orange-600">{sug.request_type}</span></td>
 <td className="p-3 text-gray-800 font-medium truncate max-w-[200px] hover:text-orange-600">{sug.title}</td>
 <td className="p-3 text-center"><span className={`text-[11px] font-bold border px-2 py-0.5 rounded shadow-sm ${sug.status === '대기중' ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>{sug.status}</span></td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </div>

 {activeModalItem && (
 <SuggestionModal
 item={activeModalItem}
 onClose={() => setActiveModalItem(null)}
 onReload={fetchData}
 userProfile={userProfile}
 />
 )}

 {isFaqModalOpen && (
 <FaqAddModal
 onClose={() => setIsFaqModalOpen(false)}
 onReload={fetchData} />
 )}

 </div>
 );
};

const DeptReplyModal = ({ row, onClose, onReload }) => {
 const [replyText, setReplyText] = useState('');
 const [isSaving, setIsSaving] = useState(false);
 const replyRef = React.useRef(null);
 React.useEffect(() => { autoResize(replyRef.current); }, []);

 const handleSubmit = async () => {
  if (!replyText.trim()) return alert('회신 내용을 입력해주세요.');
  setIsSaving(true);
  try {
   const { error } = await supabase.from('logistics_issues').update({
    purchase_response: replyText,
    status: '이관부서 확인',
   }).eq('id', row.id);
   if (error) throw error;
   // 관리자에게 슬랙 알림
   supabase.functions.invoke('on-issue-event', {
    body: {
     record:     { ...row, purchase_response: replyText, status: '이관부서 확인' },
     old_record: { status: row.status },
    },
   }).catch(() => {}); // 알림 실패해도 저장은 성공 처리
   await onReload(); onClose();
  } catch (e) { alert('저장 중 오류가 발생했습니다.'); } finally { setIsSaving(false); }
 };

 return (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
   <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
   <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-2xl slide-up border border-gray-100 overflow-hidden flex flex-col">
    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
     <div>
      <h3 className="font-bold text-gray-900">회신 등록 ({row.reception_no})</h3>
      <p className="text-xs text-gray-400 mt-0.5">물류 관리자에게 회신 내용을 전달합니다</p>
     </div>
     <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><CloseIcon /></button>
    </div>
    <div className="p-5 overflow-y-auto max-h-[70vh]">
     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      {/* 왼쪽: 현장 사진 */}
      <div className="flex flex-col">
       <h4 className="text-sm font-bold text-gray-700 mb-2">📸 현장 사진</h4>
       <ImageSlider imageUrlString={row.image_url} imageUrlHqString={row.image_url_hq} />
      </div>
      {/* 오른쪽: 이관 요청 내용 + 회신 입력 */}
      <div className="flex flex-col gap-4">
       <div>
        <h4 className="text-sm font-bold text-gray-700 mb-2">📋 이관 요청 내용</h4>
        <div className="w-full border border-gray-200 bg-gray-50 rounded-lg p-3 text-sm text-gray-600 min-h-[60px]">
         {row.relay_content || '(내용 없음)'}
        </div>
       </div>
       <div>
        <h4 className="text-sm font-bold text-purple-600 mb-2">✏️ 회신 내용</h4>
        <textarea
         ref={replyRef}
         value={replyText}
         onChange={e => { setReplyText(e.target.value); autoResize(e.target); }}
         placeholder="이관 요청에 대한 확인 및 처리 내용을 입력해주세요."
         className="w-full border border-purple-300 bg-purple-50 rounded-lg p-3 text-sm text-gray-800 outline-none overflow-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 min-h-[100px]"
        />
       </div>
      </div>
     </div>
    </div>
    <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
     <button onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 text-sm font-bold rounded hover:bg-gray-100 bg-white">취소</button>
     <button onClick={handleSubmit} disabled={isSaving || !replyText.trim()}
      className={`px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-bold rounded shadow transition-colors ${(isSaving || !replyText.trim()) ? 'opacity-60 cursor-not-allowed' : ''}`}>
      {isSaving ? '저장 중...' : '회신 전달'}
     </button>
    </div>
   </div>
  </div>
 );
};

// 🌟 전역 등록
export { SuggestionModal };
export { FaqAddModal };
export { RequestModal };
export { HandleModal };
export { DeptReplyModal };
export { SupportCenter };