#!/usr/bin/env bash
# SMBE 정기 배치 실행기 (cron 이 부르는 스크립트)
#
# 하는 일: 앱 컨테이너 안에서 배치 엔드포인트를 한 번 호출한다.
#   - 미실시 주 안전점검 회의 알림 (관리감독자·안전관리자 메일)
#
# 왜 컨테이너 안에서 부르나:
#   앱의 3000 번 포트는 호스트에 공개되어 있지 않다 (compose.yaml expose).
#   컨테이너 안에서 부르면 프록시·인증서·도메인과 무관하게 항상 닿는다.
#   CRON_SECRET 도 컨테이너가 .env 에서 이미 들고 있어 호스트에 노출되지 않는다.
#
# 등록은 scripts/setup-cron.sh 가 해 준다. 수동 실행도 이 스크립트로 한다:
#   ./scripts/run-cron.sh
#
# 매일 돌려도 안전하다. 같은 주를 두 번 알리지 않도록 DB 가 막는다 (db/0016).

set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
REPO_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")/.." &> /dev/null && pwd)"
cd "$REPO_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] SMBE 배치 시작"

docker compose exec -T app node -e '
const secret = process.env.CRON_SECRET || "";
if (secret.length < 32) {
  console.error("CRON_SECRET 이 없거나 32자 미만입니다. .env 를 확인하세요.");
  process.exit(2);
}
fetch("http://127.0.0.1:3000/api/cron/meeting-reminders", {
  method: "POST",
  headers: { authorization: "Bearer " + secret },
})
  .then(async (res) => {
    const body = await res.text();
    console.log("HTTP " + res.status + " " + body);
    process.exit(res.ok ? 0 : 1);
  })
  .catch((error) => {
    console.error("요청 실패: " + error.message);
    process.exit(1);
  });
'

echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] SMBE 배치 끝"
