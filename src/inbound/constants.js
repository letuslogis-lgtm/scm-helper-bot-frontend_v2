export const FILE_TYPES = [
  { id: '입고실적',  label: '입고실적등록',  needsWarehouse: true,  colorKey: 'blue',   desc: 'ERP 입고실적등록 Excel' },
  { id: '반입집계',  label: '반입집계표',    needsWarehouse: true,  colorKey: 'green',  desc: '사업장별 반출입 집계 (반입) Excel' },
  { id: '반출집계',  label: '반출집계표',    needsWarehouse: true,  colorKey: 'orange', desc: '사업장별 반출입 집계 (반출) Excel' },
  { id: 'WMS직송컷', label: 'WMS 직송컷',   needsWarehouse: false, colorKey: 'purple', desc: 'WMS 사업장 직송 CUT LIST Excel' },
];
// ※ 부족컷은 기존 RPA(wms_extract.py)가 wms_shortage_list에 수집 → 별도 업로드 불필요

export const FILE_TYPE_MAP = Object.fromEntries(FILE_TYPES.map(t => [t.id, t]));

export const TYPE_BADGE = {
  '입고실적':  'bg-blue-100 text-blue-700 border-blue-200',
  '반입집계':  'bg-green-100 text-green-700 border-green-200',
  '반출집계':  'bg-orange-100 text-orange-700 border-orange-200',
  'WMS부족컷': 'bg-red-100 text-red-700 border-red-200',
  'WMS직송컷': 'bg-purple-100 text-purple-700 border-purple-200',
};
