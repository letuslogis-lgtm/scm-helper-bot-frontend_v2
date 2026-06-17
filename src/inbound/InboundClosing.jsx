// ===========================================================================
// 입고 실적 마감 — 메인 페이지
// ===========================================================================
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { InboundUploadTab }   from './InboundUploadTab.jsx';
import { InboundSummaryTab }  from './InboundSummaryTab.jsx';
import { InboundUploadModal } from './InboundUploadModal.jsx';

const TABS = [
  { id: 'upload',  label: '업로드 관리' },
  { id: 'summary', label: '집계 현황' },
];

export const InboundClosing = () => {
  const { userProfile } = useAuth();
  const [activeTab,     setActiveTab]     = useState('upload');
  const [showModal,     setShowModal]     = useState(false);
  const [batches,       setBatches]       = useState([]);
  const [loadingBatch,  setLoadingBatch]  = useState(false);

  useEffect(() => { loadBatches(); }, []);

  const loadBatches = async () => {
    setLoadingBatch(true);
    const { data } = await supabase
      .from('inbound_upload_batches')
      .select('*')
      .order('business_date', { ascending: false })
      .order('uploaded_at', { ascending: false })
      .limit(500);
    setBatches(data || []);
    setLoadingBatch(false);
  };

  // 창고명 자동완성용 기존 목록
  const existingWarehouses = useMemo(() =>
    [...new Set(batches.map(b => b.warehouse_name).filter(Boolean))].sort()
  , [batches]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 페이지 헤더 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-black text-gray-900">입고 실적 마감</h1>
          <p className="text-xs text-gray-400 mt-0.5">ERP/WMS 데이터 업로드 · 브랜드별 집계 · 마감 현황</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-letusBlue text-white text-sm font-black px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          파일 업로드
        </button>
      </div>

      {/* 탭 */}
      <div className="bg-white border-b border-gray-200 px-6 shrink-0">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-5 py-3 text-sm font-black border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-letusBlue text-letusBlue'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'upload' && (
          <InboundUploadTab
            batches={batches}
            onUploadClick={() => setShowModal(true)}
            onDeleteBatch={loadBatches}
          />
        )}
        {activeTab === 'summary' && <InboundSummaryTab />}
      </div>

      {/* 업로드 모달 */}
      {showModal && (
        <InboundUploadModal
          userProfile={userProfile}
          existingWarehouses={existingWarehouses}
          onClose={() => setShowModal(false)}
          onReload={() => { loadBatches(); }}
        />
      )}
    </div>
  );
};
