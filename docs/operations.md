# 서버 운영 안내

Lightsail 서버(Ubuntu)에서 실제로 무엇을 해야 하는지만 모았습니다. Docker 명령어 전체
목록은 [docker.md](docker.md), 인스턴스 준비는 [lightsail.md](lightsail.md)에 있습니다.

모든 명령은 서버에 SSH 로 접속한 뒤 `cd ~/SMBE` 에서 실행합니다.

---

## 0. 지금 서버에서 해야 하는 것

새 기능이 올라갔습니다. 아래 두 줄을 순서대로 실행하면 끝납니다.

```sh
cd ~/SMBE && git pull
bash scripts/deploy.sh --migrate
bash scripts/setup-cron.sh
```

| 줄 | 하는 일 | 다시 해야 하나 |
| --- | --- | --- |
| `git pull` | 새 코드 받기 | 배포할 때마다 |
| `deploy.sh --migrate` | 배포 + DB 구조 변경 적용 | 배포할 때마다 (`--migrate` 는 필요할 때만) |
| `setup-cron.sh` | 미실시 회의 알림 설치 | **처음 한 번만** |

`setup-cron.sh` 는 여러 번 실행해도 안전합니다. 이미 설정된 값은 그대로 두고, cron 줄도
하나만 남습니다.

---

## 1. 배포 — 코드가 바뀔 때마다

```sh
cd ~/SMBE
git pull
bash scripts/deploy.sh
```

`deploy.sh` 가 GitHub Actions 가 만들어 둔 이미지를 받아 컨테이너를 갈아 끼우고 헬스체크까지
합니다. 서버에서 직접 빌드하지 않는 이유는 2GB 메모리로 `next build` 를 돌리면 **서버 전체가
멎기** 때문입니다.

### `--migrate` 를 붙여야 하는 때

DB 에 새 컬럼·테이블이 필요한 배포에서만 붙입니다. 판단이 헷갈리면 붙여도 손해가 없습니다 —
이미 적용된 것은 다시 실행되지 않습니다.

```sh
bash scripts/deploy.sh --migrate
```

**붙이지 않으면 어떻게 되나:** 코드는 새 컬럼을 읽으려 하는데 DB 에 없어서 화면이 500 으로
깨집니다. 그러니 애매하면 붙이세요.

`db/` 폴더에 새 `NNNN_*.sql` 파일이 생겼는지가 기준입니다. `git pull` 결과에
`db/0017_...sql` 같은 줄이 보이면 필요합니다.

### 자주 쓰는 배포 옵션

```sh
bash scripts/deploy.sh --no-pull      # .env 만 고치고 재기동
bash scripts/deploy.sh --logs         # 배포 후 로그 보기
bash scripts/deploy.sh --local-build  # CI 가 막혔을 때만 (스왑 필수)
```

---

## 2. 마이그레이션이란

DB 의 **구조**(테이블·컬럼)를 바꾸는 SQL 파일입니다. `db/0001_init.sql` 부터 번호순으로
쌓여 있고, 러너가 아직 적용되지 않은 파일만 순서대로 실행한 뒤 `schema_migrations` 표에
기록합니다.

- 같은 파일이 두 번 실행되는 일은 없습니다.
- 데이터를 지우지 않습니다. 컬럼을 더하거나 표를 새로 만드는 일만 합니다.
- 이미 적용된 파일은 **고치지 않습니다.** 바꿀 일이 생기면 다음 번호로 새 파일을 만듭니다.

마이그레이션만 따로 돌리려면:

```sh
docker compose --profile tools run --rm migrate
```

적용 현황은 러너가 돌 때 화면에 찍힙니다. `skip` 은 이미 적용된 파일, `apply` 는 지금
적용한 파일입니다.

```
skip  0001_init
skip  0002_company_required_fields
apply 0016_safety_meeting_reminders
done
```

그래서 마이그레이션을 그냥 한 번 돌려 보는 것이 가장 확실한 확인 방법입니다. 적용할 것이
없으면 전부 `skip` 만 찍고 끝납니다.

---

## 3. 정기 배치 (미실시 회의 알림) — 처음 한 번만

주가 끝났는데 안전점검 회의 기록이 없으면 **관리감독자·안전관리자에게 메일**이 갑니다.

```sh
cd ~/SMBE && bash scripts/setup-cron.sh
```

스크립트가 세 가지를 합니다.

1. `.env` 에 `CRON_SECRET` 이 없으면 만들어 넣습니다 (`openssl rand -hex 32`).
   기존 `.env` 는 `.bak` 으로 백업합니다. 값은 화면에 찍지 않습니다.
2. 앱 컨테이너를 **다시 만듭니다.** `.env` 를 고쳐도 `restart` 로는 반영되지 않기 때문입니다.
3. `crontab` 에 매일 실행 한 줄을 넣고, 마지막에 한 번 실제로 돌려 결과를 보여줍니다.

성공하면 이렇게 나옵니다.

