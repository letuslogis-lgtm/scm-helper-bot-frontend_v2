"""
main_runner.py  (v2 - Contract Runner)
===============================================================================
Playwright 기반 물류 ERP RPA 플랫폼 - GitHub Actions Runner

[v2 계약 (Contract)]
  사용자 스크립트는 다음 2가지를 제공한다:
    1) RPA_META   : dict   — RPA 이름/파라미터/필요 시크릿 선언
    2) run(ctx)   : func   — 실제 실행 진입점
         ctx.params       : dict   대시보드에서 받은 입력값
         ctx.output_dir   : Path   결과 파일 저장 경로
         ctx.secrets_dir  : Path   auth.json 등 시크릿 파일들의 폴더
         ctx.log(msg)     : func   진행 상황을 로그로 찍기 (A안: stdout만)
         ctx.job_id       : str    현재 rpa_runs.id

  run() 이 없는 legacy 스크립트(hello_rpa.py 등)도 호환되도록
  top-level 실행을 그대로 허용한다.

[실행 흐름]
    1. 환경변수 확인
    2. rpa_runs 상태 전이:   pending -> running
    3. 사용자 스크립트 다운로드
    4. RPA_META 파싱 (AST)
    5. rpa_jobs 의 parameters_schema / required_secrets 동기화
    6. rpa_runs.params 로드 → RPA_PARAMS 환경변수로 주입
    7. RPA_META["secrets"] 에 따라 rpa-secrets 버킷에서 파일 다운로드
    8. bootstrap 래퍼로 run(ctx) 호출 (subprocess 격리)
    9. RPA_OUTPUT_DIR 의 산출물 업로드
   10. rpa_runs 상태 마감 (success / failed / timeout)
   11. rpa_jobs.last_run_at 갱신
===============================================================================
"""

from __future__ import annotations

import ast
import json
import os
import subprocess
import sys
import textwrap
import traceback
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from supabase import create_client, Client


# ---------------------------------------------------------------------------
# 0. 환경변수 / 설정
# ---------------------------------------------------------------------------
def _require_env(key: str) -> str:
    val = os.environ.get(key)
    if not val:
        print(f"[FATAL] 필수 환경변수 누락: {key}", flush=True)
        sys.exit(2)
    return val


JOB_ID               = _require_env("JOB_ID")               # = rpa_runs.id
SCRIPT_URL           = _require_env("SCRIPT_URL")
SUPABASE_URL         = _require_env("SUPABASE_URL")
SUPABASE_SERVICE_KEY = _require_env("SUPABASE_SERVICE_KEY")

# Storage 버킷 규약
BUCKET_ARTIFACTS = os.environ.get("BUCKET_ARTIFACTS", "rpa-artifacts")
BUCKET_LOGS      = os.environ.get("BUCKET_LOGS",      "rpa-logs")
BUCKET_SECRETS   = os.environ.get("BUCKET_SECRETS",   "rpa-secrets")

# DB 테이블명
TABLE_RUNS        = "rpa_runs"
TABLE_DEFINITIONS = "rpa_jobs"

# 작업 공간
WORK_ROOT    = Path(os.environ.get("RPA_WORK_ROOT", "/tmp/rpa_work")) / JOB_ID
SCRIPT_DIR   = WORK_ROOT / "script"
OUTPUT_DIR   = WORK_ROOT / "output"
SECRETS_DIR  = WORK_ROOT / "secrets"
LOG_PATH     = WORK_ROOT / "runner.log"
BOOTSTRAP_PY = WORK_ROOT / "_bootstrap.py"

# 사용자 스크립트 실행 타임아웃 (초). 기본 25분
EXEC_TIMEOUT = int(os.environ.get("RPA_TIMEOUT", "1500"))

# Supabase 클라이언트
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ---------------------------------------------------------------------------
# 1. 공용 유틸
# ---------------------------------------------------------------------------
def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(msg: str) -> None:
    """러너의 로그. stdout + 파일 동시 기록."""
    line = f"[{now_utc_iso()}] {msg}"
    print(line, flush=True)
    try:
        WORK_ROOT.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception as e:
        print(f"[WARN] 로그 파일 기록 실패: {e}", flush=True)


def update_run(**fields) -> None:
    """rpa_runs 테이블(실행 이력) 상태 갱신."""
    try:
        supabase.table(TABLE_RUNS).update(fields).eq("id", JOB_ID).execute()
    except Exception as e:
        log(f"[WARN] {TABLE_RUNS} 업데이트 실패 (fields={list(fields.keys())}): {e}")


