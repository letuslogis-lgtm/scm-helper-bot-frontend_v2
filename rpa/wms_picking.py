"""
wms_picking.py
===============================================================================
WMS PALLET HISTORY(피킹실적) 자동 추출 → logistics_accidents 매칭 업데이트

[실행 방법]
  어제(D-1) 자동:
    python rpa/wms_picking.py

  날짜 지정:
    python rpa/wms_picking.py --start 2026-05-25
    python rpa/wms_picking.py --start 2026-05-20 --end 2026-05-25

  브라우저 표시:
    python rpa/wms_picking.py --show

[처리 흐름]
  1. Playwright로 WMS 로그인 → 세션 쿠키 획득
  2. requests로 PALLET HISTORY API 호출 (5개 센터)
  3. (order_no, item_code) 기준 집계 → 최다 빈도 작업자 확정
  4. logistics_accidents.order_no 매칭 → zone / shift / worker 업데이트
===============================================================================
"""

import argparse
import os
import sys
import requests

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from datetime import datetime, date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / '.env')

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')
WMS_USER     = os.getenv('WMS_USER')
WMS_PASSWORD = os.getenv('WMS_PASSWORD')
WMS_URL      = 'https://wms.letus4u.com/'

PALLET_HISTORY_API = 'https://wms.letus4u.com/v1/performance/palletHistory/getPerformancePalletHistoryList'

CENTERS = [
    ('양지1물류센터', 'YA'),
    ('양지2물류센터', 'Y2'),
    ('양지3물류센터', 'Y3'),
    ('안성물류센터',  'AN'),
    ('평택물류센터',  'SE'),
]

if not all([SUPABASE_URL, SUPABASE_KEY, WMS_USER, WMS_PASSWORD]):
    print('[FATAL] .env 필수 항목 누락: VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY, WMS_USER, WMS_PASSWORD')
    sys.exit(1)


def parse_args():
    yesterday = str(date.today() - timedelta(days=1))
    parser = argparse.ArgumentParser(description='WMS 피킹실적 추출')
    parser.add_argument('--start', default=yesterday, help='조회 시작일 YYYY-MM-DD (기본: 어제)')
    parser.add_argument('--end',   default=None,      help='조회 종료일 YYYY-MM-DD (기본: start와 동일)')
    parser.add_argument('--show',  action='store_true', help='브라우저 표시')
    args = parser.parse_args()
    end = args.end or args.start
    return args.start, end, args.show


def calc_zone(location: str) -> str | None:
    if not location:
        return None
    loc = location.upper().replace('-', '').replace('_', '')
    if loc.startswith('P3'):
        return 'DPC'
    return location[0].upper()


def calc_shift(worked_at_str: str) -> str | None:
    if not worked_at_str:
        return None
    try:
        # API 날짜 형식: '2026-06-05T02:39:48.493'
        dt = datetime.strptime(str(worked_at_str).strip()[:19], '%Y-%m-%dT%H:%M:%S')
        return '주간' if 9 <= dt.hour < 18 else '야간'
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 1. WMS 로그인 (Playwright) → 세션 쿠키
# ---------------------------------------------------------------------------
def get_wms_cookies(headless: bool = True) -> dict:
    print('[1/3] WMS 로그인 중...')
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
            try:
                page.wait_for_selector('input[name="loginId"]', state='hidden', timeout=5000)
            except PWTimeout:
                raise RuntimeError('로그인 실패 - 아이디/비밀번호 확인 필요')
            cookies = {c['name']: c['value'] for c in context.cookies()}
            print(f'    로그인 성공 (쿠키 {len(cookies)}개)')
            return cookies
        except PWTimeout:
            raise RuntimeError('WMS 로그인 타임아웃')
        finally:
            context.close()
            browser.close()


# ---------------------------------------------------------------------------
# 2. PALLET HISTORY API 호출
# ---------------------------------------------------------------------------
def fetch_pallet_history(cookies: dict, warehouse_id: str, start_date: str, end_date: str) -> list[dict]:
    sess = requests.Session()
    sess.cookies.update(cookies)
    from_dt = start_date.replace('-', '')
    to_dt   = end_date.replace('-', '')
    params = {
        'warehouseId':    warehouse_id,
        'ownerIdArrName': '',
        'itemId':         '',
        'fromToDt':       f'{from_dt} ~ {to_dt}',
        'fromDt':         from_dt,
        'toDt':           to_dt,
        'historyYn':      'N',
        'ownerIdArr':     '',
    }
    resp = sess.get(
        PALLET_HISTORY_API,
        params=params,
        headers={'Accept': 'application/json', 'Referer': WMS_URL},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, list) else []


