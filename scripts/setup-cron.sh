#!/usr/bin/env bash
# SMBE 정기 배치 설치 스크립트 (서버에서 최초 1회)
#
#   ./scripts/setup-cron.sh
#
# 하는 일 세 가지:
#   1. .env 에 CRON_SECRET 이 없으면 만들어 넣는다 (openssl rand -hex 32)
#   2. 앱 컨테이너를 새 환경변수로 다시 띄운다
#   3. crontab 에 매일 실행 한 줄을 넣는다 (이미 있으면 갈아 끼운다)
#
# 마지막에 한 번 실제로 돌려 결과를 보여준다.
# 몇 번 돌려도 안전하다 — 같은 주를 두 번 알리지 않도록 DB 가 막는다 (db/0016).

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
die()  { echo "${RED}✗${RESET} $1" >&2; exit 1; }

ENV_FILE="${SMBE_ENV_FILE:-.env}"
LOG_FILE="$HOME/smbe-cron.log"
CRON_MARK="# SMBE 정기 배치 (미실시 회의 알림)"
# 매일 09:00(서버 시간). 주가 끝났는지는 앱이 한국시간으로 판정하므로,
# 이 시각은 "메일이 언제 도착하는가" 만 정한다. 하루 놓쳐도 다음 날 따라잡는다.
CRON_LINE="0 9 * * * $REPO_DIR/scripts/run-cron.sh >> $LOG_FILE 2>&1"

step "1/3 CRON_SECRET 확인"
[ -f "$ENV_FILE" ] || die "$ENV_FILE 이 없습니다. cp .env.template .env 부터 하세요."
CURRENT="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
if [ "${#CURRENT}" -ge 32 ]; then
  ok "이미 설정되어 있습니다 (${#CURRENT}자). 그대로 씁니다."
else
  command -v openssl > /dev/null || die "openssl 이 없습니다. sudo apt install -y openssl"
  SECRET="$(openssl rand -hex 32)"
  cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  if grep -qE '^CRON_SECRET=' "$ENV_FILE"; then
    # 값이 비어 있던 줄을 새 값으로 갈아 끼운다.
    tmp="$(mktemp)"
    sed "s|^CRON_SECRET=.*|CRON_SECRET=$SECRET|" "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"
    rm -f "$tmp"
  else
    printf '\n# 정기 배치 엔드포인트(/api/cron/*) 인증. setup-cron.sh 가 생성.\nCRON_SECRET=%s\n' "$SECRET" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
  ok "새로 만들어 $ENV_FILE 에 넣었습니다 (백업 .bak 생성). 값은 화면에 찍지 않습니다."
fi

step "2/3 앱 컨테이너에 환경변수 반영"
# env_file 변경은 재생성해야 컨테이너에 들어간다. restart 로는 반영되지 않는다.
docker compose up -d --force-recreate app
echo "${DIM}컨테이너가 준비될 때까지 기다립니다…${RESET}"
for i in $(seq 1 30); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2> /dev/null; then
    ok "앱이 응답합니다."
    break
  fi
  [ "$i" -eq 30 ] && die "앱이 응답하지 않습니다. docker compose logs --tail=100 app 을 확인하세요."
  sleep 2
done

step "3/3 crontab 등록"
command -v crontab > /dev/null || die "cron 이 없습니다. sudo apt install -y cron && sudo systemctl enable --now cron"
# 기존 SMBE 줄은 지우고 새로 넣는다 (여러 번 실행해도 한 줄만 남는다).
{
  crontab -l 2> /dev/null | grep -vF "$CRON_MARK" | grep -vF "scripts/run-cron.sh" || true
  echo "$CRON_MARK"
  echo "$CRON_LINE"
} | crontab -
ok "매일 09:00(서버 시간)에 실행합니다."
echo "${DIM}$CRON_LINE${RESET}"

step "지금 한 번 실행해 봅니다"
if ./scripts/run-cron.sh; then
  ok "정상 실행되었습니다."
else
  warn "실행이 실패했습니다. 위 메시지를 확인하세요."
fi

echo
echo "${BOLD}끝났습니다.${RESET}"
echo "  · 로그:        tail -f $LOG_FILE"
echo "  · 등록 확인:   crontab -l"
echo "  · 수동 실행:   ./scripts/run-cron.sh"
echo
echo "결과의 뜻:"
echo "  companies 알림 보낸 회사 수 · weeks 알린 주 수"
echo "  sent 발송 성공 · skipped 메일 설정 없음 · failed 발송 실패"
echo "  두 번째 실행부터는 weeks 가 0 입니다 (같은 주를 다시 알리지 않습니다)."
