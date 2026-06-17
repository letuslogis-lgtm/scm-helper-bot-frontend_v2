// ===========================================================================
// 입고 실적 마감 — Excel 파서 + 브랜드 매칭
// ===========================================================================

// XLSX binary → 첫 번째 시트의 row 배열 반환
const readSheetRows = (XLSX, binaryData) => {
  const wb = XLSX.read(binaryData, { type: 'binary', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
};

// Date 객체 또는 문자열 → 'YYYY-MM-DD'
const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val).trim();
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.substring(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
};

// 숫자 안전 파싱 (콤마 제거)
const safeInt = (val) => {
  if (!val && val !== 0) return 0;
  const n = parseInt(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

// WMS 품목ID 분리: 마지막 '-' 기준 (NGHS12CP02A-WW → {item_code, item_color})
const splitItemId = (id) => {
  const s = String(id || '').trim();
  const idx = s.lastIndexOf('-');
  if (idx < 0) return { item_code: s, item_color: '' };
  return { item_code: s.slice(0, idx), item_color: s.slice(idx + 1) };
};

// ── 파서: 입고실적등록 ──────────────────────────────────────────────────────
const parseInboundPerformance = (XLSX, binaryData, { business_date, warehouse_name }) => {
  const rows = readSheetRows(XLSX, binaryData);
  return rows
    .filter(r => String(r['단품코드'] || '').trim())
    .map(r => ({
      business_date: parseDate(r['입고일자']) || business_date,
      warehouse_name,
      전표번호:   String(r['입고전표번호'] || '').trim(),
      item_code:  String(r['단품코드'] || '').trim(),
      item_color: String(r['색상'] || '').trim(),
      단품명칭:   String(r['단품명칭'] || '').trim(),
      수량:       safeInt(r['수량']),
      입고금액:   safeInt(r['입고금액']),
      입고유형:   String(r['입고유형'] || '').trim(),
      공급처:     String(r['공급처'] || '').trim(),
    }));
};

// ── 파서: 반출입 집계 (반입/반출 동일 구조) ──────────────────────────────────
const parseTransfer = (XLSX, binaryData, { business_date, transfer_type }) => {
  const rows = readSheetRows(XLSX, binaryData);
  return rows
    .filter(r => String(r['단품코드'] || '').trim())
    .map(r => ({
      business_date:   parseDate(r['기준일자']) || business_date,
      transfer_type,
      other_warehouse: String(r['반출창고'] || r['반입창고'] || '').trim(),
      전표번호:        String(r['전표번호'] || '').trim(),
      item_code:       String(r['단품코드'] || '').trim(),
      item_color:      String(r['칼라'] || r['색상'] || '').trim(),
      단품명:          String(r['단품명'] || '').trim(),
      수량:            safeInt(r['반입량'] || r['반출량']),
      금액:            safeInt(r['반입금액'] || r['반출금액']),
    }));
};

// ── 파서: WMS 부족컷 ─────────────────────────────────────────────────────────
const parseWmsCut = (XLSX, binaryData, { business_date }) => {
  const rows = readSheetRows(XLSX, binaryData);
  return rows
    .filter(r => String(r['품목ID'] || '').trim())
    .map(r => {
      const { item_code, item_color } = splitItemId(r['품목ID']);
      return {
        business_date,
        cut_type:   '부족컷',
        item_code,
        item_color,
        wave명:     String(r['WAVE명'] || '').trim(),
        오더번호:   String(r['오더번호'] || '').trim(),
        오더건명:   String(r['오더건명'] || '').trim(),
        cut수량:    safeInt(r['CUT수량']),
        구분:       String(r['구분'] || '').trim(),
        공급업체명: String(r['공급업체명'] || '').trim(),
        owner:      String(r['OWNER'] || '').trim(),
        유통채널:   String(r['유통채널'] || '').trim(),
        제품구분:   String(r['제품구분'] || '').trim(),
      };
    });
};

// ── 파서: WMS 직송컷 ─────────────────────────────────────────────────────────
const parseWmsDirectCut = (XLSX, binaryData, { business_date }) => {
  const rows = readSheetRows(XLSX, binaryData);
  return rows
    .filter(r => String(r['품목ID'] || '').trim())
    .map(r => {
      const { item_code, item_color } = splitItemId(r['품목ID']);
      return {
        business_date,
        cut_type:   '직송컷',
        item_code,
        item_color,
        wave명:     String(r['WAVE명'] || '').trim(),
        오더번호:   String(r['오더번호'] || '').trim(),
        오더건명:   String(r['오더건명'] || '').trim(),
        cut수량:    safeInt(r['CUT수량']),
        구분:       null,
        공급업체명: null,
        owner:      String(r['OWNER'] || '').trim(),
        유통채널:   null,
        제품구분:   null,
      };
    });
};

// ── 파일 유형별 파서 디스패치 ─────────────────────────────────────────────────
export const parseFile = (XLSX, binaryData, { file_type, business_date, warehouse_name }) => {
  switch (file_type) {
    case '입고실적':  return parseInboundPerformance(XLSX, binaryData, { business_date, warehouse_name });
    case '반입집계':  return parseTransfer(XLSX, binaryData, { business_date, transfer_type: '반입' });
    case '반출집계':  return parseTransfer(XLSX, binaryData, { business_date, transfer_type: '반출' });
    case 'WMS부족컷': return parseWmsCut(XLSX, binaryData, { business_date });
    case 'WMS직송컷': return parseWmsDirectCut(XLSX, binaryData, { business_date });
    default: return [];
  }
};

// ── DB 테이블명 매핑 ──────────────────────────────────────────────────────────
export const getTableName = (file_type) => {
  if (file_type === '입고실적') return 'inbound_performance';
  if (file_type === '반입집계' || file_type === '반출집계') return 'inbound_transfer';
  if (file_type === 'WMS부족컷' || file_type === 'WMS직송컷') return 'inbound_cut_list';
  return null;
};

// ── 브랜드 매칭 (products 테이블 JOIN) ───────────────────────────────────────
// items: { item_code, item_color, ... }[]
// → brand_category 를 조회해서 각 item에 주입 (없으면 '미분류')
export const matchBrands = async (supabase, items) => {
  if (items.length === 0) return items;
  const codes = [...new Set(items.map(i => i.item_code).filter(Boolean))];
  if (codes.length === 0) return items.map(i => ({ ...i, brand_category: '미분류' }));

  const CHUNK = 200;
  const productRows = [];
  for (let i = 0; i < codes.length; i += CHUNK) {
    const { data } = await supabase
      .from('products')
      .select('item_code, item_color, brand_category')
      .in('item_code', codes.slice(i, i + CHUNK));
    if (data) productRows.push(...data);
  }

  const brandMap = {};
  productRows.forEach(p => { brandMap[`${p.item_code}__${p.item_color}`] = p.brand_category; });

  return items.map(item => ({
    ...item,
    brand_category: brandMap[`${item.item_code}__${item.item_color}`] || '미분류',
  }));
};
