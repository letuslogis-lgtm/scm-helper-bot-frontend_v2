"""
wms_extract.py
===============================================================================
WMS CUT리스트 자동 추출 → Supabase 업로드

[실행 방법]
  스케줄 (기본 날짜 자동):
    python rpa/wms_extract.py

  센터 지정:
    python rpa/wms_extract.py --center 양지1물류센터

  날짜 지정:
    python rpa/wms_extract.py --center 양지1물류센터 --start 2026-05-19
    python rpa/wms_extract.py --center 양지1물류센터 --start 2026-05-19 --end 2026-05-20

[필요 .env 항목]
  WMS_USER=아이디
  WMS_PASSWORD=비밀번호

[센터 목록]
  양지1물류센터 / 양지2물류센터 / 양지3물류센터 / 안성물류센터 / 평택물류센터
===============================================================================
"""

import argparse
import os
import re
import sys
import requests

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / '.env')

SUPABASE_URL    = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY    = os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')
WMS_USER        = os.getenv('WMS_USER')
WMS_PASSWORD    = os.getenv('WMS_PASSWORD')
HOLIDAY_API_KEY = os.getenv('HOLIDAY_API_KEY')

WMS_URL      = 'https://wms.letus4u.com/'
OWNER_API    = 'https://wms.letus4u.com/v1/master/owner/list'
CUT_LIST_API = 'https://wms.letus4u.com/v1/outbound/cut/cutList'

WID_MAP = {
    '양지1물류센터': 'YA',
    '양지2물류센터': 'Y2',
    '양지3물류센터': 'Y3',
    '안성물류센터':  'AN',
    '평택물류센터':  'SE',
}

if not all([SUPABASE_URL, SUPABASE_KEY, WMS_USER, WMS_PASSWORD]):
    print('[FATAL] .env에 필수 항목 누락: VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY, WMS_USER, WMS_PASSWORD')
    sys.exit(1)


# ---------------------------------------------------------------------------
# 1. 공휴일 / 영업일 계산
# ---------------------------------------------------------------------------
_holiday_cache: dict = {}


def fetch_holidays(year: int, month: int) -> set:
    cache_key = (year, month)
    if cache_key in _holiday_cache:
        return _holiday_cache[cache_key]
    if not HOLIDAY_API_KEY:
        return set()
    try:
        params = urllib.parse.urlencode({
            'serviceKey': HOLIDAY_API_KEY,
            'solYear':    year,
            'solMonth':   f'{month:02d}',
            'numOfRows':  30,
            '_type':      'xml',
        })
        url = f'http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo?{params}'
        with urllib.request.urlopen(url, timeout=5) as resp:
            root = ET.fromstring(resp.read())
        days = {
            int(item.findtext('locdate', '0')[-2:])
            for item in root.iter('item')
            if item.findtext('isHoliday') == 'Y'
        }
    except Exception as e:
        print(f'    [WARN] 공휴일 API 오류: {e} → 공휴일 체크 생략')
        days = set()
    _holiday_cache[cache_key] = days
    return days


def is_off_day(d: datetime) -> bool:
    if d.weekday() >= 5:
        return True
    return d.day in fetch_holidays(d.year, d.month)


def next_work_day(d: datetime) -> datetime:
    d = d + timedelta(days=1)
    while is_off_day(d):
        d += timedelta(days=1)
    return d


def calc_default_dates():
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start = next_work_day(today)
    end = start
    candidate = start + timedelta(days=1)
    while is_off_day(candidate):
        candidate += timedelta(days=1)
    if (candidate - start).days > 1:
        end = candidate
    return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')


ALL_CENTERS = list(WID_MAP.keys())


def parse_args():
    default_start, default_end = calc_default_dates()
    parser = argparse.ArgumentParser(description='WMS CUT리스트 추출')
    parser.add_argument('--center', required=False, default=None,
                        help='WMS 센터명 (예: 양지1물류센터). 생략 시 전체 5개 센터 순차 처리')
    parser.add_argument('--start',  default=default_start,
                        help='조회 시작일 YYYY-MM-DD (기본: 다음 영업일)')
    parser.add_argument('--end',    default=None,
                        help='조회 종료일 YYYY-MM-DD (기본: start와 동일, 금요일은 월요일)')
    parser.add_argument('--show',   action='store_true',
                        help='브라우저 창 표시 (기본: headless)')
    args = parser.parse_args()
    end = args.end or (default_end if args.start == default_start else args.start)
    centers = [args.center] if args.center else ALL_CENTERS
    return centers, args.start, end, args.show


