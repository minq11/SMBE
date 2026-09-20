# SMBE 개발일지

## 2026-09-20 모바일 화면 점검·보완

- 320px 홈에서 작업명 폭이 시간·인원 정보에 밀려 좁아지던 문제를 해결: 제목/장소와 시간/인원/상태를 두 행으로 분리.
- 960px 이하에서 접이식 메뉴를 사용. 메뉴 내부 세로 스크롤, 닫기 버튼, Escape 닫기, 초점 순환·복귀, 닫힌 메뉴의 초점 차단을 적용. 배경 스크롤 잠금이 메뉴의 터치 스크롤을 막지 않도록 보완.
- 모바일 상단에는 현재 페이지명만 표시하고 버튼 간격·프로필 폭을 조정. 페이지 액션 버튼 줄바꿈 및 긴 제목 처리.
- 표준서 단계 입력칸의 최소 너비를 해제하고 작은 화면의 위험성평가 담당자·날짜 입력을 한 열로 전환. 도움말은 화면 하단 패널로 표시해 잘림을 막고 내부 스크롤·터치 영역을 확보.
- 검증: 공개 5개 경로를 320/390/768px에서 확인. 일회성 로컬 PostgreSQL과 테스트용 세션으로 로그인 후 홈·인원·작업지시 목록/작성 단계·표준서 작성·요금제·안전점검 7개 경로의 가로 넘침 및 메뉴 동작 검증 통과. 640×360 가로모드 메뉴 스크롤도 확인. 실제 휴대폰 대신 Chromium 모바일 에뮬레이션 사용.
- 프로덕션 빌드, 타입·lint 검사 통과. 테스트 러너는 최신 SQL 마이그레이션을 로컬 임시 스키마에 적용하도록 보완. 운영 DB 변경 없음.
- 로컬 Docker 갱신 완료. 운영 사이트 배포는 별도.
- 재검증: `npm run test:orders-ui -- tests/mobile-layout.spec.ts` (일회성 테스트 PostgreSQL 필요). 공개 화면 점검: `node scripts/audit-mobile.mjs` (localhost:3001).

---

## 2026-09-20 지시서 ↔ 표준서 정식 링크

**해결한 이슈**: 이전까지 지시서에서 표준서를 선택해도 폼 pre-fill 만 되고 저장 시 표준서 참조가 남지 않던 문제. 이제 지시서·평가·스냅샷 세 곳에서 표준서를 정식으로 링크한다.

**변경**
- 마이그레이션 `db/0007_work_order_standard_link.sql`: `work_orders.standard_id uuid REFERENCES standards(id)` 컬럼 + 인덱스
- `features/work-orders/model.ts` `draftSchema`: `standardId` (nullable, optional, default null) 추가
- `server/work-order-service.ts`:
  - `resolveStandardLink()` 헬퍼 신설 — 지정된 표준서가 자기 회사의 승인된 문서인지 검증
  - `saveOrder` — INSERT/UPDATE 시 `standard_id` 함께 저장 (검증 실패 시 오류)
  - `requestAssessment` — 표준서 기반이면 `risk_assessments.is_simple=false, standard_id=X` 로 마킹, 간이평가면 `is_simple=true, standard_id=NULL`
  - `issueOrder` — 표준서 기반 지시서면 `work_order_snapshots` 에 `STANDARD_META` payload 삽입 (`standard_id, standard_name, ptw_required, standard_updated_at, captured_at`)
- `features/work-orders/work-order-form.tsx`: 표준서 선택·해제 시 `data.standardId` 를 함께 갱신
- `app/work-orders/[id]/page.tsx`: 상세 헤더에 "표준서 기반 · {표준서명}" 링크 배지 (발급 후엔 STANDARD_META 스냅샷, 초안이면 draft_data.standardId 기준)

**감사·심사 대응**
- 발급된 지시서는 STANDARD_META 스냅샷으로 "당시 표준서명 / PTW 여부 / 표준서 최신 수정 시각 / 스냅샷 시각" 을 불변 기록
- 표준서가 이후 편집·폐기돼도 지시서 발급 당시 정보는 보존
- 감사 로그(audit_logs) 와 결합하면 "표준서 X 를 언제 사용해 어떤 지시서를 발급했는가" 완전 추적 가능

**남은 한계**
- 표준서 기반 지시서에서 폼 값을 수정해도 그 수정본이 `risk_assessments` 회차로 별도 등록되지는 않음 (같은 표준서·다른 지시서의 평가는 각자 record 로 저장되지만 표준서의 회차 이력에는 자동 편입 안 됨). 필요 시 후속으로 "지시서에서 발생한 평가를 표준서 회차로 승격" 흐름 추가.
- 표준서 폐기 시 이미 발급된 지시서의 STANDARD_META 스냅샷은 살아 있지만, 그 표준서 상세 페이지 접근 링크는 여전히 열림 (폐기된 상세 페이지에서 이력만 표시).

