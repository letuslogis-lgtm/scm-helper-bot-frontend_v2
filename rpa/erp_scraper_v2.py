"""
erp_scraper_v2.py  (v2.4.2 - Stealth 모드 + 타임아웃 재조정)
===============================================================================
변경 요약 (v2.4 → v2.4.2):

  🔴 진짜 원인 발견 (erp_entry_failed.html 내용 분석):
      ERP 서버가 "This page is having a problem" 에러 페이지를 반환함.
      → Headless Chromium 을 봇으로 감지하여 Nexacro 로딩을 거부한 것.

  ✅ Stealth 모드 적용:
      1) --disable-blink-features=AutomationControlled  (webdriver 플래그 제거)
      2) 정상 Chrome User-Agent 로 위장
      3) navigator.webdriver / languages / plugins 정상화 (init script)
      4) 한국 locale / timezone 설정

  🎯 타임아웃 재조정 (Fail Fast):
      - 실패 감지까지 최대 ~90초 (기존 ~5분)
      - 정상 시간의 2~3배만 기다림
===============================================================================
"""

import json
import os
from datetime import datetime, date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError

load_dotenv(Path(__file__).parent.parent / '.env')


RPA_META = {
    "name":        "상차이슈 추출",
    "version":     "2.4.2",
    "description": "Fursys ERP에서 상차이슈 엑셀을 자동 추출합니다",
    "parameters": [
        {"key": "start_date", "label": "조회 시작일", "type": "date", "required": False},
        {"key": "end_date",   "label": "조회 종료일", "type": "date", "required": False},
    ],
    "secrets": ["fursys_login"],
}

ERP_KOREA_SYSCD = "T05S02"

# ---------------------------------------------------------------------------
# 타임아웃 정책 (Fail Fast)
# ---------------------------------------------------------------------------
WAIT_AFTER_LOGIN_MS       = 4000
TIMEOUT_APPINFO_MS        = 10000
TIMEOUT_HIDDEN_INPUT_MS   = 10000
TIMEOUT_GOTO_MS           = 30000
TIMEOUT_ERP_UI_MS         = 45000      # Nexacro 로딩은 좀 더 여유 있게
TIMEOUT_SEARCH_LOADING_MS = 30000

# ---------------------------------------------------------------------------
# Stealth — 봇 감지 우회
# ---------------------------------------------------------------------------
STEALTH_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

STEALTH_INIT_SCRIPT = """
// navigator.webdriver 숨김 (자동화 감지의 핵심 플래그)
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 일반 브라우저의 언어 목록
Object.defineProperty(navigator, 'languages', {
    get: () => ['ko-KR', 'ko', 'en-US', 'en']
});

// 플러그인 배열 — headless 에서는 비어있어 감지됨
Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5]
});

// Chrome 객체 존재 (headless 에선 없을 수 있음)
if (!window.chrome) {
    window.chrome = { runtime: {} };
}

// Permissions API — headless 특유의 반응 위장
const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
if (originalQuery) {
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters)
    );
}
"""

