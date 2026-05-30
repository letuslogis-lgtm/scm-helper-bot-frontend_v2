import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase credentials in .env file.");
    console.error("Required: VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

// Initialize Supabase Admin Client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 🔒 사내 MS-SQL 접속 정보는 .env 에서 읽음 (평문 하드코딩 금지)
const mssqlConfig = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    database: process.env.MSSQL_DATABASE,
    server: process.env.MSSQL_SERVER,
    port: parseInt(process.env.MSSQL_PORT, 10),
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    // 외근/내부망 미접속 시 빠르게 실패하고, 쿼리는 60초 안에 응답하도록 강제
    connectionTimeout: 10000,   // 10초
    requestTimeout:    60000,   // 60초
};

if (!mssqlConfig.user || !mssqlConfig.password || !mssqlConfig.server || !mssqlConfig.database || !mssqlConfig.port) {
    console.error("Missing MS-SQL credentials in .env file.");
    console.error("Required: MSSQL_USER, MSSQL_PASSWORD, MSSQL_SERVER, MSSQL_PORT, MSSQL_DATABASE");
    process.exit(1);
}

const clean = (val) => val ? String(val).trim() : '';

// Supabase UPSERT 한 번 호출 당 처리할 row 수.
// (item_code, item_color) UNIQUE 제약이 있어야 onConflict 기반 UPSERT 가능.
const CHUNK_SIZE = 200;

async function loadAliases() {
    const { data, error } = await supabase.from('vendor_aliases').select('raw_name, canonical_name');
    if (error) { console.warn('vendor_aliases 로드 실패, 정규화 없이 진행:', error.message); return new Map(); }
    return new Map((data || []).map(r => [r.raw_name, r.canonical_name]));
}

function resolveDisplayVendor(vendor, productionLine, aliasMap) {
    // 외작: vendor 있으면 vendor 우선, 없으면 production_line 사용
    const raw = (vendor || productionLine || '').trim();
    if (!raw) return null;
    if (aliasMap.has(raw)) return aliasMap.get(raw); // null이면 제외
    return raw;
}

async function syncProducts() {
    const startedAt = Date.now();
    console.log(`[${new Date().toISOString()}] Starting MS-SQL to Supabase Sync...`);
    let pool;
    try {
        console.log('Loading vendor_aliases from Supabase...');
        const aliasMap = await loadAliases();
        console.log(`Loaded ${aliasMap.size} alias entries.`);

        console.log('Connecting to MS-SQL (fgdw)...');
        pool = await sql.connect(mssqlConfig);

        console.log('Fetching data from [group].[DM_단품마스터+소속법인사별단품마스터]...');
        const result = await pool.request().query(`
            SELECT
                단품코드,
                단품색상,
                [단품명칭(한글)],
                브랜드,
                회사,
                공급업체,
                생산지창고,
                출고창고,
                공장도가,
                재고구분,
                제품구분
            FROM [group].[DM_단품마스터+소속법인사별단품마스터]
        `);

        const rawData = result.recordset;
        console.log(`Successfully fetched ${rawData.length.toLocaleString()} rows from MS-SQL.`);

        // 1) MS-SQL 결과를 Supabase 컬럼 스키마로 매핑 + (item_code, item_color) 중복 제거
        const uniqueMap = new Map();
        rawData.forEach(row => {
            const itemCode = clean(row['단품코드']);
            const itemColor = clean(row['단품색상']);
            if (!itemCode) return; // item_code 없는 row 는 무시
            const priceRaw = row['공장도가'];
            const vendorVal = clean(row['공급업체']);
            const prodLine  = clean(row['생산지창고']);
            uniqueMap.set(`${itemCode}_${itemColor}`, {
                item_code: itemCode,
                item_color: itemColor,
                item_name: clean(row['단품명칭(한글)']),
                brand_category: clean(row['브랜드']),
                company_division: clean(row['회사']),
                vendor: vendorVal,
                production_line: prodLine,
                outbound_warehouse: clean(row['출고창고']),
                factory_price: priceRaw != null && priceRaw !== '' ? Number(priceRaw) : null,
                display_vendor: resolveDisplayVendor(vendorVal, prodLine, aliasMap),
                stock_type: clean(row['재고구분']) || null,
                product_type: clean(row['제품구분']) || null,
            });
        });
        const uniqueData = Array.from(uniqueMap.values());
        console.log(`After deduplication: ${uniqueData.length.toLocaleString()} unique items to upsert.`);

        // 2) Supabase UPSERT (chunked)
        //    ON CONFLICT (item_code, item_color) → 자동으로 INSERT or UPDATE 분기
        //    - 기존 SELECT → 비교 → INSERT/UPDATE 의 3단계 호출이 1단계로 줄어듦
        //    - 변경 안 된 row 도 UPSERT 되지만, PostgreSQL 의 동일값 UPDATE 는 매우 저렴함
        let processed = 0;
        for (let i = 0; i < uniqueData.length; i += CHUNK_SIZE) {
            const chunk = uniqueData.slice(i, i + CHUNK_SIZE);

            // 일시 오류 대비 최대 3회 재시도 (exponential backoff)
            let lastError = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                const { error } = await supabase
                    .from('products')
                    .upsert(chunk, { onConflict: 'item_code,item_color' });
                if (!error) { lastError = null; break; }
                lastError = error;
                console.warn(`Upsert retry ${attempt}/3 at chunk ${i.toLocaleString()}:`, error.message);
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
            if (lastError) {
                console.error(`Upsert failed at chunk starting ${i.toLocaleString()} after 3 retries:`, lastError);
                throw lastError;
            }

            processed += chunk.length;
            // 타임아웃 방지: 청크 사이 100ms 대기
            await new Promise(r => setTimeout(r, 100));
            if (processed % 10000 === 0 || processed >= uniqueData.length) {
                const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
                console.log(`Progress: ${processed.toLocaleString()} / ${uniqueData.length.toLocaleString()} (${elapsed}s elapsed)`);
            }
        }

        const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`\n[${new Date().toISOString()}] Sync Completed Successfully in ${totalSec}s.`);
        console.log(`- Total fetched from MS-SQL: ${rawData.length.toLocaleString()}`);
        console.log(`- Unique items upserted    : ${uniqueData.length.toLocaleString()}`);

    } catch (err) {
        console.error(`\n[${new Date().toISOString()}] Sync Failed:`, err);
        process.exitCode = 1;
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

syncProducts();
