"""
wms_stock_report.py
===============================================================================
WMS 재고보유현황 자동 수집 → Supabase 저장

[실행 방법]
  python rpa/wms_stock_report.py              # 오늘 날짜 기준 실행
  python rpa/wms_stock_report.py --date 2026-06-01  # 날짜 지정
  python rpa/wms_stock_report.py --show       # 브라우저 창 표시

[동작 흐름]
  1. Playwright로 WMS 로그인 → 세션 쿠키 획득
  2. requests로 stockHolding API 호출 (5개 창고)
  3. Supabase products.factory_price 조회 → 재고금액 계산
  4. 이상값 탐지 (수량 > 10,000)
  5. 창고×화주 단위로 집계 → wms_stock_snapshots upsert

[필요 .env 항목]
  WMS_USER=아이디
  WMS_PASSWORD=비밀번호
  VITE_SUPABASE_URL=...
  VITE_SUPABASE_SERVICE_ROLE_KEY=...
===============================================================================
"""

import argparse
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / '.env')

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')
WMS_USER     = os.getenv('WMS_USER')
WMS_PASSWORD = os.getenv('WMS_PASSWORD')
WMS_URL      = 'https://wms.letus4u.com/'

STOCK_API = 'https://wms.letus4u.com/v1/inventory/stockHolding/list'
OWNER_API = 'https://wms.letus4u.com/v1/master/owner/list'

ANOMALY_QTY_THRESHOLD = 10_000

WAREHOUSES = {
    'YA': '양지1물류센터',
    'Y2': '양지2물류센터',
    'Y3': '양지3물류센터',
    'AN': '안성물류센터',
    'SE': '평택물류센터',
}

if not all([SUPABASE_URL, SUPABASE_KEY, WMS_USER, WMS_PASSWORD]):
    print('[FATAL] .env 필수 항목 누락: VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY, WMS_USER, WMS_PASSWORD')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# 1. WMS 로그인 (Playwright) → 세션 쿠키
