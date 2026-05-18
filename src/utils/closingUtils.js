/**
 * 물류 마감 자동화 — 핵심 처리 유틸
 */

import * as XLSX from 'xlsx';
import XLSXStyle from 'xlsx-js-style';

// ─── 업로드 타입별 필드 정의 ──────────────────────────────────────
export const UPLOAD_TYPES = {
    inbound: {
        label: '입고실적',
        fields: [
            { key: 'company',       label: '회사',       required: true  },
            { key: 'warehouse',     label: '창고',       required: true  },
            { key: 'inbound_type',  label: '입고구분',   required: true  },
            { key: 'item_code',     label: '단품코드',   required: true  },
            { key: 'item_color',    label: '단품색상',   required: false },
            { key: 'quantity',      label: '수량',       required: true  },
            { key: 'last_modifier', label: '최종변경자', required: false },
        ],
    },
    transfer: {
        label: '반출입집계',
        fields: [
            { key: 'company',        label: '회사',       required: true  },
            { key: 'from_warehouse', label: '반출창고',   required: false },
            { key: 'to_warehouse',   label: '반입창고',   required: false },
            { key: 'item_code',      label: '단품코드',   required: false },
            { key: 'transfer_type',  label: '반출입구분', required: false },
            { key: 'quantity',       label: '수량',       required: true  },
            { key: 'amount',         label: '금액',       required: false },
        ],
    },
    cut_picking: {
        label: 'CUT/직송 피킹',
        fields: [],  // 자동 파싱 (컬럼 매핑 불필요)
    },
    direct_cut: {
        label: '직송 CUT',
        fields: [],
    },
    returns: {
        label: '반품실적',
        fields: [],  // 자동 파싱
    },
    parcel: {
        label: '택배출고포장',
        fields: [
            { key: 'company',   label: '회사',     required: true  },
            { key: 'warehouse', label: '창고',     required: true  },
            { key: 'quantity',  label: '수량',     required: false },
            { key: 'parcel_no', label: '운송번호', required: false },
        ],
    },
    outbound_order: {
        label: '물류출고금액',
        fields: [],  // 자동 파싱
    },
    wms_wave: {
        label: '운송·피킹 실적',
        fields: [],  // 자동 파싱
    },
    logistics_cost: {
        label: '물류비 정산',
        fields: [],  // 자동 파싱
    },
};

// 자동 파싱(하드코딩) 타입 목록
export const HARDCODED_TYPES = new Set([
    'inbound', 'cut_picking', 'returns', 'outbound_order', 'wms_wave', 'logistics_cost',
]);

// ─── WAVE 타입별 운송출고 해당여부 ────────────────────────────────
const WAVE_ELIGIBILITY = {
    'AS(경인)':   false,
    'AS(지방)':   true,
    '경인(소액)': false,
    '경인(현장)': true,
    '지방(권역)': true,
    '지방(현장)': true,
    '택배':       false,
    '수출':       false,
    '전시품오더': true,
};

const EXCLUDED_DELIVERY_CENTERS = ['고객센터', '양지센터'];
const PARCEL_ITEM_PREFIXES = ['HVCS40', 'HCS40'];
const SLOWBED_PREFIX = 'S';

// ─── 헬퍼 함수들 ─────────────────────────────────────────────────

function isParcelItem(itemCode) {
    if (!itemCode) return false;
    const code = String(itemCode).toUpperCase();
    return PARCEL_ITEM_PREFIXES.some(p => code.startsWith(p));
}

