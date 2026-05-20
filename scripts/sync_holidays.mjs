/**
 * sync_holidays.mjs
 * ==================
 * 공공데이터포털 한국천문연구원 특일 정보 API → Supabase company_holidays 동기화
 *
 * [실행 방법]
 *   node scripts/sync_holidays.mjs
 *   npm run sync:holidays
 *
 * [필요 .env 항목]
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_SERVICE_ROLE_KEY
 *   HOLIDAY_API_KEY
 *
 * [동기화 범위]
 *   올해 + 내년 전체 (24개월)
 *   임시공휴일 포함 — 실행 시점의 최신 API 데이터 기준
 *
 * [RPA 자동화 관리 등록]
 *   실행 명령어 : node scripts/sync_holidays.mjs
 *   트리거      : auto  / cron: 0 3 1 * *  (매월 1일 새벽 3시)
 *   임시공휴일 발표 시: UI "▶ 실행" 버튼으로 즉시 수동 반영
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL              = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const HOLIDAY_API_KEY           = process.env.HOLIDAY_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !HOLIDAY_API_KEY) {
    console.error('[FATAL] .env에 필수 항목 누락');
    console.error('  필요: VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY, HOLIDAY_API_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const API_BASE = 'http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo';

// ---------------------------------------------------------------------------
// 특정 연월의 공휴일(isHoliday=Y) 목록을 반환
// @returns {{ holiday_date: string, name: string }[]}
// ---------------------------------------------------------------------------
async function fetchHolidaysForMonth(year, month) {
    const params = new URLSearchParams({
        serviceKey: HOLIDAY_API_KEY,
        solYear:    String(year),
        solMonth:   String(month).padStart(2, '0'),
        numOfRows:  '30',
        _type:      'json',
    });

    const res = await fetch(`${API_BASE}?${params}`, {
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`API HTTP ${res.status} (${year}-${month})`);

    const json = await res.json();
    const raw  = json?.response?.body?.items?.item;
    if (!raw) return [];

    // 항목이 1개면 객체, 여러 개면 배열로 반환됨
    const items = Array.isArray(raw) ? raw : [raw];

    return items
        .filter(item => item.isHoliday === 'Y')
        .map(item => ({
            holiday_date: String(item.locdate).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
            name:         item.dateName,
        }));
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------
async function syncHolidays() {
    const startedAt   = Date.now();
    const currentYear = new Date().getFullYear();
    const years       = [currentYear, currentYear + 1];

    console.log(`[${new Date().toISOString()}] 공휴일 동기화 시작 (${years.join(', ')}년)`);

    // ── 1. API 조회 ────────────────────────────────────────────────────────
    const all = [];
    for (const year of years) {
        let yearCount = 0;
        for (let month = 1; month <= 12; month++) {
            const holidays = await fetchHolidaysForMonth(year, month);
            if (holidays.length > 0) {
                const names = holidays.map(h => h.name).join(', ');
                console.log(`  ${year}-${String(month).padStart(2, '0')}: ${names}`);
                all.push(...holidays);
                yearCount += holidays.length;
            }
        }
        console.log(`  → ${year}년 소계: ${yearCount}건`);
    }
    console.log(`\n전체 공휴일 조회 완료: ${all.length}건`);

    // ── 2. 기존 데이터 삭제 (대상 연도 전체 삭제 후 재삽입) ───────────────
    console.log('\n기존 데이터 삭제 중...');
    for (const year of years) {
        const { error } = await supabase
            .from('company_holidays')
            .delete()
            .gte('holiday_date', `${year}-01-01`)
            .lte('holiday_date', `${year}-12-31`);
        if (error) throw new Error(`DELETE 실패 (${year}): ${error.message}`);
        console.log(`  ${year}년 기존 데이터 삭제 완료`);
    }

    // ── 3. 신규 삽입 ───────────────────────────────────────────────────────
    if (all.length === 0) {
        console.log('\nAPI에서 공휴일 데이터가 없습니다 — 삽입 스킵');
        return;
    }

    // company_holidays 테이블에 name 컬럼이 있으면 함께 저장, 없으면 holiday_date만 저장
    console.log(`\n${all.length}건 삽입 중...`);
    let insertError;
    ({ error: insertError } = await supabase.from('company_holidays').insert(all));
    if (insertError?.message?.includes("'name' column")) {
        // name 컬럼 미존재 → holiday_date만 재시도
        console.log("  [INFO] name 컬럼 없음 → holiday_date만 저장합니다");
        console.log("  [INFO] name 컬럼 추가: Supabase Studio > SQL Editor 에서 실행");
        console.log("         ALTER TABLE company_holidays ADD COLUMN IF NOT EXISTS name text;");
        const dateOnly = all.map(h => ({ holiday_date: h.holiday_date }));
        ({ error: insertError } = await supabase.from('company_holidays').insert(dateOnly));
    }
    if (insertError) throw new Error(`INSERT 실패: ${insertError.message}`);

    // ── 4. 결과 출력 ───────────────────────────────────────────────────────
    const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`\n[${new Date().toISOString()}] 동기화 완료: ${all.length}건 저장 (${totalSec}s)`);
    console.log('\n=== 저장된 공휴일 목록 ===');
    all.forEach(h => console.log(`  ${h.holiday_date}  ${h.name}`));
}

syncHolidays().catch(err => {
    console.error(`\n[${new Date().toISOString()}] 동기화 실패:`, err);
    process.exitCode = 1;
});
