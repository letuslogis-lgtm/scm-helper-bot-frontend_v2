// ===========================================================================
// 상세 내역 테이블 훅 (테이블 UI 표준)
//   컬럼 순서/너비 드래그·리사이징, 정렬, localStorage 저장을 담당.
// ===========================================================================
import { useState, useRef, useEffect } from 'react';
import { DETAIL_COLUMNS, COL_STORAGE_KEY } from './constants.js';

export function useDetailTable() {
  const [sortConfig, setSortConfig] = useState(null);
  const [colOrder, setColOrder] = useState(DETAIL_COLUMNS.map((_, i) => i));
  const [colWidths, setColWidths] = useState(DETAIL_COLUMNS.map(c => c.w));
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const resizingRef = useRef(null);
  const dragSrcRef = useRef(null);
  const wasDraggedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_STORAGE_KEY));
      if (saved?.order?.length === DETAIL_COLUMNS.length) setColOrder(saved.order);
      if (saved?.widths?.length === DETAIL_COLUMNS.length) setColWidths(saved.widths);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(COL_STORAGE_KEY, JSON.stringify({ order: colOrder, widths: colWidths }));
  }, [colOrder, colWidths]);

  const resetColSettings = () => {
    setColOrder(DETAIL_COLUMNS.map((_, i) => i));
    setColWidths(DETAIL_COLUMNS.map(c => c.w));
    localStorage.removeItem(COL_STORAGE_KEY);
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig?.key !== key) return null;
    if (sortConfig.direction === 'asc') return <span className="ml-1 text-letusBlue font-black">↑</span>;
    if (sortConfig.direction === 'desc') return <span className="ml-1 text-letusBlue font-black">↓</span>;
    return null;
  };

  const handleResizeStart = (e, visualIdx) => {
    e.preventDefault(); e.stopPropagation();
    const origIdx = colOrder[visualIdx];
    resizingRef.current = { origIdx, startX: e.clientX, startW: colWidths[origIdx] };
    const onMove = (ev) => {
      const { origIdx, startX, startW } = resizingRef.current;
      setColWidths(prev => { const n = [...prev]; n[origIdx] = Math.max(50, startW + (ev.clientX - startX)); return n; });
    };
    const onUp = () => { resizingRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const handleDragStart = (e, visualIdx) => { dragSrcRef.current = visualIdx; wasDraggedRef.current = false; e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, visualIdx) => { e.preventDefault(); setDragOverIdx(visualIdx); };
  const handleDrop = (e, visualIdx) => {
    e.preventDefault(); setDragOverIdx(null);
    if (dragSrcRef.current === null || dragSrcRef.current === visualIdx) return;
    wasDraggedRef.current = true;
    const newOrder = [...colOrder]; const [moved] = newOrder.splice(dragSrcRef.current, 1); newOrder.splice(visualIdx, 0, moved);
    setColOrder(newOrder); dragSrcRef.current = null;
  };
  const handleDragEnd = () => { setDragOverIdx(null); setTimeout(() => { wasDraggedRef.current = false; }, 50); };

  return {
    sortConfig, colOrder, colWidths, dragOverIdx, setDragOverIdx,
    wasDraggedRef,
    requestSort, getSortIcon, resetColSettings,
    handleResizeStart, handleDragStart, handleDragOver, handleDrop, handleDragEnd,
  };
}
