-- WMS CUT리스트 자동 추출 봇 등록 (센터별 5개)
-- ⚠️ 셀렉터 설정 완료 후 enabled = true 로 변경할 것

INSERT INTO public.rpa_jobs (rpa_name, description, runner_type, script_command, cron_expr, enabled)
VALUES
    (
        'WMS 결품추출 - 양지1',
        'WMS 양지1물류센터 CUT리스트 자동 추출 (매일 00:00, 전일 기준)',
        'local',
        'python rpa/wms_extract.py --center 양지1물류센터',
        '0 0 * * *',
        false
    ),
    (
        'WMS 결품추출 - 양지2',
        'WMS 양지2물류센터 CUT리스트 자동 추출 (매일 00:05, 전일 기준)',
        'local',
        'python rpa/wms_extract.py --center 양지2물류센터',
        '5 0 * * *',
        false
    ),
    (
        'WMS 결품추출 - 양지3',
        'WMS 양지3물류센터 CUT리스트 자동 추출 (매일 00:10, 전일 기준)',
        'local',
        'python rpa/wms_extract.py --center 양지3물류센터',
        '10 0 * * *',
        false
    ),
    (
        'WMS 결품추출 - 안성',
        'WMS 안성물류센터 CUT리스트 자동 추출 (매일 00:15, 전일 기준)',
        'local',
        'python rpa/wms_extract.py --center 안성물류센터',
        '15 0 * * *',
        false
    ),
    (
        'WMS 결품추출 - 평택',
        'WMS 평택물류센터 CUT리스트 자동 추출 (매일 00:20, 전일 기준)',
        'local',
        'python rpa/wms_extract.py --center 평택물류센터',
        '20 0 * * *',
        false
    );