```
▸ 1/3 CRON_SECRET 확인
✓ 새로 만들어 .env 에 넣었습니다 (백업 .bak 생성). 값은 화면에 찍지 않습니다.

▸ 2/3 앱 컨테이너에 환경변수 반영
✓ 앱이 응답합니다.

▸ 3/3 crontab 등록
✓ 매일 09:00(서버 시간)에 실행합니다.

▸ 지금 한 번 실행해 봅니다
HTTP 200 {"companies":1,"weeks":2,"sent":2,"skipped":0,"failed":0}
✓ 정상 실행되었습니다.
```

### 결과 JSON 읽는 법

| 필드 | 뜻 | 0 이 아니면 |
| --- | --- | --- |
| `companies` | 알림 보낸 회사 수 | — |
| `weeks` | 알린 주 수 | — |
| `sent` | 메일 발송 성공 | 정상 |
| `skipped` | 메일 설정이 없어 건너뜀 | `.env` 의 `RESEND_API_KEY`·`EMAIL_FROM` 확인 |
| `failed` | 발송 실패 | 로그에서 사유 확인 |

**두 번째 실행부터 `weeks` 가 0 인 것이 정상입니다.** 같은 주를 두 번 알리지 않습니다.

### 왜 매일 도는가

주가 끝났는지는 **앱이 한국시간으로** 판정합니다. 그래서 cron 시각은 "메일이 언제
도착하는가" 만 정하며, 서버 시간대(UTC 일 수도 있습니다)를 계산할 필요가 없습니다.
하루 놓쳐도 다음 날 따라잡고, 중복은 DB 가 막습니다 (`db/0016`).

### 왜 컨테이너 안에서 호출하는가

앱의 3000 번 포트는 **호스트에 공개하지 않습니다**(`compose.yaml` 의 `expose`). 그래서
호스트에서 `curl localhost:3000` 은 닿지 않습니다. 배치는 컨테이너 안에서 부르며, 그래야
프록시·도메인·인증서와 무관하게 항상 닿고 `CRON_SECRET` 이 호스트 명령줄이나 셸 히스토리에
남지 않습니다. 이 호출을 `scripts/run-cron.sh` 가 감싸고 있습니다.

### 설치 후 확인·관리

```sh
crontab -l                     # 등록됐는지 확인
tail -f ~/smbe-cron.log        # 로그 보기 (Ctrl+C 로 나가기)
bash scripts/run-cron.sh       # 지금 한 번 실행
crontab -e                     # 직접 고치기 (보통 필요 없음)
```

---

## 4. 잘 돌고 있는지 확인

```sh
docker compose ps                                          # 컨테이너 상태
docker compose logs -f --tail=100 app                      # 앱 로그
docker compose exec app node scripts/container-readiness.mjs  # Neon·S3 연결 확인
```

`docker compose ps` 의 `STATUS` 에 `(healthy)` 가 보이면 정상입니다.

---

## 5. 문제가 생기면

| 증상 | 먼저 볼 것 | 명령 |
| --- | --- | --- |
| 화면이 500 으로 깨진다 | 마이그레이션 누락 | `bash scripts/deploy.sh --migrate` |
| `git pull` 이 거부된다 | 서버에서 파일을 고침 | `git status` 로 확인 후 `git checkout -- <파일>` |
| 배포 중 서버가 멎었다 | 서버에서 빌드함 | 스왑 확인 후 `smbe-deploy` (CI 이미지 사용) |
| 메일이 안 간다 | 메일 키 | `.env` 의 `RESEND_API_KEY`·`EMAIL_FROM` |
| 배치가 401 을 준다 | `CRON_SECRET` 미설정 | `bash scripts/setup-cron.sh` 다시 실행 |
| 배치가 안 돌았다 | cron 등록·로그 | `crontab -l`, `tail ~/smbe-cron.log` |
| `.env` 를 고쳤는데 안 먹는다 | 컨테이너 재생성 필요 | `docker compose up -d --force-recreate app` |
| 디스크가 찼다 | 이미지 쓰레기 | `docker system df` → `docker system prune -a` |

로그에 답이 없으면 `docker compose logs --tail=200 app proxy` 를 그대로 붙여 주세요.

---

## 6. 자주 쓰는 명령 한 장

```sh
cd ~/SMBE

# 배포
git pull && bash scripts/deploy.sh             # 평소
git pull && bash scripts/deploy.sh --migrate   # db/ 에 새 .sql 이 생긴 배포

# 확인
docker compose ps
docker compose logs -f --tail=100 app
docker compose exec app node scripts/container-readiness.mjs

# 정기 배치
bash scripts/setup-cron.sh    # 최초 1회
bash scripts/run-cron.sh      # 수동 실행
crontab -l                    # 등록 확인
tail -f ~/smbe-cron.log       # 로그

# 재기동
docker compose restart app                     # 코드·env 변경 없음
docker compose up -d --force-recreate app      # .env 를 고쳤을 때
```

전역 단축어를 걸어 두면 어느 디렉터리에서든 `smbe-deploy` 로 배포할 수 있습니다 (최초 1회).

```sh
sudo ln -s "$HOME/SMBE/scripts/deploy.sh" /usr/local/bin/smbe-deploy
```
