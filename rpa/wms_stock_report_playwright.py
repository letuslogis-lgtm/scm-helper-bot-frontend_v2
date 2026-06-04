"""
wms_stock_report_playwright.py
===============================================================================
WMS 창고별 재고보유현황 자동 수집 → Supabase 저장 (Full Playwright 방식)

wms_stock_report.py 의 hybrid(requests API) 방식을 전체 Playwright 자동화로 재작성.

[실행 방법]
  python rpa/wms_stock_report_playwright.py              # 오늘 날짜 기준
  python rpa/wms_stock_report_playwright.py --date 2026-06-01
  python rpa/wms_stock_report_playwright.py --show       # 브라우저 창 표시

[필요 .env 항목]
  WMS_USER=아이디
  WMS_PASSWORD=비밀번호
  VITE_SUPABASE_URL=...
  VITE_SUPABASE_SERVICE_ROLE_KEY=...

[TODO] 첫 실행 후 다운로드된 엑셀을 열어 실제 컬럼명을 확인하고
       EXCEL_TO_DB 매핑을 수정해야 합니다.
===============================================================================
"""

import argparse
import os
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
from supabase import create_client
import pandas as pd

load_dotenv(Path(__file__).parent.parent / '.env')

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')
WMS_USER     = os.getenv('WMS_USER')
WMS_PASSWORD = os.getenv('WMS_PASSWORD')
WMS_URL      = 'https://wms.letus4u.com/'

ANOMALY_QTY_THRESHOLD = 10_000

# (드롭박스 표시명, warehouseId)
CENTERS = [
    ('양지1물류센터', 'YA'),
    ('양지2물류센터', 'Y2'),
    ('양지3물류센터', 'Y3'),
    ('안성물류센터',  'AN'),
    ('평택물류센터',  'SE'),
]

EXCEL_TO_DB = {
    'OWNER':        'company_id',
    'LOCATION ID':  'location',
    '품목ID':       'item_code',
    '품목명':       'item_name',
    '현 재고 수량': 'stock_qty',
}

if not all([SUPABASE_URL, SUPABASE_KEY, WMS_USER, WMS_PASSWORD]):
    print('[FATAL] .env 필수 항목 누락')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# 1. 브라우저 자동화 — 창고 1개 엑셀 다운로드