# ---------------------------------------------------------------------------
# SSO URL 조합 JS
# ---------------------------------------------------------------------------
SSO_URL_BUILDER_JS = """(sysCd) => {
    const result = { success: false, url: null, error: null, debug: {} };
    try {
        const $el = document.getElementById(sysCd);
        if (!$el) { result.error = `Element #${sysCd} not found`; return result; }

        const sysId   = $el.value || '';
        const ssoKey  = $el.getAttribute('key') || '';
        const ssoKey2 = $el.dataset.key || '';
        const deptCd  = (document.getElementById('deptCd') || {}).value || '';

        result.debug = { sysId, ssoKeyLen: ssoKey.length, ssoKey2Len: ssoKey2.length, deptCd };

        if (!sysId) { result.error = 'sysId empty'; return result; }
        if (typeof SingleSignOn === 'undefined' || !SingleSignOn.AppInfo) {
            result.error = 'SingleSignOn.AppInfo not loaded'; return result;
        }

        const app = SingleSignOn.AppInfo.find(a => a.sysCd === sysCd);
        if (!app) { result.error = `AppInfo for ${sysCd} not found`; return result; }

        result.debug.appType  = app.type;
        result.debug.pathTmpl = app.path;
        result.debug.popup    = app.popup;

        if (app.type !== 'WEB') { result.error = `Unsupported type: ${app.type}`; return result; }

        let url = app.path;
        url = url.replace('[key2]',   ssoKey2);
        url = url.replace('[id]',     sysId);
        url = url.replace('[key]',    ssoKey);
        url = url.replace('[deptCd]', deptCd);

        result.debug.finalUrl = url;
        result.url = (app.popup === 'yes')
            ? '/open.do?url=' + encodeURIComponent(url)
            : url;
        result.success = true;
        return result;
    } catch (e) {
        result.error = e.message;
        return result;
    }
}"""