function parseNum(val) {
    if (val == null || val === '') return 0;
    const n = Number(String(val).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
}

// JS Date 문자열 → YYYY-MM-DD
function parseJsDate(val) {
    if (!val) return null;
    const s = String(val).trim();
    if (!s) return null;
    try {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    } catch { return null; }
}

// WAVE명 → WAVE 타입 파싱 (wms_wave 피킹금액 파일용)
function parseWaveTypeFromName(waveName) {
    if (!waveName) return null;
    // "[04/01] " 형태의 날짜 접두어 제거
    const core = waveName.replace(/^\[[\d\/]+\]\s*/, '').trim();

    if (/AS\(지방\)/.test(core)) return 'AS(지방)';
    if (/AS\(경인\)/.test(core)) return 'AS(경인)';
    if (/^AS/.test(core)) return 'AS(경인)';
    if (/수출/.test(core)) return '수출';
    if (/^지\d/.test(core)) return '지방(권역)';
    if (/^경\d+[~\-]/.test(core)) return '경인(현장)';  // 경NN-거래처 or 경NN~NN
    if (/^[A-Z]{2}\d/.test(core)) return '경인(소액)';  // 담당자코드 (FA03, FB05 등)
    if (/택배/.test(core)) return '택배';
    if (/전시품/.test(core)) return '전시품오더';
    return null;
}

// combined "코드-색상" 문자열을 마지막 '-' 기준으로 분리
function splitItemId(itemId) {
    const s = String(itemId ?? '').trim();
    const idx = s.lastIndexOf('-');
    if (idx <= 0) return { item_code: s, item_color: '' };
    return { item_code: s.slice(0, idx), item_color: s.slice(idx + 1) };
}

// ─── products 캐시 ────────────────────────────────────────────────
let _productsCache = null;
async function getProductsMap(supabase) {
    if (_productsCache) return _productsCache;
    const { data } = await supabase
        .from('products')
        .select('item_code, item_color, brand_category, company_division, factory_price');
    const map = {};
    (data ?? []).forEach(p => {
        map[`${p.item_code}_${p.item_color ?? ''}`] = p;
        if (!map[p.item_code]) map[p.item_code] = p;
    });
    _productsCache = map;
    return map;
}

export function clearProductsCache() { _productsCache = null; }

// ─── 기존 방식 (manual mapping) 헬퍼 ─────────────────────────────
function applyMapping(row, mapping) {
    const out = {};
    Object.entries(mapping).forEach(([field, srcCol]) => {
        if (srcCol) out[field] = row[srcCol] ?? '';
    });
    return out;
}

// ─── 워크북 파서들 ────────────────────────────────────────────────

/** File 1: 브랜드별 출고실적금액 */
function* parseOutboundRows(wb) {
    for (const sheetName of wb.SheetNames) {
        if (sheetName.endsWith('X')) continue;          // 해당없음X 시트 제외
        if (sheetName.includes('단품정보')) continue;

        const ws = wb.Sheets[sheetName];
        if (!ws['!ref']) continue;
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r[0] || isNaN(Number(String(r[0]).trim()))) continue; // 번호(0) 숫자만

            const item_code  = String(r[14] ?? '').trim();
            const item_color = String(r[15] ?? '').trim();
            const warehouse  = String(r[30] ?? '').trim();
            const amount     = parseNum(r[31]);
            const brand      = String(r[32] ?? '').trim() || null;
            const qty        = parseNum(r[16]);

            if (!amount && !qty) continue;
            yield { item_code, item_color, warehouse, amount, brand, qty, raw: r };
        }
    }
}

/** File 2: CUT금액/직송금액 (cut_picking + direct_cut) */
function* parseCutRows(wb) {
    for (const sheetName of wb.SheetNames) {
        if (sheetName.includes('단품정보')) continue;

        const isDirect = sheetName.includes('직송');
        const subType  = isDirect ? 'direct_cut' : 'cut_picking';

        const ws = wb.Sheets[sheetName];
        if (!ws['!ref']) continue;
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            const itemId = String(r[6] ?? '').trim();
            if (!itemId) continue;

            const qty    = parseNum(r[9]);
            const amount = parseNum(r[22]);
            if (!qty && !amount) continue;

            const { item_code, item_color } = splitItemId(itemId);
            yield {
                subType,
                item_code, item_color,
                waveName:     String(r[0] ?? '').trim(),
                waveType:     String(r[1] ?? '').trim(),
                company:      String(r[4] ?? '').trim(),
                qty,
                factoryPrice: parseNum(r[21]),
                amount,
                isPicked:     String(r[11] ?? '').trim().toUpperCase(),
                raw: r,
            };
        }
    }
}

