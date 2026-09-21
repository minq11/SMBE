# SMBE Docker 실행·운영 명령어

모든 명령은 프로젝트 루트 `SMBE`에서 실행합니다. 로컬은 Docker Desktop의 **Linux 컨테이너**, Lightsail은 Docker Engine + Compose 플러그인을 사용합니다. 코드 초기 동기화를 위해 **Docker Compose 2.32.0 이상**을 사용하세요. 호스트에 Node.js를 설치하지 않아도 됩니다.

## 구성

| 용도      | 설정               | 접속                              | 동작                      |
| --------- | ------------------ | --------------------------------- | ------------------------- |
| 로컬 개발 | `compose.dev.yaml` | http://localhost:3001             | 코드 변경 자동 반영       |
| 서버 운영 | `compose.yaml`     | http://고정IP 또는 https://도메인 | production 이미지 + Caddy |

Neon과 S3는 외부 서비스입니다. 로컬 DB·파일 서버 컨테이너는 만들지 않습니다. 화면은 시크릿 없이 실행되며 실제 업무는 아직 연결하지 않았습니다.

## 1. 로컬 최초 실행 — Windows

`C:\경로>` 프롬프트는 CMD, `PS C:\경로>`는 PowerShell입니다. 사용하는 셸에 맞는 명령을 실행하세요.

### CMD (명령 프롬프트)

Docker Desktop을 실행한 뒤 다음을 실행합니다. 기존 `.env.local`은 덮어쓰지 않습니다.

```bat
cd /d C:\Users\minku\Documents\ChatGPT\SMBE
if not exist .env.local copy .env.template .env.local
docker compose --env-file .env.local -f compose.dev.yaml up --build --watch
```

시크릿 입력이 필요하면 `notepad .env.local`로 편집합니다. 아래 Docker 명령들은 CMD와 PowerShell에서 동일하게 사용할 수 있습니다.

### PowerShell

Docker Desktop을 실행하고 Linux 엔진이 준비된 뒤 확인합니다.

```powershell
cd C:\Users\minku\Documents\ChatGPT\SMBE
docker version
docker compose version
if (-not (Test-Path .env.local)) { Copy-Item .env.template .env.local }
notepad .env.local
```

Neon/S3 값은 README를 참고해 입력합니다. 기본값 `LOCAL_PORT=3001`은 기존 3000번 미리보기와 충돌하지 않게 정했습니다. 기존 `.env.local`은 덮어쓰지 않습니다. 이전 `.env.example`은 로컬 접속 정보를 포함할 수 있어 Git에서 제외했습니다. **공유용 템플릿은 `.env.template` 하나입니다.**

```powershell
docker compose --env-file .env.local -f compose.dev.yaml up --build --watch
```

http://localhost:3001 을 엽니다. 터미널을 유지하면 `src/`, `public/`, `scripts/` 변경을 동기화합니다. 패키지·Next 설정 변경은 자동 재빌드합니다. `Ctrl+C`로 종료합니다.

Windows의 `node_modules`·`.next`를 컨테이너와 공유하지 않아 Linux 패키지와 충돌하지 않습니다. 컨테이너에서 소스를 직접 수정해도 호스트에는 반영되지 않으므로 소스는 PC에서 편집하세요.

macOS/Linux는 `test -f .env.local || cp .env.template .env.local`로 파일을 준비하고 동일한 Docker 명령을 사용합니다.

## 2. 로컬 명령어

| 작업                      | 명령                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| 실행 + 코드 감시          | `docker compose --env-file .env.local -f compose.dev.yaml up --build --watch`                            |
| 백그라운드 실행           | `docker compose --env-file .env.local -f compose.dev.yaml up -d --build`                                 |
| 별도 터미널에서 코드 감시 | `docker compose --env-file .env.local -f compose.dev.yaml watch`                                         |
| 상태                      | `docker compose --env-file .env.local -f compose.dev.yaml ps`                                            |
| 로그                      | `docker compose --env-file .env.local -f compose.dev.yaml logs -f --tail=100 app`                        |
| 재시작                    | `docker compose --env-file .env.local -f compose.dev.yaml restart app`                                   |
| 환경변수 변경 적용        | `docker compose --env-file .env.local -f compose.dev.yaml up -d --force-recreate app`                    |
| Neon·S3 연결 검사         | `docker compose --env-file .env.local -f compose.dev.yaml exec app npm run check:connections`            |
| 토큰 포함 API 연결 검사   | `docker compose --env-file .env.local -f compose.dev.yaml exec app node scripts/container-readiness.mjs` |
| 린트                      | `docker compose --env-file .env.local -f compose.dev.yaml exec app npm run lint`                         |
| 타입 검사                 | `docker compose --env-file .env.local -f compose.dev.yaml exec app npm run typecheck`                    |
| 일시 중지                 | `docker compose --env-file .env.local -f compose.dev.yaml stop`                                          |
| 중지한 컨테이너 재개      | `docker compose --env-file .env.local -f compose.dev.yaml start`                                         |
| 종료·컨테이너 제거        | `docker compose --env-file .env.local -f compose.dev.yaml down`                                          |

`up -d`에는 코드 감시가 포함되지 않으므로 별도 `watch`가 필요합니다. 환경변수 변경은 `restart`로 적용되지 않으며 재생성이 필요합니다. foreground watch 실행 중이면 Ctrl+C로 종료하고 설정을 수정한 후 다시 실행하세요.

패키지 추가는 호스트 Node/npm으로 하거나, 코드 감시를 잠시 종료하고 다음 일회성 컨테이너로 원본 package.json과 lockfile을 갱신합니다.

