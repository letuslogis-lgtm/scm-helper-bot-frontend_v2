/**
 * 마감 엑셀 구조 분석기 (복합 구조용)
 *
 * 사용법:
 *   node scripts/analyze_closing_excel.mjs "C:\경로\파일명.xlsx"
 *
 * 출력 파일: 같은 폴더에 파일명_분석.txt 생성
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import fs from 'fs';
import path from 'path';

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
    console.error('사용법: node analyze_closing_excel.mjs "파일경로.xlsx"');
    process.exit(1);
}

const MAX_ROWS_PER_SHEET = 200; // 시트당 최대 출력 행 수

const wb = XLSX.readFile(filePath, { cellText: true, cellDates: true });
const fileName = path.basename(filePath);
const outPath = filePath.replace(/\.(xlsx?|csv)$/i, '_분석.txt');

const lines = [];
const w = (s) => lines.push(s);

w(`파일: ${fileName}`);
w(`시트 수: ${wb.SheetNames.length}개`);
w(`시트 목록: ${wb.SheetNames.join(' | ')}`);
w('');

for (const sheetName of wb.SheetNames) {
    w('='.repeat(70));
    w(`[시트] ${sheetName}`);
    w('='.repeat(70));

    const ws = wb.Sheets[sheetName];
    if (!ws['!ref']) { w('  (비어있음)\n'); continue; }

    // 전체를 2D 배열로 읽기 (빈셀 포함)
    const rows = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        blankrows: true,
    });

    const totalRows = rows.length;
    w(`전체 행 수: ${totalRows}  (최대 ${MAX_ROWS_PER_SHEET}행 출력)`);
    w('');

    const printRows = rows.slice(0, MAX_ROWS_PER_SHEET);

    printRows.forEach((row, ri) => {
        // 빈 행 판별
        const hasContent = row.some(c => String(c).trim() !== '');
        if (!hasContent) {
            w(`  [행${ri + 1}] (빈 행)`);
            return;
        }

        // 셀값을 "컬럼번호:값" 형태로 출력 (빈 셀 제외)
        const cells = row
            .map((c, ci) => {
                const v = String(c).trim();
                return v ? `(${ci})${v}` : null;
            })
            .filter(Boolean)
            .join('  |  ');

        w(`  [행${ri + 1}] ${cells}`);
    });

    if (totalRows > MAX_ROWS_PER_SHEET) {
        w(`  ... (이하 ${totalRows - MAX_ROWS_PER_SHEET}행 생략)`);
    }
    w('');
}

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`\n분석 완료 → ${outPath}`);
console.log('이 파일을 Claude에게 공유해 주세요.');
