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
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError


RPA_META = {
    "name":        "상차이슈 추출",
    "version":     "2.4.2",
    "description": "Fursys ERP에서 상차이슈 엑셀을 자동 추출합니다",
    "parameters": [
        {"key": "start_date", "label": "조회 시작일", "type": "date", "required": True},
        {"key": "end_date",   "label": "조회 종료일", "type": "date", "required": True},
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
    # 0. 파라미터 검증
    # ---------------------------------------------------------------
    start_date = ctx.params["start_date"]
    end_date   = ctx.params["end_date"]

    d1 = datetime.strptime(start_date, "%Y-%m-%d")
    d2 = datetime.strptime(end_date,   "%Y-%m-%d")
    if d1 > d2:
        raise ValueError("시작일이 종료일보다 뒤입니다.")
    if (d2 - d1).days > 31:
        raise ValueError(f"조회 범위 초과 ({(d2 - d1).days}일). 최대 31일까지.")

    # ---------------------------------------------------------------
    # 1. 로그인 정보
    # ---------------------------------------------------------------
    with open(ctx.secrets_dir / "fursys_login.json", 'r', encoding='utf-8') as f:
        credentials = json.load(f)

    ctx.log(f"ERP 접속 시도: {start_date} ~ {end_date}")
    t0 = datetime.now()

    with sync_playwright() as playwright:
        # ---------------------------------------------------------------
        # 🔴 Stealth 브라우저 기동
        # ---------------------------------------------------------------
        browser = playwright.chromium.launch(
            headless=True,
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
        page.locator("#userId").fill(credentials["username"])
        page.locator("#userPw").fill(credentials["password"])
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
            ).wait_for(state="visible", timeout=TIMEOUT_ERP_UI_MS)
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

            # 날짜
            ctx.log(f"[{_elapsed(t0)}] 날짜 입력")
            from_cal = erp_page.locator(
                "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_div_search_from_cal_calendaredit_input"
            )
            from_cal.dblclick()
            from_cal.fill(f"{start_date} ")
            from_cal.press("Tab")

            to_cal = erp_page.locator(
                "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_div_search_to_cal_calendaredit_input"
            )
            to_cal.dblclick()
            to_cal.fill(f"{end_date} ")

            # 검색
            ctx.log(f"[{_elapsed(t0)}] 검색 실행")
            erp_page.locator(
                "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_div_search_btn_search"
            ).click()
            erp_page.locator("#mainframe_waitwindow").wait_for(
                state="hidden", timeout=TIMEOUT_SEARCH_LOADING_MS
            )
            erp_page.wait_for_timeout(500)

            # 엑셀 다운로드
            ctx.log(f"[{_elapsed(t0)}] 엑셀 다운로드")
            erp_page.locator(
                "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_Grid00_body_gridrow_0_cell_0_11"
            ).click(button="right")
            erp_page.wait_for_timeout(1000)

            with erp_page.expect_download() as download_info:
                erp_page.locator(
                    "#mainframe_VFrameSet_HFrameSet_VFrameSet1_workFrame_07002011_form_div_work_div_workGrid00PopupMenu_31TextBoxElement"
                ).get_by_text("자료변환 [Export File]").click()

            download  = download_info.value
            now_str   = datetime.now().strftime("%Y%m%d_%H%M%S")
            save_path = ctx.output_dir / f"상차이슈_{start_date}_{end_date}_{now_str}.xls"
            download.save_as(str(save_path))

            ctx.log(f"[{_elapsed(t0)}] ✅ RPA 작업 완료: {save_path.name}")

        except Exception as e:
            ctx.log(f"❌ 추출 중 오류: {e}")
            _dump_debug(erp_page, ctx, tag="extraction_failed")
            raise

        finally:
            try:
                context.close()
                browser.close()
            except Exception:
                pass


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