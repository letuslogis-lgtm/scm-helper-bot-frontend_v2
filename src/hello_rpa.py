import os
from pathlib import Path
from datetime import datetime

# 러너가 주입해주는 출력 디렉토리
out = Path(os.environ["RPA_OUTPUT_DIR"])

# 현재 시각이 담긴 텍스트 파일 생성
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
target = out / f"hello_{stamp}.txt"
target.write_text(f"RPA runner is alive!\nRun ID: {os.environ.get('RPA_JOB_ID', 'unknown')}\nTime: {stamp}")

print(f"✓ 스모크 테스트 성공: {target.name}")