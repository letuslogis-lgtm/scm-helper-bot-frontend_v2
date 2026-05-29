/**
 * sync_incoming_plans.mjs
 * ============================================================
 * MS-SQL 입고계획 → Supabase incoming_plans 동기화
 *
 * - 퍼시스(fursys) / 시디즈(sidiz) 2개 테이블 조회
 * - 오늘 이후 미완료 건만 sync
 * - MS-SQL 연결 불가(외근/내부망 미접속) 시 조용히 스킵
 * - worker.mjs에서 3분마다 호출됨
 * ============================================================
 */

import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ---------------------------------------------------------------------------
// 환경변수
// ---------------------------------------------------------------------------
const SUPABASE_URL             = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[FATAL] Supabase 환경변수 누락');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const mssqlConfig = {
    user:     process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    database: process.env.MSSQL_DATABASE,
    server:   process.env.MSSQL_SERVER,
    port:     parseInt(process.env.MSSQL_PORT, 10),
    pool:     { max: 5, min: 0, idleTimeoutMillis: 15000 },
    options:  { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 8000,   // 외근 시 빠르게 실패
    requestTimeout:    30000,
};

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------
const CHUNK_SIZE = 200;
const TODAY = new Date().toISOString().split('T')[0];

const TARGETS = [
    { company: 'fursys', table: 'fursys.DM_ERP_퍼시스_입고계획조회및등록_WBY0010_M01' },
    { company: 'sidiz',  table: 'sidiz.DM_ERP_시디즈_입고계획조회및등록_WBY0010_M01'  },
];

const clean = (val) => (val != null ? String(val).trim() : '');

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------
async function syncIncomingPlans() {
    const startedAt = Date.now();
    console.log(`[${new Date().toISOString()}] 입고계획 sync 시작 (기준일: ${TODAY})`);

    let pool;
    try {
        pool = await sql.connect(mssqlConfig);
        console.log('  MS-SQL 연결 성공');

        let totalRows = 0;

        for (const { company, table } of TARGETS) {
            console.log(`  [${company}] 조회 중...`);

            const result = await pool.request().query(`
                SELECT 입고예정일, 입고차수, 단품코드, 단품색상, 단품명칭,
                       입고구분, 공급업체, 입고유형, 입고예정량, 완료여부
                FROM ${table}
                WHERE 입고예정일 >= '${TODAY}'
            `);

            const rows = result.recordset
                .map(r => ({
                    company,
                    plan_date:        r['입고예정일']
                        ? new Date(r['입고예정일']).toISOString().split('T')[0]
                        : null,
                    plan_seq:         clean(r['입고차수']),
                    item_code:        clean(r['단품코드']),
                    item_color:       clean(r['단품색상']),
                    item_name:        clean(r['단품명칭']) || null,
                    inbound_type:     clean(r['입고구분'])  || null,
                    vendor:           clean(r['공급업체'])  || null,
                    inbound_category: clean(r['입고유형'])  || null,
                    planned_qty:      r['입고예정량'] != null ? Number(r['입고예정량']) : null,
                    is_completed:     r['완료여부'] === 'Y',
                    synced_at:        new Date().toISOString(),
                }))
                .filter(r => r.item_code); // 단품코드 없는 행 제외

            console.log(`  [${company}] ${rows.length}건`);

            // 1) 과거 완료/지난 계획 정리
            await supabase.from('incoming_plans')
                .delete()
                .eq('company', company)
                .lt('plan_date', TODAY);

            // 2) Upsert (청크 단위)
            for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
                const chunk = rows.slice(i, i + CHUNK_SIZE);
                const { error } = await supabase
                    .from('incoming_plans')
                    .upsert(chunk, {
                        onConflict: 'company,item_code,item_color,plan_date,plan_seq',
                    });
                if (error) throw new Error(`[${company}] upsert 실패: ${error.message}`);
            }

            totalRows += rows.length;
            console.log(`  [${company}] ✅ upsert 완료`);
        }

        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`[${new Date().toISOString()}] ✅ 완료 — 총 ${totalRows}건 (${elapsed}s)`);

    } catch (err) {
        // 내부망 미접속(외근) 시 조용히 스킵
        const isNetworkError = ['ETIMEOUT', 'ECONNREFUSED', 'ESOCKET', 'ENOTFOUND'].includes(err.code);
        if (isNetworkError) {
            console.warn(`[SKIP] MS-SQL 접속 불가 (내부망 외부) — ${err.message}`);
            process.exit(0);
        }
        console.error('[ERROR] sync 실패:', err.message);
        process.exit(1);
    } finally {
        if (pool) await pool.close();
    }
}

syncIncomingPlans();
