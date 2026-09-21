# 데이터베이스

Neon PostgreSQL을 사용합니다. 이 폴더의 `*.sql` 파일이 버전 관리되는 마이그레이션이며,
`scripts/migrate.ts` 러너가 순차 적용하고 `schema_migrations` 테이블에 기록합니다.

앱 시작·이미지 빌드 시 자동 DDL 실행은 하지 않습니다. 명시적으로 커맨드를 돌려야 반영됩니다.

## 파일 규칙

- 이름: `NNNN_설명.sql` (예: `0001_init.sql`) — 사전순 = 실행 순.
- 한 파일 = 하나의 논리 변경 묶음. 러너가 파일 전체를 하나의 트랜잭션으로 실행합니다.
- 이미 적용된 파일은 다시 실행하지 않습니다. **적용된 SQL은 사후 수정하지 말고 새 파일로 후속 변경**하세요.

## 실행

로컬 (Node 설치된 개발 PC):

```powershell
# .env.local의 DATABASE_URL이 채워져 있어야 함
npm run db:migrate
```

운영 서버 (Lightsail — 호스트에 Node 를 설치하지 않습니다):

```sh
docker compose --profile tools run --rm migrate
```

운영 이미지(`runner`)에는 `tsx` 와 `package.json` 이 없어 `docker compose exec app` 으로는
실행되지 않습니다. `migrate` 서비스가 devDeps 가 있는 `development` 단계로 돌립니다.
배포와 함께 적용하려면 `./scripts/deploy.sh --migrate` 를 쓰세요.

첫 실행 시 `schema_migrations` 테이블을 자동 생성합니다. 각 파일은 트랜잭션으로 실행되므로
중간 실패 시 롤백됩니다.

## 현재 페이즈

- `0001_init.sql` — Phase 1: 계정·회사·소속·장소·초대 (`docs/SMBE-schema-v5.5.md` §2, §3, §4-1).
  - enum: `user_status`, `oauth_provider`, `employee_size_band`, `company_pro_state`,
    `company_member_role`, `company_member_status`, `company_join_via`
  - table: `users`, `user_identities`, `companies`, `company_members`, `work_locations`,
    `company_invitations`
  - helper: `touch_updated_at()` 트리거 함수, 각 테이블의 `updated_at` 자동 갱신

- `0002_company_required_fields.sql` — 사업개시일·예상 연매출액 필수값.
- `0003_work_orders.sql` — 간이평가, 작업지시·배정·발급 스냅샷·체크리스트·전달 기록·감사 로그.
- `0004_inspections.sql` — 작업회차, TBM·작업 중 점검, 점검 결과, 부적합 및 조치완료.
  - 작업지시·현장점검 범위 및 검증 방법: [work-orders.md](../docs/work-orders.md).

- `0005_standards.sql` — 작업표준서 마스터·버전·작업단계·체크리스트.
- `0006_standards_flat.sql` — 표준서 모델 재정의: 단일 문서 + 위험성평가 회차 이력.
- `0007_work_order_standard_link.sql` — 지시서 ↔ 표준서 정식 링크, 발급 시 표준서 스냅샷.
- `0008_attachments.sql` — S3 기반 다목적 첨부 (`company_id` 접두사로 테넌트 격리).
- `0009_ptw.sql` — 작업허가(PTW)와 승인 이벤트 이력.
- `0010_work_order_access_tokens.sql` — 작업지시 링크 접근 토큰 (배정별 1개, 해시 저장, 열람 기록).
- `0011_work_order_access_grants.sql` — 접근 권한을 발송 기록에서 분리. 토큰은 작업자당 1행,
  발송 기록은 채널별 행이 되어야 하므로 테이블을 나눴다 (0010의 컬럼은 이관 후 제거).
  - 설계 배경과 보안 경계: [worker-access.md](../docs/worker-access.md),
    채널 설계: [notifications.md](../docs/notifications.md).
- `0012_company_plan.sql` — 계약 요금 구간(`plan`)과 결제 기준일(`plan_started_at`).
  계약 인원 초과 시 등록 차단의 판정 근거이며, 구간 정의는
  `src/features/billing/plans.ts` 에 있습니다.
- `0013_company_risk_criteria.sql` — 회사의 위험성 수준 판단 기준(`risk_criteria`).
  평가는 생성 시 이 값을 `risk_assessments.criteria_snapshot` 으로 복사하므로,
  기준을 바꿔도 이미 승인된 평가는 그때의 기준으로 남습니다.

후속 페이즈(표준서·PTW·사진·사후입력·수정이력·과금 등)는 새 파일로 추가합니다.
