#!/usr/bin/env bash
# 로그 tail. 인자에 서비스명(app/proxy) 지정 가능. 미지정 시 app.

set -euo pipefail
REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &> /dev/null && pwd)"
cd "$REPO_DIR"

SERVICE="${1:-app}"
docker compose logs -f --tail=100 "$SERVICE"