# ---------------------------------------------------------------------------
# 3. API 응답 → (order_no, item_code) 집계
# ---------------------------------------------------------------------------
def parse_pallet_history_rows(rows: list[dict], center_label: str) -> list[dict]:
    print(f'    [{center_label}] {len(rows)}건 파싱')
    results = {}

    for r in rows:
        order_no  = (r.get('orderNo')    or '').strip()
        item_code = (r.get('itemId')     or '').strip() or None
        if not order_no:
            continue

        worker    = (r.get('fstUsrNm')   or '').strip()
        location  = (r.get('toLocation') or '').strip()
        worked_at = (r.get('fstSysDt')   or '').strip()

        zone  = calc_zone(location)
        shift = calc_shift(worked_at)

        key = (order_no, item_code)
        if key not in results:
            results[key] = {
                'order_no':   order_no,
                'item_code':  item_code,
                'center':     center_label,
                'zone':       zone,
                'shift_type': shift,
                'location':   location,
                'workers':    {},
            }
        if worker:
            results[key]['workers'][worker] = results[key]['workers'].get(worker, 0) + 1

    records = []
    for data in results.values():
        workers = data.pop('workers')
        top_worker = max(workers, key=workers.get) if workers else None
        records.append({**data, 'worker_name': top_worker})

    return records


# ---------------------------------------------------------------------------
# 4. logistics_accidents 매칭 업데이트
# ---------------------------------------------------------------------------
def update_accidents(all_records: list[dict]):
    if not all_records:
        print('[DB] 업데이트할 피킹 레코드 없음')
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    order_nos = list({r['order_no'] for r in all_records})
    print(f'[DB] 총 {len(order_nos)}개 오더번호 → logistics_accidents 조회 중...')
    print(f'[DB] 샘플 오더번호: {order_nos[:5]}')

    existing = []
    CHUNK = 200
    for i in range(0, len(order_nos), CHUNK):
        resp = supabase.table('logistics_accidents') \
            .select('id, order_no, item_code, zone, shift_type, worker_name, location') \
            .in_('order_no', order_nos[i:i + CHUNK]) \
            .execute()
        if resp.data:
            existing.extend(resp.data)

    if not existing:
        print('[DB] 매칭되는 logistics_accidents 레코드 없음')
        return

    pick_map = {(r['order_no'], r['item_code']): r for r in all_records}

    to_update = []
    for acc in existing:
        pick = pick_map.get((acc['order_no'], acc.get('item_code')))
        if not pick:
            continue

        patch = {'id': acc['id'], 'updated_at': datetime.now().isoformat()}
        changed = False

        if not acc.get('zone') and pick.get('zone'):
            patch['zone'] = pick['zone']
            changed = True
        if not acc.get('shift_type') and pick.get('shift_type'):
            patch['shift_type'] = pick['shift_type']
            changed = True
        if not acc.get('worker_name') and pick.get('worker_name'):
            patch['worker_name'] = pick['worker_name']
            changed = True
        if not acc.get('location') and pick.get('location'):
            patch['location'] = pick['location']
            changed = True

        if changed:
            to_update.append(patch)

    if not to_update:
        print('[DB] 새롭게 매칭할 항목 없음 (이미 모두 설정됨)')
        return

    print(f'[DB] {len(to_update)}건 업데이트 중...')
    for i in range(0, len(to_update), CHUNK):
        supabase.table('logistics_accidents') \
            .upsert(to_update[i:i + CHUNK], on_conflict='id') \
            .execute()

    print(f'[DB] 업데이트 완료: {len(to_update)}건')


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def main():
    start_date, end_date, show = parse_args()
    headless = not show

    print(f'=== WMS 피킹실적 추출 시작: {start_date} ~ {end_date} ===')
    print(f'    대상 센터: {len(CENTERS)}개')

    cookies = get_wms_cookies(headless=headless)

    print('[2/3] PALLET HISTORY API 호출 중...')
    all_records = []
    for center_label, warehouse_id in CENTERS:
        print(f'\n── {center_label} ──')
        try:
            rows = fetch_pallet_history(cookies, warehouse_id, start_date, end_date)
            print(f'    API 응답: {len(rows)}건')
            records = parse_pallet_history_rows(rows, center_label)
            print(f'    집계 결과: {len(records)}건')
            all_records.extend(records)
        except Exception as e:
            print(f'    오류: {e}')

    print(f'\n=== 전체 집계: {len(all_records)}건 ===')
    print('[3/3] logistics_accidents 업데이트 중...')
    update_accidents(all_records)
    print('=== 완료 ===')


if __name__ == '__main__':
    main()
