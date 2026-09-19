#!/usr/bin/env bash
# 컨테이너 상태 + 최근 로그 요약. 실서비스 응답까지 훑는다.

set -euo pipefail
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
REPO_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")/.." &> /dev/null && pwd)"
cd "$REPO_DIR"

BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'

echo "${BOLD}컨테이너 상태${RESET}"
docker compose ps
echo

echo "${BOLD}로컬 헬스체크${RESET}"
if curl -fsS -o /dev/null -m 3 http://127.0.0.1/api/health; then
  echo "  http://127.0.0.1/api/health  ✓"
else
  echo "  http://127.0.0.1/api/health  ✗"
fi

if [ -f .env ] && grep -qE '^SITE_ADDRESS=[^:]' .env; then
  DOMAIN=$(grep -E '^SITE_ADDRESS=' .env | sed -E 's/^SITE_ADDRESS=//; s/[[:space:]]*$//')
  echo
  echo "${BOLD}공개 응답${RESET}"
  if curl -fsS -o /dev/null -m 10 "https://${DOMAIN}/api/health"; then
    echo "  https://${DOMAIN}/api/health  ✓"
  else
    echo "  https://${DOMAIN}/api/health  ✗"
  fi
fi

echo
echo "${BOLD}최근 앱 로그 (마지막 20줄)${RESET}"
docker compose logs --tail=20 app
