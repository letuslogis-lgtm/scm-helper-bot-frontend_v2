"""
erp_inbound_plan.py
===============================================================================
ERP 관계사입고예정생성 → WMS 입고예정정보 IF 자동화

[실행 방법]
  python rpa/erp_inbound_plan.py              # 오늘 날짜 기준
  python rpa/erp_inbound_plan.py --date 2026-06-10
  python rpa/erp_inbound_plan.py --show       # 브라우저 창 표시 (디버그용)

[동작 흐름]
  1. Supabase erp_inbound_config 읽기 (is_active=true)
  2. EP 포털 로그인 → ERP SSO 접속
  3. 관계사입고예정생성 메뉴 진입
  4. 설정별 반복 (회사 × 입고예정창고 × 출고창고):
     a. 드롭다운 선택 + 조회
     b. 활성 체크박스(visibility!=hidden) 행만 선택
     c. 입고예정생성 버튼 클릭
     d. 오류/완료 팝업 처리
  5. WMS 로그인 → 입고예정정보 IF 실행

[필요 .env 항목]
  EP_USER / EP_PASSWORD
  WMS_USER / WMS_PASSWORD
  VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY

[erp_inbound_config 테이블 예시]
  company="퍼시스", input_warehouse="퍼시스양지", output_warehouse="일동안성"
===============================================================================
"""

import argparse
import os
import sys
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / '.env')

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')
EP_USER      = os.getenv('EP_USER')
EP_PASSWORD  = os.getenv('EP_PASSWORD')
WMS_USER     = os.getenv('WMS_USER')
WMS_PASSWORD = os.getenv('WMS_PASSWORD')

EP_URL    = 'https://ep.fursys.com/v3/main.do'
WMS_URL   = 'https://wms.letus4u.com/'
ERP_SYSCD = 'T05S02'

# 화면 prefix (내부 코드: 06002008 = 관계사입고예정생성)
_SCR = 'mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_06002008_form_div_work'

ERP_IDS = {
    'company':    f'{_SCR}_div_search_cbo_company_dropbuttonImageElement',
    'input_wh':   f'{_SCR}_div_search_cbo_stock_dropbuttonImageElement',
    'output_wh':  f'{_SCR}_div_search_cbo_stockOut_dropbuttonImageElement',
    'search':     f'{_SCR}_div_search_btn_search',
    'create':     f'{_SCR}_btn_createInPlan',
    'date_input': f'{_SCR}_cal_dtInPlan_calendaredit_input',
}

