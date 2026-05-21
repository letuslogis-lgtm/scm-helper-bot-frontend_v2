# LETUS LOGIS — 프로젝트 지침

## 세션 시작 시 필수 행동

이 프로젝트 디렉토리에서 세션이 시작되면, 가장 먼저 아래 파일을 읽어 프로젝트 전체 구조를 파악한다.

```
C:\Users\FURSYS\Desktop\Python\LetusLogis\PROJECT_MAP.md
```

PROJECT_MAP.md에는 다음이 포함되어 있다:
- 전체 디렉토리 구조 및 각 파일 역할
- 주요 DB 테이블 / Storage 버킷 목록
- 핵심 기능 흐름 (입고 특이사항, WMS 결품 추출, RPA Worker 등)
- 시스템 아키텍처 다이어그램
- Edge Functions, 환경변수, 빌드 명령어
- 최근 변경 이력

사용자의 첫 번째 요청을 처리하기 전에 이 파일을 읽어 컨텍스트를 확보한다.

---

## 프로젝트 개요

- **시스템명**: LETUS LOGIS (일룸 물류 입고 특이사항 통합 관리 시스템)
- **기술 스택**: React 18 + Vite + TailwindCSS / Supabase (PostgreSQL + Edge Functions) / Python RPA (Playwright) / Node.js Local Worker
- **배포**: Vercel (프론트엔드) + Supabase Cloud (백엔드)
- **내부 연동**: MS-SQL (fgdw, 상품마스터) / WMS (결품추출)
