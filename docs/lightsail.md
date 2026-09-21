# Lightsail 배포

이 문서는 설정 파일을 사용해 직접 배포하는 절차입니다. 실제 AWS 리소스 생성·비용 발생·배포는 아직 하지 않았습니다.
로컬·서버 명령어 전체는 [Docker 실행·운영 안내](docker.md)를 참고하세요.
시크릿 외에도 Lightsail 인스턴스, Docker Compose, S3 버킷, Neon DB가 준비되어 있어야 합니다.

## 1. 서버 준비

Lightsail 서울 리전에 Ubuntu LTS 인스턴스를 생성하고 고정 IP를 연결합니다. 서버에서 이미지를 빌드한다면 메모리 여유가 필요하므로 2GB 이상에서 시작해 빌드 메모리를 확인하세요. 작은 서버에서 빌드가 실패하면 더 큰 빌드 환경에서 이미지를 만드는 방식으로 전환합니다.

Docker Engine과 Compose 플러그인을 [공식 Ubuntu 설치 안내](https://docs.docker.com/engine/install/ubuntu/)대로 설치합니다. `docker compose version`으로 확인합니다.

Lightsail 네트워킹에서 TCP 80·443을 열고 SSH 22는 관리 IP로 제한합니다. IPv6를 사용할 경우 IPv6 규칙도 확인합니다. 3000번 포트는 공개하지 않습니다.

## 2. 코드와 설정

이 코드는 현재 로컬에만 있으므로 먼저 본인이 GitHub에 커밋·푸시해야 아래 clone으로 받을 수 있습니다. 이미 받은 서버에서는 pull을 사용합니다.

```sh
git clone https://github.com/minq11/SMBE.git
cd SMBE
test -f .env || cp .env.template .env
chmod 600 .env
nano .env
```

로컬용 `.env.local`과 달리 Docker Compose는 `.env`를 사용합니다.
Neon/S3/진단 토큰은 README를 보고 입력합니다. 설정 파일의 `$` 문자는 Compose 보간 대상이므로 값에 `$`가 포함되면 `.env`에서 전체 값을 작은따옴표로 감쌉니다.

도메인이 없다면 `SITE_ADDRESS=:80`을 유지하면 `http://고정IP`로 화면을 볼 수 있습니다. 이는 공개 미리보기 용도입니다. 토큰을 전송하는 진단 API는 HTTPS 또는 서버 내부에서만 호출하세요.

도메인이 있다면 A 레코드를 고정 IP에 연결하고 `SITE_ADDRESS=smbe.example.com`처럼 프로토콜 없이 입력합니다. 잘못된 AAAA 레코드는 제거하거나 서버 IPv6와 맞추세요. Caddy가 인증서를 자동 발급하며 인증서 상태는 볼륨에 보존합니다.

## 3. 실행 및 확인

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app proxy
curl --fail http://127.0.0.1/api/health
```

마지막 curl은 `SITE_ADDRESS=:80`일 때의 예시입니다. 도메인 모드에서는 `curl --fail https://본인도메인/api/health`를 사용합니다.

컨테이너 내부에서 토큰을 화면에 출력하지 않고 실제 연결 확인:

```sh
docker compose exec app node scripts/container-readiness.mjs
```

health는 프로세스 상태이고 ready는 Neon과 S3 상태입니다. Docker healthcheck는 아직 업무 연결 없는 홈의 생존 여부만 확인합니다. Docker의 restart 정책은 프로세스 종료 시 적용되며 unhealthy 자체를 자동 재시작하지는 않습니다.

## 4. 업데이트와 운영

운영 이미지는 GitHub Actions 가 만들어 GHCR 에 올립니다. 서버는 받아서 실행만 합니다.

```sh
smbe-deploy          # git pull + 이미지 pull + 재기동 + 헬스체크
```

**서버에서 `next build` 를 돌리지 않습니다.** 2GB 인스턴스에서 빌드 피크가 가용 메모리를
넘기면 커널이 멎어 SSH 입력조차 받지 않습니다(2026-09-21 실제 발생). 스왑은 그때 서버가
죽는 대신 느려지게 하는 안전망이지 해결책이 아닙니다.

최초 1회, 서버가 GHCR 에서 이미지를 받으려면 로그인이 필요합니다. 저장소가 비공개이므로
패키지도 비공개입니다.

```sh
# GitHub → Settings → Developer settings → Personal access tokens (classic)
# 권한: read:packages 만
echo <PAT> | docker login ghcr.io -u <깃허브아이디> --password-stdin
```

스왑(2GB)은 그대로 켜 두세요. 마이그레이션 컨테이너와 런타임 여유에 쓰입니다.

CI 가 막혀 이미지를 못 받는 비상 상황에서만 서버 빌드를 씁니다.

```sh
smbe-deploy --local-build
```

`db/` 에 새 마이그레이션이 포함된 배포라면 스키마를 먼저 적용합니다. 서버 호스트에는 Node 를
설치하지 않으므로 컨테이너로 실행합니다.

```sh
./scripts/deploy.sh --migrate
# 또는 마이그레이션만:
docker compose --profile tools run --rm migrate
```

단일 서버이므로 재배포나 장애 시 잠깐 중단될 수 있습니다. Caddy 볼륨·시크릿은 삭제하지 않습니다. 이 단계는 무중단 배포나 자동 DB 복구를 제공하지 않습니다.
첫 고객 도입 전에 운영 DB 분리, Neon 복구 보존 기간과 복구 테스트, S3 버전 관리·보존 정책, 인증 및 회사별 접근 검증을 완료해야 합니다.