STEALTH_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/120.0.0.0 Safari/537.36'
)
STEALTH_INIT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3, 4, 5] });
if (!window.chrome) { window.chrome = { runtime: {} }; }
"""
SSO_BUILDER_JS = """(sysCd) => {
    const r = { success: false, url: null, error: null };
    try {
        const el = document.getElementById(sysCd);
        if (!el) { r.error = 'element not found'; return r; }
        const sysId   = el.value || '';
        const ssoKey  = el.getAttribute('key') || '';
        const ssoKey2 = el.dataset.key || '';
        const deptCd  = (document.getElementById('deptCd') || {}).value || '';
        if (!sysId) { r.error = 'sysId empty'; return r; }
        if (typeof SingleSignOn === 'undefined' || !SingleSignOn.AppInfo) {
            r.error = 'AppInfo not loaded'; return r;
        }
        const app = SingleSignOn.AppInfo.find(a => a.sysCd === sysCd);
        if (!app) { r.error = 'AppInfo entry not found'; return r; }
        let url = app.path
            .replace('[key2]', ssoKey2).replace('[id]', sysId)
            .replace('[key]',  ssoKey) .replace('[deptCd]', deptCd);
        r.url = (app.popup === 'yes') ? '/open.do?url=' + encodeURIComponent(url) : url;
        r.success = true;
    } catch(e) { r.error = e.message; }
    return r;
}"""

if not all([SUPABASE_URL, SUPABASE_KEY, EP_USER, EP_PASSWORD, WMS_USER, WMS_PASSWORD]):
    print('[FATAL] .env 필수 항목 누락 (EP_USER, EP_PASSWORD, WMS_USER, WMS_PASSWORD, SUPABASE 키)')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------------------
# 공통 브라우저 생성
# ---------------------------------------------------------------------------
def _new_browser(pw, headless: bool):
    browser = pw.chromium.launch(
        headless=headless,
        args=['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
    )
    ctx = browser.new_context(
        user_agent=STEALTH_UA,
        viewport={'width': 1920, 'height': 1080},
        locale='ko-KR',
        timezone_id='Asia/Seoul',
    )
    ctx.add_init_script(STEALTH_INIT)
    return browser, ctx


# ---------------------------------------------------------------------------
# 1. Supabase 설정 로드
# ---------------------------------------------------------------------------
def load_configs() -> list[dict]:
    res = (supabase.from_('erp_inbound_config')
           .select('*')
           .eq('is_active', True)
           .order('sort_order')
           .execute())
    configs = res.data or []
    print(f'[CONFIG] 활성 설정 {len(configs)}개')
    for c in configs:
        print(f'  - {c["company"]} | 입고창고: {c["input_warehouse"]} | 출고창고: {c["output_warehouse"]}')
    return configs


# ---------------------------------------------------------------------------
# 2. ERP 로그인 + 화면 진입
# ---------------------------------------------------------------------------
def erp_login(page) -> None:
    print('[ERP] EP 로그인 중...')
    page.goto(EP_URL, timeout=30000)
    page.locator('#userId').fill(EP_USER)
    page.locator('#userPw').fill(EP_PASSWORD)
    page.get_by_role('button', name='로그인').click()
    page.wait_for_timeout(4000)

    page.wait_for_function(
        "() => typeof SingleSignOn !== 'undefined'"
        " && Array.isArray(SingleSignOn.AppInfo)"
        " && SingleSignOn.AppInfo.length > 0",
        timeout=10000,
    )
    page.wait_for_function(
        f"() => {{ const e = document.getElementById('{ERP_SYSCD}');"
        f" return e && e.value && e.value.length > 0; }}",
        timeout=10000,
    )

    build = page.evaluate(SSO_BUILDER_JS, ERP_SYSCD)
    if not build.get('success'):
        raise RuntimeError(f'SSO 실패: {build.get("error")}')

    url = build['url']
    if url.startswith('/'):
        url = 'https://ep.fursys.com' + url

    page.goto(url, wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(3000)

    # Nexacro 메인 로딩 확인
    page.locator(
        '#mainframe_VFrameSet_topFrame_form_edt_searchMenu_input'
    ).wait_for(state='attached', timeout=45000)
    print('[ERP] ERP 메인 진입 완료')


def navigate_to_screen(page) -> None:
    """관계사입고예정생성 화면 진입"""
    page.get_by_text('화면검색(Menu search)').click()
    si = page.locator('#mainframe_VFrameSet_topFrame_form_edt_searchMenu_input')
    si.fill('관계사입고예정생성')
    si.press('Enter')
    page.wait_for_timeout(1000)

    page.locator(
        '#mainframe_VFrameSet_HFrameSet_leftFrame_form_grdMenu_body'
    ).get_by_text('관계사입고예정생성').click()
    page.wait_for_timeout(2000)

    # 화면 로드 확인 (조회 버튼 등장)
    page.locator(f'#{ERP_IDS["search"]}').wait_for(state='attached', timeout=15000)
    print('[ERP] 관계사입고예정생성 화면 로드 완료')


# ---------------------------------------------------------------------------
# 3. 드롭다운 선택 (Nexacro 단일선택 콤보)
# ---------------------------------------------------------------------------
def select_combo(page, btn_id: str, value: str, label: str) -> None:
    page.locator(f'#{btn_id}').click()
    page.wait_for_timeout(400)

    # 전략 ①: 콤보 팝업 내 텍스트 매칭
    try:
        popup = page.locator('[id*="_pdiv_"]').filter(has_text=value).first
        popup.wait_for(state='visible', timeout=2000)
        popup.get_by_text(value, exact=True).click()
        page.wait_for_timeout(300)
        print(f'    {label}: "{value}" 선택 (팝업 매칭)')
        return
    except Exception:
        pass

    # 전략 ②: 전체 페이지에서 텍스트 클릭 (fallback)
    try:
        page.get_by_text(value, exact=True).last.click()
        page.wait_for_timeout(300)
        print(f'    {label}: "{value}" 선택 (텍스트 매칭)')
        return
    except Exception:
        pass

    # 실패 시 Escape 후 예외
    page.keyboard.press('Escape')
    raise RuntimeError(f'{label} 콤보 선택 실패: "{value}" — --show 모드로 확인 필요')


# ---------------------------------------------------------------------------
# 4. 체크박스 헬퍼
# ---------------------------------------------------------------------------
def get_active_rows(page) -> list[dict]:
    """처리 대상 행 반환: 8번 체크박스 존재하는 행 중 매출금액 양수인 것"""
    return page.evaluate("""
        () => {
            const pattern = '_8_controlcheckbox_chkimgImageElement';
            const els = document.querySelectorAll('[id*="grd_mst_body"][id*="' + pattern + '"]');
            const rows = [];
            els.forEach(el => {
                const m = el.id.match(/gridrow_(\\d+)/);
                if (!m) return;
                const rowIdx = parseInt(m[1]);

                // 매출전표번호 (column 1)
                let invoiceNo = '';
                document.querySelectorAll(
                    '[id*="grd_mst_body_gridrow_' + rowIdx + '"][id*="_cell_' + rowIdx + '_1"]'
                ).forEach(e => { const t = (e.innerText || '').trim(); if (t.length > 3) invoiceNo = t; });

                // 출고일자 (column 2)
                let shipDate = '';
                document.querySelectorAll(
                    '[id*="grd_mst_body_gridrow_' + rowIdx + '"][id*="_cell_' + rowIdx + '_2"]'
                ).forEach(e => { const t = (e.innerText || '').trim(); if (t) shipDate = t; });

                // 매출금액 (column 6) — 음수면 제외
                let salesAmt = 0;
                document.querySelectorAll(
                    '[id*="grd_mst_body_gridrow_' + rowIdx + '"][id*="_cell_' + rowIdx + '_6"]'
                ).forEach(e => {
                    const n = parseFloat((e.innerText || '').replace(/,/g, '').trim());
                    if (!isNaN(n)) salesAmt = n;
                });
                if (salesAmt < 0) return;

                rows.push({ row_idx: rowIdx, invoice_no: invoiceNo || ('row_' + rowIdx), ship_date: shipDate });
            });
            return rows;
        }
    """)


def select_one_checkbox(page, row_idx: int) -> None:
    """특정 행 선택 체크박스 클릭 (8번 컬럼) — Playwright 실제 클릭으로 Nexacro 이벤트 트리거"""
    try:
        page.locator(
            f'[id*="grd_mst_body_gridrow_{row_idx}"][id*="_8_controlcheckbox_chkimgImageElement"]'
        ).first.click(force=True, timeout=2000)
    except Exception:
        pass


def set_inplan_date(page, ship_date: str) -> None:
    """입고예정일자를 출고일자와 동일하게 설정 (YYYY/MM/DD 형식)"""
    date_str = ship_date.replace('.', '/').replace('-', '/')
    cal = page.locator(f'#{ERP_IDS["date_input"]}')
    cal.click(click_count=3)
    cal.fill(date_str)
    cal.press('Tab')
    page.wait_for_timeout(200)


def _requery(page) -> bool:
    """조회 재실행. 결과 행 존재 여부 반환."""
    page.locator(f'#{ERP_IDS["search"]}').click()
    try:
        page.locator('#mainframe_waitwindow').wait_for(state='hidden', timeout=30000)
    except PWTimeout:
        pass
    page.wait_for_timeout(500)
    try:
        page.locator('[id*="06002008"][id*="grd_mst_body_gridrow_0"]').first.wait_for(
            state='attached', timeout=5000
        )
        return True
    except PWTimeout:
        return False


# ---------------------------------------------------------------------------
# 5. 팝업 처리 (확인/닫기 버튼 클릭)
# ---------------------------------------------------------------------------
def dismiss_popup(page, timeout: int = 3000) -> str | None:
    """팝업이 있으면 텍스트 반환 후 닫기. 없으면 None."""
    try:
        # Nexacro 메시지박스 텍스트 감지
        popup = page.locator('.w2popup_msg, [class*="msgbox"], [id*="popup_msg"]').first
        popup.wait_for(state='visible', timeout=timeout)
        text = popup.inner_text(timeout=1000).strip()
        page.get_by_role('button', name='확인').click(timeout=2000)
        return text
    except PWTimeout:
        pass

    # 확인 버튼만 있는 경우 fallback
    try:
        page.get_by_role('button', name='확인').click(timeout=1000)
        return '(팝업 텍스트 미확인)'
    except PWTimeout:
        return None


# ---------------------------------------------------------------------------
# 6. 단건 처리 fallback
# ---------------------------------------------------------------------------
def _process_one_by_one(page, cfg: dict) -> dict:
    """오류 발생 시 행 하나씩 처리. 오류 행은 invoice_no로 추적해 skip."""
    company   = cfg['company']
    output_wh = cfg['output_warehouse']
    ok_count  = 0
    error_rows = []
    skip_set   = set()

    for attempt in range(100):  # 무한루프 방지 상한
        if not _requery(page):
            break

        active    = get_active_rows(page)
        remaining = [r for r in active if r['invoice_no'] not in skip_set]

        if not remaining:
            break

        row = remaining[0]
        skip_set.add(row['invoice_no'])
        print(f'    [{attempt + 1}] {row["invoice_no"]} ({row.get("ship_date", "")}) 단건 처리 중...')

        if row.get('ship_date'):
            set_inplan_date(page, row['ship_date'])
        select_one_checkbox(page, row['row_idx'])
        page.wait_for_timeout(500)
        page.locator(f'#{ERP_IDS["create"]}').click()
        page.wait_for_timeout(1500)

        popup = dismiss_popup(page, timeout=4000)
        is_error = popup and any(w in popup for w in ['오류', '에러', 'error', '실패'])

        if is_error:
            print(f'    ❌ {row["invoice_no"]}: {(popup or "")[:80]}')
            error_rows.append({'invoice_no': row['invoice_no'], 'error': popup or 'unknown'})
        else:
            print(f'    ✅ {row["invoice_no"]} 완료')
            ok_count += 1

    status = ('ok'      if ok_count > 0 and not error_rows else
              'partial' if ok_count > 0 else
              'all_error')
    return {
        'company': company, 'output_wh': output_wh,
        'status':  status,  'selected': ok_count,
        'error':   f'오류행 {len(error_rows)}건' if error_rows else None,
        'error_rows': error_rows,
    }


# ---------------------------------------------------------------------------
# 7. 단일 설정(회사 × 창고) 처리
# ---------------------------------------------------------------------------
def process_config(page, cfg: dict, target_date: str) -> dict:
    company   = cfg['company']
    input_wh  = cfg['input_warehouse']
    output_wh = cfg['output_warehouse']

    print(f'\n  ── {company} | {output_wh} → {input_wh} ──')
    try:
        # 드롭다운 선택
        select_combo(page, ERP_IDS['company'],   company,   '회사')
        select_combo(page, ERP_IDS['input_wh'],  input_wh,  '입고예정창고')
        select_combo(page, ERP_IDS['output_wh'], output_wh, '출고창고')

        # 조회
        page.locator(f'#{ERP_IDS["search"]}').click()
        try:
            page.locator('#mainframe_waitwindow').wait_for(state='hidden', timeout=30000)
        except PWTimeout:
            pass
        page.wait_for_timeout(500)

        # 결과 확인
        try:
            page.locator('[id*="06002008"][id*="grd_mst_body_gridrow_0"]').first.wait_for(
                state='attached', timeout=5000
            )
        except PWTimeout:
            dismiss_popup(page, timeout=2000)
            print('    조회 결과 없음 — 스킵')
            return {'company': company, 'output_wh': output_wh,
                    'status': 'no_data', 'selected': 0, 'error': None, 'error_rows': []}

        # 활성 행 확인
        active = get_active_rows(page)
        if not active:
            print('    미생성품목 없음 — 스킵')
            return {'company': company, 'output_wh': output_wh,
                    'status': 'no_selectable', 'selected': 0, 'error': None, 'error_rows': []}

        # 출고일자별 그룹핑
        groups: dict[str, list] = {}
        for row in active:
            d = row.get('ship_date') or ''
            groups.setdefault(d, []).append(row)

        date_count = len(groups)
        print(f'    활성 행 {len(active)}건 (출고일자 {date_count}종) → 날짜별 생성 시도')

        total_ok = 0
        all_error_rows: list = []

        for ship_date, rows in groups.items():
            print(f'    출고일자 {ship_date or "미확인"} ({len(rows)}건)...')

            # ① 입고예정일자 = 출고일자
            if ship_date:
                set_inplan_date(page, ship_date)

            # ② 해당 날짜 행 전체 선택 → 생성
            for row in rows:
                select_one_checkbox(page, row['row_idx'])
                page.wait_for_timeout(300)  # 체크박스 간 딜레이

            page.wait_for_timeout(500)  # 전체 선택 후 버튼 활성화 대기
            page.locator(f'#{ERP_IDS["create"]}').click()
            page.wait_for_timeout(1500)

            popup = dismiss_popup(page, timeout=4000)
            is_error = popup and any(w in popup for w in ['오류', '에러', 'error', '실패'])

            if not is_error:
                print(f'    ✅ {ship_date or "미확인"} {len(rows)}건 완료')
                total_ok += len(rows)
            else:
                # ③ 오류 시 단건 fallback
                print(f'    ⚠️ {ship_date or "미확인"} 오류 팝업 → 단건 처리 모드')
                r = _process_one_by_one(page, cfg)
                total_ok += r['selected']
                all_error_rows.extend(r.get('error_rows') or [])

        status = ('ok'      if total_ok > 0 and not all_error_rows else
                  'partial' if total_ok > 0 else
                  'all_error')
        return {'company': company, 'output_wh': output_wh,
                'status': status, 'selected': total_ok,
                'error': f'오류행 {len(all_error_rows)}건' if all_error_rows else None,
                'error_rows': all_error_rows}

    except Exception as e:
        print(f'    ❌ 예외: {e}')
        dismiss_popup(page, timeout=2000)
        return {'company': company, 'output_wh': output_wh,
                'status': 'exception', 'selected': 0, 'error': str(e), 'error_rows': []}


# ---------------------------------------------------------------------------
# 7. WMS 입고예정정보 IF 실행
# ---------------------------------------------------------------------------
def run_wms_if(headless: bool) -> None:
    print('\n[WMS] 입고예정정보 IF 실행 중...')
    with sync_playwright() as pw:
        browser, ctx = _new_browser(pw, headless)
        page = ctx.new_page()
        try:
            # WMS 로그인
            page.goto(WMS_URL, timeout=30000)
            page.wait_for_load_state('networkidle')
            page.fill('input[name="loginId"]', WMS_USER)
            page.fill('input[name="password"]', WMS_PASSWORD)
            page.click('button#sendAuthCodeBtn')
            page.wait_for_load_state('networkidle')
            try:
                page.wait_for_selector('input[name="loginId"]', state='hidden', timeout=5000)
            except PWTimeout:
                raise RuntimeError('WMS 로그인 실패 — 아이디/비밀번호 확인')
            print('[WMS] 로그인 성공')

            # 입고 예정 정보 관리 메뉴 이동
            # 전략 ①: 사이드바 메뉴 클릭
            try:
                page.get_by_text('입고관리').first.click(timeout=5000)
                page.get_by_text('입고 예정 정보 관리').first.click(timeout=5000)
                page.wait_for_load_state('networkidle')
            except PWTimeout:
                # 전략 ②: 직접 URL 이동
                page.goto('https://wms.letus4u.com/v1/inbound/asn', timeout=30000)
                page.wait_for_load_state('networkidle')
            page.wait_for_timeout(1500)
            print('[WMS] 입고 예정 정보 관리 진입')

            # 입고예정정보 IF 버튼 클릭 (페이지 상단 버튼)
            page.get_by_text('입고예정정보 IF').first.click()
            page.wait_for_timeout(1000)
            print('[WMS] 모달 열림')

            # 모달 내 입고예정정보 IF 버튼 클릭 (오렌지 버튼)
            page.get_by_role('button', name='입고예정정보 IF').click()
            page.wait_for_timeout(3000)
            print('[WMS] IF 실행 완료 대기 중...')

            # 완료 모달 닫기
            try:
                page.get_by_role('button', name='확인').click(timeout=5000)
            except PWTimeout:
                try:
                    page.get_by_role('button', name='닫기').click(timeout=3000)
                except PWTimeout:
                    pass
            print('[WMS] 입고예정정보 IF 완료')

        except Exception as e:
            print(f'[WMS] ❌ 오류: {e}')
        finally:
            ctx.close()
            browser.close()


# ---------------------------------------------------------------------------
# 메인
# ---------------------------------------------------------------------------
def run(target_date: str, headless: bool):
    print('=' * 60)
    print(f'ERP 입고예정생성 RPA 시작 | 기준일: {target_date}')
    print('=' * 60)
    t0 = time.time()

    configs = load_configs()
    if not configs:
        print('[WARN] 활성 설정 없음 — erp_inbound_config 테이블에 데이터를 추가하세요')
        return

    results = []
    with sync_playwright() as pw:
        browser, ctx = _new_browser(pw, headless)
        page = ctx.new_page()
        try:
            erp_login(page)
            navigate_to_screen(page)

            print(f'\n[ERP] {len(configs)}개 설정 순차 처리')
            for cfg in configs:
                r = process_config(page, cfg, target_date)
                results.append(r)

        except Exception as e:
            print(f'\n[ERP] 치명적 오류: {e}')
        finally:
            ctx.close()
            browser.close()

    # 결과 요약
    ok         = [r for r in results if r['status'] == 'ok']
    no_data    = [r for r in results if r['status'] in ('no_data', 'no_selectable')]
    errors     = [r for r in results if r['status'] in ('error_popup', 'exception')]

    print('\n' + '=' * 60)
    print('ERP 처리 결과 요약')
    print(f'  성공: {len(ok)}건 | 데이터없음/선택없음: {len(no_data)}건 | 오류: {len(errors)}건')
    for r in ok:
        suffix = f' (오류행: {len(r["error_rows"])}건)' if r.get('error_rows') else ''
        print(f'  ✅ {r["company"]} / {r["output_wh"]}: {r["selected"]}행 생성{suffix}')
        for er in (r.get('error_rows') or []):
            print(f'     └ ❌ {er["invoice_no"]}: {er["error"][:60]}')
    for r in errors:
        print(f'  ❌ {r["company"]} / {r["output_wh"]}: {r["error"]}')
        for er in (r.get('error_rows') or []):
            print(f'     └ ❌ {er["invoice_no"]}: {er["error"][:60]}')

    # WMS IF 실행 (ERP 성공 건 있을 때만)
    if ok:
        run_wms_if(headless)
    else:
        print('\n[WMS] ERP 성공 건 없음 — WMS IF 스킵')

    print('=' * 60)
    print(f'완료! ({time.time() - t0:.1f}초)')
    print('=' * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='ERP 입고예정생성 + WMS 입고예정정보 IF')
    parser.add_argument('--date', default=str(date.today()), help='기준일 YYYY-MM-DD (기본: 오늘)')
    parser.add_argument('--show', action='store_true', help='브라우저 창 표시')
    args = parser.parse_args()
    run(target_date=args.date, headless=not args.show)
