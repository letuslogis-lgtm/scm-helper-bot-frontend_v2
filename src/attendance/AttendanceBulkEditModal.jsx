// ===========================================================================
// 선택 인원 일괄 수정 (지원/파견) 모달
// ===========================================================================
import React, { useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { CloseIcon } from '../SharedUI.jsx';
import { WORKED_VENDOR_OPTIONS } from './constants.js';
import { notifySuccess, notifyError, notifyConfirm } from './notify.js';

export const AttendanceBulkEditModal = ({ selectedIds, onClose, onReload }) => {
  const [workedVendor, setWorkedVendor] = useState('');
  const [remark, setRemark] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!workedVendor && !remark) return notifyError('변경할 투입 업체나 비고 내용을 입력해 주세요.');
    if (!notifyConfirm(`선택하신 ${selectedIds.length}명의 근무 데이터를 일괄 수정하시겠습니까?\n(지원/파견 처리)`)) return;

    setIsSaving(true);
    try {
      const updateData = {};
      if (workedVendor) updateData.worked_vendor = workedVendor;
      if (remark) updateData.remark = remark;

      const { error } = await supabase.from('worker_attendance').update(updateData).in('id', selectedIds);
      if (error) throw error;

      notifySuccess(`🎉 총 ${selectedIds.length}명의 데이터가 일괄 수정되었습니다.`);
      onReload();
      onClose();
    } catch (err) {
      notifyError('일괄 저장 중 오류 발생: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="bg-white rounded-xl shadow-2xl z-10 w-full max-w-md slide-up overflow-hidden border border-gray-100 flex flex-col">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <span className="w-1.5 h-3.5 bg-letusOrange rounded-full"></span>
            선택 인원 일괄 수정 (지원/파견)
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><CloseIcon /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm font-bold text-letusBlue text-center">
            현재 <span className="text-lg mx-1">{selectedIds.length}</span>명의 근무 데이터가 선택되었습니다.
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-2">실제 투입 업체 (지원/파견 변경 시)</label>
              <select value={workedVendor} onChange={e => setWorkedVendor(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue transition-all cursor-pointer bg-white">
                <option value="">변경 안 함 (기존 소속 유지)</option>
                {WORKED_VENDOR_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-1.5 font-medium">* 선택 시 원 소속과 무관하게 해당 업체의 생산성(UPH)으로 집계됩니다.</p>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-2">특이사항 (비고) 일괄 적용</label>
              <input type="text" value={remark} onChange={e => setRemark(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-letusBlue/20 focus:border-letusBlue transition-all placeholder:text-gray-300" placeholder="예: IPC 물량 증가로 인한 오후 지원" />
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors shadow-sm">취소</button>
          <button onClick={handleSave} disabled={isSaving || (!workedVendor && !remark)} className="px-6 py-2 bg-letusBlue text-white text-sm font-bold rounded-lg shadow hover:bg-blue-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSaving ? '일괄 적용 중...' : '확인 및 일괄 적용'}
          </button>
        </div>
      </div>
    </div>
  );
};