---

## 2026-09-20 표준서 모델 재정의 — flat mutable + 위험성평가 회차 이력

**결정**: 표준서와 위험성평가의 DB 관계를 다시 짰다. **표준서는 개정 개념 없이 수정 가능한 단일 문서**, **위험성평가만 회차별 이력으로 축적**한다. 표준서:위험성평가 = **1:N**.

### 법적 근거

- **표준서(작업표준서)** — 산안법상 필수 문서가 아님. 사업장 자율 관리 문서. 인정 심사에서도 표준서 개정 이력이 심사 항목이 아님. 따라서 무거운 버전 관리 요건이 없음.
- **위험성평가** — 산안법 제36조 · 시행규칙 제37조. **법정 문서**, 실시 이력 3년 보존 의무. 최초/정기/수시/상시 각 회차가 독립 문서로 남아야 함.

두 문서 성격이 다르므로 스키마도 다르게 취급.

### 스키마 변경 (마이그레이션 `db/0006_standards_flat.sql`)

**폐기**:
- `standard_versions` 테이블 통째로 삭제
- `standards.current_version_id` 컬럼 삭제
- `standard_steps.version_id`, `standard_checklist_items.version_id` 삭제
- `risk_assessments.standard_version_id` 삭제

**추가**:
- `standards.ptw_required` (버전에서 표준서 직접으로 이관)
- `standard_steps.standard_id` (직접 참조), UNIQUE (standard_id, order_no)
- `standard_checklist_items.standard_id` (직접 참조), UNIQUE (standard_id, category, order_no)
- `risk_assessments.standard_id` (nullable — NULL 은 간이평가/예외 경로)
- 인덱스 `risk_assessments_standard_performed_idx` (표준서별 최신 승인 평가 조회 가속)

**백필**: 기존 데이터의 `standard_versions` → `standards` flat 이전 후 구 컬럼·테이블 정리.

### 최종 관계

```
standards                       ← mutable, 단일 문서
  id, name, ptw_required, status (DRAFT/APPROVED/ARCHIVED)
  ─ 편집 이력은 audit_logs (before/after) 로 소명

standard_steps          ─ standard_id FK
standard_checklist_items ─ standard_id FK

risk_assessments               ← 회차별 이력, 시계열 축적
  id, standard_id (nullable), assessment_kind (FIRST/PERIODIC/AD_HOC/CONTINUOUS)
  performed_on, status (APPROVED/…)
  ─ 한 표준서에 여러 행 축적

work_orders
  standard_id      ← 어떤 표준서 기반인지
  risk_assessment_id ← 발급 시 사용한 특정 회차의 스냅샷 소스
```

### 서비스·UI 변경

**서버 (`src/server/standards-service.ts`)** — 완전 재작성:
- `createStandardWithFirstAssessment` — 표준서 + 최초평가를 한 트랜잭션에서 생성 (self-approve)
- `updateStandardMutable` — 표준서 필드·단계·체크리스트 수정, before/after 를 `audit_logs` 에 기록
- `addAssessmentRound` — 기존 표준서에 새 위험성평가 회차 추가 (정기·수시·상시)
- `getStandardDetail` — `current_assessment` (최신 승인 평가) + `assessments[]` (전체 회차 이력) 반환
- `computeValidUntil` — 회차 유형별 유효기간 계산 (최초 3년 · 정기·수시 12개월 · 상시 만료 없음)
- `listUsableStandards` — 지시서 발급 시 선택 가능한 표준서 = 승인 상태 + 유효 평가 있음

**서버 액션 (`src/features/standards/actions.ts`)**:
- `createStandardAction` — 신규 (변경: `initialStandardSchema` 로 nested `first_assessment`)
- `updateStandardAction` — 편집 (신규)
- `addAssessmentAction` — 평가 회차 추가 (신규)
- `archiveStandardAction` — 폐기

**UI**:
- `/standards` — 목록. 표준서별 최근 평가일·회차 수·사용 가능 여부 표시
- `/standards/new` — 표준서 + 최초평가를 한 폼에서 생성 (기존, `performed_on` 필드 추가)
- `/standards/[id]` — 상세. 현재 평가·전체 회차 이력·유효기간 배지·**수정**·**평가 회차 추가** CTA. 만료 시 상단 경고 배너.
- `/standards/[id]/edit` — 표준서 필드만 수정 (신규)
- `/standards/[id]/assessments/new` — 새 위험성평가 회차 등록 (신규). 이전 회차의 방법·기준·사전조사 값을 seed 로 재사용해 입력 부담 완화. 평가 유형(정기/수시/상시/최초) 선택 UI.