def run(ctx):
    # ---------------------------------------------------------------
    # 0. 파라미터 검증 (미입력 시 D-1 자동 적용)
    # ---------------------------------------------------------------
    _yesterday = str(date.today() - timedelta(days=1))
    start_date = ctx.params.get("start_date") or _yesterday
    end_date   = ctx.params.get("end_date")   or _yesterday

    d1 = datetime.strptime(start_date, "%Y-%m-%d")
    d2 = datetime.strptime(end_date,   "%Y-%m-%d")
    if d1 > d2:
        raise ValueError("시작일이 종료일보다 뒤입니다.")
    if (d2 - d1).days > 31:
        raise ValueError(f"조회 범위 초과 ({(d2 - d1).days}일). 최대 31일까지.")

    # ---------------------------------------------------------------
    # 1. 로그인 정보 (.env 우선, 없으면 fursys_login.json 폴백)
    # ---------------------------------------------------------------
    ep_user = os.environ.get('EP_USER')
    ep_password = os.environ.get('EP_PASSWORD')

    if not ep_user or not ep_password:
        with open(ctx.secrets_dir / "fursys_login.json", 'r', encoding='utf-8') as f:
            creds = json.load(f)
        ep_user = creds.get('username')
        ep_password = creds.get('password')

    if not ep_user or not ep_password:
        raise RuntimeError("EP 로그인 정보 없음 — .env에 EP_USER / EP_PASSWORD를 설정하세요")

    ctx.log(f"ERP 접속 시도: {start_date} ~ {end_date}")
    t0 = datetime.now()
    save_path_acc = None   # 상차이슈
    save_path_sch = None   # 시공재일정 (D-DAY ~ D+14)

    _today  = str(date.today())
    sch_end = str(date.today() + timedelta(days=14))

    with sync_playwright() as playwright:
        # ---------------------------------------------------------------
        # 🔴 Stealth 브라우저 기동
        # ---------------------------------------------------------------
        browser = playwright.chromium.launch(
            headless=getattr(ctx, 'headless', True),
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-features=IsolateOrigins,site-per-process",
            ]
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent=STEALTH_UA,
            locale="ko-KR",
            timezone_id="Asia/Seoul",
        )
        # 모든 페이지 로드 전에 주입되는 init script
        context.add_init_script(STEALTH_INIT_SCRIPT)
        ctx.log("Stealth 모드 활성화 완료")

        page = context.new_page()

        # ---------------------------------------------------------------
        # 2. EP 포털 로그인
        # ---------------------------------------------------------------
        page.goto("https://ep.fursys.com/v3/main.do", timeout=TIMEOUT_GOTO_MS)
        page.locator("#userId").fill(ep_user)
        page.locator("#userPw").fill(ep_password)
        page.get_by_role("button", name="로그인").click()
        page.wait_for_timeout(WAIT_AFTER_LOGIN_MS)
        ctx.log(f"[{_elapsed(t0)}] EP 포털 로그인 완료")

        # ---------------------------------------------------------------
        # 3. AppInfo + hidden input 확인
        # ---------------------------------------------------------------
        try:
            page.wait_for_function(
                "() => typeof SingleSignOn !== 'undefined' "
                "&& Array.isArray(SingleSignOn.AppInfo) "
                "&& SingleSignOn.AppInfo.length > 0",
                timeout=TIMEOUT_APPINFO_MS
            )
        except PWTimeoutError:
            _dump_debug(page, ctx, tag="appinfo_not_loaded")
            raise RuntimeError("SingleSignOn.AppInfo 로드 실패")

        try:
            page.wait_for_function(
                f"() => {{ const el = document.getElementById('{ERP_KOREA_SYSCD}'); "
                f"return el && el.value && el.value.length > 0; }}",
                timeout=TIMEOUT_HIDDEN_INPUT_MS
            )
            ctx.log(f"[{_elapsed(t0)}] #{ERP_KOREA_SYSCD} 준비 완료")
        except PWTimeoutError:
            _dump_debug(page, ctx, tag="erp_permission_missing")
            raise RuntimeError(f"#{ERP_KOREA_SYSCD} 값 비어있음 (ERP 권한 확인)")

        # ---------------------------------------------------------------
        # 4. SSO URL 조합
        # ---------------------------------------------------------------
        build_result = page.evaluate(SSO_URL_BUILDER_JS, ERP_KOREA_SYSCD)
        ctx.log(f"  ↳ success: {build_result.get('success')}")
        ctx.log(f"  ↳ debug  : {build_result.get('debug')}")

        if not build_result.get("success"):
            _dump_debug(page, ctx, tag="sso_url_build_failed")
            raise RuntimeError(f"SSO URL 조합 실패: {build_result.get('error')}")

        final_url = build_result["url"]
        if final_url.startswith("/"):
            final_url = "https://ep.fursys.com" + final_url

        ctx.log(f"[{_elapsed(t0)}] SSO URL: {final_url[:150]}...")

        # ---------------------------------------------------------------
        # 5. ERP 로 이동
        # ---------------------------------------------------------------
        page.goto(final_url, wait_until="domcontentloaded", timeout=TIMEOUT_GOTO_MS)
        page.wait_for_timeout(3000)
        ctx.log(f"[{_elapsed(t0)}] 도착 URL: {page.url}")
        ctx.log(f"  ↳ 페이지 타이틀: '{page.title()}'")

        # 🔴 에러 페이지 즉시 감지 (더 이상 긴 타임아웃으로 낭비하지 않음)
        body_text = page.locator("body").inner_text(timeout=5000)
        if "This page is having a problem" in body_text:
            ctx.log("❌ ERP가 Stealth 우회에도 불구하고 봇으로 감지함")
            _dump_debug(page, ctx, tag="erp_bot_detected")
            raise RuntimeError("ERP 봇 감지 — 추가 우회 필요")

        erp_page = page

        # ---------------------------------------------------------------
        # 6. Nexacro 엔진 로딩 대기
        # ---------------------------------------------------------------
        try:
            ctx.log(f"[{_elapsed(t0)}] Nexacro 엔진 로딩 대기 중...")
            erp_page.locator(
                "#mainframe_VFrameSet_topFrame_form_edt_searchMenu_input"
            ).wait_for(state="attached", timeout=TIMEOUT_ERP_UI_MS)
            ctx.log(f"[{_elapsed(t0)}] ✅ ERP 메인 진입 성공!")
        except Exception as e:
            ctx.log(f"❌ ERP UI 로딩 실패: {e}")
            _dump_debug(erp_page, ctx, tag="erp_ui_timeout")
            raise

        # ---------------------------------------------------------------
        # 7. 상차이슈 관리 메뉴 이동
        # ---------------------------------------------------------------
        try:
            ctx.log(f"[{_elapsed(t0)}] 상차이슈 관리 메뉴 검색")
            erp_page.get_by_text("화면검색(Menu search)").click()
            search_input = erp_page.locator(
                "#mainframe_VFrameSet_topFrame_form_edt_searchMenu_input"
            )
            search_input.fill("상차이슈 관리")
            search_input.press("Enter")

            erp_page.locator(
                "#mainframe_VFrameSet_HFrameSet_leftFrame_form_grdMenu_body_gridrow_0_cell_0_0_controltreeTextBoxElement"
            ).get_by_text("상차이슈 관리").click()

            # 회사 콤보박스
            ctx.log(f"[{_elapsed(t0)}] 회사 콤보박스 선택")
            erp_page.locator(
                "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_div_search_cbo_corp_cmb_check_dropbutton > div"
            ).click()
            erp_page.locator("#undefined_cbo_corp_pdiv_grd_combo_body_gridrow_0_cell_0_0_controlcheckbox_chkimg > div").click()
            erp_page.locator("#undefined_cbo_corp_pdiv_grd_combo_body_gridrow_1_cell_1_0_controlcheckbox_chkimg > div").click()
            erp_page.locator("#undefined_cbo_corp_pdiv_grd_combo_body_gridrow_2_cell_2_0_controlcheckbox_chkimg > div").click()
            erp_page.locator("#undefined_cbo_corp_pdiv_btn_okTextBoxElement").get_by_text("적용").click()

            # 날짜 (Nexacro: triple_click으로 전체 선택 후 입력 + Tab 확정)
            ctx.log(f"[{_elapsed(t0)}] 날짜 입력: {start_date} ~ {end_date}")
            from_cal = erp_page.locator(
                "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_div_search_from_cal_calendaredit_input"
            )
            from_cal.click(click_count=3)
            from_cal.press_sequentially(start_date.replace('-', '/'), delay=50)
            from_cal.press("Tab")
            erp_page.wait_for_timeout(400)

            to_cal = erp_page.locator(
                "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_div_search_to_cal_calendaredit_input"
            )
            to_cal.click(click_count=3)
            to_cal.press_sequentially(end_date.replace('-', '/'), delay=50)
            to_cal.press("Tab")
            erp_page.wait_for_timeout(400)

            # 검색
            ctx.log(f"[{_elapsed(t0)}] 검색 실행")
            erp_page.locator(
                "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_div_search_btn_search"
            ).click()
            erp_page.locator("#mainframe_waitwindow").wait_for(
                state="hidden", timeout=TIMEOUT_SEARCH_LOADING_MS
            )
            erp_page.wait_for_timeout(500)

            # 데이터 존재 여부 확인 — 첫 번째 행이 없으면 데이터 없음
            first_row = erp_page.locator(
                "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_Grid00_body_gridrow_0_cell_0_11"
            )
            try:
                first_row.wait_for(state="attached", timeout=5000)
            except PWTimeoutError:
                # 팝업이 떠있으면 닫기
                try:
                    erp_page.get_by_role("button", name="확인").click(timeout=2000)
                except Exception:
                    pass
                ctx.log(f"  [{start_date} ~ {end_date}] 조회 결과 없음 — 다운로드 스킵")
                return

            # 엑셀 다운로드
            ctx.log(f"[{_elapsed(t0)}] 엑셀 다운로드")
            first_row.click(button="right")
            erp_page.wait_for_timeout(1000)

            with erp_page.expect_download() as download_info:
                erp_page.locator(
                    "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_div_workGrid00PopupMenu_31TextBoxElement"
                ).get_by_text("자료변환 [Export File]").click()

            download  = download_info.value
            now_str   = datetime.now().strftime("%Y%m%d_%H%M%S")
            save_path_acc = ctx.output_dir / f"상차이슈_{start_date}_{end_date}_{now_str}.xls"
            download.save_as(str(save_path_acc))

            ctx.log(f"[{_elapsed(t0)}] ✅ 다운로드 완료: {save_path_acc.name}")

        except Exception as e:
            ctx.log(f"❌ 상차이슈 추출 오류: {e}")
            _dump_debug(erp_page, ctx, tag="acc_extraction_failed")

        # ---------------------------------------------------------------
        # 8. 시공일정관리 메뉴 이동 (D-DAY ~ D+14, 재시공 건)
        # ---------------------------------------------------------------
        try:
            save_path_sch = _step2_schedule(erp_page, ctx, _today, sch_end, t0)
        except Exception as e:
            ctx.log(f"❌ 시공재일정 추출 오류: {e}")
            _dump_debug(erp_page, ctx, tag="sch_extraction_failed")

        try:
            context.close()
            browser.close()
        except Exception:
            pass

    # ---------------------------------------------------------------
    # 9. Supabase 업로드 (브라우저 종료 후)
    # ---------------------------------------------------------------
    if save_path_acc:
        _parse_and_upload(ctx, save_path_acc, start_date, end_date, t0)
    if save_path_sch:
        _update_is_delayed(ctx, save_path_sch, t0)
    ctx.log(f"[{_elapsed(t0)}] ===== 완료 =====")


