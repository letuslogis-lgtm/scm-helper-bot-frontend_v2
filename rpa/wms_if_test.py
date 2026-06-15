"""
wms_if_test.py
===============================================================================
WMS 입고예정정보 IF 단독 테스트 스크립트

[실행]
  python rpa/wms_if_test.py          # headless
  python rpa/wms_if_test.py --show   # 브라우저 표시 (권장)
===============================================================================
"""

import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

load_dotenv(Path(__file__).parent.parent / '.env')

WMS_URL      = 'https://wms.letus4u.com/'
WMS_USER     = os.getenv('WMS_USER')
WMS_PASSWORD = os.getenv('WMS_PASSWORD')

WMS_IDS = {
    'if_page_btn':     'button.modalBtn',
    'if_modal_btn':    '#saveAsnIfBtn',
    'if_complete_ok':  '#alertModal button.okBtn',
    'if_result_close': 'button.cancelBtn.mr10, #ifResultModal button.cancelBtn',
}


def run(headless: bool):
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=headless,
            args=['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        )
        ctx = browser.new_context(
            user_agent=(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            ),
            viewport={'width': 1920, 'height': 1080},
            locale='ko-KR',
        )
        page = ctx.new_page()
        try:
            # ── 1. 로그인 ──
            print('[1] WMS 로그인 중...')
            page.goto(WMS_URL, timeout=30000)
            page.wait_for_load_state('networkidle')
            page.fill('input[name="loginId"]', WMS_USER)
            page.fill('input[name="password"]', WMS_PASSWORD)
            page.click('button#sendAuthCodeBtn')
            page.wait_for_load_state('networkidle')
            page.wait_for_selector('input[name="loginId"]', state='hidden', timeout=5000)
            print('    로그인 성공')

            # ── 2. 로그인 후 팝업/알림 닫기 ──
            print('[2] 초기 팝업 정리...')
            for sel in ['button.closeBtn', 'button.cancelBtn']:
                try:
                    btn = page.locator(sel).first
                    btn.wait_for(state='visible', timeout=1500)
                    btn.click()
                    page.wait_for_timeout(300)
                except PWTimeout:
                    pass

            # ── 3. 메뉴 이동 (직접 URL) ──
            print('[3] 입고 예정 정보 관리 진입...')
            page.goto('http://wms.letus4u.com/v1/inbound/asn', timeout=30000)
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(3000)

            # ── 4. 진단 ──
            print(f'[4] 현재 URL: {page.url}')
            frames = page.frames
            print(f'    프레임 수: {len(frames)}')
            for f in frames:
                print(f'      - {f.url}')

            print('    텍스트 있는 버튼:')
            for b in page.locator('button').all():
                try:
                    txt = b.inner_text().strip()
                    cls = b.get_attribute('class') or ''
                    bid = b.get_attribute('id') or ''
                    if txt or 'modalBtn' in cls:
                        print(f'      - id={bid!r:20} class={cls!r:50} text={txt!r}')
                except Exception:
                    pass

            # ── 5. 버튼 클릭 시도 ──
            print('[5] 입고예정정보 IF 버튼 클릭 시도...')
            page_btn = page.locator(WMS_IDS['if_page_btn'])
            page_btn.wait_for(state='visible', timeout=10000)
            page_btn.click()
            page.wait_for_timeout(800)
            print('    페이지 버튼 클릭 완료')

            print('[6] 모달 내 버튼 클릭...')
            modal_btn = page.locator(WMS_IDS['if_modal_btn'])
            modal_btn.wait_for(state='visible', timeout=5000)
            modal_btn.click()
            print('    IF 실행 중... (최대 120초 대기)')

            print('[7/8] 완료 팝업 + 결과 모달 감시 (최대 120초)...')
            _js = ("(sel) => { const el = document.querySelector(sel);"
                   " if (!el) return 'not_found';"
                   " const r = el.getBoundingClientRect();"
                   " const s = window.getComputedStyle(el);"
                   " if (r.width > 0 && r.height > 0"
                   "     && s.display !== 'none' && s.visibility !== 'hidden')"
                   "   { el.click(); return 'clicked'; }"
                   " return 'hidden'; }")
            for i in range(240):
                if page.evaluate(_js, 'button.cancelBtn.mr10') == 'clicked':
                    break
                if page.evaluate(_js, '#alertModal button.okBtn') == 'clicked':
                    print('    완료 팝업 클릭')
                    page.wait_for_timeout(300)
                page.wait_for_timeout(500)
            else:
                raise PWTimeout('WMS IF 완료 대기 120초 초과')
            print('✅ WMS 입고예정정보 IF 완료')

        except Exception as e:
            print(f'❌ 오류: {e}')
        finally:
            if headless:
                ctx.close()
                browser.close()
            else:
                print('\n브라우저를 닫으려면 Enter...')
                input()
                ctx.close()
                browser.close()


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--show', action='store_true')
    args = p.parse_args()
    run(headless=not args.show)