# ---------------------------------------------------------------------------
def download_stock_excel(
    center_label: str,
    download_dir: str,
    headless: bool = True,
) -> Path | None:
    """WMS 로그인 → 창고별 재고보유현황 → 창고 선택 → 조회 → 엑셀 다운로드."""

    with sync_playwright() as pw:
        browser = None
        context = None
        try:
            browser = pw.chromium.launch(
                headless=headless,
                args=['--disable-blink-features=AutomationControlled', '--no-sandbox', '--start-maximized'],
            )
            context = browser.new_context(
                user_agent=(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/120.0.0.0 Safari/537.36'
                ),
                accept_downloads=True,
                viewport={'width': 1920, 'height': 1080},
            )
            context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko'] });
                if (!window.chrome) { window.chrome = { runtime: {} }; }
            """)

            page = context.new_page()
            print(f'  [1/5] WMS 접속')
            page.goto(WMS_URL, timeout=30000)
            page.wait_for_load_state('networkidle')

            # ── 로그인 ────────────────────────────────────────────────────
            print('  [2/5] 로그인 중...')
            page.fill('input[name="loginId"]', WMS_USER)
            page.fill('input[name="password"]', WMS_PASSWORD)
            page.click('button#sendAuthCodeBtn')
            page.wait_for_load_state('networkidle')

            # ── 재고관리 아코디언 → 창고별 재고보유현황 (새창) ───────────
            print('  [3/5] 메뉴 이동: 재고관리 > 창고별 재고보유현황')
            page.click('span.menuIcon[data-id="0010"]')
            page.wait_for_timeout(500)

            with context.expect_page() as popup_info:
                page.click('a[menuid="00100010"]')

            stock_page = popup_info.value
            stock_page.wait_for_load_state('networkidle')

            # ── 창고 선택 ─────────────────────────────────────────────────
            print(f'  [4/5] 창고 선택: {center_label}')
            stock_page.select_option('select[name="warehouseId"]', label=center_label)
            stock_page.wait_for_timeout(500)

            stock_page.click('button.dfBtn._sizeL._orangeLine')  # 조회하기
            stock_page.wait_for_load_state('networkidle')
            stock_page.wait_for_timeout(1000)

            # ── 엑셀 다운로드 ─────────────────────────────────────────────
            print('  [5/5] 엑셀 다운로드 중...')
            export_btn = stock_page.locator('button.exportXlsxBtn').first
            try:
                export_btn.wait_for(state='visible', timeout=90000)
            except PWTimeout:
                print(f'    [{center_label}] 엑셀 버튼 미표시 → 조회 결과 없음, 스킵')
                return None

            export_btn.scroll_into_view_if_needed()
            stock_page.wait_for_timeout(500)

            try:
                with stock_page.expect_download(timeout=60000) as dl_info:
                    export_btn.click()
                    try:
                        save_btn = stock_page.get_by_role('button', name='저장', exact=True)
                        save_btn.wait_for(state='visible', timeout=15000)
                        print('    저장 다이얼로그 확인 → "저장" 클릭')
                        save_btn.click()
                    except Exception:
                        pass  # 팝업 없이 바로 다운로드되는 경우 — 정상
            except Exception:
                print(f'    [{center_label}] 다운로드 없음, 스킵')
                return None

            download = dl_info.value
            file_path = Path(download_dir) / f'stock_{center_label}.xlsx'
            download.save_as(str(file_path))
            print(f'    다운로드 완료: {file_path.name}')
            return file_path

        finally:
            if context:
                try: context.close()
                except Exception: pass
            if browser:
                try: browser.close()
                except Exception: pass


# ---------------------------------------------------------------------------
# 2. 엑셀 파싱 → SKU 레코드 반환
# ---------------------------------------------------------------------------
def parse_excel(file_path: Path, center_label: str, warehouse_id: str) -> list[dict]:
    df = pd.read_excel(str(file_path), dtype=str)
    df = df.fillna('')
    print(f'    엑셀 파싱: {len(df)}행 / 컬럼: {list(df.columns)}')

    rows = []
    for _, row in df.iterrows():
        rec = {'_wid': warehouse_id, '_wname': center_label}
        for excel_col, db_col in EXCEL_TO_DB.items():
            if excel_col in df.columns:
                val = str(row[excel_col]).strip()
                rec[db_col] = val if val not in ('', 'nan', 'None') else None

        # LOCATION이 Y로 시작하는 건 제외 (wms_stock_report.py 동일 규칙)
        loc = (rec.get('location') or '').upper()
        if loc.startswith('Y'):
            continue

        # stock_qty → 숫자 변환
        try:
            rec['stock_qty'] = float(rec.get('stock_qty') or 0)
        except (ValueError, TypeError):
            rec['stock_qty'] = 0.0

        rows.append(rec)

    return rows


# ---------------------------------------------------------------------------
# 3. 단가 조회 (WMS item_code 목록 기준으로만 조회)
# ---------------------------------------------------------------------------
def load_prices_for_items(item_codes: list[str]) -> dict:
    """WMS에서 수집한 item_code에 해당하는 단가만 조회 (전체 스캔 방지)"""
    if not item_codes:
        return {}

    # WMS item_code(A1234-BK) → base code(A1234) 추출
    base_codes = list({code.split('-')[0] for code in item_codes if code})
    print(f'[단가 조회] 대상 품목 {len(item_codes)}개 (base code {len(base_codes)}개) 단가 조회 중...')

    price_map = {}
    try:
        CHUNK = 500
        for i in range(0, len(base_codes), CHUNK):
            result = (supabase.from_('products')
                      .select('item_code, item_color, factory_price')
                      .in_('item_code', base_codes[i:i + CHUNK])
                      .not_.is_('factory_price', 'null')
                      .gt('factory_price', 0)
                      .execute())
            for r in (result.data or []):
                code  = (r.get('item_code') or '').strip()
                color = (r.get('item_color') or '').strip()
                price = r.get('factory_price')
                if not code or not price:
                    continue
                combined = f'{code}-{color}' if color else code
                price_map[combined] = float(price)
                if color:
                    price_map.setdefault(code, float(price))
    except Exception as e:
        print(f'    단가 조회 실패: {e}')

    print(f'    단가 로드: {len(price_map):,}건')
    return price_map


# ---------------------------------------------------------------------------
# 3-2. Supabase upsert
# ---------------------------------------------------------------------------
def upsert_snapshots(rows: list[dict]):
    print(f'[upsert] {len(rows)}건 → wms_stock_snapshots')
    CHUNK = 500
    for i in range(0, len(rows), CHUNK):
        supabase.from_('wms_stock_snapshots') \
            .upsert(rows[i:i + CHUNK], on_conflict='snapshot_date,warehouse_id,company_id,item_code,location') \
            .execute()
    print(f'    저장 완료: {len(rows)}건')


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description='WMS 창고별 재고보유현황 수집 (Playwright)')
    parser.add_argument('--date', default=datetime.now().strftime('%Y-%m-%d'),
                        help='기준일 YYYY-MM-DD (기본: 오늘)')
    parser.add_argument('--show', action='store_true', help='브라우저 창 표시')
    args = parser.parse_args()
    headless = not args.show

    print('=' * 60)
    print(f'WMS 재고보유현황 수집 시작 (Playwright) | 기준일: {args.date}')
    print('=' * 60)
    start = time.time()

    # ── Phase 1: WMS 데이터 수집 ──────────────────────────────────────────
    all_raw: list[dict] = []
    MAX_RETRIES = 3

    with tempfile.TemporaryDirectory() as tmp_dir:
        for center_label, warehouse_id in CENTERS:
            print(f'\n── {center_label} ──')
            file_path = None
            last_error = None

            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    file_path = download_stock_excel(center_label, tmp_dir, headless=headless)
                    last_error = None
                    break
                except PWTimeout as e:
                    last_error = e
                    wait = 2 ** attempt
                    if attempt < MAX_RETRIES:
                        print(f'  [WARN] 타임아웃 (시도 {attempt}/{MAX_RETRIES}) → {wait}초 후 재시도')
                        time.sleep(wait)
                    else:
                        print(f'  [ERROR] 타임아웃 ({MAX_RETRIES}회 실패): {e}')
                except Exception as e:
                    last_error = e
                    wait = 2 ** attempt
                    if attempt < MAX_RETRIES:
                        print(f'  [WARN] 오류 (시도 {attempt}/{MAX_RETRIES}) → {wait}초 후 재시도')
                        time.sleep(wait)
                    else:
                        print(f'  [ERROR] 다운로드 실패 ({MAX_RETRIES}회): {e}')

            if last_error or file_path is None:
                continue

            raw_rows = parse_excel(file_path, center_label, warehouse_id)
            print(f'    유효 행: {len(raw_rows)}건')
            all_raw.extend(raw_rows)

    # ── Phase 2: 수집된 item_code로만 단가 조회 ───────────────────────────
    item_codes = list({r.get('item_code') or '' for r in all_raw if r.get('item_code')})
    price_map = load_prices_for_items(item_codes)

    # ── Phase 3: 레코드 구성 + upsert ─────────────────────────────────────
    all_records: list[dict] = []
    anomaly_cnt = unpriced_cnt = 0

    for r in all_raw:
        item_code = r.get('item_code') or ''
        qty = r.get('stock_qty', 0.0)

        if qty > ANOMALY_QTY_THRESHOLD:
            anomaly_cnt += 1
            continue

        price = price_map.get(item_code, 0)
        if price <= 0:
            unpriced_cnt += 1

        all_records.append({
            'snapshot_date':  args.date,
            'warehouse_id':   r.get('_wid', ''),
            'warehouse_name': r.get('_wname', ''),
            'company_id':     r.get('company_id') or '',
            'brand':          r.get('company_id') or '',
            'item_code':      item_code,
            'item_name':      r.get('item_name') or '',
            'location':       r.get('location') or '',
            'stock_qty':      int(qty),
            'factory_price':  int(price),
            'stock_amount':   int(qty * price),
        })

    total_amt = sum(r['stock_amount'] for r in all_records)
    print(f'\n[결과] 품목 단위: {len(all_records)}건 | '
          f'이상값 제외: {anomaly_cnt}건 | 단가 미등록: {unpriced_cnt}건 | '
          f'총 재고금액: {total_amt:,.0f}원')

    upsert_snapshots(all_records)

    print('=' * 60)
    print(f'완료! ({time.time() - start:.1f}초)')
    print('=' * 60)


if __name__ == '__main__':
    main()
