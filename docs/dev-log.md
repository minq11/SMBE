# SMBE 개발일지

## 2026-09-19 작업지시 1차 구현

- W-01 목록·검색·상태 탭·페이지 이동, W-02 네 단계 작성/임시저장/복사, W-03 상세·평가 검토·발급·취소, W-05 QR/인쇄·링크 전달 구현.
- 확정 결정: 작성한 관리자도 **평가 승인 후 발급**을 명시적으로 눌러 본인 평가 승인 가능. 본인 승인 감사 기록을 남기며 승인과 발급은 함께 커밋/롤백.
- 별도 검토 경로(평가 검토 요청 → 다른 관리자 평가 승인 → 발급)도 제공. 지시서 자체 승인 절차는 없음.
- 간이평가에 위험요인·수준·허용 여부·대책·조치 담당자/예정일·판단 기준·사전조사 정보·실제 참여자를 저장.
- 발급 당시 평가/방법 스냅샷, 체크리스트 행, 배정자 이름 보존. 날짜 전용 필드는 문자열로 고정해 시간대 변환에 따른 날짜 변경 방지.
- 권한·회사 경계·배정·활성 소속 서버 검증, 중복 발급/오래된 편집 차단, 한국시간 야간작업 및 16시간 상한 적용.
- 무료의 오래된 종료/취소 기록은 건수만 제공하며 상세·복사 경로에서도 열람 제한.
- 발급 후 이메일 전달 및 미전달 재시도, QR/링크 복사·지시서 인쇄. 출력 시각은 실제 인쇄 직전에 갱신.
- 홈/사이드바를 실제 작업지시로 연결. 로그인 홈에 예정·진행 작업 표시, 작업자는 배정 작업으로 이동.
- 연결된 Neon DB에 **0003_work_orders 적용 완료**. 신규 평가·작업지시·감사 테이블만 추가. 실제 업무 테스트 데이터는 로컬 일회성 DB에서만 생성.
- 검증 통과: PostgreSQL 회귀 18개, PC/모바일 로그인 작성→본인 승인·발급→작업자 열람→복사→취소 E2E 2개, 일반 화면/비로그인 E2E 8개, 프로덕션 빌드·타입·lint 검사. 인쇄 화면도 확인. 자세한 실행 방법은 work-orders.md.
- 로컬 개발 Docker 갱신 완료: http://localhost:3001 . 헬스 API 200, 비로그인 작업지시 작성 경로의 로그인 이동(307) 확인. 실제 OAuth 제공자 로그인 및 실 이메일 수신은 미검증.
- 운영 앱 배포는 하지 않음. 기존 globals.css 변경 보존.
- 남은 범위: PTW(필요 작업 발급 차단), 표준서/업종 템플릿, TBM·순회점검 입력, 부적합 조치, 발급 후 일정·인원 변경(W-04), 조별 일괄 생성.
- 안내: [work-orders.md](work-orders.md).

## 2026-09-19 TBM·작업 중 점검 연결

- 발급 시 작업기간의 각 날짜를 작업회차로 생성하고, 한국시간 시작 2시간 전부터 종료 2시간 후까지 현재 회차 입력을 허용했다. 야간작업은 시작일 기준으로 유지한다.
- 작업지시 상세의 TBM·작업 중 점검 버튼, 모바일 현장 입력 화면, 위험요인·감소대책 표시, QR/링크/웹 진입경로 기록을 연결했다.
- TBM은 배정 작업자별 1회 확인, 작업 중 점검은 회차당 반복 입력을 허용한다. 두 기능의 순서는 강제하지 않는다.
- 적합·부적합·해당없음과 코멘트를 저장하고, 부적합마다 지정 관리자를 선택한다. 지정 관리자만 조치완료할 수 있으며 조치 내용은 다음 회차 TBM 시작 전에 표시한다.
- 홈에 내 부적합 알림을 표시하고 `/inspections`에서 과거 열람 제한과 별개로 미조치 안전조치를 계속 처리할 수 있게 했다.
- 운영 Neon DB에 **0004_inspections 적용 완료**. 기존 작업지시·평가 데이터는 삭제하거나 변경하지 않았고, 발급된 기존 지시서의 회차만 생성했다.
- 검증 통과: PostgreSQL 회귀 26개, PC/모바일 화면 12개, 프로덕션 빌드·타입·lint. 실제 OAuth 로그인·실제 이메일·사진 업로드는 미검증.
- 로컬 Docker 개발 컨테이너를 새 이미지로 갱신했다. `http://localhost:3001/api/health`는 200, 비로그인 `/work-orders`·`/inspections`는 로그인으로 이동한다. 운영 앱 배포는 하지 않았다.
- 남은 범위: PTW, 사진(S3), 관리자 사후입력, 점검 결과 수정·이력, 작업 없는 날 제외, 발급 후 일정·인원 변경, 알림 이메일/푸시.