```powershell
# PACKAGE_NAME을 실제 패키지명으로 교체합니다.
docker run --rm --mount "type=bind,source=$($PWD.Path),target=/workspace" -w /workspace node:22-alpine npm install --package-lock-only PACKAGE_NAME
docker compose --env-file .env.local -f compose.dev.yaml up --build --watch
```

운영 빌드는 개발 서버의 `.next`와 충돌하지 않게 별도 이미지로 검사합니다.

```sh
docker build --target runner -t smbe:check .
```

## 3. Lightsail 최초 실행 — Ubuntu

Lightsail 인스턴스와 고정 IP를 준비하고 [공식 Ubuntu 안내](https://docs.docker.com/engine/install/ubuntu/)대로 Docker Engine과 Compose를 설치합니다. Docker 실행 권한이 없다면 명령 앞에 `sudo`를 사용합니다.

방화벽은 TCP 80·443을 공개하고 SSH 22는 관리 IP로 제한합니다. 앱의 3000번 포트는 열지 않습니다. GitHub에 최신 코드가 올라가 있어야 아래 clone으로 받을 수 있습니다.

```sh
git clone https://github.com/minq11/SMBE.git
cd SMBE
test -f .env || cp .env.template .env
chmod 600 .env
nano .env
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app proxy
```

서버는 `.env`, 로컬은 `.env.local`을 읽습니다. 접속 정보는 각각 관리합니다. 값에 `$`가 있으면 `.env`에서 전체 값을 작은따옴표로 감싸 Compose 치환을 막으세요.

- `SITE_ADDRESS=:80`: `http://고정IP`에서 미리보기.
- `SITE_ADDRESS=본인도메인`: DNS A 레코드를 고정 IP로 연결하면 Caddy가 HTTPS 인증서를 발급합니다. 프로토콜은 넣지 않습니다. AAAA 레코드도 있다면 서버 IPv6와 일치해야 합니다.

시크릿 토큰은 HTTP로 보내지 말고 HTTPS 또는 아래 컨테이너 내부 진단 명령을 사용하세요.

## 4. 서버 운영 명령어

| 작업                      | 명령                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| 배포 (CI 이미지 받기)     | `smbe-deploy` · 수동은 `docker compose pull app && docker compose up -d`                     |
| 서버 직접 빌드 (비상용)   | `smbe-deploy --local-build` — 스왑 필수                                                      |
| DB 마이그레이션 적용      | `docker compose --profile tools run --rm migrate`                                            |
| 배포 + 마이그레이션       | `./scripts/deploy.sh --migrate`                                                              |
| 상태                      | `docker compose ps`                                                                          |
| 앱 로그                   | `docker compose logs -f --tail=100 app`                                                      |
| 프록시·인증서 로그        | `docker compose logs -f --tail=100 proxy`                                                    |
| 앱 재시작                 | `docker compose restart app`                                                                 |
| 환경변수·도메인 변경 적용 | `docker compose up -d --force-recreate`                                                      |
| Neon·S3 연결 확인         | `docker compose exec app node scripts/container-readiness.mjs`                               |
| 프록시 설정 검사          | `docker compose exec proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` |
| 프록시 설정 다시 읽기     | `docker compose exec proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`   |
| 일시 중지 / 재개          | `docker compose stop` / `docker compose start`                                               |
| 종료·컨테이너 제거        | `docker compose down`                                                                        |
| 디스크 사용량             | `docker system df`                                                                           |

코드 업데이트:

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose exec app node scripts/container-readiness.mjs
```

단일 서버이므로 재배포 중 잠깐 중단될 수 있습니다. 서버에서 이미지를 빌드하다 메모리가 부족하면 별도 빌드 환경을 사용하거나 인스턴스 메모리를 늘립니다.

## 5. 로컬에서 운영 모드로 확인 (선택)

`.env.template`을 `.env`로 복사하고 `SITE_ADDRESS=:80`을 유지한 뒤 서버와 동일한 `docker compose up -d --build`를 실행하면 http://localhost 에서 운영 모드로 볼 수 있습니다. 80·443번 포트가 비어 있어야 합니다. 개발 프로젝트 `smbe-dev`와 운영 프로젝트 `smbe-server`는 분리됩니다. 운영 모드에는 코드 자동 반영이 없으므로 수정 후 재빌드하세요.

## 6. 상태·오류·데이터 보관

- `/api/health`의 200은 앱 실행 상태이며 Neon/S3 성공을 의미하지 않습니다.
- 진단 스크립트의 200은 Neon/S3 모두 성공, 503은 설정·권한·네트워크 확인이 필요함을 의미합니다.
- `HEALTHCHECK_TOKEN`은 32자 이상이어야 합니다. 개발 컨테이너에서 생성하려면 다음 명령을 사용하세요.

```sh
docker compose --env-file .env.local -f compose.dev.yaml exec app node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

- `dockerDesktopLinuxEngine`을 찾지 못하면 Docker Desktop을 시작하고 Linux 엔진 준비를 기다립니다.
- 포트 충돌 시 `.env.local`의 `LOCAL_PORT`를 바꾸고 `up`을 다시 실행합니다.
- 변경이 반영되지 않으면 `watch` 실행 여부를 확인하고 필요하면 `down` 후 `up --build --watch`로 시작합니다.
- 운영의 `restart: unless-stopped`는 프로세스 종료에 적용되며 `unhealthy` 표시만으로 재시작하지 않습니다.
- `down`은 Neon 데이터·S3 파일·Caddy 인증서 볼륨을 지우지 않습니다. **일상적인 종료에 `down -v`나 `docker system prune --volumes`는 사용하지 마세요.**
- 실제 환경변수는 Git·이미지에서 제외됩니다. `docker compose config`는 값을 출력할 수 있으므로 검증·공유에는 `config --quiet`를 사용하세요.

참고: [Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/), [Next.js Docker 구성](https://docs.docker.com/guides/nextjs/).