# ---------------------------------------------------------------------------
def get_wms_cookies(headless: bool = True) -> dict:
    print('[1/5] WMS 로그인 중...')
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=headless,
            args=['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        )
        context = browser.new_context(
            user_agent=(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            ),
            viewport={'width': 1920, 'height': 1080},
        )
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            if (!window.chrome) { window.chrome = { runtime: {} }; }
        """)
        page = context.new_page()
        try:
            page.goto(WMS_URL, timeout=30000)
            page.wait_for_load_state('networkidle')
            page.fill('input[name="loginId"]', WMS_USER)
            page.fill('input[name="password"]', WMS_PASSWORD)
            page.click('button#sendAuthCodeBtn')
            page.wait_for_load_state('networkidle')

            # 로그인 폼이 사라졌는지로 성공 판단 (WMS는 SPA — URL 변경 없음)
            try:
                page.wait_for_selector('input[name="loginId"]', state='hidden', timeout=5000)
            except PWTimeout:
                raise RuntimeError(f'로그인 실패 - 로그인 폼이 여전히 표시됨 (아이디/비밀번호 확인 필요)')

            cookies = {c['name']: c['value'] for c in context.cookies()}
            print(f'    로그인 성공 (쿠키 {len(cookies)}개)')
            return cookies
        except PWTimeout:
            raise RuntimeError('WMS 로그인 타임아웃')
        finally:
            context.close()
            browser.close()


# ---------------------------------------------------------------------------
# 2. WMS stockHolding API 수집
# ---------------------------------------------------------------------------
def fetch_stock_data(cookies: dict) -> list[dict]:
    print('[2/5] WMS 재고현황 수집 중...')
    sess = requests.Session()
    sess.cookies.update(cookies)
    headers = {
        'Accept': 'application/json',
        'Referer': 'https://wms.letus4u.com/v1/inventory/stockHolding',
    }

    # 화주 마스터 (ownerId → ownerNm)
    owner_map = {}
    try:
        resp = sess.get(OWNER_API, headers=headers, timeout=30)
        if resp.ok:
            owners = resp.json()
            if isinstance(owners, list):
                owner_map = {o['ownerId']: o.get('ownerNm', o['ownerId'])
                             for o in owners if 'ownerId' in o}
                print(f'    화주 마스터: {len(owner_map)}개')
    except Exception as e:
        print(f'    화주 마스터 조회 실패 (무시): {e}')

    all_rows = []
    for wid, wname in WAREHOUSES.items():
        try:
            params = (f'warehouseId={wid}&ownerIdArrName=&zoneIdArrName='
                      f'&searchType=itemId&searchText=&ownerIdArr=&zoneIdArr=')
            resp = sess.get(f'{STOCK_API}?{params}', headers=headers, timeout=60)
            resp.raise_for_status()
            rows = resp.json()
            if isinstance(rows, list):
                valid = [r for r in rows
                         if not str(r.get('locationId', '')).upper().startswith('Y')]
                for r in valid:
                    r['_wid']      = wid
                    r['_wname']    = wname
                    r['_owner_nm'] = owner_map.get(r.get('ownerId', ''), r.get('ownerId', '미확인'))
                    r['_item_nm']  = r.get('itemNm') or r.get('itemName') or r.get('itemNm2') or ''
                all_rows.extend(valid)
                print(f'    {wname}: {len(valid):,}건')
        except Exception as e:
            print(f'    {wname} 수집 오류: {e}')

    print(f'    수집 완료: 총 {len(all_rows):,}건')
    return all_rows


# ---------------------------------------------------------------------------
# 3. Supabase products.factory_price 로드 (item_code + item_color 기반 조회)
# ---------------------------------------------------------------------------
def load_prices_for_items(item_codes: list[str]) -> dict:
    """WMS에서 수집한 item_code에 해당하는 단가만 조회 (전체 스캔 방지)"""
    if not item_codes:
        return {}

    base_codes = list({code.split('-')[0] for code in item_codes if code})
    print(f'[3/5] 대상 품목 {len(item_codes)}개 (base code {len(base_codes)}개) 단가 조회 중...')

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
# 4. 집계 (창고×화주×SKU) → 이상값 분리 → 창고×화주 합산
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# 4. Supabase upsert (품목 단위)
# ---------------------------------------------------------------------------
def upsert_snapshots(rows: list[dict]):
    print(f'[5/5] Supabase upsert 중... ({len(rows)}건)')
    CHUNK = 500
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        result = (supabase.from_('wms_stock_snapshots')
                  .upsert(chunk, on_conflict='snapshot_date,warehouse_id,company_id,item_code')
                  .execute())
        if hasattr(result, 'error') and result.error:
            raise RuntimeError(f'upsert 오류: {result.error}')
    print(f'    저장 완료: {len(rows)}건')


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def run(snapshot_date: str, headless: bool = True):
    print('=' * 60)
    print(f'WMS 재고보유현황 수집 시작 | 기준일: {snapshot_date}')
    print('=' * 60)
    start = time.time()

    # ── Phase 1: WMS 데이터 수집 ──────────────────────────────────────────
    cookies  = get_wms_cookies(headless=headless)
    raw_rows = fetch_stock_data(cookies)

    # ── Phase 2: 수집된 item_code로만 단가 조회 ───────────────────────────
    item_codes = list({str(r.get('itemId', '')).strip() for r in raw_rows if r.get('itemId')})
    price_map  = load_prices_for_items(item_codes)

    # ── Phase 3: 레코드 구성 ──────────────────────────────────────────────
    print('[4/5] 품목별 레코드 구성 중...')
    all_records = []
    anomaly_cnt = unpriced_cnt = 0

    for r in raw_rows:
        wid      = r.get('_wid', '')
        wname    = r.get('_wname', '')
        oid      = r.get('ownerId', '')
        onm      = r.get('_owner_nm', oid)
        item_code = str(r.get('itemId', '')).strip()
        item_name = r.get('_item_nm', '')
        loc       = str(r.get('locationId', '')).upper()

        # Y로 시작하는 로케이션 제외
        if loc.startswith('Y'):
            continue

        try:
            qty = float(r.get('stockQty') or 0)
        except (TypeError, ValueError):
            qty = 0.0

        if qty > ANOMALY_QTY_THRESHOLD:
            anomaly_cnt += 1
            continue

        price = price_map.get(item_code, 0.0)
        if price <= 0:
            unpriced_cnt += 1

        all_records.append({
            'snapshot_date':  snapshot_date,
            'warehouse_id':   wid,
            'warehouse_name': wname,
            'company_id':     oid,
            'item_code':      item_code,
            'item_name':      item_name,
            'stock_qty':      int(qty),
            'factory_price':  int(price),
            'stock_amount':   int(qty * price),
        })

    total_amt = sum(r['stock_amount'] for r in all_records)
    print(f'    품목 단위: {len(all_records)}건 | '
          f'이상값 제외: {anomaly_cnt}건 | 단가 미등록: {unpriced_cnt}건 | '
          f'총 재고금액: {total_amt:,.0f}원')

    upsert_snapshots(all_records)

    elapsed = time.time() - start
    print('=' * 60)
    print(f'완료! ({elapsed:.1f}초)')
    print('=' * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='WMS 재고보유현황 수집')
    parser.add_argument('--date', default=datetime.now().strftime('%Y-%m-%d'),
                        help='기준일 YYYY-MM-DD (기본: 오늘)')
    parser.add_argument('--show', action='store_true', help='브라우저 창 표시')
    args = parser.parse_args()
    run(snapshot_date=args.date, headless=not args.show)