---

## 2026-09-19 추가 보완 — 데이터 정합성 · 동시 요청

- 승인·거부·퇴사·역할 변경을 회사 행 잠금이 있는 단일 트랜잭션으로 통합. 잠금 후 실제 관리자 권한/소속/대상 상태 재검증.
- 마지막 관리감독자 동시 강등·퇴사 방지. 비트랜잭션 isLastSupervisor 헬퍼 제거.
- ACTIVE이며 미퇴사인 소속을 기준으로 active_headcount 및 current_employee_size_band 재계산. 초기 신고 규모는 유지.
- 회사 생성 시 현재 규모는 창업자 1명 기준 UNDER_5. 회사 생성·직접 가입·초대 가입 시 사용자 잠금과 중복 소속 재확인.
- 초대 링크 GET 자동 가입을 제거하고 명시적 수락 Server Action으로 변경. 조건부 UPDATE로 단일 사용/만료를 보장하고 실패 시 전체 롤백.
- OAuth 이메일 중복 오류는 SAVEPOINT로 복구. 동일 provider identity 동시 콜백은 advisory lock으로 중복 사용자 생성 방지.
- 회사코드 충돌은 ON CONFLICT DO NOTHING으로 처리해 트랜잭션을 깨지 않고 재시도.
- 문의 honeypot을 입력 검증보다 먼저 처리해 메일 발송 없이 성공 응답.
- 현재 화면과 맞지 않던 E2E 기대값 수정. DB 회귀 테스트와 CI PostgreSQL 서비스 추가.
- 검증: lint/typecheck 통과, 일회성 로컬 PostgreSQL 회귀 9개 통과, PC/모바일 E2E 8개 통과, 시크릿 없는 임시 복사본에서 프로덕션 빌드 성공.
- 현재 설정된 Neon DB의 인원수·규모 구간을 읽기 전용 점검: 불일치 0건. 운영 DB 데이터/스키마 변경 및 배포는 하지 않음.
- 향후 정합성 보정용 db:reconcile-headcounts 명령 추가. 기본 읽기 전용, --apply는 변경 전 값을 .local-backups에 백업한 뒤 트랜잭션 적용.
- 실제 OAuth 제공자 로그인·실 이메일 발송 및 로그인 상태 전체 UI 흐름은 이번 자동 검증 범위 밖.
- 기존 globals.css 수정은 보존. 신규 업무 기능·과금 상태 자동 전환·감사 로그는 이번 범위에 포함하지 않음.
- 실행 방법과 운영 보정 주의사항: [regression-testing.md](regression-testing.md).

---

이 파일은 실제 구현된 기능과 인프라 결정을 기록합니다. 설계 문서(`SMBE-design-v5.4.md`)의 항목 중 어느 부분이 코드로 반영됐는지 추적하는 용도.

---

## 2026-09-19

### 요약

- 홈/대시보드 UI 재정비 (여러 차례 리디자인)
- 공용 셸(AppShell·PreviewDialogProvider) + UI 프리미티브(PageHeader·SectionHeading·EmptyState·Panel)
- **인원관리(C-01)** 구현: 초대 링크 발급·이메일 자동 발송·가입 승인/거부·역할 변경·퇴사 처리
- **초대 수락 흐름** (`/invite/[token]`) 자동 소속 처리
- **이메일 발송(Resend)** 인프라 + smbe.net 도메인 검증
- **운영자 백오피스(O-01/O-02)** 구현: 회사 목록·상세·`free_limit` 조정·사용자 검색, 세션 이메일 기반 404 게이트
- **사전 예약·문의(`/contact`)** 폼 + 서버 발송, 상단 공지 배너
- **Lightsail 프로덕션 배포** 완료: smbe.net HTTPS 라이브, 자동화 스크립트 3종

---

### 1. UI / 셸 · 프리미티브

