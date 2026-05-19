"""
wms_extract.py
===============================================================================
WMS CUT리스트 자동 추출 → Supabase 업로드

[실행 방법]
  스케줄 (어제 날짜 자동):
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
import sys
import time
import tempfile
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
from supabase import create_client

# ---------------------------------------------------------------------------
# 0. 환경변수
# ---------------------------------------------------------------------------
load_dotenv(Path(__file__).parent.parent / '.env')

SUPABASE_URL    = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY    = os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')
WMS_USER        = os.getenv('WMS_USER')
WMS_PASSWORD    = os.getenv('WMS_PASSWORD')
HOLIDAY_API_KEY = os.getenv('HOLIDAY_API_KEY')

WMS_URL = 'https://wms.letus4u.com/'

if not all([SUPABASE_URL, SUPABASE_KEY, WMS_USER, WMS_PASSWORD]):
    print('[FATAL] .env에 필수 항목 누락: VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY, WMS_USER, WMS_PASSWORD')
    sys.exit(1)

# ---------------------------------------------------------------------------
# 1. 인수 파싱
# ---------------------------------------------------------------------------
_holiday_cache: dict = {}   # {(year, month): set of day numbers}

def fetch_holidays(year: int, month: int) -> set:
    """공공데이터포털 특일 정보 API로 해당 월 공휴일 일(day) 집합 반환"""
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
    """토/일/공휴일 여부"""
    if d.weekday() >= 5:   # 토=5, 일=6
        return True
    holidays = fetch_holidays(d.year, d.month)
    return d.day in holidays


def next_work_day(d: datetime) -> datetime:
    """d 이후 첫 번째 영업일 반환"""
    d = d + timedelta(days=1)
    while is_off_day(d):
        d += timedelta(days=1)
    return d


def calc_default_dates():
    """
    실행일 기준 추출 납기일자 범위 계산
    - 평일: 다음 영업일 하루
    - 마지막 영업일 (다음 영업일까지 쉬는 날이 있는 경우): 쉬는 날 건너뛰고 다음 영업일까지
      예) 금요일 → 토~월(공휴일 포함) 스킵 → 화요일이 첫 영업일이면 토~화 범위
    """
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start = next_work_day(today)

    # start 바로 다음 날도 영업일인지 확인 → 아니면 그 다음 영업일까지 end 확장
    # (금요일처럼 주말+공휴일이 연속되는 경우 마지막 날까지 end)
    end = start
    candidate = start + timedelta(days=1)
    while is_off_day(candidate):
        candidate += timedelta(days=1)
    # candidate = start 이후 첫 영업일
    # start~candidate 사이에 쉬는 날이 있으면 end = candidate
    if (candidate - start).days > 1:
        end = candidate

    return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')


def parse_args():
    default_start, default_end = calc_default_dates()
    parser = argparse.ArgumentParser(description='WMS CUT리스트 추출')
    parser.add_argument('--center', required=True, help='WMS 센터명 (예: 양지1물류센터)')
    parser.add_argument('--start',  default=default_start,
                        help='조회 시작일 YYYY-MM-DD (기본: 다음 영업일)')
    parser.add_argument('--end',    default=None,
                        help='조회 종료일 YYYY-MM-DD (기본: start와 동일, 금요일은 월요일)')
    args = parser.parse_args()
    end = args.end or (default_end if args.start == default_start else args.start)
    return args.center, args.start, end

# ---------------------------------------------------------------------------
# 2. Excel → DB 컬럼 매핑 (WmsShortageList.jsx EXCEL_TO_DB 와 동일)
# ---------------------------------------------------------------------------
EXCEL_TO_DB = {
    'WAVE명':          'wave_name',
    'WAVE 타입':       'wave_type',
    '오더번호':        'order_no',
    '오더건명':        'order_name',
    'OWNER':           'brand',
    '유통채널':        'channel',
    '품목ID':          'item_code',
    '제품구분':        'item_category',
    '공급업체명':      'vendor',
    'CUT수량':         'shortage_qty',
    '구분':            'category',
    '피킹여부':        'is_picked',
    '미출여부':        'is_unshipped',
    '조치사항':        'action_note',
    '매출여부':        'is_sales',
    '취소대상여부':    'is_cancel',
    '최초 등록자':     'wms_registered_by',
    '최초 등록 일시':  'wms_registered_at',
    '최종 변경자':     'wms_updated_by',
    '최종 변경 일시':  'wms_updated_at',
}

# ---------------------------------------------------------------------------
# 3. 브라우저 자동화
# ---------------------------------------------------------------------------
def download_cut_list(center: str, start_date: str, end_date: str, download_dir: str) -> Path:
    """WMS에서 CUT리스트 엑셀을 다운로드하고 파일 경로를 반환"""

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
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
        print(f'[1/5] WMS 접속 중: {WMS_URL}')
        page.goto(WMS_URL, timeout=30000)
        page.wait_for_load_state('networkidle')

        # ── 로그인 ──────────────────────────────────────────────
        print('[2/5] 로그인 중...')
        page.fill('input[name="loginId"]', WMS_USER)
        page.fill('input[name="password"]', WMS_PASSWORD)
        page.click('button#sendAuthCodeBtn')
        page.wait_for_load_state('networkidle')

        # ── 메뉴 이동 (새창) ─────────────────────────────────────
        print('[3/5] 메뉴 이동: 피킹/출고관리 > 부족량 CUT 관리')
        page.click('span[data-id="0009"]')               # 상위 메뉴 펼치기
        with context.expect_page() as popup_info:
            page.click('a[menuid="00090010"]')           # 부족량 CUT 관리 (새창)

        cut_page = popup_info.value
        cut_page.wait_for_load_state('networkidle')

        cut_page.click('#resultTable2HeadBox')               # CUT리스트 관리 탭
        cut_page.wait_for_load_state('networkidle')

        # ── 센터 드롭박스 선택 ────────────────────────────────────
        print(f'[4/6] 센터 선택: {center}')
        cut_page.select_option('select[name="warehouseId"]', label=center)
        cut_page.wait_for_timeout(500)

        # ── 날짜 설정 (Flatpickr JS API) ──────────────────────────
        print(f'[5/6] 날짜 설정: {start_date} ~ {end_date}')
        cut_page.evaluate(f"""
            const input = document.querySelector('input.dfInput.dateInput._range');
            if (input && input._flatpickr) {{
                input._flatpickr.setDate(['{start_date}', '{end_date}'], true);
                input.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}
        """)
        cut_page.wait_for_timeout(500)

        cut_page.click('button.dfBtn._orangeLine')           # 조회하기 버튼
        cut_page.wait_for_load_state('networkidle')
        cut_page.wait_for_selector(
            'button.exportXlsxBtn[data-target="resultTable2"]',
            state='visible', timeout=60000
        )

        # ── 엑셀 다운로드 ─────────────────────────────────────────
        print('[6/6] 엑셀 다운로드 중...')

        # 1차 클릭 후 WMS 자체 다이얼로그(저장 확인) 처리
        cut_page.click('button.exportXlsxBtn[data-target="resultTable2"]')
        cut_page.wait_for_timeout(2000)

        save_btn = cut_page.get_by_role('button', name='저장', exact=True)
        if save_btn.count() > 0 and save_btn.is_visible():
            # 다이얼로그 "저장" 버튼 클릭
            with cut_page.expect_download(timeout=60000) as dl_info:
                save_btn.click()
        else:
            # 다이얼로그 없음 → 재클릭으로 다운로드
            with cut_page.expect_download(timeout=60000) as dl_info:
                cut_page.click('button.exportXlsxBtn[data-target="resultTable2"]')

        download = dl_info.value
        file_path = Path(download_dir) / f'cut_list_{start_date}_{end_date}.xlsx'
        download.save_as(str(file_path))
        print(f'    다운로드 완료: {file_path.name}')

        context.close()
        browser.close()

    return file_path

# ---------------------------------------------------------------------------
# 4. 파싱 + Supabase 업로드
# ---------------------------------------------------------------------------
def parse_and_upload(file_path: Path, upload_date: str, center: str):
    df = pd.read_excel(file_path, dtype=str)
    df = df.fillna('')

    print(f'    엑셀 파싱: {len(df)}행, 컬럼: {list(df.columns)}')

    records = []
    for _, row in df.iterrows():
        rec = {
            'upload_date':   upload_date,
            'source_center': center,
            'uploaded_by':   'RPA',
        }
        for excel_col, db_col in EXCEL_TO_DB.items():
            if excel_col in df.columns:
                val = str(row[excel_col]).strip()
                rec[db_col] = val if val not in ('', 'nan', 'None') else None

        # shortage_qty → 정수 변환
        if rec.get('shortage_qty'):
            try:
                rec['shortage_qty'] = int(float(rec['shortage_qty']))
            except (ValueError, TypeError):
                rec['shortage_qty'] = 0

        if rec.get('shortage_qty', 0) > 0:  # 0건 제외
            records.append(rec)

    if not records:
        print('    업로드할 데이터 없음 (0건 제외 후)')
        return 0

    # 엑셀 내 중복 행 제거 (자연키 기준 마지막 행 유지)
    seen = {}
    for rec in records:
        key = (rec.get('source_center'), rec.get('upload_date'),
               rec.get('order_no'), rec.get('item_code'), rec.get('wave_name'))
        seen[key] = rec
    records = list(seen.values())
    print(f'    중복 제거 후: {len(records)}건')

    print(f'    유효 데이터: {len(records)}건 → Supabase 업로드 중...')
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # upsert: 자연키 충돌 시 WMS 원본 필드만 업데이트 (action_logs 연결 보존)
    WMS_UPDATE_COLS = [
        'wave_type', 'order_name', 'brand', 'channel', 'item_category',
        'vendor', 'shortage_qty', 'category', 'is_picked', 'is_unshipped',
        'action_note', 'is_sales', 'is_cancel',
        'wms_registered_by', 'wms_registered_at', 'wms_updated_by', 'wms_updated_at',
        'upload_date', 'uploaded_by',
    ]

    CHUNK = 500
    uploaded = 0
    for i in range(0, len(records), CHUNK):
        chunk = records[i:i + CHUNK]
        supabase.table('wms_shortage_list').upsert(
            chunk,
            on_conflict='source_center,upload_date,order_no,item_code,wave_name',
            ignore_duplicates=False,
        ).execute()
        uploaded += len(chunk)
        print(f'    진행: {uploaded}/{len(records)}')

    return uploaded

# ---------------------------------------------------------------------------
# 5. 메인
# ---------------------------------------------------------------------------
def main():
    center, start_date, end_date = parse_args()
    print(f'=== WMS CUT리스트 추출 시작: [{center}] {start_date} ~ {end_date} ===')

    with tempfile.TemporaryDirectory() as tmp_dir:
        try:
            file_path = download_cut_list(center, start_date, end_date, tmp_dir)
        except PWTimeout as e:
            print(f'[ERROR] 브라우저 타임아웃: {e}')
            sys.exit(1)
        except Exception as e:
            print(f'[ERROR] 다운로드 실패: {e}')
            raise

        uploaded = parse_and_upload(file_path, start_date, center)

    print(f'=== 완료: [{center}] {uploaded}건 업로드 ===')

if __name__ == '__main__':
    main()