/** File 3: 양지3센터 브랜드별 피킹금액 */
function* parseWmsWaveRows(wb) {
    for (const sheetName of wb.SheetNames) {
        if (sheetName.includes('비대상')) continue;
        if (sheetName.includes('단품정보')) continue;

        const ws = wb.Sheets[sheetName];
        if (!ws['!ref']) continue;
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            const owner = String(r[0] ?? '').trim();
            if (!owner) continue; // 합계행(빈 OWNER) 및 빈 행 제외

            const itemId = String(r[3] ?? '').trim();
            if (!itemId) continue;

            const qty    = parseNum(r[4]);
            const amount = parseNum(r[15]);
            if (!qty && !amount) continue;

            const { item_code, item_color } = splitItemId(itemId);
            const waveName = String(r[8] ?? '').trim();
            yield {
                item_code, item_color,
                owner,
                waveName,
                waveType:     parseWaveTypeFromName(waveName),
                orderName:    String(r[9] ?? '').trim(),
                qty,
                factoryPrice: parseNum(r[14]),
                amount,
                raw: r,
            };
        }
    }
}

/** File 4: 브랜드별 반품실적금액 */
function* parseReturnsRows(wb) {
    for (const sheetName of wb.SheetNames) {
        if (sheetName.includes('단품정보')) continue;
        const isReturn = sheetName.includes('반품');
        const isRefund = sheetName.includes('반불');
        if (!isReturn && !isRefund) continue;

        const returnType = isRefund ? '반품불가' : '반품실적';

        const ws = wb.Sheets[sheetName];
        if (!ws['!ref']) continue;
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r[0] || isNaN(Number(String(r[0]).trim()))) continue; // 번호(0) 숫자만

            const item_code  = String(r[6] ?? '').trim();
            const item_color = String(r[7] ?? '').trim();
            if (!item_code) continue;

            yield {
                item_code, item_color,
                returnType,
                date:         parseJsDate(String(r[4] ?? '')),
                amount:       parseNum(r[15]),   // 반품금액(공장도가 기준)
                factoryPrice: parseNum(r[14]),
                raw: r,
            };
        }
    }
}

/** File 7: 입고실적금액 */
function* parseInboundRows(wb) {
    for (const sheetName of wb.SheetNames) {
        // 반입X 시트 제외
        if (sheetName.includes('반입X') || /[XＸ]$/.test(sheetName)) continue;

        const isOutbound = sheetName.includes('반출');
        // 창고 파싱: (양3) 포함 여부
        const warehouse = sheetName.includes('양3') ? '양지3센터' : '양지센터';

        const ws = wb.Sheets[sheetName];
        if (!ws['!ref']) continue;
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r[0] || isNaN(Number(String(r[0]).trim()))) continue; // 번호(0) 숫자만

            const item_code  = String(r[4] ?? '').trim();
            const item_color = String(r[5] ?? '').trim();
            if (!item_code) continue;

            const sign = isOutbound ? -1 : 1;
            yield {
                item_code, item_color,
                warehouse,
                isOutbound,
                date:        parseJsDate(String(r[2] ?? '')),
                qty:         parseNum(r[7])  * sign,
                amount:      parseNum(r[9])  * sign,
                inboundType: String(r[18] ?? '').trim(),  // 입고유형
                productType: String(r[15] ?? '').trim(),  // 제품구분
                raw: r,
            };
        }
    }
}

/** Files 5 & 6: 물류비 정산내역 (시디즈/아코) */
function parseLogisticsCostRows(wb) {
    const hasSidiz = wb.SheetNames.includes('시디즈');
    const hasAco   = wb.SheetNames.includes('아코');
    if (!hasSidiz && !hasAco) return [];

    const mainSheet = hasSidiz ? '시디즈' : '아코';
    const company   = hasSidiz ? '시디즈' : '아코(일룸)';
    const amtCol    = hasSidiz ? 5 : 3;  // 시디즈=col(5), 아코=col(3)

    const ws = wb.Sheets[mainSheet];
    if (!ws['!ref']) return [];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const result = [];
    for (let i = 1; i < rows.length && i <= 6; i++) {
        const r = rows[i];
        const label  = String(r[1] ?? '').trim();
        if (!label) continue;
        const amount = parseNum(r[amtCol]);
        result.push({ company, label, amount, rowIdx: i });
    }
    return result;
}