**공용 셸 (`src/components/shell/`)**
- `AppShell`, `Sidebar`, `Topbar`, `PreviewDialogProvider` — 모든 관리자 페이지가 공유
- `NavEntry.href` 지원: 구현된 메뉴는 `<Link>`, 미구현은 준비 중 모달
- 데스크톱에서 상단바 왼쪽(햄버거·로고·홈 브레드크럼) 숨김, 모바일에서만 노출

**UI 프리미티브 (`src/components/ui/`)**
- `PageHeader`, `SectionHeading`, `Panel`, `EmptyState` — 향후 메뉴에서 재사용
- `row-list` / `row` 패턴을 CSS 클래스로 정형화 (인원 목록·오늘 처리할 일·오늘 작업 등)

**브랜드**
- 앱 아이콘: `public/brand/logo.png` 를 `AppIcon` 컴포넌트로 인라인 렌더링
- `layout.tsx` metadata 에 favicon(logo.png) 등록
- 사이드바 워드마크: `public/brand/smbe-original.png` (기존 유지)

**홈 리디자인**
- 히어로: `Safety must be easy.` 슬로건 + 서브카피 두 줄, 시스템 폰트 스택
- 두 개 액션 카드(구성원 초대 / 오늘의 작업 지시) — 오늘의 작업 카드는 브랜드 오렌지 필
- 오늘 처리할 일·오늘의 작업: row-list 방식 (기존 카드 그리드에서 전환)
- 삭제한 요소들: 장식 div-일러스트, 영문 eyebrow, 미리보기 알림 바, 프롬프트 카드, 안전점수 placeholder, 페이지 푸터, 상태 pill/진행 바 등 AI 슬롭성 장식

---

### 2. 인원관리 (C-01)

**서버 (`src/server/members.ts` · `src/features/members/actions.ts`)**
- 데이터: `listMembers`, `listOpenInvites`, `getCompanyOverview`, `isLastSupervisor`
- 액션: `createInviteAction`, `revokeInviteAction`, `approvePendingAction`, `rejectPendingAction`, `changeRoleAction`, `resignMemberAction`
- 마지막 관리감독자 강등·퇴사 차단, 관리감독자 승격은 관리감독자만·본인 승격 금지 등 설계 규칙 준수
- 초대 토큰: `crypto.getRandomValues` 22자, 14일 유효, 충돌 재시도 5회

**UI**
- `/company/members` — 페이지 헤더 + 메타 스트립(현재 인원·무료 한도·요금제·회사코드) + 초대 패널 + 탭(재직/승인 대기/퇴사) + 인원 row-list
- 인라인 액션 버튼: 승인·거부·역할 변경 드롭다운·퇴사
- 초대 패널: 대상 역할 · 이메일 · 전화번호 입력 → 링크 생성 + 자동 이메일 발송 → URL 복사 가능, 미수락 초대 목록에서 재복사·폐기 가능

**초대 수락 흐름 (`/invite/[token]`)**
- 미로그인 시 `/login?next=/invite/{token}` 으로 리다이렉트 (open-redirect 방지: 상대 경로만 허용)
- 로그인 상태면 유효성 검증 후 자동 `ACTIVE` 소속 생성, `active_headcount +1`, 초대 accepted 마킹
- 에러 케이스별 안내: 유효하지 않은 토큰 / 이미 사용 / 만료 / 이미 다른 회사 소속

---

### 3. 이메일 발송

**Resend 통합 (`src/server/email.ts`)**
- `sendEmail()` — API 키/발신자 미설정 시 안전하게 `skipped` 반환
- `inviteEmailTemplate()` — HTML + plain-text 병행, 브랜드 컬러·CTA·유효기간·평문 링크 폴백 포함

**도메인 검증**
- Resend Dashboard 에 `smbe.net` 등록 → Cloudflare DNS 에 SPF·DKIM(CNAME)·MX 레코드 추가
- 검증 완료 후 `EMAIL_FROM=SMBE <no-reply@smbe.net>` 설정

**Contact 발송의 self-loop 이슈**
- Cloudflare Email Routing 이 `no-reply@smbe.net → hi@smbe.net` 같은 자기 도메인 내부 발송을 조용히 드롭
- 해결: `/contact` 폼에서는 `CONTACT_INBOX` 환경변수를 통해 Gmail(`gooddonutsyh@gmail.com`) 로 직행

---

### 4. 운영자 백오피스 (O-01 / O-02)

**인증 (`src/server/operator.ts`)**
- 환경변수 `SMBE_OPERATOR_EMAILS` (콤마 구분) 에 매칭되는 세션 이메일만 접근
- `requireOperator()` 는 비운영자에게 **404 반환** (403 대신, 페이지 존재 자체를 감춤)

