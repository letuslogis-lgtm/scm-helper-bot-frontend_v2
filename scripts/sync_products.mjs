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
    }
};

if (!mssqlConfig.user || !mssqlConfig.password || !mssqlConfig.server || !mssqlConfig.database || !mssqlConfig.port) {
    console.error("Missing MS-SQL credentials in .env file.");
    console.error("Required: MSSQL_USER, MSSQL_PASSWORD, MSSQL_SERVER, MSSQL_PORT, MSSQL_DATABASE");
    process.exit(1);
}

const clean = (val) => val ? String(val).trim() : '';

// Supabase UPSERT 한 번 호출 당 처리할 row 수.
// (item_code, item_color) UNIQUE 제약이 있어야 onConflict 기반 UPSERT 가능.
const CHUNK_SIZE = 2000;

async function syncProducts() {
    const startedAt = Date.now();
    console.log(`[${new Date().toISOString()}] Starting MS-SQL to Supabase Sync...`);
    let pool;
    try {
        console.log('Connecting to MS-SQL (fgdw)...');
        pool = await sql.connect(mssqlConfig);

        console.log('Fetching data from [group].[DM_단품마스터+소속법인사별단품마스터]...');
        const result = await pool.request().query(`
            SELECT
                단품코드,
                단품색상,
                브랜드,
                회사,
                공급업체,
                생산지창고,
                출고창고
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
            uniqueMap.set(`${itemCode}_${itemColor}`, {
                item_code: itemCode,
                item_color: itemColor,
                brand_category: clean(row['브랜드']),
                company_division: clean(row['회사']),
                vendor: clean(row['공급업체']),
                production_line: clean(row['생산지창고']),
                outbound_warehouse: clean(row['출고창고']),
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
            const { error } = await supabase
                .from('products')
                .upsert(chunk, { onConflict: 'item_code,item_color' });

            if (error) {
                console.error(`Upsert error at chunk starting ${i.toLocaleString()}:`, error);
                throw error;
            }

            processed += chunk.length;
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