**지시서 폼 (`work-order-form.tsx`, `/work-orders/new/page.tsx`)**:
- `StandardPickerOption` 에서 `version_id`, `version_no` 필드 제거 → `id` 만 사용
- 표준서 선택 시 현재 승인 평가를 자동 pre-fill (변경 없음, 내부 조회 로직만 flat 참조로 바뀜)

### 실무 시나리오

**표준서 수정** — 관리자가 편집 화면에서 텍스트 수정 → 즉시 반영. 변경 이력은 `audit_logs`. 기존 발급된 지시서는 발급 당시 스냅샷을 이미 갖고 있어 영향 없음.

**정기평가 사이클** — 매년 표준서 상세 화면에서 "평가 회차 추가" → 유형 "정기평가" 선택 → 실시일·판단기준·위험요인·참여자 입력. 새 회차가 승인되어 지시서 발급 스냅샷 소스로 승격.

**수시평가** — 시설·물질·인력 변경, 사고 발생 시 표준서 그대로 두고 회차만 추가 (유형 "수시평가").

**만료 알림** — 표준서 상세에 유효기간 만료 시 상단 경고 배너, 지시서 발급 진입 불가.

### 확인된 한계 · 후속

- 표준서 수정 이력은 `audit_logs` before/after 로만 남음. UI 로 diff 조회는 향후 감사 로그 화면 개발 시 함께.
- 평가 회차 삭제·수정은 미지원 (법정 이력 보존). 실수 시 새 회차로 덮음.
- 표준서 폐기 시 그 표준서의 평가 이력은 남지만 새 지시서 발급 대상에서 제외.
- 표준서를 활성화하려면 최소 1개의 유효 승인 평가 필요.

---

## 2026-09-20 요금 정책 전환 — 인원 한도 폐지

**결정**: 기존 "무료 인원 한도(기본 10명) 초과 시 회사 전체 Pro 자동 전환·전체 인원 과금" 규칙을 폐지한다. 앞으로는 **인원 수와 무관하게 텍스트 기반 기능은 무료로 누구나 사용**, **Pro 는 부가 기능이 필요한 회사가 자발적으로 전환**하는 프리미엄 모델로 전환한다.

**근거**
- 무료 사용자의 실 인프라 부담(Neon 스토리지·Resend 발송·Lightsail 고정요금)이 매우 낮아 규모 상관없이 무료 제공이 지속 가능하다고 판단.
- 초기 도입 마찰 제거가 매출보다 우선. 인원 제한은 진입 장벽이지 매출 메커니즘이 아님. 실 매출은 Pro 전용 기능에서 발생.
- 아직 `pro_state` 자동 전환·일일 사용량 스냅샷·과금 로직을 코드로 구현하지 않은 상태라 방향 전환에 코드 부담이 없다.

**Pro 전용으로 유지되는 기능** (매출 원천)
- 문자(SMS) 알림 (무료는 메일만)
- 표준서·점검·안전사고 사진 첨부
- 점검 모니터링 대시보드
- 점검 결과 보고서(PDF/인쇄) 출력
- 모바일 관리 업무 (모바일에서 표준서 열람·지시서/PTW 생성·기록 조회 등, 무료 모바일은 현장 기능만)
- 지난 기록 전체 조회 (무료는 최근 1주일, 이전은 건수만 표시)

**설계 문서·코드 변경 사항**
- `docs/SMBE-design-v5.4.md` 요금제 표에서 "한도 초과 시 자동 Pro 전환" 항목 향후 개정 예정. 우선 dev-log 로 결정 기록.
- DB: `companies.pro_state` `PRO_MANDATORY` 값은 스키마에 남기되 코드 경로에서 사용하지 않음. `free_limit` 컬럼은 유지하되 자동 강제 트리거로 쓰지 않고, 운영자가 특정 회사에 프리미엄 안내 여부를 조절하는 참고값으로만 사용.
- 인원관리 화면의 "한도 초과" 경고 배지 제거 → Pro 부가 기능 소프트 안내로 대체.
- 이용·관리(B-01) 화면 신설: 현재 요금제 상태, Pro 전용 기능 카탈로그, 가격 안내, 문의 CTA. 결제 자체는 미구현 상태로 문의 폼(/contact)에 연결.

**엔터프라이즈(100인+) 대응**
- "규모가 크면 자연스레 문자 알림·모바일 관리·다중 사업장 요구가 커짐 → 그 시점에 Pro 전환하며 개별 협의" 흐름으로 흡수. 인원 강제 트리거 없이 필요 기능이 트리거가 된다.

---

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