**데이터 (`src/server/admin.ts`)**
- `listCompanies({search, limit})` — 활성/대기 인원 수 조인 포함
- `getCompanyDetail(id)` — 회사 필드 전체 + 인원 breakdown
- `listUsers({search})` — 이름/이메일/전화 부분 검색

**액션 (`src/features/admin/actions.ts`)**
- `updateFreeLimitAction` — 회사별 무료 한도 조정 (0~10000)

**UI**
- `AdminShell` — 심플한 상단 네비 (SMBE 운영자 · 회사 / 사용자 · 일반화면 링크 · 로그아웃)
- `/admin` — 회사 목록 (검색·상세 링크)
- `/admin/companies/[id]` — 상세 + free_limit 편집 폼
- `/admin/users` — 사용자 검색

**진입점**
- 운영자로 로그인 시 `AppShell` 상단바에 **오렌지 렌치 아이콘** 노출 → `/admin` 이동
- 비운영자에겐 서버 사이드에서 아예 렌더 안 함 (DOM 조작으로도 못 봄)

---

### 5. 사전 예약 · 문의 (`/contact`)

**목적**: 프리런치 상태에서 유입된 사용자가 사전 예약·기능 문의를 남길 수 있도록.

**서버 액션 (`src/features/contact/actions.ts`)**
- Zod 검증: 이름·이메일·회사(선택)·유형(사전예약/문의/기타)·메시지(5~2000자)
- **허니팟** `website` 필드: 봇이 채우면 조용히 성공 응답 반환 (실제 발송 안 함)
- 검증 실패 시 입력값 스냅샷을 함께 반환 → 폼에서 `defaultValue` 로 복원 (React 19 auto-reset 대응)
- Resend 로 발송, **Reply-To** 에 방문자 이메일 설정 → Gmail 에서 "답장" 만 눌러 방문자에게 회신 가능
- 발송 대상: `CONTACT_INBOX` env (기본 `hi@smbe.net`, 현재는 self-loop 회피 위해 Gmail 직행)

**UI**
- 성공 시 확인 화면, 실패 시 폼 값 유지 + 오류 배지
- 문의 유형 라디오: `white-space: nowrap; word-break: keep-all; flex: 0 0 auto` 로 CJK 문자 깨짐 방지
- 폴백: "직접 hi@smbe.net 으로 메일을 보내주셔도 됩니다"

**상단 배너 (`PreviewBanner`)**
- 모든 페이지 최상단에 40px(모바일 56px) 다크 스트립
- "SMBE 는 아직 개발 중입니다. → 사전 예약 · 문의하기" → `/contact` 링크
- `--banner-h` CSS 변수로 sidebar/topbar top offset 자동 조정
- 정식 오픈 시 `layout.tsx` 에서 한 줄 지우면 제거

---

### 6. 인프라 · 배포