def fetch_run_context() -> tuple[str | None, dict]:
    """
    rpa_runs 에서 definition_id 와 params 를 한 번에 가져온다.
    반환: (definition_id, params_dict)
    """
    try:
        resp = (
            supabase.table(TABLE_RUNS)
            .select("definition_id, params")
            .eq("id", JOB_ID)
            .single()
            .execute()
        )
        data = resp.data or {}
        return data.get("definition_id"), (data.get("params") or {})
    except Exception as e:
        log(f"[WARN] rpa_runs 컨텍스트 조회 실패: {e}")
        return None, {}


def touch_definition_last_run(definition_id: str | None) -> None:
    """rpa_jobs.last_run_at 을 현재 시각으로 업데이트."""
    if not definition_id:
        log("[WARN] definition_id 없음 — last_run_at 갱신 스킵")
        return
    try:
        supabase.table(TABLE_DEFINITIONS) \
            .update({"last_run_at": now_utc_iso()}) \
            .eq("id", definition_id) \
            .execute()
        log(f"      {TABLE_DEFINITIONS}.last_run_at 갱신 완료")
    except Exception as e:
        log(f"[WARN] last_run_at 갱신 실패: {e}")


# ---------------------------------------------------------------------------
# 2. 스크립트 다운로드
# ---------------------------------------------------------------------------
def download_script() -> Path:
    """SCRIPT_URL에서 사용자 파이썬 스크립트를 받아 SCRIPT_DIR에 저장."""
    SCRIPT_DIR.mkdir(parents=True, exist_ok=True)

    file_name = Path(urlparse(SCRIPT_URL).path).name or "user_script.py"
    if not file_name.endswith(".py"):
        file_name = "user_script.py"
    target = SCRIPT_DIR / file_name

    log(f"[1/5] 스크립트 다운로드: {SCRIPT_URL}")
    resp = requests.get(SCRIPT_URL, timeout=60)
    resp.raise_for_status()
    target.write_bytes(resp.content)
    log(f"      저장 완료: {target.name} ({len(resp.content):,} bytes)")
    return target


# ---------------------------------------------------------------------------
# 3. RPA_META 파싱 (AST 기반 — 안전)
# ---------------------------------------------------------------------------
def extract_rpa_meta(script_path: Path) -> dict:
    """
    사용자 스크립트에서 RPA_META = {...} 를 AST로 찾아 literal_eval 한다.
    스크립트를 import하지 않으므로 사이드 이펙트 없음.
    RPA_META 가 없거나 단순 dict 리터럴이 아니면 빈 dict 반환.
    """
    try:
        source = script_path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "RPA_META":
                        try:
                            return ast.literal_eval(node.value)
                        except (ValueError, SyntaxError):
                            log("[WARN] RPA_META 를 literal_eval 하지 못했습니다 (동적 값 사용?)")
                            return {}
        return {}
    except Exception as e:
        log(f"[WARN] RPA_META 파싱 실패: {e}")
        return {}


def sync_meta_to_definition(meta: dict, definition_id: str | None) -> None:
    """
    파싱한 RPA_META 로 rpa_jobs 의 parameters_schema / required_secrets 를 최신화.
    대시보드가 이 값을 읽어 실행 폼을 자동 렌더링한다.
    """
    if not definition_id or not meta:
        return
    update_fields: dict = {}
    if "parameters" in meta:
        update_fields["parameters_schema"] = meta["parameters"]
    if "secrets" in meta:
        update_fields["required_secrets"] = meta["secrets"]
    # rpa_name 도 메타에 있으면 보강 (빈 이름 RPA 방지)
    if meta.get("name"):
        update_fields["rpa_name"] = meta["name"]

    if not update_fields:
        return
    try:
        supabase.table(TABLE_DEFINITIONS) \
            .update(update_fields) \
            .eq("id", definition_id) \
            .execute()
        log(f"      rpa_jobs 메타 동기화 완료 (keys={list(update_fields.keys())})")
    except Exception as e:
        log(f"[WARN] rpa_jobs 메타 동기화 실패: {e}")


# ---------------------------------------------------------------------------
# 4. Secrets 다운로드
# ---------------------------------------------------------------------------
def download_secrets(required_secrets: list[str]) -> None:
    """
    rpa-secrets 버킷의 각 하위 폴더(= secret name)에서 모든 파일을 받아
    SECRETS_DIR 평면 구조로 저장한다.

    버킷 레이아웃 규약:
        rpa-secrets/
          └── {secret_name}/           ← RPA_META["secrets"] 항목명과 일치
                ├── *.json
                └── *.pem  (파일 종류 자유)

    로컬 레이아웃:
        SECRETS_DIR/
          ├── fursys_auth.json
          └── ... (모든 secret의 파일이 한 폴더에)
    """
    SECRETS_DIR.mkdir(parents=True, exist_ok=True)

    if not required_secrets:
        log("      요구 시크릿 없음 — 스킵")
        return

    for secret_name in required_secrets:
        try:
            files = supabase.storage.from_(BUCKET_SECRETS).list(secret_name)
            if not files:
                raise FileNotFoundError(f"시크릿 폴더 '{secret_name}/' 가 비어있거나 존재하지 않습니다")

            for f in files:
                fname = f.get("name")
                if not fname:
                    continue
                remote = f"{secret_name}/{fname}"
                data   = supabase.storage.from_(BUCKET_SECRETS).download(remote)
                (SECRETS_DIR / fname).write_bytes(data)
                log(f"      ✓ secret: {remote} ({len(data):,} bytes)")
        except Exception as e:
            # 시크릿 실패는 치명적 — 사용자 스크립트가 돌 수 없음
            raise RuntimeError(f"시크릿 '{secret_name}' 다운로드 실패: {e}") from e


