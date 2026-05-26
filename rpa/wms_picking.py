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
  1. 5개 센터 순차 로그인 → 실적관리 > PALLET HISTORY → XLS 다운로드
  2. 엑셀 파싱: 오더번호·작업자·LOCATION·작업일시 추출
  3. zone = LOCATION 첫 글자 (P3/P-3 → DPC)
     shift = 작업일시 시간대 (09~18시 → 주간, 그 외 → 야간)
  4. logistics_accidents.order_no 매칭 → zone / shift / worker 업데이트
===============================================================================
"""

import argparse
import os
import sys
import tempfile
from datetime import datetime, date, timedelta
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
from supabase import create_client

# ---------------------------------------------------------------------------
load_dotenv(Path(__file__).parent.parent / '.env')

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')
WMS_USER     = os.getenv('WMS_USER')
WMS_PASSWORD = os.getenv('WMS_PASSWORD')

WMS_URL = 'https://wms.letus4u.com/'

if not all([SUPABASE_URL, SUPABASE_KEY, WMS_USER, WMS_PASSWORD]):
    print('[FATAL] .env 필수 항목 누락: VITE_SUPABASE_URL, VITE_SUPABASE_SERVICE_ROLE_KEY, WMS_USER, WMS_PASSWORD')
    sys.exit(1)

# 5개 센터 (label=드롭박스 표시명, code=value)
CENTERS = [
    ('양지1물류센터', 'YA'),
    ('양지2물류센터', 'Y2'),
    ('양지3물류센터', 'Y3'),
    ('안성물류센터',  'AN'),
    ('평택물류센터',  'SE'),
]

# ---------------------------------------------------------------------------
# 날짜 인수
# ---------------------------------------------------------------------------
def parse_args():
    yesterday = str(date.today() - timedelta(days=1))
    parser = argparse.ArgumentParser(description='WMS 피킹실적 추출')
    parser.add_argument('--start', default=yesterday, help='조회 시작일 YYYY-MM-DD (기본: 어제)')
    parser.add_argument('--end',   default=None,      help='조회 종료일 YYYY-MM-DD (기본: start와 동일)')
    parser.add_argument('--show',  action='store_true', help='브라우저 표시')
    args = parser.parse_args()
    end = args.end or args.start
    return args.start, end, args.show


# ---------------------------------------------------------------------------
# zone / shift 계산
# ---------------------------------------------------------------------------
def calc_zone(location: str) -> str | None:
    """LOCATION → zone 코드 (P3/P-3 → DPC, 그 외 첫 글자)"""
    if not location:
        return None
    loc = location.upper().replace('-', '').replace('_', '')
    if loc.startswith('P3'):
        return 'DPC'
    return location[0].upper()


def calc_shift(worked_at_str: str) -> str | None:
    """작업일시 → 주간(09~18시) / 야간"""
    if not worked_at_str:
        return None
    try:
        # '2026-05-25 14:30:00' 형식 가정
        dt = datetime.strptime(str(worked_at_str).strip()[:19], '%Y-%m-%d %H:%M:%S')
        return '주간' if 9 <= dt.hour < 18 else '야간'
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 브라우저: 센터 1개 다운로드
# ---------------------------------------------------------------------------
def download_pallet_history(
    center_label: str,
    start_date: str,
    end_date: str,
    download_dir: str,
    headless: bool = True,
) -> Path | None:
    """WMS 로그인 → PALLET HISTORY → XLS 다운로드. 결과 없으면 None."""

    with sync_playwright() as pw:
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
        print(f'  [1/6] WMS 접속: {WMS_URL}')
        page.goto(WMS_URL, timeout=30000)
        page.wait_for_load_state('networkidle')

        # ── 로그인 ────────────────────────────────────────────────────
        print('  [2/6] 로그인 중...')
        page.fill('input[name="loginId"]', WMS_USER)
        page.fill('input[name="password"]', WMS_PASSWORD)
        page.click('button#sendAuthCodeBtn')
        page.wait_for_load_state('networkidle')

        # ── 실적관리 아코디언 → PALLET HISTORY (새창) ─────────────────
        print('  [3/6] 메뉴 이동: 실적관리 > PALLET HISTORY')
        page.click('span[data-id="0011"]')          # 실적관리 아코디언
        page.wait_for_timeout(500)

        with context.expect_page() as popup_info:
            page.click('a[menuid="00110003"]')       # PALLET HISTORY (새창)

        pick_page = popup_info.value
        pick_page.wait_for_load_state('networkidle')

        # ── 센터 선택 ─────────────────────────────────────────────────
        print(f'  [4/6] 센터 선택: {center_label}')
        pick_page.select_option('select[name="warehouseId"]', label=center_label)
        pick_page.wait_for_timeout(500)

        # ── 날짜 설정 (Flatpickr JS API) ──────────────────────────────
        print(f'  [5/6] 날짜 설정: {start_date} ~ {end_date}')
        pick_page.evaluate(f"""
            const input = document.querySelector('input.dfInput.dateInput._range');
            if (input && input._flatpickr) {{
                input._flatpickr.setDate(['{start_date}', '{end_date}'], true);
                input.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}
        """)
        pick_page.wait_for_timeout(500)

        pick_page.click('button.dfBtn._sizeL._orangeLine')  # 조회하기
        pick_page.wait_for_load_state('networkidle')
        pick_page.wait_for_timeout(1000)

        # ── 엑셀 다운로드 ─────────────────────────────────────────────
        print('  [6/6] 엑셀 다운로드 중...')
        export_btn = pick_page.locator('button:has(img[alt="excel icon"])').first
        export_btn.scroll_into_view_if_needed()
        pick_page.wait_for_timeout(300)
        try:
            with pick_page.expect_download(timeout=15000) as dl_info:
                export_btn.click()
        except Exception:
            print(f'    [{center_label}] 다운로드 없음 (결과 없음), 스킵')
            context.close()
            browser.close()
            return None

        download = dl_info.value
        file_path = Path(download_dir) / f'picking_{center_label}_{start_date}_{end_date}.xlsx'
        download.save_as(str(file_path))
        print(f'    다운로드 완료: {file_path.name}')

        context.close()
        browser.close()

    return file_path


# ---------------------------------------------------------------------------
# 엑셀 파싱 → order_no별 집계
# ---------------------------------------------------------------------------
def parse_picking_excel(file_path: Path, center_label: str) -> list[dict]:
    """
    XLS 파싱 후 order_no 기준으로 집계.
    같은 오더에 작업자가 여럿이면 가장 많이 등장한 작업자로.
    반환: [{ order_no, worker, zone, shift }, ...]
    """
    try:
        df = pd.read_excel(str(file_path), dtype=str)
    except Exception as e:
        print(f'    엑셀 파싱 오류: {e}')
        return []

    df = df.fillna('')
    print(f'    [{center_label}] {len(df)}행 파싱')

    # 필수 컬럼 확인
    required = {'오더번호', '작업자', 'LOCATION', '작업일시'}
    missing = required - set(df.columns)
    if missing:
        print(f'    ⚠️  컬럼 없음: {missing} / 실제 컬럼: {list(df.columns)}')
        return []

    results = {}  # order_no → { worker: count, zone: ..., shift: ... }

    for _, row in df.iterrows():
        order_no = str(row['오더번호']).strip()
        if not order_no or order_no in ('nan', 'None', ''):
            continue

        worker   = str(row['작업자']).strip()
        location = str(row['LOCATION']).strip()
        worked_at = str(row['작업일시']).strip()

        zone  = calc_zone(location)
        shift = calc_shift(worked_at)

        if order_no not in results:
            results[order_no] = {
                'order_no':   order_no,
                'center':     center_label,
                'zone':       zone,
                'shift_type': shift,
                'location':   location,
                'workers':    {},
            }

        # 작업자 빈도 집계
        if worker:
            results[order_no]['workers'][worker] = results[order_no]['workers'].get(worker, 0) + 1

        # zone/shift는 최초 설정값 유지 (첫 행 기준)

    # 최다 빈도 작업자 확정
    records = []
    for data in results.values():
        workers = data.pop('workers')
        top_worker = max(workers, key=workers.get) if workers else None
        records.append({**data, 'worker_name': top_worker})

    return records


# ---------------------------------------------------------------------------
# logistics_accidents 매칭 업데이트
# ---------------------------------------------------------------------------
def update_accidents(all_records: list[dict]):
    """
    order_no 기준으로 logistics_accidents.zone / shift / worker 업데이트.
    이미 값이 있는 필드는 덮어쓰지 않음.
    """
    if not all_records:
        print('[DB] 업데이트할 피킹 레코드 없음')
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    order_nos = list({r['order_no'] for r in all_records})
    print(f'[DB] 총 {len(order_nos)}개 오더번호 → logistics_accidents 조회 중...')
    print(f'[DB] 샘플 오더번호: {order_nos[:5]}')

    # 기존 레코드 조회 (청크 처리)
    existing = []
    CHUNK = 200
    for i in range(0, len(order_nos), CHUNK):
        resp = supabase.table('logistics_accidents') \
            .select('id, order_no, zone, shift_type, worker_name, location') \
            .in_('order_no', order_nos[i:i + CHUNK]) \
            .execute()
        if resp.data:
            existing.extend(resp.data)

    if not existing:
        print('[DB] 매칭되는 logistics_accidents 레코드 없음')
        return

    # order_no → 피킹 데이터 맵
    pick_map = {r['order_no']: r for r in all_records}

    to_update = []
    for acc in existing:
        pick = pick_map.get(acc['order_no'])
        if not pick:
            continue

        patch = {'id': acc['id'], 'updated_at': datetime.now().isoformat()}
        changed = False

        # 기존 값 없을 때만 채움
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

    print(f'[DB] ✅ 업데이트 완료: {len(to_update)}건')


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def main():
    start_date, end_date, show = parse_args()
    headless = not show

    print(f'=== WMS 피킹실적 추출 시작: {start_date} ~ {end_date} ===')
    print(f'    대상 센터: {len(CENTERS)}개')

    all_records = []

    with tempfile.TemporaryDirectory() as tmp_dir:
        for center_label, center_code in CENTERS:
            print(f'\n── {center_label} ──')
            try:
                file_path = download_pallet_history(
                    center_label, start_date, end_date, tmp_dir, headless=headless
                )
            except PWTimeout as e:
                print(f'  ❌ 타임아웃: {e}')
                continue
            except Exception as e:
                print(f'  ❌ 오류: {e}')
                continue

            if file_path is None:
                continue

            records = parse_picking_excel(file_path, center_label)
            print(f'    집계 결과: {len(records)}건')
            all_records.extend(records)

    print(f'\n=== 전체 집계: {len(all_records)}건 ===')
    update_accidents(all_records)
    print('=== 완료 ===')


if __name__ == '__main__':
    main()
