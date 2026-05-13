import React, { useState, useEffect, useMemo } from 'react';
import { CloseIcon } from './SharedUI.jsx';

const TodoModal = ({ todo, onClose, onSave, onDelete }) => {
    const [text, setText] = useState(todo ? todo.text : '');
    const [priority, setPriority] = useState(todo ? todo.priority : '4');
    const [repeat, setRepeat] = useState(todo && todo.repeat ? todo.repeat : []);

    const DAYS = ['월', '화', '수', '목', '금', '토', '일'];

    const handleToggleDay = (day) => {
        if (repeat.includes(day)) setRepeat(repeat.filter(d => d !== day));
        else setRepeat([...repeat, day]);
    };

    const handleSelectAllDays = () => {
        if (repeat.length === 7) setRepeat([]);
        else setRepeat([...DAYS]);
    };

    const handleSubmit = () => {
        if (!text.trim()) return alert('할 일을 입력해 주세요.');

        const finalRepeat = repeat.length > 0 ? repeat : null;

        onSave({
            id: todo ? todo.id : Date.now(),
            text: text.trim(),
            priority,
            repeat: finalRepeat,
            isDone: todo ? todo.isDone : false
        });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-sm slide-up border border-gray-100 overflow-hidden flex flex-col">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                        <span className="w-1.5 h-3.5 bg-letusBlue rounded-full"></span>
                        {todo ? 'TO DO 수정' : '새로운 TO DO 추가'}
                    </h3>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><CloseIcon /></button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-700">할 일 <span className="text-letusOrange">*</span></label>
                        <input
                            type="text" value={text} onChange={e => setText(e.target.value)}
                            placeholder="할 일 내용을 입력하세요" autoFocus
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-700">우선 순위</label>
                        <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-letusBlue bg-white cursor-pointer font-bold">
                            <option value="긴급">🚨 긴급 (최우선)</option>
                            <option value="1">1 순위</option>
                            <option value="2">2 순위</option>
                            <option value="3">3 순위</option>
                            <option value="4">4 순위 (기본)</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5 pt-1">
                        <div className="flex justify-between items-end mb-1">
                            <label className="text-xs font-bold text-gray-700">반복 설정 (요일)</label>
                            <button onClick={handleSelectAllDays} className="text-[10px] font-bold text-letusBlue hover:bg-blue-50 px-2 py-0.5 rounded border border-blue-200 transition-colors">
                                {repeat.length === 7 ? '전체 해제' : '전체 선택'}
                            </button>
                        </div>
                        <div className="flex gap-1.5 w-full justify-between">
                            {DAYS.map(day => {
                                const isSelected = repeat.includes(day);
                                return (
                                    <button
                                        key={day} onClick={() => handleToggleDay(day)}
                                        className={`w-9 h-9 rounded-full text-xs font-bold transition-all flex items-center justify-center ${isSelected ? 'bg-letusBlue text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                    >
                                        {day}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                    <div>
                        {todo && (
                            <button onClick={() => { onDelete(todo.id); onClose(); }} className="px-4 py-2 border border-red-200 text-red-500 bg-white text-xs font-bold rounded-lg hover:bg-red-50 transition-colors shadow-sm">
                                삭제
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-600 bg-white text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors shadow-sm">취소</button>
                        <button onClick={handleSubmit} className="px-5 py-2 bg-letusBlue text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-600 transition-colors">저장</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export { TodoModal };