# ---------------------------------------------------------------------------
# 5. Bootstrap — 사용자 스크립트를 run(ctx) 규약으로 호출
# ---------------------------------------------------------------------------
BOOTSTRAP_TEMPLATE = textwrap.dedent('''
    """러너가 주입하는 부트스트랩. 사용자 스크립트를 import 하여 run(ctx) 를 호출."""
    import importlib.util
    import json
    import os
    import sys
    from pathlib import Path
    from types import SimpleNamespace

    # ---- ctx 구성 ----
    ctx = SimpleNamespace(
        job_id      = os.environ.get("RPA_JOB_ID", ""),
        params      = json.loads(os.environ.get("RPA_PARAMS", "{}")),
        output_dir  = Path(os.environ["RPA_OUTPUT_DIR"]),
        secrets_dir = Path(os.environ["RPA_SECRETS_DIR"]),
    )

    def _log(msg):
        # A안: ctx.log 는 stdout 만 찍는다. 러너가 captured stdout 을 로그로 수집.
        print(f"[ctx] {msg}", flush=True)
    ctx.log = _log

    # ---- 사용자 스크립트 import ----
    script_path = os.environ["RPA_SCRIPT_PATH"]
    spec = importlib.util.spec_from_file_location("user_script", script_path)
    if spec is None or spec.loader is None:
        print(f"[FATAL] 사용자 스크립트 로드 실패: {script_path}", file=sys.stderr)
        sys.exit(2)

    module = importlib.util.module_from_spec(spec)
    sys.modules["user_script"] = module
    spec.loader.exec_module(module)

    # ---- run(ctx) 호출 (없으면 legacy 모드로 간주) ----
    if hasattr(module, "run") and callable(module.run):
        module.run(ctx)
    else:
        print("[ctx] run(ctx) 미정의 — legacy 모드로 종료", flush=True)
''').strip() + "\n"