# ---------------------------------------------------------------------------
# 2. WMS 로그인 (Playwright) → 세션 쿠키
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
# 3. API 호출
# ---------------------------------------------------------------------------
def fetch_owner_map(cookies: dict) -> dict:
    sess = requests.Session()
    sess.cookies.update(cookies)
    try:
        resp = sess.get(OWNER_API, headers={'Accept': 'application/json', 'Referer': WMS_URL}, timeout=30)
        if resp.ok:
            owners = resp.json()
            if isinstance(owners, list):
                return {o['ownerId']: o.get('ownerNm', o['ownerId'])
                        for o in owners if 'ownerId' in o}
    except Exception as e:
        print(f'    [WARN] 화주 마스터 조회 실패: {e}')
    return {}


def fetch_cut_list(cookies: dict, warehouse_id: str, start_date: str, end_date: str) -> list[dict]:
    sess = requests.Session()
    sess.cookies.update(cookies)
    from_dt = start_date.replace('-', '')
    to_dt   = end_date.replace('-', '')
    params = {
        'warehouseId':       warehouse_id,
        'ownerIdArrName':    '',
        'fromToDt':          f'{from_dt} ~ {to_dt}',
        'fromDt':            from_dt,
        'toDt':              to_dt,
        'waveTypeIdArrName': '',
        'searchType':        'itemId',
        'searchText':        '',
        'chkCond':           '',
        'ownerIdArr':        '',
        'waveTypeIdArr':     '',
    }
    resp = sess.get(
        CUT_LIST_API,
        params=params,
        headers={'Accept': 'application/json', 'Referer': WMS_URL},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, list) else []


# ---------------------------------------------------------------------------
# 4. API 응답 파싱 + Supabase 업로드
# ---------------------------------------------------------------------------
def parse_and_upload(rows: list[dict], upload_date: str, center: str,
                     owner_map: dict, supabase, alias_map: dict) -> int:
    print(f'    [{center}] API 응답 {len(rows)}건 파싱')

    records = []
    for r in rows:
        cut_qty = r.get('cutQty') or 0
        try:
            cut_qty = int(cut_qty)
        except (ValueError, TypeError):
            cut_qty = 0
        if cut_qty <= 0:
            continue  # 0건 제외

        owner_id = (r.get('ownerId') or '').strip()
        brand    = r.get('ownerNm') or owner_map.get(owner_id, owner_id) or None

        wave_name = r.get('waveNm') or None
        delivery_date = None
        if wave_name:
            m = re.search(r'\[(\d{2})/(\d{2})\]', wave_name)
            if m:
                year = upload_date[:4]
                delivery_date = f"{year}-{m.group(1)}-{m.group(2)}"

        rec = {
            'upload_date':       upload_date,
            'source_center':     center,
            'uploaded_by':       'RPA',
            'wave_name':         wave_name,
            'wave_type':         r.get('waveTypeNm') or None,
            'order_no':          (r.get('orderNo') or '').strip() or None,
            'order_name':        r.get('ormNm') or None,
            'brand':             brand,
            'channel':           r.get('channelNm') or None,
            'item_code':         (r.get('itemId') or '').strip() or None,
            'item_category':     r.get('comGoodcdNm') or None,
            'vendor':            r.get('vendorNm') or None,
            'shortage_qty':      cut_qty,
            'category':          r.get('cutGubun') or None,
            'is_picked':         r.get('isPicking'),
            'is_unshipped':      r.get('isMichul'),
            'action_note':       r.get('mainReasonRemark') or None,
            'is_sales':          r.get('isCutSale'),
            'is_cancel':         r.get('isCancel'),
            'wms_registered_by': r.get('fstUsrCd') or None,
            'wms_registered_at': r.get('fstSysDt') or None,
            'wms_updated_by':    r.get('usrCd') or None,
            'wms_updated_at':    r.get('sysDt') or None,
            'delivery_date':     delivery_date,
        }

        if not rec.get('order_no'):
            continue

        records.append(rec)

    if not records:
        print('    업로드할 데이터 없음 (0건 제외 후)')
        return 0

    # 중복 제거 (자연키 기준 마지막 행 유지)
    seen = {}
    for rec in records:
        key = (rec.get('source_center'), rec.get('upload_date'),
               rec.get('order_no'), rec.get('item_code'), rec.get('wave_name'))
        seen[key] = rec
    records = list(seen.values())
    print(f'    중복 제거 후: {len(records)}건')

    # 공급업체명 정규화 (vendor_aliases 테이블 적용)
    normalized = []
    for rec in records:
        raw = rec.get('vendor') or ''
        if raw in alias_map:
            canonical = alias_map[raw]
            if canonical is None:
                continue  # canonical=NULL → 제외 대상
            rec['vendor'] = canonical
        normalized.append(rec)
    print(f'    공급업체 정규화 후: {len(normalized)}건 (제외: {len(records) - len(normalized)}건)')
    records = normalized

    if not records:
        print('    업로드할 데이터 없음 (정규화 후 0건)')
        return 0

    print(f'    유효 데이터: {len(records)}건 → Supabase 업로드 중...')

    # upsert: 자연키 충돌 시 WMS 원본 필드만 업데이트 (action_logs 연결 보존)
    CHUNK = 500
    uploaded = 0
    total_chunks = (len(records) + CHUNK - 1) // CHUNK
    for i in range(0, len(records), CHUNK):
        chunk = records[i:i + CHUNK]
        try:
            result = supabase.table('wms_shortage_list').upsert(
                chunk,
                on_conflict='source_center,upload_date,order_no,item_code,wave_name',
                ignore_duplicates=False,
            ).execute()
            if hasattr(result, 'error') and result.error:
                raise RuntimeError(f'upsert 실패 (청크 {i // CHUNK + 1}/{total_chunks}): {result.error}')
        except Exception as e:
            print(f'    [ERROR] wms_shortage_list upsert 실패 (청크 {i // CHUNK + 1}/{total_chunks}): {e}')
            raise
        uploaded += len(chunk)
        print(f'    진행: {uploaded}/{len(records)}')

    return uploaded


