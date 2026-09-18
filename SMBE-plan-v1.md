# SMBE 개발 계획 v1

- 작성일: 2026-09-18
- 기준 문서: `SMBE-design-v5.4.md`, `SMBE-menu-layout-v5.4.md`
- 개발 목표: 0~5단계까지 (공개 유입 화면 포함), 요금·안전점수·운영자 백오피스는 6~7단계로 후속
- 개발 접근: **백엔드 우선, 프론트엔드 나중**. 도메인·API·배치 안정화 후 UI 착수
- 예상 기간(러프): 백엔드 5~6개월 + 프론트엔드 3~4개월, 병렬 진행 시 8~10개월
- 이 문서 성격: 개발 착수 전 확정해야 할 4가지(기술 스택·미결정 사항·데이터 모델·상세 태스크)를 한 문서에 모은 계획서. 세부 UI 수치·업무 규칙은 원 두 문서를 정본으로 참조

---

## 목차

1. [기술 스택](#1-기술-스택)
2. [원 설계 확인사항(17장) 잠정 결정](#2-원-설계-확인사항17장-잠정-결정)
3. [데이터 모델 스키마 초안](#3-데이터-모델-스키마-초안)
4. [단계별 상세 태스크](#4-단계별-상세-태스크)
5. [리스크·전제·후속 결정 시점](#5-리스크전제후속-결정-시점)

---

## 1. 기술 스택

### 1-1. 확정

| 영역 | 선택 | 근거 |
|---|---|---|
| 런타임 | **Java 21 (LTS)** | Spring Boot 3.x 기본 지원, 가상 스레드 활용 여지 |
| 프레임워크 | **Spring Boot 3.3.x** | 계약 문화·감사·배치·보안 생태계 성숙, 안전관리 도메인 표준 |
| 빌드 | **Gradle (Kotlin DSL)** | 멀티 모듈 확장 유리, 캐시·병렬 우수 |
| DB | **Neon (Serverless PostgreSQL 16)** | 관리형 서버리스, 브랜칭 기반 환경 분리, 자동 스케일·자동 백업. JSONB·부분 인덱스·범위 타입 등 표준 Postgres 기능 그대로 사용 |
| 앱 인프라 | **AWS (Seoul, `ap-northeast-2`)** | 앱 컴퓨트·SES·S3·ElastiCache. DB만 Neon 사용 |

### 1-2. 라이브러리·구성 요소

| 영역 | 라이브러리 | 용도 |
|---|---|---|
| ORM | **Spring Data JPA + Hibernate 6** | 도메인 매핑, 지연 로딩 관리 |
| 복잡 조회 | **QueryDSL 5** | 지시서 목록·회차 집계·과금 조회의 동적 쿼리 |
| 마이그레이션 | **Flyway** | 스키마 버전 관리(Liquibase 대체) |
| 인증 | **Spring Security + OAuth2 Client** | 네이버·구글·카카오 로그인 |
| 세션·토큰 | **JWT (Access 15분 / Refresh 30일) + Redis 세션 저장** | 모바일 장기 로그인 유지, 로그아웃 취소 처리 |
| 캐시·잠금·큐 | **Redis (ElastiCache)** | 회사코드 조회, 초대 링크 토큰, ShedLock 잠금 |
| 배치·스케줄 | **Spring Batch + ShedLock** | 일일 사용량 집계, 회차 판정, 정기평가 알림 |
| 이벤트 발행 | **Spring `ApplicationEventPublisher` (초기) → SQS 후속** | 알림·감사 로그 비동기 처리 |
| 파일 | **AWS S3** | 자격증 첨부, Pro 사진, 회사 데이터 다운로드 zip |
| 이메일 | **AWS SES** | 승인 링크·초대·알림. 발신 도메인 필요 |
| 문자 | **판단 보류** | Pro 기능. 국내 알림톡+SMS 게이트웨이 후속 결정 |
| 결제 | **판단 보류** | 6단계 이전에 PG(토스/아임포트/나이스) 확정 |
| QR 생성 | **ZXing (core)** | 지시서 출력물 QR |
| PDF·출력 | **OpenHTMLtoPDF 또는 Handlebars + wkhtmltopdf** | 지시서·점검 보고서 |
| 로깅 | **Logback + logstash-encoder (JSON)** | CloudWatch Logs 수집 |
| 관측 | **Spring Actuator + Micrometer → CloudWatch Metrics** | 헬스체크·요청량·지연 |
| API 문서 | **springdoc-openapi (OpenAPI 3)** | 프론트 팀 계약 문서, 코드 생성기 재사용 |
| 검증 | **Jakarta Bean Validation (Hibernate Validator)** | DTO 검증 표준화 |
| 매핑 | **MapStruct** | Entity ↔ DTO 변환 |
| 테스트 | **JUnit 5, AssertJ, MockMvc, Testcontainers (PostgreSQL/Redis)** | 통합 테스트에서 실제 DB 사용 |
| 정적 분석 | **Spotless(google-java-format) + ArchUnit + Sonar (선택)** | 스타일·아키텍처 규칙 |

### 1-3. 인프라 구성(초기)

- **VPC**: 퍼블릭/프라이빗 서브넷 각 2AZ
- **컴퓨트**: 초기 **EC2 + Docker Compose (2대) + ALB**, 안정화 후 **ECS Fargate**로 이행. Kubernetes(EKS)는 규모 도달 전까지 보류
- **DB (Neon)**:
  - **단일 프로젝트·단일 DB 사용**(별도 개발 DB 없음). 로컬 개발자도 이 Neon에 직접 붙어서 개발. 필요 시 임시 브랜치를 만들어 실험 후 삭제
  - **리전**: `AWS ap-southeast-1 (Singapore)` 확정. 엔드포인트는 pooler(`*-pooler.*.aws.neon.tech`) 사용, `sslmode=require`
  - **연결**: Neon 서버리스 드라이버는 JVM 미지원이므로 **표준 JDBC + PgBouncer 풀 URL**(Neon이 제공하는 `-pooler.` 엔드포인트) 사용. HikariCP는 서버리스 재활성화 지연을 흡수하는 값으로 튜닝(`keepaliveTime`, `maxLifetime` 짧게, `connectionTimeout` 여유)
  - **접속 문자열**: 리터럴은 어디에도 커밋 금지. **AWS Secrets Manager** 저장, 애플리케이션은 부팅 시 로드. 로컬은 `.env`(gitignore)로 관리
  - **백업**: Neon 자동 스냅샷(point-in-time 복구). 별도 백업 인프라 불필요
  - **환경 격리(단일 DB의 부작용):** dev/stg/prd 트래픽이 한 DB를 공유하므로 초기 개발용으로만 유지하고, **첫 실사용자 확보 전에 prd 브랜치 분리**로 전환하는 것을 권장. 이 문서에서는 초기 단일 DB 유지, 분리 시점은 리스크 항목에 명시
- **캐시**: ElastiCache Redis 7 (single node, 후속 Cluster Mode)
- **스토리지**: S3 (versioning ON, 감사 로그·청구 스냅샷 별도 버킷)
- **CDN**: CloudFront (공개 페이지 U-01~U-04 및 지시서 QR 정적 이미지)
- **DNS/TLS**: Route 53 + ACM
- **비밀 관리**: AWS Secrets Manager (Neon 접속 문자열·OAuth 시크릿·SES 자격)
- **감사 저장**: CloudTrail(AWS 관리) + 앱 감사 로그는 DB `audit_log` 테이블
- **환경 분리**: 초기에는 앱만 `dev`·`stg`·`prd`로 나누고 **Neon DB는 단일 인스턴스 공유**. 실사용자 확보 전에 prd 브랜치를 분리해 격리 강화

### 1-4. 프론트엔드(나중 착수)

| 영역 | 후보 | 결정 시점 |
|---|---|---|
| 관리자 PC | **React 18 + Vite + TypeScript + TailwindCSS** | 4단계 완료 무렵 착수 |
| 상태·서버 상태 | **TanStack Query + Zustand** | UI 착수 시 |
| 폼 | **React Hook Form + Zod** | UI 착수 시 |
| 모바일 현장 | **PWA 우선(React 재사용)**, 필요 시 React Native | 1단계 UI에서 모바일 3화면 별도 라우트로 우선 대응 |
| 공개 페이지 | **Next.js 14 (App Router, SSG/ISR)** | 5단계 착수 시. SEO·OG·사이트맵 위해 별도 앱으로 분리 |
| 코드 공유 | OpenAPI TypeScript codegen | 백엔드 API 확정 후 |

### 1-5. 저장소·CI/CD

- **모노레포**: `smbe-api/`, `smbe-web/`, `smbe-mobile/`, `smbe-public/`, `smbe-infra/`
- **CI**: GitHub Actions. 브랜치: `main` 보호, PR merge 시 `dev` 자동 배포, tag push 시 `stg`/`prd`
- **컨테이너 레지스트리**: ECR
- **배포**: 초기 SSH + docker compose pull, 이후 ECS 롤링 배포
- **DB 마이그레이션**: 앱 부팅 시 Flyway가 자동 실행. 초기 단일 DB 구조에서는 실서비스 오픈 후 prd DB 분리 시점부터 수동 승인 절차 도입. PR 단위 검증이 필요해지면 Neon 브랜치를 임시로 만들어 CI dry-run 후 삭제
- **시크릿 주입**: Secrets Manager → 컨테이너 환경변수. Neon 접속 문자열은 리터럴 커밋 금지, Secrets Manager에만 보관

### 1-6. 결정 보류 항목

| 항목 | 결정 필요 시점 |
|---|---|
| 결제 PG사 (토스페이먼츠 / 아임포트 / 나이스페이) | 6단계 착수 전 |
| 문자·알림톡 게이트웨이 (카카오 비즈니스 / NHN / 알리고 등) | 7단계 착수 전 |
| 세금계산서 발행 (파프리카 / 빌톡 / 팝빌) | 6단계 착수 전 |
| ECS Fargate 이행 시점 | 트래픽·회사 수 관찰 후 |
| 모바일 앱 네이티브 전환 여부 | PWA 사용성 검증 후 |

---

## 2. 원 설계 확인사항(17장) 잠정 결정

메뉴 문서 17장의 미결정 UI 경계 항목에 대한 **잠정 결정(안)**. 실제 서비스 오픈 전에 확정하되, 코드에서 임의로 정하지 않기 위해 잠정치를 명시한다.

| # | 항목 | 잠정 결정 | 근거·비고 |
|---|---|---|---|
| 1 | 평가 승인·저장·승인자 지정 | **관리자 작성 시 저장/승인 버튼 분리 노출. 본인이 자기 평가 승인 가능(자가 승인 태그 표시). 승인자는 관리자 그룹 중 콤보 선택** | PTW와 동일한 자가 승인 패턴 재사용, 인원이 적은 소기업 현실 반영 |
| 2 | 평가·회의·사고 권한 | **작업자: 조회만. 관리자 그룹: 작성·승인·수정·조치. 조치 담당자는 부적합·평가 항목별로 지정 가능** | 3장 역할표의 '관리자 그룹' 원칙 유지 |
| 3 | 모바일 안전점수 노출 | **모바일 홈에는 점수 배지만, 상세 패널은 PC에서** | 무료 모바일 현장 기능과 관리 기능 분리 원칙 유지 |
| 4 | 무료 과거 부적합 조회 | **OPEN 상태 부적합은 최근 1주일 제한을 예외적으로 해제, 종결(RESOLVED)된 건은 원 정책대로 1주일 제한 적용** | 아직 열린 안전조치를 못 보게 하는 것은 위험 |
| 5 | 주간 회의 과거 원문 | **회의 상세에서 수집된 항목의 요약은 노출, 원 점검 상세 링크는 무료 1주일 제한 적용** | 회의 완료 이력은 유지하되 조회 제한 규칙은 원 문서 규칙에 우선 순응 |
| 6 | 감사 로그 조회 문서 노출 | **감사 로그의 '요약(대상 종류·행위·필드명)'은 티어와 무관하게 표시, 변경 전/후 값 중 유료 제한 문서 본문은 마스킹** | 우회 조회 방지 |
| 7 | 무료 전화번호 초대 전달 | **무료도 전화번호 입력은 허용하되 초대 링크는 이메일로만 발송. 전화번호는 등록 후 관리 용도** | 무료 알림은 메일만이라는 요금표 원칙 유지 |
| 8 | 평가 회차 기간 중첩 | **한 평가는 단 하나의 회차에만 매칭. 우선순위는 '실시 구분 일치 > 회차 생성 순 > 기간 시작이 늦은 것'** | 자동 수집이 애매하면 회차 상세에서 관리자가 수동 재지정 가능 |
| 9 | PTW 필수 항목 | **작업 장소·설비·책임자·비상연락처 1건 이상은 필수. 그 외 항목은 필요 시 입력** | 지시서에서 이미 입력한 값은 재사용 |
| 10 | PTW 여러 날 승인 기한 판정 | **'작업 시작일 23:59'까지 승인 가능. 시작일 익일부터는 승인 불가, 반려/철회만 허용** | 원 설계 '작업 당일까지' 규칙을 시작일 기준으로 확정 |
| 11 | 사고 발생장소 | **회사 장소 마스터가 있으면 콤보 선택 우선, 없거나 외부는 직접입력 허용. 상세장소는 별도 텍스트 항상 입력 가능** | 온보딩 초기부터 사고 등록 가능해야 함 |
| 12 | 첨부파일 티어 | **자격증·사업자 등록·평가 참고 문서(PDF/이미지) = 무료도 허용. 표준서·점검·사고 '사진'만 Pro** | 원 설계의 '사진은 Pro' 규칙을 정확히 좁힘 |
| 13 | 안전점수 산정 | **v1은 계산식만 구현하고 화면 노출은 최소(배지 + '자체 진단 점수' 표기). 배점표는 관리자 설정용 JSON으로 분리해 튜닝 가능** | 미확정 산식을 실제 점수처럼 표시 금지 |
| 14 | 회사 탈퇴 실행 | **관리감독자만 실행 가능. 다운로드 범위는 회사의 모든 문서(zip: 지시서 PDF + 점검 CSV + 평가 JSON + 사고 JSON + 감사 로그 CSV). 법정 보존 대상은 서버에 5년 보관 후 자동 삭제** | 마지막 관리감독자는 다른 관리자 지정 후 탈퇴 |
| 15 | 요금 세부 | **부가세 별도 표시(총액 = 공급가액 + VAT 10%). 결제 실패 재시도 D+1, D+3, D+7 총 3회. 실패 후 무료 전환. 증빙은 세금계산서 자동 발행(카드)/수기(계좌)** | PG·세금계산서 벤더 결정 시 확정 |
| 16 | 공개 콘텐츠 게시 | **v1 출시 시점의 법령·인정 기준·문항을 노무사·안전보건공단 자료로 검토 후 게시. 페이지별 '적용 기준일'과 '검토일' 필드 필수** | 초기에는 파일 기반(YAML/MD)으로 관리, CMS 화면은 후속 |

**추가로 원 문서에서 미언급이나 개발에 필요한 잠정 결정:**

| 항목 | 잠정 결정 |
|---|---|
| 회사코드 형식 | 8자리 대문자+숫자 랜덤, 유일 제약. 예: `A3F9K27B` |
| 초대 링크 유효기간 | 7일, 1회 사용 |
| 지시서·PTW ID 형식 | `WO-{yyyymmdd}-{seq6}`, `PTW-{yyyymmdd}-{seq6}` |
| 표준서 ID 형식 | `STD-{seq4}-V{ver}` (원 설계 5-1 유지) |
| 로그인 세션 | 모바일 60일 유지(refresh rotation), PC 30일 |
| 사진 최대 크기 | 10MB, 저장 시 서버에서 리사이즈(1600px 장변) |
| 시간대 | 저장은 UTC, 표시·판정(작업회차)은 `Asia/Seoul` |
| 국제화 | v1 한국어 고정. `i18n` 키는 코드로 준비하되 리소스 파일은 한국어만 |

---

## 3. 데이터 모델 스키마 초안

**설계 원칙**
- Soft delete는 감사 필요 도메인(회원소속·문서·과금)만. 나머지는 hard delete
- 모든 문서 테이블은 `created_at`, `updated_at`, `created_by`, `updated_by` 공통 감사 컬럼 보유
- 상태값(State)은 enum 문자열 컬럼 + DB CHECK 제약, 상태 전이 이력은 별도 `_transition` 테이블에서 관리
- 회사 스코프 격리를 위해 회사 단위 리소스는 `company_id`를 필수 컬럼으로 두고 인덱스 선두에 배치
- 스냅샷 데이터(지시서에 붙는 표준서·평가 사본)는 원문 참조가 아니라 JSONB로 저장하여 원본 변경으로부터 격리

### 3-1. 계정·회사·소속

```
users
  id (PK, UUID)
  email
  phone (nullable)
  name
  oauth_provider (naver|google|kakao)
  oauth_subject (unique per provider)
  created_at, updated_at
  UNIQUE (oauth_provider, oauth_subject)

companies
  id (PK, UUID)
  name
  business_number (nullable)
  industry_code
  initial_employee_size_band (UNDER_5|FROM_5_TO_19|FROM_20_TO_49|FROM_50)
  company_code (UNIQUE, 8자리)
  free_member_limit (기본 10, 운영자 조정)
  is_pro (bool, 자발적 Pro 표시)
  pro_reason (VOLUNTARY|LIMIT_EXCEEDED|NULL)
  status (ACTIVE|WITHDRAWN)
  withdrew_at (nullable)
  created_at, updated_at

company_member  -- 소속 기간 이력
  id (PK)
  company_id (FK)
  user_id (FK)
  role (SUPERVISOR|SAFETY_MANAGER|WORKER)  -- 관리감독자·안전관리자·작업자
  joined_at (date/timestamp)
  left_at (nullable)
  status (ACTIVE|JOIN_PENDING|RESIGNED)
  join_path (INVITE_LINK|COMPANY_CODE)
  INDEX (company_id, left_at)
  INDEX (user_id, left_at)
  CHECK: 회원당 left_at IS NULL 행은 최대 1개

invitations
  id (PK, UUID)
  company_id (FK)
  invited_by (user_id)
  email (nullable), phone (nullable)
  token (UNIQUE, 32자)
  expires_at
  consumed_at (nullable)
  consumed_by_user_id (nullable)
  created_at

user_qualifications  -- 자격증
  id
  user_id (FK)
  name
  file_url (S3 key)
  created_at

locations  -- 회사 장소 마스터, 최대 5단계
  id (PK)
  company_id (FK)
  parent_id (nullable, self FK)
  name
  depth (1~5)
  path (LTREE 또는 문자열 캐시)
  is_active
  INDEX (company_id, parent_id)
```

### 3-2. 작업표준서·위험성평가

```
work_standards  -- 마스터
  id (PK) -- STD-0012 형태로 사용, 실제 컬럼은 UUID 두고 표시용 code 분리
  code (UNIQUE per company, e.g., STD-0012)
  company_id (FK)
  name
  ptw_required (bool)
  discarded_at (nullable)
  discarded_by (nullable)

work_standard_versions
  id (PK)
  standard_id (FK)
  version_no (1,2,3…)  -- V1, V2 형태로 조합
  status (DRAFT|PENDING|REJECTED|CURRENT|SUPERSEDED)
  content (JSONB) -- 작업 단계·방법 목록
  checklists (JSONB) -- {before:[…], during:[…]}
  approved_by (nullable), approved_at (nullable)
  rejected_reason (nullable)
  created_by, created_at, updated_at
  INDEX (standard_id, status)

risk_assessments
  id (PK)
  company_id (FK)
  standard_version_id (nullable FK) -- 간이평가면 NULL
  target_name -- 작업명·평가 대상
  execution_type (INITIAL|PERIODIC|OCCASIONAL|CONTINUOUS)
  execution_date
  is_simplified (bool)
  status (DRAFT|APPROVED|REJECTED)
  approved_by, approved_at (self-approval 태그 별도 컬럼)
  self_approved (bool)
  criteria (JSONB) -- 적용한 위험성 수준 판단 기준 스냅샷
  safety_info (JSONB) -- 사전조사 안전보건정보(설비·물질·환경·재해이력)
  participants (JSONB) -- 참여 근로자 [{user_id, name_at_time}]
  round_id (nullable FK, 평가 회차)
  created_by, created_at, updated_at

risk_hazards  -- 위험요인 각 건
  id (PK)
  assessment_id (FK)
  description
  level (HIGH|MID|LOW 또는 회사 커스텀)
  acceptable (bool)
  mitigation
  assignee_user_id (nullable)
  due_date (nullable)
  actual_action (nullable)
  actual_completed_at (nullable)
  level_after (nullable)
  acceptable_after (nullable)

assessment_rounds  -- 5-3 사업장 회차
  id (PK)
  company_id (FK)
  name
  execution_type
  period_start, period_end
  approved_at (nullable), approved_by (nullable)
  status (OPEN|APPROVED)

company_risk_criteria  -- 회사 단위 판단 기준
  company_id (PK)
  criteria (JSONB)
  updated_by, updated_at
  participants (JSONB) -- 기준 결정 시 근로자 참여 기록

company_assessment_regulation  -- 실시규정
  company_id (PK)
  content (JSONB)
  updated_by, updated_at
```

### 3-3. 작업지시서·PTW·회차

```
work_orders  -- 지시서 마스터. 취소 시 새 재발행은 새 row
  id (PK, UUID)
  code (WO-yyyymmdd-seqN, per company)
  company_id (FK)
  standard_version_id (nullable) -- 간이평가 기반이면 NULL
  assessment_id (nullable FK) -- 사용된 평가(승인된 시점의 스냅샷 포인터)
  assessment_snapshot (JSONB) -- 실제 스냅샷 내용
  standard_snapshot (JSONB) -- 표준서 내용 스냅샷
  title
  location_id (nullable), location_free_text (nullable)
  detail_location (nullable)
  ptw_required (bool)
  work_start_at (timestamp)
  work_end_at (timestamp)
  status (DRAFT|ISSUE_PENDING|ISSUED|IN_PROGRESS|COMPLETED|CANCELED)
  cancel_reason (nullable), canceled_at (nullable), canceled_by (nullable)
  issued_at (nullable)
  issue_version (int, 재발급·변경 시 증가) -- 출력물 발행 버전
  crew_group_id (nullable) -- '조 추가'로 함께 생성된 지시서 묶음 ID
  created_by, created_at, updated_at
  INDEX (company_id, status, work_start_at)

work_order_assignments  -- 지시서 배정 인원
  id
  work_order_id (FK)
  user_id (FK)
  assigned_at
  removed_at (nullable)
  removal_reason (SCHEDULE|REJECTED_ADDITION|MANUAL|null)

work_order_changes  -- 발급 후 일정·인원 변경 신청 이력
  id
  work_order_id (FK)
  requester_id, requested_at
  change_type (SCHEDULE|MEMBER_ADD|MEMBER_REMOVE)
  payload (JSONB)
  status (APPLIED|PENDING|REJECTED|WITHDRAWN)
  approver_id (nullable), approved_at (nullable)
  reject_reason (nullable)

ptws
  id (PK)
  code (PTW-yyyymmdd-seqN)
  work_order_id (FK, 1:1이지만 발급 후 추가 신청은 새 row + latest 플래그)
  applicant_id, approver_id
  status (PENDING|APPROVED|REJECTED|WITHDRAWN|EXPIRED|VOID)
  self_approved (bool)
  applied_at, approved_at, rejected_at
  reject_reason (nullable)
  valid_from, valid_to
  content (JSONB) -- 특이사항·설비·화기·화재감시자·비상연락처 배열
  is_latest (bool) -- 지시서의 최신 PTW 판정
  INDEX (work_order_id, is_latest)

ptw_transitions  -- 신청·철회·재신청·승인자 변경 이력
  id, ptw_id, from_status, to_status, actor_id, reason, changed_at

work_shifts  -- 작업회차 (지시서 × 작업일자)
  id (PK)
  work_order_id (FK)
  shift_date (date, 시작일 기준)
  start_at, end_at (timestamp, 회차 판정 범위 산출용)
  status (SCHEDULED|OPEN|DONE|MISSED)
  excluded (bool, 일정 변경으로 제외됨)
  UNIQUE (work_order_id, shift_date)
```

### 3-4. 점검·부적합

```
inspections  -- TBM/작업 중 점검 결과
  id (PK)
  shift_id (FK)
  inspector_id (user_id)
  inspector_role_at_time (SUPERVISOR|SAFETY_MANAGER|WORKER)
  type (TBM|DURING)
  entry_path (QR|LINK|WEB)
  submitted_at
  is_backfilled (bool)
  results (JSONB) -- [{item_id, verdict:SUITABLE|UNSUITABLE|N_A, comment, photo_urls[]}]

inspection_edits  -- 수정 이력
  id, inspection_id, editor_id, edited_at, before(JSONB), after(JSONB)

nonconformities
  id (PK)
  company_id (FK)
  shift_id (FK)
  inspection_id (FK)
  item_key -- 어떤 체크 항목
  content -- 원문 부적합 내용
  reported_by
  status (OPEN|RESOLVED)
  assignee_id (관리자)
  resolved_by, resolved_at, resolution_content
  INDEX (company_id, status, created_at)

weekly_meetings
  id, company_id, week_start (date), created_by, completed_at
  participants (JSONB)
  discussion (JSONB)
  items (JSONB) -- 자동 수집된 부적합/사고/미조치 대책 요약 스냅샷
```

### 3-5. 사고

```
accidents
  id (PK)
  company_id (FK)
  work_order_id (nullable) -- 지시서 연계 시
  occurred_at
  location_id (nullable), location_free_text (nullable)
  detail_location
  content
  photo_urls (JSONB) -- Pro만 값 존재
  countermeasure
  work_order_snapshot (JSONB, nullable) -- 지시서 연계 시 당시 정보 사본
  created_by, created_at
```

### 3-6. 과금·결제

```
daily_usage
  company_id, date (PK)
  headcount int
  free_limit int
  is_pro bool
  pro_reason (VOLUNTARY|LIMIT_EXCEEDED|null)
  billable_count int
  unit_price_per_day (원 단위 소수)
  amount_krw int
  calculated_at

billing_snapshots  -- 월 마감 확정
  id
  company_id
  billing_month (yyyymm)
  amount_krw int
  vat_krw int
  total_krw int
  per_member (JSONB) -- 인원별 일수·금액
  finalized_at
  UNIQUE (company_id, billing_month)

payment_methods
  id, company_id
  type (CARD_BILLING|BANK_ANNUAL)
  external_key -- PG billing key
  status (ACTIVE|EXPIRED|FAILED)
  registered_at

payments
  id, company_id, billing_snapshot_id
  attempt_no, status (SUCCESS|FAILED|PENDING)
  external_txid
  attempted_at, settled_at
  failure_reason
  invoice_url (세금계산서 링크)
```

### 3-7. 감사 로그·공개 콘텐츠

```
audit_log
  id (PK, bigserial)
  occurred_at
  actor_id (nullable, 시스템 배치면 null)
  actor_role_at_time
  company_id (nullable)
  target_type (WORK_ORDER|PTW|STANDARD|ASSESSMENT|INSPECTION|MEMBER|COMPANY|PAYMENT|…)
  target_id
  action (CREATE|UPDATE|DELETE|APPROVE|REJECT|ISSUE|CANCEL|LOGIN|…)
  before (JSONB, nullable)
  after (JSONB, nullable)
  entry_path (WEB|QR|LINK|BATCH|API)
  self_approved (bool)
  INDEX (company_id, occurred_at DESC)
  INDEX (target_type, target_id)

-- 공개 콘텐츠는 초기 파일 기반. 이 테이블은 5단계에서 추가 검토
guide_pages (선택)
  slug (PK) -- occupational-safety, serious-accidents 등
  title, body_md, sources (JSONB)
  applicable_from (date)
  reviewed_at (date)
  version
  published (bool)

recognition_questions (선택)
  id, section (TARGET|READINESS)
  order_no, question, choices (JSONB)
  applicable_from, reviewed_at, version

recognition_sessions -- 익명 응답 임시 보관(브라우저 세션이 원칙, 서버 저장은 옵션)
  session_key (PK)
  answers (JSONB)
  created_at, expires_at
```

### 3-8. 상태 전이·인덱스 요약

- 지시서 상태 전이는 `work_order_transitions` 별도 테이블에 감사(action, actor, reason)
- 인원 카운트 배치는 야간 실행: `daily_usage`를 전날 기준으로 채움. `company_member`의 (`joined_at <= date` AND (`left_at` IS NULL OR `left_at >= date`)) 조건 사용
- 회차 판정 배치: 매 5분 주기로 `work_shifts.status`를 시각 기준 갱신(SCHEDULED → OPEN → DONE/MISSED)
- 정기평가 안내 배치: 일 1회 회사별 마지막 승인 평가 연도 확인 후 다음 연도 미실시면 알림

---

## 4. 단계별 상세 태스크

각 태스크는 백엔드 관점의 API·모듈·배치 단위로 쪼갠다. UI는 5단계 완료 시점부터 본격 착수하되, 각 단계마다 최소 검증용 화면(초기: 인증된 HTTP 클라이언트 스크립트, 후기: 임시 관리 페이지)을 갖춘다.

### 0단계. 기반 (예상 3~4주)

**목표:** 인증·회사 생성/가입·역할 판정·감사 로그·마이그레이션·CI/CD가 돌아간다.

- **0-1** 프로젝트 초기화: Gradle 멀티모듈(`api`, `domain`, `infra`), 코드 스타일, 라이센스 헤더
- **0-2** 로컬 개발환경: Docker Compose (Redis + LocalStack for SES/S3). **DB는 Neon 원격 직접 접속**(별도 로컬 Postgres 없음). `.env.sample`에는 접속 문자열 자리표시자만 두고 실제 값은 gitignore 대상 `.env`에 저장
- **0-3** Flyway V1: `users`, `companies`, `company_member`, `invitations`, `locations`, `audit_log`, `outbox_event`. Neon 확장 옵션(pgvector 등)은 v1 미사용
- **0-4** OAuth2 로그인: 네이버·구글·카카오. redirect callback → 사용자 upsert → JWT 발급
- **0-5** JWT 발급·검증 필터, Refresh Token 회전, 로그아웃 시 Redis blacklist
- **0-6** 회사 API: 생성(`POST /companies`), 가입(`POST /companies/join`), 회사코드 발급/조회, 초대 링크 발급/소비
- **0-7** 역할 판정 컴포넌트 `MemberContext.isManager()`, `@RequireManager` 애노테이션 + Interceptor
- **0-8** 감사 로그 발행: `@Audited` AOP 또는 Application Event → `audit_log` INSERT
- **0-9** 예외 계층·`@RestControllerAdvice`·에러 응답 표준(RFC 7807 Problem Details)
- **0-10** OpenAPI 문서 노출, springdoc-openapi 설정
- **0-11** CI: GitHub Actions (test → build → docker push), `dev` 자동 배포
- **0-12** Neon 프로젝트 확정(단일 DB), ElastiCache 프로비저닝(Terraform 또는 CDK), Secrets Manager에 접속 문자열 저장. **최초 role 비밀번호는 개발 착수 전 롤링(초기 채팅 노출분 무효화)**
- **0-13** 관측: /actuator/health, /metrics, CloudWatch Logs 연동

**완료 기준:** 새 사용자가 네이버 로그인 → 회사 생성 → 초대 링크 → 다른 사용자 가입까지 API로 성공, 모든 행위가 `audit_log`에 남는다.

### 1단계. 첫 1시간 MVP (예상 8~10주)

**목표:** 관리자가 로그인→회사 생성→작업지시(간이평가 포함)→발급→모바일 링크 진입→TBM 확인까지 한 사이클 완주.

**도메인 API**
- **1-1** 인원관리: `GET /members`, `POST /members/invite`, `PATCH /members/{id}` (역할·자격증), `POST /members/{id}/resign`
- **1-2** 지시서 초안: `POST /work-orders` (DRAFT 생성), 필드 유효성, PTW 필요 여부 플래그
- **1-3** 간이평가 폼: `POST /work-orders/{id}/simplified-assessment`. 업종 템플릿 자동 채움 API `GET /templates/simplified-assessment?industry=`
- **1-4** 지시서 스냅샷 저장: 평가·표준서 정보를 `assessment_snapshot` / `standard_snapshot`으로 복사
- **1-5** 지시서 발급: `POST /work-orders/{id}/issue`. PTW 미필요 → 즉시 ISSUED, 필수값 검증
- **1-6** 지시서 요약 조회: `GET /work-orders/{id}` (상세), `GET /work-orders?scope=today` (오늘 진행 목록)
- **1-7** QR 생성: `GET /work-orders/{id}/qr.png` (ZXing)
- **1-8** 지시서 링크 발송: SES로 배정 인원에게 링크 메일

**모바일 진입**
- **1-9** 링크·QR 진입: `GET /shifts/current?workOrderId=`, 회차 판정 로직(시작 2시간 전 ~ 종료 2시간 후) 서버 검증
- **1-10** TBM 조회·저장: `GET /shifts/{id}/tbm` (평가 위험요인·이전 회차 부적합 팝업 데이터 포함), `POST /shifts/{id}/tbm` (결과 저장)
- **1-11** 작업 중 점검: `POST /shifts/{id}/during-inspection`
- **1-12** 부적합 자동 생성: 부적합 verdict가 들어오면 `nonconformities`에 OPEN 생성 + 알림 대상 관리자에게 SES 알림

**공통**
- **1-13** 업종 템플릿 시드(제조·건설·용접·고소·밀폐 등 몇 개)
- **1-14** 회차 판정 배치: 5분 주기 스케줄러로 SCHEDULED→OPEN→DONE/MISSED 전이
- **1-15** 검증용 웹 UI 최소본(선택): Bruno/Postman 컬렉션과 curl 스크립트로 대체 가능

**완료 기준:** 새 회사 생성 후 관리자가 API 호출만으로 지시서 발급 → QR/링크로 다른 사용자가 로그인 후 TBM 저장까지 성공, `daily_usage` 배치도 이 사이클을 인원으로 반영한다.

### 2단계. 관리 기능 (예상 6~8주)

**목표:** 반복 사용 흐름(복사·조회·조치)이 실제로 돌아간다.

- **2-1** 지시서 내역: `GET /work-orders` (상태·기간·작업명·장소·작성자 필터, 페이지네이션)
- **2-2** 지시서 복사: `POST /work-orders/{id}/copy` (작업일 등 초기화, 표준서 개정 반영)
- **2-3** 지시서 취소: `POST /work-orders/{id}/cancel` (사유 필수, PTW 자동 VOID)
- **2-4** 일정·인원 변경: `POST /work-orders/{id}/changes` (승인 필요/불필요 분기)
- **2-5** 지시서 상세 상단 상태(4개 독립 배지) 계산 로직
- **2-6** 점검 기록 조회: `GET /inspections`, 회차별/작업자별 그룹, 사후입력·수정 이력 포함
- **2-7** 사후입력 API: `POST /shifts/{id}/tbm/backfill` (관리자 전용)
- **2-8** 부적합 관리: `GET /nonconformities` 필터, `POST /nonconformities/{id}/resolve` (조치 내용 필수)
- **2-9** 티어 열람 제한 필터: 무료면 최근 1주일만 조회 노출(진행 중/발급 상태는 예외), 부적합 OPEN은 예외
- **2-10** 지시서·점검 PDF 출력: Handlebars 템플릿, wkhtmltopdf
- **2-11** 이메일 알림 템플릿·발송 로그 (SES → `outbox_event`)

**완료 기준:** 어제 지시서 복사 → 오늘 발급 → 모바일 점검 → 부적합 발생 → 관리자 조치완료까지 API 호출로 완주.

### 3단계. 표준서·정식 평가 (예상 6~8주)

**목표:** 표준서 마스터·버전·개정, 정식 위험성평가가 지시서에 연결된다.

- **3-1** 표준서 마스터·버전 API: `POST /standards`, `POST /standards/{id}/revise`, `POST /standard-versions/{id}/approve|reject|discard`
- **3-2** 표준서 승인 워크플로: DRAFT → PENDING → CURRENT/REJECTED, `SUPERSEDED` 자동 전이
- **3-3** 위험성평가 정식 폼: `POST /assessments` (표준서 버전 연결), 위험요인 CRUD, 참여자 기록
- **3-4** 회사 판단 기준·실시규정: `PUT /company/risk-criteria`, `PUT /company/assessment-regulation`
- **3-5** 표준서→평가 연속 작성: 표준서 승인 후 평가 작성으로 이어지는 리소스 라우팅
- **3-6** 지시서에서 표준서·평가 선택: `POST /work-orders/{id}/attach-standard`, 최신 승인 평가 자동 연결
- **3-7** 평가 승인·자가 승인 태그
- **3-8** 조치 이행 기록: 위험요인별 실제 조치·완료일·조치 후 수준
- **3-9** 정기평가 안내 배치: 연도별 미실시 검출 → SES 알림
- **3-10** 업종 템플릿(표준서+평가 세트) 콘텐츠 확장

**완료 기준:** 표준서 신규 → 승인 → 평가 이어쓰기 → 승인 → 지시서에서 선택하여 발급 흐름이 성공.

### 4단계. PTW·장소 (예상 4~5주)

**목표:** 허가가 필요한 작업이 신청·승인·자동발급·변경까지 돌아간다.

- **4-1** 장소관리 API: 5단계 트리 CRUD, 중간 단계 선택 허용
- **4-2** PTW 신청: 지시서 발급 신청 시 `ptws` INSERT (PENDING), 승인자 지정
- **4-3** PTW 승인·반려·철회·승인자 변경, `ptw_transitions` 이력
- **4-4** 신청&승인(자가 승인): 한 번의 요청으로 APPROVED 전이, `self_approved=true`
- **4-5** 승인 시 지시서 자동 ISSUED 전이 + 링크 발송
- **4-6** 발급 후 추가 PTW: 새 PTW row, is_latest 관리, 미승인 표시 계산
- **4-7** PTW 만료 배치: 일 1회 유효기간 지난 건 EXPIRED
- **4-8** 승인 링크 이메일(승인/반려/재발송)
- **4-9** PTW 목록·상세 API, 내 승인 대기 필터, 임박 정렬

**완료 기준:** 화기작업 지시서 작성 → PTW 신청 → 승인 링크 승인 → 자동 발급 → 모바일 진입까지 성공.

### 5단계. 공개 진입 (예상 5~7주)

**목표:** 비로그인 방문자가 안전법 가이드·인정 준비도 진단을 이용하고 가입으로 이어진다.

- **5-1** 공개 콘텐츠 저장 구조: YAML/MD 파일 → 빌드 시 정적 사이트 또는 런타임 로딩
- **5-2** 가이드 API: `GET /public/guides/{slug}`, 인원 구간별 개인화 파라미터
- **5-3** 인정 준비도 진단 API: `GET /public/recognition/questions`, `POST /public/recognition/answers` (세션 쿠키만 사용, 개인정보 없음)
- **5-4** 진단 결과 산정 로직: 신청대상·준비상태 분리, 응답 기준 명시
- **5-5** 세션 → 가입 이어가기: 로그인 후 `POST /companies` 시 진단 세션의 업종·규모 프리필
- **5-6** 공개 페이지용 Next.js 앱(별도 저장소): SSR + 사이트맵 + Open Graph
- **5-7** 검색 노출 방지: 개인 진단 결과 URL은 `noindex`, 답변을 쿼리에 담지 않음
- **5-8** 콘텐츠 검토 프로세스: 노무사/공단 자료 대조, 검토일·기준일 기록
- **5-9** 유입 분석: 답변 원문 없이 이벤트 트래킹(진단 시작/완료/가입/첫 평가 저장)

**완료 기준:** 공개 URL 방문 → 진단 완료 → CTA 클릭 → 로그인 → 회사 생성 시 업종·규모 프리필 확인.

### 6~7단계 (후속, 이번 문서에서는 개요만)

- **6단계 요금·안전점수·감사:** `daily_usage` 배치 완성, `billing_snapshot` 월 마감, PG 연동, 세금계산서, 안전점수 계산기, 감사 로그 뷰, 회사 탈퇴
- **7단계 Pro·운영자:** 사진 첨부, 문자 알림, 점검 모니터링, 사업장 평가 현황, 사고 관리, 주간 안전점검 회의, 운영자 백오피스

### 병렬화·의존성 요약

```
0단계 ── 1단계 ── 2단계 ── 3단계 ── 4단계 ── 5단계
                     └──── 6단계 (인원 배치 등 1단계와 병렬 시작 가능)
                     └──── 7단계 (2단계 이후)
```

- **1단계 진행 중 병렬**: 프론트 팀은 0단계 API 계약이 나오면 관리자 홈·인원관리 목업 시작 가능
- **5단계 병렬**: 공개 페이지는 다른 도메인과 결합도 낮음. 3단계 무렵부터 콘텐츠 검토·페이지 개발 병행
- **6단계 배치 개발**은 1단계 인원 관리 완료 즉시 착수 가능(청구는 나중이지만 데이터 축적을 미리 시작)

---

## 5. 리스크·전제·후속 결정 시점

### 5-1. 주요 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| OAuth 3사 정책 변경(네이버·카카오 심사) | 로그인 차단 | 개발 초기부터 심사 서류 준비, 이메일/비밀번호 폴백은 두지 않되 심사 지연 대비 로컬 테스트 계정 유지 |
| 공개 콘텐츠의 법령 정확성 | 신뢰 훼손 | 노무사 감수 계약, `applicable_from`·`reviewed_at` 필드 노출, 변경 이력 관리 |
| 회차 판정 배치 지연 | 미확인 표시 오류 | 5분 주기 스케줄러 + 지시서 조회 시점의 실시간 재계산 함수 병행 |
| Pro 자동 전환 오작동 | 청구 분쟁 | 배치 dry-run + 회사 관리자에 사전 안내 + 청구 스냅샷 이후 소급 변경 금지 |
| 감사 로그 폭증 | Neon 스토리지 비용 | `audit_log`는 파티셔닝(월 단위) + 12개월 이후 S3 아카이브 (파티션 detach → dump → 삭제) |
| Neon 콜드 스타트·리전 지연 | 첫 요청 지연·모바일 QR 진입 지연 | 헬스체크 워커로 idle 방지, HikariCP `keepaliveTime` 짧게, Seoul 이용자 대상 지연 실측(`ap-southeast-1` 서울↔싱가포르 왕복 60~80ms 예상) 후 필요 시 리전 이전 |
| 단일 DB 공유 (개발·스테이징·운영) | 개발 실수로 운영 데이터 훼손 | 초기에만 유지, **실사용자 유입 전에 prd 브랜치 분리**. DDL/DELETE는 앱 재시작 없이 직접 SQL 금지, Flyway·서비스 계층으로만 |
| 접속 문자열 유출 | DB 전체 노출 | 리터럴을 코드·문서·채팅에 남기지 않음. Secrets Manager 단일 소스, 노출 즉시 role 비밀번호 롤링 |
| 무료 열람 제한 우회 | 정책 붕괴 | 서비스 계층에서 티어 필터 컴포넌트 단일화, 컨트롤러에서 직접 조회 금지 |

### 5-2. 개발 착수 전 확정 필요(추가)

- SMBE 브랜드 자산: 로고·컬러 팔레트(현재 강조색 '주황' 명시)
- 도메인·발신 이메일: `smbe.co.kr` 등 확보 여부
- 노무사 자문 계약 (공개 콘텐츠·회사 탈퇴 시 보존 조문)
- 개인정보 처리방침·이용약관 초안
- OAuth 3사 개발자 앱 등록

### 5-3. 진행 원칙

- **버전 관리:** 이 문서는 `v1`부터 시작. 큰 결정 변경 시 새 버전 발행(`SMBE-plan-v2.md`)
- **원 설계 문서와의 관계:** 업무 규칙은 `SMBE-design-v5.4`, UI 배치는 `SMBE-menu-layout-v5.4`, 개발 계획은 본 문서. 세 문서 간 충돌은 원 설계가 우선
- **문서 반영 정책:** 17장 잠정 결정이 확정으로 바뀌면 원 문서에 반영 후 본 문서에서 인용으로 축약
- **범위 확대 요청 처리:** 6단계 이전에는 후속 단계 기능을 앞당기지 않는다(첫 사이클 완주 우선)