// ─── 메인 처리 함수 ───────────────────────────────────────────────
/**
 * @param {object} params
 * @param {string}   params.uploadType
 * @param {object}   [params.workbook]   - XLSX workbook (하드코딩 타입)
 * @param {object[]} [params.rawData]    - sheet_to_json 결과 (manual 타입)
 * @param {object}   [params.mapping]    - 컬럼 매핑 (manual 타입)
 * @param {string}   params.closingDate  - YYYY-MM-DD
 * @param {number}   params.uploadId
 * @param {object}   params.supabase
 */
export async function processClosingData({ uploadType, workbook, rawData, mapping, closingDate, uploadId, supabase }) {
    const productsMap = await getProductsMap(supabase);

    const rawRows    = [];
    const summaryAcc = {};

    const periodType = closingDate.endsWith('-01') ? 'monthly' : 'daily';

    const addToSummary = (key, partial) => {
        if (!summaryAcc[key]) summaryAcc[key] = { ...partial, quantity: 0, amount: 0 };
        summaryAcc[key].quantity += partial.quantity ?? 0;
        summaryAcc[key].amount   += partial.amount   ?? 0;
    };

    const baseFields = { upload_id: uploadId, closing_date: closingDate };
    const summBase   = { period_type: periodType, period_date: closingDate, upload_id: uploadId };

    // ── 하드코딩 타입 (workbook 기반) ──────────────────────────────
    if (workbook && HARDCODED_TYPES.has(uploadType)) {

        // ── outbound_order ──────────────────────────────────────────
        if (uploadType === 'outbound_order') {
            let idx = 0;
            for (const item of parseOutboundRows(workbook)) {
                const product  = productsMap[`${item.item_code}_${item.item_color}`] ?? productsMap[item.item_code] ?? null;
                const brand    = item.brand || product?.brand_category || null;
                const company  = product?.company_division || null;

                // 일룸 양지3 택배 품목 제외
                if (brand === '일룸' && item.warehouse.includes('양지3') && isParcelItem(item.item_code)) continue;
                if (brand === '시디즈' && item.warehouse.includes('양지3') && isParcelItem(item.item_code)) continue;

                rawRows.push({ ...baseFields, upload_type: 'outbound_order', row_index: idx++,
                    company, warehouse: item.warehouse, item_code: item.item_code,
                    item_color: item.item_color, quantity: item.qty, brand,
                    factory_price: product?.factory_price ?? null, amount: item.amount, raw_json: item.raw });

                const sk = `${periodType}|${closingDate}|outbound_order|${company ?? ''}|${item.warehouse}|${brand ?? ''}||`;
                addToSummary(sk, { ...summBase, summary_type: 'outbound_order',
                    company, warehouse: item.warehouse, brand, inbound_type: null,
                    wave_type: null, is_eligible: null, quantity: item.qty, amount: item.amount });
            }

        // ── cut_picking + direct_cut ────────────────────────────────
        } else if (uploadType === 'cut_picking') {
            let idx = 0;
            for (const item of parseCutRows(workbook)) {
                const product      = productsMap[`${item.item_code}_${item.item_color}`] ?? productsMap[item.item_code] ?? null;
                const brand        = product?.brand_category || null;
                const factoryPrice = item.factoryPrice || product?.factory_price || 0;
                const amount       = item.amount || (factoryPrice * item.qty);
                const st           = item.subType; // 'cut_picking' | 'direct_cut'

                rawRows.push({ ...baseFields, upload_type: st, row_index: idx++,
                    company: item.company, warehouse: null, item_code: item.item_code,
                    item_color: item.item_color, quantity: item.qty, brand,
                    factory_price: factoryPrice, amount, raw_json: item.raw });

                const sk = `${periodType}|${closingDate}|${st}||${item.company ?? ''}|${brand ?? ''}||${item.waveType ?? ''}`;
                addToSummary(sk, { ...summBase, summary_type: st,
                    company: item.company, warehouse: null, brand, inbound_type: null,
                    wave_type: item.waveType || null, is_eligible: null, quantity: item.qty, amount });
            }

        // ── wms_wave ────────────────────────────────────────────────
        } else if (uploadType === 'wms_wave') {
            let idx = 0;
            for (const item of parseWmsWaveRows(workbook)) {
                const product      = productsMap[`${item.item_code}_${item.item_color}`] ?? productsMap[item.item_code] ?? null;
                const brand        = product?.brand_category || item.owner || null;
                const factoryPrice = item.factoryPrice || product?.factory_price || 0;
                const warehouse    = '양지3센터';

                // WAVE 해당여부 판정
                let isEligible = WAVE_ELIGIBILITY[item.waveType] ?? null;
                if (item.waveName.includes('대전')) isEligible = true;
                if (EXCLUDED_DELIVERY_CENTERS.some(c => warehouse.includes(c))) isEligible = false;
                if (item.waveType === '전시품오더' && !item.waveName.includes('현장')) isEligible = false;
                if (item.waveType === '경인(현장)' && item.waveName.includes('교차')) isEligible = false;

                rawRows.push({ ...baseFields, upload_type: 'wms_wave', row_index: idx++,
                    company: item.owner, warehouse, item_code: item.item_code,
                    item_color: item.item_color, quantity: item.qty, brand,
                    factory_price: factoryPrice, amount: item.amount,
                    wave_name: item.waveName, wave_type: item.waveType, is_eligible: isEligible,
                    raw_json: item.raw });

                const sk = `${periodType}|${closingDate}|wms_wave||${warehouse}|${brand ?? ''}||${item.waveType ?? ''}`;
                addToSummary(sk, { ...summBase, summary_type: 'wms_wave',
                    company: item.owner, warehouse, brand, inbound_type: null,
                    wave_type: item.waveType, is_eligible: isEligible, quantity: item.qty, amount: item.amount });
            }

        // ── returns ─────────────────────────────────────────────────
        } else if (uploadType === 'returns') {
            let idx = 0;
            for (const item of parseReturnsRows(workbook)) {
                const product  = productsMap[`${item.item_code}_${item.item_color}`] ?? productsMap[item.item_code] ?? null;
                const brand    = product?.brand_category || null;
                const company  = product?.company_division || null;
                const amount   = item.amount || (item.factoryPrice * 1); // 수량은 금액에 포함됨

                rawRows.push({ ...baseFields, upload_type: 'returns', row_index: idx++,
                    company, warehouse: null, item_code: item.item_code,
                    item_color: item.item_color, quantity: 0, brand,
                    factory_price: item.factoryPrice, amount, inbound_type: item.returnType,
                    raw_json: item.raw });

                const sk = `${periodType}|${closingDate}|returns|${company ?? ''}||${brand ?? ''}|${item.returnType}|`;
                addToSummary(sk, { ...summBase, summary_type: 'returns',
                    company, warehouse: null, brand, inbound_type: item.returnType,
                    wave_type: null, is_eligible: null, quantity: 0, amount });
            }

        // ── inbound ─────────────────────────────────────────────────
        } else if (uploadType === 'inbound') {
            let idx = 0;
            for (const item of parseInboundRows(workbook)) {
                const product  = productsMap[`${item.item_code}_${item.item_color}`] ?? productsMap[item.item_code] ?? null;
                const brand    = product?.brand_category || null;
                const company  = product?.company_division || null;

                rawRows.push({ ...baseFields, upload_type: 'inbound', row_index: idx++,
                    company, warehouse: item.warehouse, item_code: item.item_code,
                    item_color: item.item_color, quantity: item.qty, brand,
                    factory_price: product?.factory_price ?? null, amount: item.amount,
                    inbound_type: item.inboundType || (item.isOutbound ? '반출' : '입고'),
                    raw_json: item.raw });

                const inType = item.inboundType || (item.isOutbound ? '반출' : '입고');
                const sk = `${periodType}|${closingDate}|inbound|${company ?? ''}|${item.warehouse}|${brand ?? ''}|${inType}|`;
                addToSummary(sk, { ...summBase, summary_type: 'inbound',
                    company, warehouse: item.warehouse, brand, inbound_type: inType,
                    wave_type: null, is_eligible: null, quantity: item.qty, amount: item.amount });
            }

        // ── logistics_cost ──────────────────────────────────────────
        } else if (uploadType === 'logistics_cost') {
            const items = parseLogisticsCostRows(workbook);
            items.forEach((item, idx) => {
                rawRows.push({ ...baseFields, upload_type: 'logistics_cost', row_index: idx,
                    company: item.company, warehouse: '양지3센터', item_code: item.label,
                    item_color: null, quantity: 0, brand: null, factory_price: null,
                    amount: item.amount, inbound_type: item.label, raw_json: item });

                // 합계행은 summary에서 제외 (개별 항목만)
                if (!item.label.includes('합계') && !item.label.includes('계')) {
                    const sk = `${periodType}|${closingDate}|logistics_cost|${item.company}|양지3센터||${item.label}|`;
                    addToSummary(sk, { ...summBase, summary_type: 'logistics_cost',
                        company: item.company, warehouse: '양지3센터', brand: null,
                        inbound_type: item.label, wave_type: null, is_eligible: null,
                        quantity: 0, amount: item.amount });
                }
            });
        }

    // ── Manual mapping 타입 (transfer, parcel 등) ──────────────────
    } else if (rawData && mapping) {
        for (let i = 0; i < rawData.length; i++) {
            const row    = rawData[i];
            const mapped = applyMapping(row, mapping);

            const itemCode  = String(mapped.item_code  ?? '').trim();
            const itemColor = String(mapped.item_color ?? '').trim();
            const product   = productsMap[`${itemCode}_${itemColor}`] ?? productsMap[itemCode] ?? null;
            const brand     = product?.brand_category ?? null;
            const company   = String(mapped.company ?? product?.company_division ?? '').trim();
            const warehouse = String(mapped.warehouse ?? '').trim();
            const qty       = parseNum(mapped.quantity);

            const baseRaw = { ...baseFields, upload_type: uploadType, row_index: i,
                company, warehouse, item_code: itemCode || null, item_color: itemColor || null,
                quantity: qty, brand, factory_price: product?.factory_price ?? null, raw_json: row };

            if (uploadType === 'transfer') {
                const fromWh       = String(mapped.from_warehouse ?? '').trim();
                const toWh         = String(mapped.to_warehouse   ?? '').trim();
                const transferType = String(mapped.transfer_type  ?? '반출입').trim();
                const amount       = parseNum(mapped.amount);
                if (!qty && !amount) continue;
                rawRows.push({ ...baseRaw, inbound_type: transferType, amount });
                const sk = `${periodType}|${closingDate}|transfer|${company}|${fromWh}→${toWh}|${brand ?? ''}||`;
                addToSummary(sk, { ...summBase, summary_type: 'transfer',
                    company, warehouse: `${fromWh}→${toWh}`, brand, inbound_type: transferType,
                    wave_type: null, is_eligible: null, quantity: qty, amount });

            } else if (uploadType === 'parcel') {
                const parcelNo  = String(mapped.parcel_no ?? '').trim();
                if (!parcelNo && !qty) continue;
                const effectQty = qty || (parcelNo ? 1 : 0);
                rawRows.push({ ...baseRaw, quantity: effectQty, amount: 0 });
                const sk = `${periodType}|${closingDate}|parcel|${company}|${warehouse}|${brand ?? ''}||`;
                addToSummary(sk, { ...summBase, summary_type: 'parcel',
                    company, warehouse, brand, inbound_type: null,
                    wave_type: null, is_eligible: null, quantity: effectQty, amount: 0 });
            }
        }
    }

    return { rawRows, summaryRows: Object.values(summaryAcc) };
}

