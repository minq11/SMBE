# 데이터베이스

Neon PostgreSQL을 사용합니다. 이 폴더의 `*.sql` 파일이 버전 관리되는 마이그레이션이며,
`scripts/migrate.ts` 러너가 순차 적용하고 `schema_migrations` 테이블에 기록합니다.

앱 시작·이미지 빌드 시 자동 DDL 실행은 하지 않습니다. 명시적으로 커맨드를 돌려야 반영됩니다.

## 파일 규칙

- 이름: `NNNN_설명.sql` (예: `0001_init.sql`) — 사전순 = 실행 순.
- 한 파일 = 하나의 논리 변경 묶음. 러너가 파일 전체를 하나의 트랜잭션으로 실행합니다.
- 이미 적용된 파일은 다시 실행하지 않습니다. **적용된 SQL은 사후 수정하지 말고 새 파일로 후속 변경**하세요.

## 실행

```powershell
# .env.local의 DATABASE_URL이 채워져 있어야 함
npm run db:migrate
```

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

후속 페이즈(표준서·PTW·사진·사후입력·수정이력·과금 등)는 새 파일로 추가합니다.
