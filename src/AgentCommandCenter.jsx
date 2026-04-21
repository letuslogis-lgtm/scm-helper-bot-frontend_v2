import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './supabaseClient.js';

export const AgentCommandCenter = ({ session, userProfile }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputText, setInputText] = useState('');

    // 🌟 로그인 유저 이름으로 개인화된 인사말
    const welcomeMessage = userProfile?.name
        ? `${userProfile.name}님, 안녕하세요! LL(LetUs Logis) 통합 AI 비서입니다.\n일정 추가, 업무 등록, 시스템 질문 등 무엇이든 편하게 말씀해 주세요!`
        : `안녕하세요! LL(LetUs Logis) 통합 AI 비서입니다.\n일정 추가, 업무 등록, 시스템 질문 등 무엇이든 편하게 말씀해 주세요!`;

    const [messages, setMessages] = useState([
        {
            id: 1,
            sender: 'ai',
            text: welcomeMessage,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
    ]);

    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!inputText.trim()) return;

        // 🔒 세션/프로필 방어 코드
        if (!session || !userProfile) {
            setMessages(prev => [...prev, {
                id: Date.now(),
                sender: 'ai',
                text: "⚠️ 로그인 정보를 확인할 수 없습니다. 페이지를 새로고침하거나 다시 로그인해 주세요.",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
            return;
        }

        const userText = inputText.trim();
        const newUserMsg = {
            id: Date.now(),
            sender: 'user',
            text: userText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, newUserMsg]);
        setInputText('');

        // 로딩(대기) 메시지 띄우기
        const loadingId = Date.now() + 1;
        setMessages(prev => [...prev, {
            id: loadingId,
            sender: 'ai',
            text: `✨ (생각 중...)`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);

        try {
            // 🚀 수파베이스 엣지 펑션 'chat-assistant' 호출
            // 💡 supabase.functions.invoke는 로그인 세션의 access_token을 
            //    Authorization 헤더에 자동 주입합니다. (별도 헤더 설정 불필요)
            const { data, error } = await supabase.functions.invoke('chat-assistant', {
                body: {
                    message: userText,
                    // ⚠️ user_id는 보내지 않습니다. Edge Function이 토큰에서 검증 후 추출.
                    // 👇 부가 컨텍스트만 전달 (챗봇이 대화에 활용)
                    context: {
                        userName: userProfile.name,
                        userTeam: userProfile.team,
                        userRole: userProfile.role,
                    }
                }
            });

            if (error) throw error;

            // 로딩 메시지를 AI의 실제 답변으로 교체
            setMessages(prev => prev.map(msg =>
                msg.id === loadingId
                    ? { ...msg, text: data.reply || "답변을 생성하지 못했습니다." }
                    : msg
            ));

        } catch (error) {
            console.error('챗봇 호출 에러:', error);
            setMessages(prev => prev.map(msg =>
                msg.id === loadingId
                    ? { ...msg, text: "🚨 통신 중 오류가 발생했습니다. 수파베이스 엣지 펑션이 정상적으로 배포되었는지 확인해 주세요." }
                    : msg
            ));
        }
    };

    const handleQuickAction = (text) => {
        setInputText(text);
    };

    return (
        <div className="fixed bottom-6 right-6 z-[999] flex flex-col items-end">

            {/* 챗봇 창 */}
            <div className={`transition-all duration-300 transform origin-bottom-right mb-4 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden ${isOpen ? 'scale-100 opacity-100 w-[380px] h-[600px]' : 'scale-0 opacity-0 w-0 h-0 pointer-events-none'}`}>

                {/* 1. 심플해진 헤더 */}
                <div className="bg-letusBlue p-4 flex justify-between items-center text-white">
                    <div className="flex items-center gap-2 font-bold text-sm">
                        <span className="text-xl">✨</span>
                        LL 통합 AI 비서
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* 2. 대화창 영역 */}
                <div className="flex-1 bg-slate-50 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] shadow-sm ${msg.sender === 'user' ? 'bg-letusBlue text-white rounded-tr-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'}`}>
                                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                                <div className={`text-[10px] mt-1.5 font-medium ${msg.sender === 'user' ? 'text-blue-200 text-right' : 'text-gray-400'}`}>
                                    {msg.timestamp}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* 3. 입력창 */}
                <div className="bg-white p-3 border-t border-gray-200">
                    <div className="flex flex-wrap gap-1.5 mb-2.5 px-1">
                        <button onClick={() => handleQuickAction('시스템 사용법 알려줘')} className="text-[11px] font-bold text-gray-600 bg-gray-50 hover:bg-teal-50 hover:text-teal-600 border border-gray-200 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors">
                            📖 가이드
                        </button>
                        <button onClick={() => handleQuickAction('일정 추가: ')} className="text-[11px] font-bold text-gray-600 bg-gray-50 hover:bg-orange-50 hover:text-orange-600 border border-gray-200 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors">
                            📅 일정 추가
                        </button>
                        <button onClick={() => handleQuickAction('TODO 추가: ')} className="text-[11px] font-bold text-gray-600 bg-gray-50 hover:bg-green-50 hover:text-green-600 border border-gray-200 px-2.5 py-1.5 rounded-md flex items-center gap-1 transition-colors">
                            ✅ 업무 등록
                        </button>
                    </div>

                    <div className="flex items-end gap-2 bg-slate-50 border border-gray-200 rounded-xl p-1.5 focus-within:border-letusBlue focus-within:ring-1 focus-within:ring-letusBlue transition-all">
                        <textarea
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder="무엇이든 물어보세요"
                            className="flex-1 max-h-32 min-h-[40px] bg-transparent text-[13px] text-gray-800 px-2 py-2.5 resize-none outline-none custom-scrollbar"
                            rows={1}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputText.trim()}
                            className={`p-2.5 rounded-lg flex shrink-0 transition-colors ${inputText.trim() ? 'bg-letusBlue text-white hover:bg-blue-600 shadow-sm' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* 플로팅 호출 버튼 */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`${isOpen ? 'bg-gray-800' : 'bg-letusBlue'} text-white w-14 h-14 rounded-full shadow-xl hover:scale-105 hover:shadow-2xl transition-all duration-300 flex items-center justify-center relative group`}
            >
                {!isOpen && (
                    <span className="absolute inset-0 rounded-full bg-letusBlue opacity-40 animate-ping"></span>
                )}
                {isOpen ? (
                    <svg className="w-6 h-6 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                ) : (
                    <span className="text-2xl relative z-10">✨</span>
                )}
            </button>
        </div>
    );
};