// ─── 보고서 엑셀 생성 ─────────────────────────────────────────────
const HEADER_STYLE = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    fill: { fgColor: { rgb: '1E40AF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
        top:    { style: 'thin', color: { rgb: 'FFFFFF' } },
        bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
        left:   { style: 'thin', color: { rgb: 'FFFFFF' } },
        right:  { style: 'thin', color: { rgb: 'FFFFFF' } },
    },
};
const CELL_STYLE = {
    font: { sz: 9 },
    alignment: { vertical: 'center' },
    border: {
        top:    { style: 'thin', color: { rgb: 'E5E7EB' } },
        bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
        left:   { style: 'thin', color: { rgb: 'E5E7EB' } },
        right:  { style: 'thin', color: { rgb: 'E5E7EB' } },
    },
};
const NUM_STYLE = { ...CELL_STYLE, alignment: { ...CELL_STYLE.alignment, horizontal: 'right' }, numFmt: '#,##0' };
const AMT_STYLE = { ...NUM_STYLE, numFmt: '#,##0' };

function makeCell(v, style) { return { v, s: style }; }
function buildSheet(headers, rows) {
    const ws = XLSXStyle.utils.aoa_to_sheet([
        headers.map(h => makeCell(h, HEADER_STYLE)),
        ...rows,
    ]);
    ws['!cols'] = headers.map(() => ({ wch: 14 }));
    ws['!rows'] = [{ hpt: 22 }];
    return ws;
}

