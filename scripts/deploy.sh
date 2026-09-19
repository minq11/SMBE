#!/usr/bin/env bash
# SMBE 서버 배포 스크립트 (Lightsail Ubuntu 용)
#
# 사용법:
#   ./scripts/deploy.sh                      기본 (git pull + rebuild + healthcheck)
#   ./scripts/deploy.sh --no-pull            git pull 생략 (env 만 바꾸고 재기동할 때)
#   ./scripts/deploy.sh --logs               배포 후 앱 로그 tail 시작
#
# 전역 단축어로 쓰려면 (최초 1회):
#   sudo ln -s "$HOME/SMBE/scripts/deploy.sh" /usr/local/bin/smbe-deploy
# 이후 어느 디렉터리에서든 `smbe-deploy` 로 실행 가능.

set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
REPO_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")/.." &> /dev/null && pwd)"
cd "$REPO_DIR"

BLUE=$'\033[0;34m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
RED=$'\033[0;31m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
RESET=$'\033[0m'

step() { echo; echo "${BLUE}${BOLD}▸ $1${RESET}"; }
ok()   { echo "${GREEN}✓${RESET} $1"; }
warn() { echo "${YELLOW}⚠${RESET} $1"; }
die()  { echo "${RED}✗ $1${RESET}" >&2; exit 1; }

PULL=1
TAIL_LOGS=0
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --logs)    TAIL_LOGS=1 ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *) die "알 수 없는 옵션: $arg (--no-pull, --logs, --help 만 지원)" ;;
  esac
done

# ---- 0. 사전 검증 ----------------------------------------------------------
[ -f .env ] || die ".env 파일이 없습니다. .env.template 복사 후 값 입력 필요."
command -v docker >/dev/null || die "docker 가 설치되지 않았습니다."
docker compose version >/dev/null 2>&1 || die "docker compose 플러그인이 없습니다."

# ---- 1. Git pull ----------------------------------------------------------
if [ "$PULL" -eq 1 ]; then
  step "GitHub 최신 코드 받기"
  if [ ! -d .git ]; then
    die ".git 이 없습니다. 이 스크립트는 git clone 된 리포지토리에서 실행하세요."
  fi
  git fetch --quiet origin
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse '@{u}' 2>/dev/null || echo "$LOCAL")
  if [ "$LOCAL" = "$REMOTE" ]; then
    ok "새 커밋 없음 (그래도 이미지는 재빌드)"
  else
    git pull --ff-only
    ok "코드 최신 반영: $(git log -1 --format='%h %s')"
  fi
else
  warn "--no-pull 지정, git pull 생략"
fi

# ---- 2. 설정 검증 ---------------------------------------------------------
step "compose 설정 문법 검증"
if docker compose config --quiet; then
  ok "compose.yaml 통과"
else
  die "compose.yaml 오류. 위 메시지 확인."
fi

# ---- 3. 빌드 + 재기동 -----------------------------------------------------
step "이미지 빌드 + 컨테이너 재기동"
docker compose up -d --build

# ---- 4. 헬스체크 대기 -----------------------------------------------------
step "헬스체크 대기 (최대 120초)"
for i in $(seq 1 40); do
  if curl -fsS -o /dev/null -m 3 http://127.0.0.1/api/health 2>/dev/null; then
    ok "앱 정상 응답 (${i}회차)"
    break
  fi
  if [ "$i" -eq 40 ]; then
    echo "${RED}최근 로그:${RESET}"
    docker compose logs --tail=40 app || true
    die "헬스체크 실패. 위 로그 확인."
  fi
  printf "${DIM}.${RESET}"
  sleep 3
done
echo

# ---- 5. 상태 요약 ---------------------------------------------------------
step "컨테이너 상태"
docker compose ps

# ---- 6. 도메인 응답 확인 --------------------------------------------------
if grep -qE '^SITE_ADDRESS=[^:]' .env 2>/dev/null; then
  DOMAIN=$(grep -E '^SITE_ADDRESS=' .env | sed -E 's/^SITE_ADDRESS=//; s/[[:space:]]*$//')
  step "https://${DOMAIN} 응답 확인"
  if curl -fsS -o /dev/null -m 10 "https://${DOMAIN}/api/health"; then
    ok "https://${DOMAIN} 정상"
  else
    warn "https://${DOMAIN} 아직 응답 없음. Caddy 인증서 발급 중이거나 DNS 지연일 수 있음."
    warn "다음 명령으로 프록시 로그 확인: docker compose logs --tail=50 proxy"
  fi
fi

echo
ok "${BOLD}배포 완료.${RESET}"

if [ "$TAIL_LOGS" -eq 1 ]; then
  echo
  step "앱 로그 tail (Ctrl+C 로 종료)"
  docker compose logs -f --tail=50 app
fi
