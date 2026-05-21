import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient.js';
import { CloseIcon, ImageSlider, formatDateTime } from './SharedUI.jsx';




// 🛠️ 고객지원 전용 모달들
const SuggestionModal = ({ item, onClose, onReload, userProfile }) => {
 const isAdmin = userProfile?.role === '관리자';
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

const RequestModal = ({ row, onClose, onReload, userProfile, onDirectHandle }) => {
 const [requestText, setRequestText] = useState(row.request_content || '');
 const [purchaseText, setPurchaseText] = useState(row.purchase_response || '');
 const [isSaving, setIsSaving] = useState(false);
 const isAdmin = userProfile?.role !== '사용자';
 const isWaiting = row.status === '조치대기';
 const isProcessing = row.status === '처리 중';
 const isDone = row.status === '조치완료';
 const hasPurchaseResponse = !!(row.purchase_response);

 const handleTransfer = async () => {
 setIsSaving(true);
 try {
 const { error } = await supabase.from('logistics_issues').update({
 request_content: requestText,
 status: '처리 중',
 }).eq('id', row.id);
 if (error) throw error;
 await onReload(); onClose();
 } catch (e) { alert('오류가 발생했습니다.'); } finally { setIsSaving(false); }
 };

 const handleDirectAction = async () => {
 setIsSaving(true);
 try {
 const { error } = await supabase.from('logistics_issues').update({
 request_content: requestText,
 status: '처리 중',
 }).eq('id', row.id);
 if (error) throw error;
 await onReload();
 onDirectHandle?.({ ...row, request_content: requestText, status: '처리 중' });
 } catch (e) { alert('오류가 발생했습니다.'); } finally { setIsSaving(false); }
 };

 const handlePurchaseConfirm = async () => {
 if (!purchaseText.trim()) return alert('구매/생산 확인 내용을 입력해주세요.');
 setIsSaving(true);
 try {
 const { error } = await supabase.from('logistics_issues').update({
 purchase_response: purchaseText,
 }).eq('id', row.id);
 if (error) throw error;
 await onReload(); onClose();
 } catch (e) { alert('오류가 발생했습니다.'); } finally { setIsSaving(false); }
 };

 const stepStyle = (active, done) =>
 active ? 'text-orange-500 font-black' : done ? 'text-green-500 font-bold' : 'text-gray-300';

 return (
 <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
 <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
 <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-4xl slide-up border border-gray-100 overflow-hidden flex flex-col">
 <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
 <div>
 <h3 className="font-bold text-gray-900">현장 특이사항 접수/이관 ({row.reception_no})</h3>
 <div className="flex items-center gap-1 mt-1 text-[11px]">
 <span className={stepStyle(isWaiting, !isWaiting)}>① 접수</span>
 <span className="text-gray-300">›</span>
 <span className={stepStyle(isProcessing && !hasPurchaseResponse, !isWaiting)}>② 이관</span>
 <span className="text-gray-300">›</span>
 <span className={stepStyle(isProcessing && !hasPurchaseResponse, hasPurchaseResponse || isDone)}>③ 구매/생산 확인</span>
 <span className="text-gray-300">›</span>
 <span className={stepStyle(false, isDone)}>④ 담당자 조치</span>
 <span className="text-gray-300">›</span>
 <span className={stepStyle(false, row.is_notified)}>⑤ 피드백</span>
 </div>
 </div>
 <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><CloseIcon /></button>
 </div>

 <div className="p-5 bg-white overflow-y-auto max-h-[70vh]">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="flex flex-col">
 <h4 className="text-sm font-bold text-gray-700 mb-2">📸 현장 사진</h4>
 <ImageSlider imageUrlString={row.image_url} />
 </div>

 <div className="flex flex-col space-y-4">
 <div className="flex flex-col">
 <h4 className="text-sm font-bold text-gray-700 mb-2">① 접수 내용</h4>
 {isWaiting ? (
 <textarea
 value={requestText}
 onChange={e => setRequestText(e.target.value)}
 placeholder="특이사항 조치 관련 요청 상세 내용이나 확인된 메모를 자유롭게 입력해 주세요."
 disabled={!isAdmin}
 className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-800 outline-none resize-none focus:ring-2 focus:ring-letusBlue focus:border-letusBlue min-h-[80px]"
 />
 ) : (
 <div className="w-full border border-gray-200 bg-gray-100 rounded-lg p-3 text-sm text-gray-600 min-h-[60px]">
 {row.request_content || '(내용 없음)'}
 </div>
 )}
 </div>

 {(isProcessing || isDone) && (
 <div className="flex flex-col">
 <h4 className="text-sm font-bold text-blue-600 mb-2">③ 구매/생산 확인 내용</h4>
 {isDone || hasPurchaseResponse ? (
 <div className="w-full border border-blue-100 bg-blue-50 rounded-lg p-3 text-sm text-blue-800 min-h-[60px]">
 {row.purchase_response || '(내용 없음)'}
 </div>
 ) : (
 <textarea
 value={purchaseText}
 onChange={e => setPurchaseText(e.target.value)}
 placeholder="구매/생산팀 확인 내용을 입력해주세요."
 className="w-full border border-blue-300 bg-blue-50 rounded-lg p-3 text-sm text-gray-800 outline-none resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px]"
 />
 )}
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-2">
 <div>
 {isDone && <span className="text-gray-500 font-bold text-sm">✅ 조치가 완료되어 수정할 수 없습니다.</span>}
 {isProcessing && hasPurchaseResponse && <span className="text-blue-500 font-bold text-sm">✅ 구매/생산 확인이 완료되었습니다.</span>}
 </div>
 <div className="flex gap-2">
 <button onClick={onClose} className="px-5 py-2 border border-gray-300 text-gray-600 text-sm font-bold rounded hover:bg-gray-100 transition-colors bg-white">
 {isDone || (isProcessing && hasPurchaseResponse) ? '닫기' : '취소'}
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
 {isProcessing && !hasPurchaseResponse && isAdmin && (
 <button onClick={handlePurchaseConfirm} disabled={isSaving || !purchaseText.trim()}
 className={`px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold rounded shadow transition-colors ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
 {isSaving ? '저장 중...' : '③ 구매/생산 확인 완료'}
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};

const HandleModal = ({ row, onClose, onReload, userProfile }) => {
 const [actionText, setActionText] = useState(row.action_content || '');
 const [isSaving, setIsSaving] = useState(false);
 const isDone = row.status === '조치완료';

 const handleComplete = async () => {
 setIsSaving(true);
 try {
 const nowIso = new Date().toISOString();
 const { error } = await supabase.from('logistics_issues').update({
 action_content: actionText,
 status: '조치완료',
 final_handler: userProfile?.name || '관리자',
 resolved_at: nowIso,
 is_notified: true,
 feedback_sent_at: nowIso,
 }).eq('id', row.id);
 if (error) throw error;
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
 <h3 className="font-bold text-gray-900">현장 특이사항 조치 등록 ({row.reception_no})</h3>
 <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><CloseIcon /></button>
 </div>

 <div className="p-5 bg-white overflow-y-auto max-h-[80vh]">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
 <div className="flex flex-col">
 <h4 className="text-sm font-bold text-gray-700 mb-2">📸 현장 사진</h4>
 <ImageSlider imageUrlString={row.image_url} />
 </div>

 <div className="flex flex-col space-y-4">
 <div>
 <h4 className="text-sm font-bold text-gray-700 mb-2">① 접수 내용</h4>
 <div className="w-full border border-gray-200 bg-gray-100 rounded-lg p-3 text-sm text-gray-600 min-h-[50px]">
 {row.request_content || '(내용 없음)'}
 </div>
 </div>

 {row.purchase_response && (
 <div>
 <h4 className="text-sm font-bold text-blue-600 mb-2">③ 구매/생산 확인 내용</h4>
 <div className="w-full border border-blue-100 bg-blue-50 rounded-lg p-3 text-sm text-blue-800 min-h-[50px]">
 {row.purchase_response}
 </div>
 </div>
 )}

 <div>
 <h4 className="text-sm font-bold text-green-600 mb-2">④ 담당자 조치 내용</h4>
 <textarea
 value={actionText}
 onChange={e => setActionText(e.target.value)}
 disabled={isDone}
 placeholder="현장 작업자에게 전달할 조치 결과를 입력해주세요."
 className={`w-full border rounded-lg p-3 text-sm text-gray-800 outline-none resize-none transition-shadow min-h-[100px] ${isDone ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500'}`}
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

 if (userProfile?.role === '관리자') {
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
 {userProfile?.role === '관리자' && (
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

 {activeTab === 'admin' && userProfile?.role === '관리자' && (
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

// 🌟 전역 등록
export { SuggestionModal };
export { FaqAddModal };
export { RequestModal };
export { HandleModal };
export { SupportCenter };