const TYPE_LABELS = {
    inbound: '입고실적', transfer: '반출입집계', cut_picking: 'CUT피킹',
    direct_cut: '직송CUT', returns: '반품실적', parcel: '택배출고',
    outbound_order: '물류출고금액', wms_wave: '운송·피킹', logistics_cost: '물류비정산',
};

export async function generateClosingReport({ periodType, periodDate, summaryData }) {
    const wb = XLSXStyle.utils.book_new();

    const grouped = summaryData.reduce((acc, r) => {
        if (!acc[r.summary_type]) acc[r.summary_type] = [];
        acc[r.summary_type].push(r);
        return acc;
    }, {});

    Object.entries(grouped).forEach(([type, rows]) => {
        const headers  = ['브랜드', '회사', '창고/구분', '항목구분', '수량', '금액(원)'];
        const dataRows = rows.map(r => [
            makeCell(r.brand ?? '-',                           CELL_STYLE),
            makeCell(r.company ?? '-',                         CELL_STYLE),
            makeCell(r.warehouse ?? '-',                       CELL_STYLE),
            makeCell(r.inbound_type ?? r.wave_type ?? '-',     CELL_STYLE),
            makeCell(r.quantity ?? 0,                          NUM_STYLE),
            makeCell(Number(r.amount ?? 0),                    AMT_STYLE),
        ]);
        const totalQty = rows.reduce((s, r) => s + (r.quantity ?? 0), 0);
        const totalAmt = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
        dataRows.push([
            makeCell('합계', { ...CELL_STYLE, font: { bold: true, sz: 9 } }),
            makeCell('', CELL_STYLE), makeCell('', CELL_STYLE), makeCell('', CELL_STYLE),
            makeCell(totalQty, { ...NUM_STYLE, font: { bold: true, sz: 9 } }),
            makeCell(totalAmt, { ...AMT_STYLE, font: { bold: true, sz: 9 } }),
        ]);
        XLSXStyle.utils.book_append_sheet(wb, buildSheet(headers, dataRows), TYPE_LABELS[type] ?? type);
    });

    const summaryHeaders = ['항목', '브랜드', '수량 합계', '금액 합계(원)'];
    const summaryRows = Object.entries(grouped).flatMap(([type, rows]) => {
        const byBrand = rows.reduce((acc, r) => {
            const k = r.brand ?? '미분류';
            if (!acc[k]) acc[k] = { qty: 0, amt: 0 };
            acc[k].qty += r.quantity ?? 0;
            acc[k].amt += Number(r.amount ?? 0);
            return acc;
        }, {});
        return Object.entries(byBrand).map(([brand, val]) => [
            makeCell(TYPE_LABELS[type] ?? type, CELL_STYLE),
            makeCell(brand, CELL_STYLE),
            makeCell(val.qty, NUM_STYLE),
            makeCell(val.amt, AMT_STYLE),
        ]);
    });
    XLSXStyle.utils.book_append_sheet(wb, buildSheet(summaryHeaders, summaryRows), '전체요약');

    const label = periodType === 'daily' ? periodDate : periodDate.slice(0, 7);
    XLSXStyle.writeFile(wb, `물류마감_${label}.xlsx`);
}