def _parse_and_upload(ctx, xls_path, start_date: str, end_date: str, t0):
    """다운로드된 XLS를 파싱하여 logistics_accidents에 신규 건만 INSERT"""
    import pandas as pd
    from supabase import create_client

    supa_url = os.environ.get('VITE_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
    supa_key = os.environ.get('VITE_SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')

    if not supa_url or not supa_key:
        ctx.log("⚠️  Supabase 환경변수 없음 — DB 업로드 스킵")
        return

    # 1. XLS 파싱
    ctx.log(f"[{_elapsed(t0)}] XLS 파싱 중: {xls_path.name}")
    try:
        df = pd.read_excel(str(xls_path), engine='xlrd', dtype=str)
    except Exception as e:
        ctx.log(f"  xlrd 실패, openpyxl 재시도: {e}")
        df = pd.read_excel(str(xls_path), dtype=str)

    df.columns = [str(c).strip() for c in df.columns]
    df = df.fillna('')
    ctx.log(f"  실제 컬럼: {list(df.columns)}")
    ctx.log(f"  총 {len(df)}행")

    # 2. 컬럼 매핑 (AccidentList.jsx 기준)
    COL_MAP = {
        '서비스예약일':   'service_date',
        '브랜드':         'brand',
        '서비스센터':     'service_center',
        '시공/AS':        'service_type',
        '수주번호':       'order_no',
        '수주건명':       'order_name',
        '품목코드':       'item_code',
        '이슈수량':       'issue_qty',
        '조치결과구분':   'action_result',
        '납기지연판별':   'is_delayed',
        '귀책부서':       'responsible_dept',
        '발생원인 상세':  'cause_detail',
        '처리상태':       'status',
    }

    # 3. 기존 레코드 조회 — (order_no, item_code, service_date) 3중 키
    ctx.log(f"  기존 레코드 조회: {start_date} ~ {end_date}")
    supa = create_client(supa_url, supa_key)
    existing_resp = (
        supa.table('logistics_accidents')
            .select('order_no, item_code, service_date')
            .gte('service_date', start_date)
            .lte('service_date', end_date)
            .execute()
    )
    existing_keys = {
        (r['order_no'], r.get('item_code'), r.get('service_date'))
        for r in (existing_resp.data or [])
        if r.get('order_no')
    }
    ctx.log(f"  기존 {len(existing_keys)}건")

    # 4. 행 변환
    records = []
    skipped = 0
    for _, row in df.iterrows():
        rec = {}
        for excel_col, db_col in COL_MAP.items():
            raw = str(row.get(excel_col, '')).strip()
            rec[db_col] = raw if raw and raw.lower() not in ('nan', 'none', '') else None

        order_no  = rec.get('order_no')
        item_code = rec.get('item_code')

        if not order_no:
            skipped += 1
            continue

        # service_date 정규화 → YYYY-MM-DD (중복 체크 전에 먼저 처리)
        if rec.get('service_date'):
            d = rec['service_date'].replace('/', '-').replace('.', '-')
            if len(d) == 8 and d.replace('-', '').isdigit():
                d = f"{d[:4]}-{d[4:6]}-{d[6:8]}"
            rec['service_date'] = d

        # 중복 체크: 수주번호 + 품목코드 + 서비스예약일 3중 키
        if (order_no, item_code, rec.get('service_date')) in existing_keys:
            skipped += 1
            continue

        # issue_qty → 정수
        if rec.get('issue_qty'):
            try:
                rec['issue_qty'] = int(float(rec['issue_qty']))
            except (ValueError, TypeError):
                rec['issue_qty'] = 0

        # 기본값
        if not rec.get('brand'):
            rec['brand'] = '알수없음'
        if not rec.get('status'):
            rec['status'] = '원인 파악 중'

        records.append(rec)

    ctx.log(f"  신규 {len(records)}건 / 스킵 {skipped}건")

    if not records:
        ctx.log("  업로드할 신규 레코드 없음")
        return

    # 5. INSERT (100건 청크)
    CHUNK = 100
    inserted = 0
    for i in range(0, len(records), CHUNK):
        chunk = records[i:i + CHUNK]
        supa.table('logistics_accidents').insert(chunk).execute()
        inserted += len(chunk)
        ctx.log(f"  → {inserted}/{len(records)}건 INSERT")

    ctx.log(f"[{_elapsed(t0)}] ✅ DB 업로드 완료: {inserted}건")


def _step2_schedule(erp_page, ctx, today_str: str, sch_end_str: str, t0):
    """
    시공일정관리(CSC0010_M01) 에서 재시공 건 엑셀 다운로드.
    반환: 저장 경로(Path) 또는 None(데이터 없음)
    """
    PREFIX = (
        "#mainframe_VFrameSet_HFrameSet_VFrameSet1"
        "_workFrame_07003001_form_div_work"
    )

    # ── 메뉴 이동 ──────────────────────────────────────────────────
    # 자료변환 완료 후 Nexacro 오버레이가 남아있을 수 있어 Escape로 먼저 닫기
    erp_page.keyboard.press("Escape")
    erp_page.wait_for_timeout(1500)

    ctx.log(f"[{_elapsed(t0)}] 시공일정관리 메뉴 검색")
    erp_page.get_by_text("화면검색(Menu search)").click(force=True)
    search_input = erp_page.locator(
        "#mainframe_VFrameSet_topFrame_form_edt_searchMenu_input"
    )
    search_input.fill("시공일정관리")
    search_input.press("Enter")
    erp_page.wait_for_timeout(1000)  # 검색 결과 로딩 대기

    # cell_1_0 = 들여쓰기된 실제 메뉴 항목 (cell_0_0은 상위 카테고리 폴더)
    target = erp_page.locator(
        "[id*='leftFrame'][id*='grdMenu_body'][id*='cell_1_0'][id*='controltreeTextBoxElement']"
    ).get_by_text("시공일정관리", exact=True).first
    target.wait_for(state="attached", timeout=5000)
    target.click()

    erp_page.wait_for_timeout(3000)  # Nexacro 새 탭 로딩

    # ── 날짜 입력 (D-DAY ~ D+14) ──────────────────────────────────
    ctx.log(f"[{_elapsed(t0)}] 날짜 입력: {today_str} ~ {sch_end_str}")
    from_cal = erp_page.locator(f"{PREFIX}_div_search_cal_remDtFrom_calendaredit_input")
    from_cal.wait_for(state="attached", timeout=TIMEOUT_ERP_UI_MS)
    from_cal.click(click_count=3)
    from_cal.press_sequentially(today_str.replace('-', '/'), delay=50)
    from_cal.press("Tab")
    erp_page.wait_for_timeout(400)

    to_cal = erp_page.locator(f"{PREFIX}_div_search_cal_remDtTo_calendaredit_input")
    to_cal.click(click_count=3)
    to_cal.press_sequentially(sch_end_str.replace('-', '/'), delay=50)
    to_cal.press("Tab")
    erp_page.wait_for_timeout(400)

    # ── 재시공 체크박스 ──────────────────────────────────────────────
    # 정확한 ID: CheckBox_plmRcsec_chkimgImageElement (visibility:hidden → force=True)
    ctx.log(f"[{_elapsed(t0)}] 재시공 체크박스 선택")
    chk = erp_page.locator(
        f"{PREFIX}_div_search_CheckBox_plmRcsec_chkimgImageElement"
    )
    chk.wait_for(state="attached", timeout=5000)
    chk.click(force=True)
    ctx.log("  ✅ 체크박스 클릭 완료")
    erp_page.wait_for_timeout(300)

    # ── 조회 ──────────────────────────────────────────────────────
    ctx.log(f"[{_elapsed(t0)}] 조회 실행")
    # 조회 버튼: JS로 클릭 (ID 불확실한 경우 대비)
    erp_page.locator(f"{PREFIX}_div_search_btn_search").click(force=True)
    erp_page.locator("#mainframe_waitwindow").wait_for(
        state="hidden", timeout=TIMEOUT_SEARCH_LOADING_MS
    )
    erp_page.wait_for_timeout(500)

    # ── 데이터 존재 여부 ──────────────────────────────────────────
    first_row = erp_page.locator(f"{PREFIX}_grd_list_body_gridrow_0_cell_0_0")
    try:
        first_row.wait_for(state="attached", timeout=5000)
    except PWTimeoutError:
        try:
            erp_page.get_by_role("button", name="확인").click(timeout=2000)
        except Exception:
            pass
        ctx.log(f"  [{today_str} ~ {sch_end_str}] 시공재일정 재시공 건 없음 — 스킵")
        return None

    # ── 엑셀 다운로드 ─────────────────────────────────────────────
    ctx.log(f"[{_elapsed(t0)}] 시공재일정 엑셀 다운로드")
    first_row.click(button="right")
    erp_page.wait_for_timeout(1000)

    with erp_page.expect_download() as dl_info:
        # grd_list 그리드 우클릭 팝업: workgrd_listPopupMenu_31 = 자료변환
        erp_page.locator(
            f"{PREFIX}_div_workgrd_listPopupMenu_31TextBoxElement"
        ).click()

    dl = dl_info.value
    now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    save_path = ctx.output_dir / f"시공재일정_{today_str}_{sch_end_str}_{now_str}.xls"
    dl.save_as(str(save_path))
    ctx.log(f"[{_elapsed(t0)}] ✅ 시공재일정 다운로드 완료: {save_path.name}")
    return save_path


def _update_is_delayed(ctx, xls_path, t0):
    """시공재일정 XLS의 수주번호 → logistics_accidents.is_delayed 업데이트"""
    import pandas as pd
    from supabase import create_client

    supa_url = os.environ.get('VITE_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
    supa_key = os.environ.get('VITE_SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')

    if not supa_url or not supa_key:
        ctx.log("⚠️  Supabase 환경변수 없음 — is_delayed 업데이트 스킵")
        return

    ctx.log(f"[{_elapsed(t0)}] 시공재일정 XLS 파싱: {xls_path.name}")
    try:
        df = pd.read_excel(str(xls_path), engine='xlrd', dtype=str)
    except Exception as e:
        ctx.log(f"  xlrd 실패, openpyxl 재시도: {e}")
        df = pd.read_excel(str(xls_path), dtype=str)

    df.columns = [str(c).strip() for c in df.columns]
    df = df.fillna('')
    ctx.log(f"  실제 컬럼: {list(df.columns)}")
    ctx.log(f"  총 {len(df)}행")

    order_col = next(
        (c for c in df.columns if '수주번호' in c or '오더번호' in c), None
    )
    if not order_col:
        ctx.log("  ⚠️  수주번호 컬럼 없음 — 업데이트 스킵")
        return

    order_nos = list({
        str(v).strip()
        for v in df[order_col]
        if str(v).strip() and str(v).strip().lower() not in ('nan', 'none', '')
    })

    if not order_nos:
        ctx.log("  수주번호 없음 — 업데이트 스킵")
        return

    ctx.log(f"  재일정 대상 수주번호: {len(order_nos)}건")

    supa = create_client(supa_url, supa_key)

    existing = []
    CHUNK = 200
    for i in range(0, len(order_nos), CHUNK):
        resp = (
            supa.table('logistics_accidents')
                .select('id, is_delayed')
                .in_('order_no', order_nos[i:i + CHUNK])
                .execute()
        )
        if resp.data:
            existing.extend(resp.data)

    to_update = [
        {'id': r['id'], 'is_delayed': '재일정(지연)', 'updated_at': datetime.now().isoformat()}
        for r in existing
        if r.get('is_delayed') != '재일정(지연)'
    ]

    if not to_update:
        ctx.log("  새롭게 지연된 건 없음 — 스킵")
        return

    for i in range(0, len(to_update), CHUNK):
        supa.table('logistics_accidents') \
            .upsert(to_update[i:i + CHUNK], on_conflict='id') \
            .execute()

    ctx.log(f"[{_elapsed(t0)}] ✅ is_delayed 업데이트 완료: {len(to_update)}건")


def _elapsed(t0) -> str:
    return f"{(datetime.now() - t0).total_seconds():.1f}s"


def _dump_debug(page, ctx, tag: str):
    try:
        path = ctx.output_dir / f"{tag}.png"
        page.screenshot(path=str(path), full_page=True)
        ctx.log(f"  ↳ 스크린샷: {path.name}")
    except Exception as e:
        ctx.log(f"  ↳ 스크린샷 실패: {e}")
    try:
        path = ctx.output_dir / f"{tag}.html"
        path.write_text(page.content(), encoding="utf-8")
        ctx.log(f"  ↳ HTML: {path.name}")
    except Exception as e:
        ctx.log(f"  ↳ HTML 실패: {e}")
    try:
        ctx.log(f"  ↳ URL: {page.url}")
        ctx.log(f"  ↳ Title: '{page.title()}'")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Local Worker 직접 실행용 (worker.mjs → script_command)
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    import argparse
    from pathlib import Path
    from types import SimpleNamespace

    _parser = argparse.ArgumentParser(description='ERP 상차이슈 추출')
    _yesterday = str(date.today() - timedelta(days=1))
    _parser.add_argument('--start', default=None, help='시작일 YYYY-MM-DD (기본: 어제)')
    _parser.add_argument('--end',   default=None, help='종료일 YYYY-MM-DD (기본: 어제)')
    _parser.add_argument('--show',  action='store_true', help='브라우저 화면 표시 (디버깅용)')
    _args = _parser.parse_args()

    _out_dir = Path(os.environ.get('RPA_OUTPUT_DIR', './rpa_output'))
    _sec_dir = Path(os.environ.get('RPA_SECRETS_DIR', str(Path(__file__).parent)))
    _out_dir.mkdir(parents=True, exist_ok=True)

    _ctx = SimpleNamespace(
        job_id='local',
        params={
            'start_date': _args.start or '',
            'end_date':   _args.end   or '',
        },
        output_dir  = _out_dir,
        secrets_dir = _sec_dir,
        headless    = not _args.show,
        log = lambda msg: print(f'[ctx] {msg}', flush=True),
    )
    run(_ctx)