# ---------------------------------------------------------------------------
# 5. 메인
# ---------------------------------------------------------------------------
def main():
    centers, start_date, end_date, show = parse_args()
    headless = not show
    print(f'=== WMS CUT리스트 추출 시작: {start_date} ~ {end_date} / 대상 센터: {len(centers)}개 ===')

    cookies = get_wms_cookies(headless=headless)

    print('[2/3] 화주 마스터 조회 + Supabase 초기화...')
    owner_map = fetch_owner_map(cookies)
    print(f'    화주 마스터: {len(owner_map)}개')

    supabase  = create_client(SUPABASE_URL, SUPABASE_KEY)
    alias_resp = supabase.table('vendor_aliases').select('raw_name,canonical_name').execute()
    alias_map  = {row['raw_name']: row['canonical_name'] for row in (alias_resp.data or [])}
    print(f'    vendor_aliases 로드: {len(alias_map)}건')

    print('[3/3] 센터별 CUT리스트 처리 중...')
    total = 0
    failed_centers = []
    for center in centers:
        warehouse_id = WID_MAP.get(center, center)
        print(f'\n── {center} ({warehouse_id}) ──')
        try:
            rows = fetch_cut_list(cookies, warehouse_id, start_date, end_date)
            print(f'    API 응답: {len(rows)}건')
            if not rows:
                print(f'    조회 결과 없음, 스킵')
                continue
            uploaded = parse_and_upload(rows, start_date, center, owner_map, supabase, alias_map)
            total += uploaded
        except Exception as e:
            print(f'    ❌ 오류: {e}')
            failed_centers.append((center, str(e)))

    success_count = len(centers) - len(failed_centers)
    print(f'\n=== 완료: 전체 {total}건 업로드, 성공 {success_count}/{len(centers)} 센터 ===')
    if failed_centers:
        print(f'❌ 실패 센터:')
        for c, err in failed_centers:
            print(f'  - {c}: {err}')
        sys.exit(1)


if __name__ == '__main__':
    main()
