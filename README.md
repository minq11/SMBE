# SMBE · Safety Must Be Easy

1인 + AI 개발을 위한 TypeScript 기반 메인 화면 및 실행 뼈대입니다.
요구사항은 `SMBE-design-v5.4.md`, `SMBE-menu-layout-v5.4.md`를 참고하며, 기존 `SMBE-plan-v1.md`의 스택·개발 순서는 적용하지 않습니다.

## 지금 구현된 범위

- PC·모바일 관리자 홈, 예시/빈 화면 전환, 준비 중 안내 대화상자
- Next.js App Router + React + TypeScript, 단일 앱에서 화면과 API 제공
- Neon 연결 확인 및 비공개 S3 연결 확인 (읽기 전용)
- Docker standalone 이미지, Lightsail용 Compose + Caddy 프록시
- 시크릿 없이 가능한 빌드·타입검사·린트·브라우저 테스트

로그인, 회사 생성, 업무 저장, 실제 점수·통계, 파일 업로드, 결제는 구현하지 않았습니다.
화면은 인증 없는 공개 미리보기이며 모든 이름·작업·건수는 예시입니다. 실제 고객 정보를 넣지 않습니다.

## Docker로 실행 (기본)

Docker Desktop 실행 후 CMD(명령 프롬프트)에서:

```bat
if not exist .env.local copy .env.template .env.local
docker compose --env-file .env.local -f compose.dev.yaml up --build --watch
```

PowerShell을 사용하는 경우:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.template .env.local }
docker compose --env-file .env.local -f compose.dev.yaml up --build --watch
```

http://localhost:3001 에서 확인합니다. 시크릿 없이 메인 화면을 볼 수 있습니다.
서버는 `.env.template`을 `.env`로 복사해 값을 설정한 뒤 `docker compose up -d --build`로 실행합니다.

**[서버 운영 안내 — 배포·마이그레이션·정기 배치](docs/operations.md)** ← 서버에서 뭘 해야 하는지
**[로컬·서버 Docker 명령어 전체 안내](docs/docker.md)**

## Node.js로 직접 실행 (선택)

Node.js 22.13 이상과 npm이 필요합니다. 저장소 루트에서:

```sh
npm ci
npm run dev
```

http://localhost:3000 에서 확인합니다. 배포 모드 확인은 `npm run build` 후 `npm start`입니다.

## Neon·S3 연결

PowerShell: `if (-not (Test-Path .env.local)) { Copy-Item .env.template .env.local }`

Linux/macOS: `test -f .env.local || cp .env.template .env.local`

`.env.local`에 다음을 입력합니다. 시크릿 파일은 Git과 Docker 빌드에서 제외됩니다.

| 값                                        | 입력 내용                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| DATABASE_URL                              | Neon Connect의 PostgreSQL URL. pooler 사용 가능, `sslmode=require` 포함 |
| AWS_REGION                                | S3 버킷 리전. 기본 `ap-northeast-2`; Neon 리전과 별개                   |
| S3_BUCKET                                 | 직접 생성한 비공개 S3 버킷 이름                                         |
| AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY | 해당 버킷만 접근 가능한 IAM 자격증명                                    |
| AWS_SESSION_TOKEN                         | 임시 자격증명을 쓰는 경우만 입력                                        |
| HEALTHCHECK_TOKEN                         | 32자 이상 무작위 토큰. 연결 진단 API 전용                               |

토큰 생성: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`

```sh
npm run check:connections
```

Neon에는 `SELECT 1`, S3에는 `HeadBucket`만 실행합니다. 테이블 생성이나 파일 업로드는 하지 않습니다.
S3는 퍼블릭 액세스 차단을 켜고 `infra/s3-policy.example.json`의 버킷 이름을 교체해 진단 계정에 적용합니다.
현재는 업로드 API가 없으므로 PutObject 권한이나 CORS 설정이 필요하지 않습니다.
두 서비스의 실제 연결은 본인 자격증명 입력 후 확인해야 합니다.

## API

| 요청                  | 응답      | 목적                                       |
| --------------------- | --------- | ------------------------------------------ |
| GET /api/health       | 200       | 앱 프로세스 상태, 클라우드 자격증명 불필요 |
| GET /api/health/ready | 200 / 503 | Neon·S3 실제 연결 상태                     |

ready 요청에는 `Authorization: Bearer <HEALTHCHECK_TOKEN>`이 필요합니다. 토큰 미설정/32자 미만/불일치는 401입니다.
응답에 접속 문자열·버킷 이름·원본 오류를 노출하지 않습니다. 실패 진단은 환경변수·IAM·네트워크를 확인하세요.
현재 DB·S3를 사용하지 않는 홈은 ready가 실패해도 실행됩니다. 업무 도입 후에는 업무별 필수 서비스 상태를 별도로 적용합니다.

## 폴더 구조

```text
src/app/                 화면 라우트, 공통 스타일, health API
src/features/dashboard/  관리자 홈 UI와 예시 데이터
src/server/              서버 연결·환경변수 검증 (클라이언트에서 import 금지)
scripts/                 배포·운영·연결 확인 스크립트
db/                      버전 관리 SQL 마이그레이션 (NNNN_설명.sql)
infra/                   Caddy·IAM 정책 예시
tests/                   PC·모바일 미리보기 및 API 경계 테스트
docs/                    운영 안내·설계 문서·개발일지
```

업무를 추가할 때 `src/features/<업무>/`와 `src/server/<업무>/`로 분리합니다.
아직 승인하지 않은 업무 스키마를 미리 고정하지 않습니다.

## 검증

```sh
npm run lint
npm run build
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

Lightsail 실행 절차는 [배포 안내](docs/lightsail.md), 서버 운영은 [운영 안내](docs/operations.md), 구조 결정은 [개발 뼈대](docs/architecture.md)를 참고하세요.

## 디자인

화면을 만들거나 고칠 때의 규칙은 [docs/design-constitution.md](docs/design-constitution.md)(디자인 헌법)에 있다.