**프로덕션 스택**
- AWS Lightsail Ubuntu 22.04 LTS · 서울 리전 · 고정 IP
- 도메인: **smbe.net** (Cloudflare Registrar 구매, DNS-only 회색 구름)
- 프록시: Caddy 2 (자동 Let's Encrypt 인증서 발급·갱신)
- 앱: Next.js 16 standalone runner
- DB: Neon Postgres (로컬↔프로덕션 단일 인스턴스, 1인 개발 전제)
- Compose 파일: `compose.yaml` (프로덕션), `compose.dev.yaml` (로컬)

**보안 · 접근**
- GitHub 리포지토리 private 전환
- 서버는 Ed25519 SSH deploy key 로 pull-only 액세스
- `.env` 는 서버 로컬 파일로 유지 (git 미포함)
- OAuth 콜백 URL `https://smbe.net/api/auth/callback/{google|naver|kakao}` 등록 완료

**배포 스크립트 (`scripts/`)**
- `deploy.sh` — git pull → 이미지 rebuild → healthy 체크 → 도메인 응답 확인
  - 옵션: `--no-pull`, `--logs`
- `status.sh` — 컨테이너 상태 + 로컬/공개 헬스체크 + 최근 로그 20줄
- `logs.sh [app|proxy]` — 실시간 로그 tail
- 심볼릭 링크로 전역 단축어: `smbe-deploy`, `smbe-status`, `smbe-logs`

**Cloudflare Email Routing**
- `hi@smbe.net → gooddonutsyh@gmail.com` 자동 포워딩 (수신 전용)
- **주의**: Contact 폼처럼 `no-reply@smbe.net → hi@smbe.net` self-loop 는 드롭됨 → CONTACT_INBOX 로 Gmail 직행

---

### 7. 환경변수 (현재 기준)

| 이름 | 용도 | 로컬 | 프로덕션 |
|---|---|---|---|
| `DATABASE_URL` | Neon Postgres | 필수 | 필수 (동일 값) |
| `AUTH_SECRET` | NextAuth 서명 | 필수 | 필수 (다른 값) |
| `AUTH_TRUST_HOST` | 프록시 뒤 신뢰 | 비움 | `1` |
| `AUTH_GOOGLE_ID/SECRET` | Google OAuth | 필수 | 동일 |
| `AUTH_NAVER_ID/SECRET` | Naver OAuth | 필수 | 동일 |
| `AUTH_KAKAO_ID/SECRET` | Kakao OAuth | 필수 | 동일 |
| `RESEND_API_KEY` | 이메일 발송 | 로컬용 키 | 프로덕션용 별도 키 권장 |
| `EMAIL_FROM` | 발신자 | `SMBE <no-reply@smbe.net>` | 동일 |
| `APP_URL` | 이메일·초대 링크 base | `http://127.0.0.1:3001` | `https://smbe.net` |
| `SMBE_OPERATOR_EMAILS` | 운영자 화이트리스트 | 콤마 구분 | 동일 |
| `CONTACT_INBOX` | 문의 폼 도착 주소 | `gooddonutsyh@gmail.com` | 동일 |
| `SITE_ADDRESS` | Caddy 도메인 | (로컬 미사용) | `smbe.net` |
| `HEALTHCHECK_TOKEN` | 진단 API 토큰 | 32자+ | 32자+ (다른 값 권장) |

---

### 8. DB 스키마 현황

이번 회차에는 마이그레이션 추가 없음. `db/0001_init.sql` + `db/0002_company_required_fields.sql` 그대로 사용:
- `users`, `user_identities`, `companies`, `company_members`, `work_locations`, `company_invitations`
- 인원관리·초대 흐름은 기존 `company_invitations` · `company_members` 로 커버

**향후 필요 마이그레이션** (다음 스코프 시작 시)
- 작업지시(`work_orders`, `work_order_assignments`, 간이평가)
- 감사 로그
- 청구·과금(일일 사용량 스냅샷)

---

### 9. 확인된 이슈 · 임시 대응

**Contact 폼 self-loop**
- 원인: Cloudflare Email Routing 이 same-domain 발송을 드롭
- 임시 대응: `CONTACT_INBOX=gooddonutsyh@gmail.com` 로 Gmail 직행
- 정식 대응 후보: (1) 별도 서브도메인 발신자 (`notify.smbe.net`), (2) Resend 로 발신하되 라우팅 우회를 문서화

**환경변수 변경 반영**
- `.env.local` / `.env` 수정 후 `restart` 만으로는 반영 안 됨 → `down` + `up` 필요
- 배포 스크립트는 `--build` 로 매번 재생성하므로 문제 없음

**브라우저 확장 hydration 경고**
- `data-wxt-integrated`, `__endic_crx__` 등 사전·번역 확장이 DOM 을 건드려 나는 경고 → 코드 이슈 아님

---

### 10. 다음 스코프 후보

우선순위 순:
1. **작업지시 (W-01·W-02·W-05)** — 홈의 두 번째 CTA "오늘의 작업 지시하기" 실동작. 표준서 없이 시작 흐름 + 간이평가 + QR 발급까지
2. **작업자 모바일 (M-01~M-04)** — TBM 확인·작업 중 점검
3. **감사 로그** — 운영자 조정·역할 변경 이력 추적
4. **작업표준서 (S-01~S-03)** + 위험성평가 (R-01~R-05)
5. **비로그인 공개 페이지 (U-01~U-04)** — 안전법 가이드·인정 준비도 진단 (SEO 유입)
6. **요금제·과금 UI (B-01/B-02)** — 실 로직은 일일 사용량 스냅샷 스케줄 만든 뒤

정식 오픈 조건 (배너 제거 시점):
- 최소 작업지시 발급 → QR → 작업자 확인까지 사이클 완료
- 감사 로그 최소 기능
- 개인정보/약관 페이지 실제 내용 채움

---