def execute_script(script_path: Path) -> tuple[int, bool]:
    """
    Bootstrap 래퍼를 통해 사용자 스크립트를 subprocess 격리 실행.
    반환: (returncode, timed_out)
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    BOOTSTRAP_PY.write_text(BOOTSTRAP_TEMPLATE, encoding="utf-8")

    child_env = os.environ.copy()
    child_env["RPA_JOB_ID"]      = JOB_ID
    child_env["RPA_SCRIPT_PATH"] = str(script_path)
    child_env["RPA_OUTPUT_DIR"]  = str(OUTPUT_DIR)
    child_env["RPA_SECRETS_DIR"] = str(SECRETS_DIR)
    # RPA_PARAMS 는 main() 에서 주입된 상태 (환경변수로 이미 설정됨)
    # Service Key 는 자식 프로세스에 노출 금지
    child_env.pop("SUPABASE_SERVICE_KEY", None)

    log(f"[4/5] 스크립트 실행 시작 (timeout={EXEC_TIMEOUT}s)")

    try:
        completed = subprocess.run(
            [sys.executable, str(BOOTSTRAP_PY)],
            cwd=str(OUTPUT_DIR),
            env=child_env,
            capture_output=True,
            text=True,
            timeout=EXEC_TIMEOUT,
        )
    except subprocess.TimeoutExpired as e:
        log(f"[ERROR] 실행 타임아웃 ({EXEC_TIMEOUT}s 초과)")
        if e.stdout:
            out = e.stdout if isinstance(e.stdout, str) else e.stdout.decode("utf-8", "ignore")
            log("----- stdout (timeout) -----\n" + out)
        if e.stderr:
            err = e.stderr if isinstance(e.stderr, str) else e.stderr.decode("utf-8", "ignore")
            log("----- stderr (timeout) -----\n" + err)
        return 124, True

    if completed.stdout:
        log("----- stdout -----\n" + completed.stdout.rstrip())
    if completed.stderr:
        log("----- stderr -----\n" + completed.stderr.rstrip())
    log(f"      종료. returncode={completed.returncode}")
    return completed.returncode, False


# ---------------------------------------------------------------------------
# 6. 산출물/로그 업로드
# ---------------------------------------------------------------------------
def _upload_file(bucket: str, local: Path, storage_path: str,
                 content_type: str | None = None) -> str | None:
    file_options: dict = {"upsert": "true"}
    if content_type:
        file_options["content-type"] = content_type
    try:
        with open(local, "rb") as f:
            supabase.storage.from_(bucket).upload(
                path=storage_path, file=f, file_options=file_options
            )
        return supabase.storage.from_(bucket).get_public_url(storage_path)
    except Exception as e:
        log(f"[WARN] 업로드 실패 ({bucket}/{storage_path}): {e}")
        return None


def upload_artifacts() -> list[str]:
    """OUTPUT_DIR 아래의 모든 파일을 {BUCKET_ARTIFACTS}/{JOB_ID}/... 로 업로드."""
    log("[5/5] 산출물 업로드")
    if not OUTPUT_DIR.exists():
        log("      산출물 디렉토리 없음 — 스킵")
        return []

    files = [p for p in OUTPUT_DIR.rglob("*") if p.is_file()]
    if not files:
        log("      산출물 없음 — 스킵")
        return []

    urls: list[str] = []
    for path in files:
        rel = path.relative_to(OUTPUT_DIR).as_posix()
        url = _upload_file(BUCKET_ARTIFACTS, path, f"{JOB_ID}/{rel}")
        if url:
            urls.append(url)
            log(f"      ✓ {rel} ({path.stat().st_size:,} bytes)")
    log(f"      총 {len(urls)}/{len(files)} 건 업로드 완료")
    return urls


def upload_run_log() -> str | None:
    if not LOG_PATH.exists():
        return None
    return _upload_file(
        BUCKET_LOGS, LOG_PATH, f"{JOB_ID}/runner.log",
        content_type="text/plain; charset=utf-8",
    )


# ---------------------------------------------------------------------------
# 7. 메인
# ---------------------------------------------------------------------------
def main() -> int:
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    log(f"===== RPA Runner v2 START | RUN_ID={JOB_ID} =====")

    # pending → running
    update_run(status="running", started_at=now_utc_iso())

    # 이 definition_id 는 에러 경로에서도 last_run_at 을 갱신하기 위해 먼저 확보
    definition_id: str | None = None

    try:
        # [1] 스크립트 다운로드
        script_path = download_script()

        # [2] 메타 파싱
        log("[2/5] RPA_META 파싱")
        meta = extract_rpa_meta(script_path)
        rpa_name         = meta.get("name") or "(unnamed)"
        rpa_version      = meta.get("version") or "-"
        required_secrets = meta.get("secrets") or []
        log(f"      name={rpa_name} / version={rpa_version} / secrets={required_secrets}")

        # [3] 실행 컨텍스트(definition_id, params) 조회 + 메타 동기화
        log("[3/5] 실행 컨텍스트 준비")
        definition_id, params = fetch_run_context()
        log(f"      definition_id={definition_id} / params_keys={list(params.keys())}")
        sync_meta_to_definition(meta, definition_id)

        # params 를 자식 프로세스에 전달
        os.environ["RPA_PARAMS"] = json.dumps(params, ensure_ascii=False)

        # 시크릿 다운로드 (실패 시 즉시 예외)
        download_secrets(required_secrets)

        # [4] 스크립트 실행
        rc, timed_out = execute_script(script_path)

        # [5] 결과 수집 (성공/실패 무관하게 최대한 수집)
        artifact_urls = upload_artifacts()
        log_url       = upload_run_log()

        # 최종 상태 결정
        if timed_out:
            update_run(
                status="timeout", finished_at=now_utc_iso(),
                error_message=f"Execution exceeded {EXEC_TIMEOUT}s",
                result_urls=artifact_urls, log_url=log_url,
            )
            touch_definition_last_run(definition_id)
            log("===== END: TIMEOUT =====")
            return 124

        if rc != 0:
            update_run(
                status="failed", finished_at=now_utc_iso(),
                error_message=f"Exit code {rc}",
                result_urls=artifact_urls, log_url=log_url,
            )
            touch_definition_last_run(definition_id)
            log(f"===== END: FAILED (rc={rc}) =====")
            return rc

        update_run(
            status="success", finished_at=now_utc_iso(),
            error_message=None,
            result_urls=artifact_urls, log_url=log_url,
        )
        touch_definition_last_run(definition_id)
        log("===== END: SUCCESS =====")
        return 0

    except Exception:
        tb = traceback.format_exc()
        log(f"[FATAL]\n{tb}")
        log_url = upload_run_log()
        update_run(
            status="failed", finished_at=now_utc_iso(),
            error_message=tb[-2000:], log_url=log_url,
        )
        touch_definition_last_run(definition_id)
        return 1


if __name__ == "__main__":
    sys.exit(main())
