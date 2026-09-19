# 보완 사항 검증 · 인원수 정합성

## 회귀 테스트

테스트용 PostgreSQL은 일회성 Docker 컨테이너이며 상시 개발 DB가 아니다.
테스트는 .env 파일을 읽지 않고 localhost:55439/smbe_regression만 사용한다.
매 실행마다 임의 스키마를 만들고 해당 스키마만 제거한다.

Windows CMD / PowerShell 공통:

```sh
docker run --detach --rm --name smbe-regression -e POSTGRES_PASSWORD=smbe-test-only -e POSTGRES_DB=smbe_regression -p 127.0.0.1:55439:5432 postgres:16-alpine
docker exec smbe-regression pg_isready -U postgres
npm run test:db
docker stop smbe-regression
```

DB 준비 완료를 확인하고 테스트한다. 컨테이너 종료 시 테스트 데이터는 삭제된다.
CI에서도 같은 버전의 PostgreSQL 서비스로 수행한다.

```sh
npm run lint
npm run build
npm run typecheck
npm run test:e2e
```

실행 중인 로컬 standalone 서버가 .next/standalone을 잠그고 있으면 빌드가 EBUSY로 실패할 수 있다.
해당 서버를 종료한 뒤 다시 빌드하거나 시크릿을 제외한 별도 복사본에서 검증한다.
Playwright 서버에는 DB·이메일 시크릿 대신 빈 값을 전달해 외부 쓰기를 차단한다.

## 구현 원칙

- 승인·거부·퇴사·역할 변경은 회사 행 잠금 후 현재 관리자 권한과 대상 상태를 재검증한다.
- 마지막 관리감독자 확인부터 변경까지 하나의 트랜잭션 안에서 처리한다.
- 인원수는 증감 연산 대신 ACTIVE/미퇴사 소속의 실제 개수로 재계산한다.
- 초기 신고 규모는 보존하고 현재 규모만 5/20/50인 경계로 갱신한다.
- 회사 생성·직접 가입·초대 가입은 사용자 행 잠금과 기존 소속 재확인으로 중복 가입을 막는다.
- 초대는 GET에서 변경하지 않는다. 로그인한 사용자의 수락 Server Action에서 조건부 UPDATE로 한 번만 사용한다.
- OAuth 동일 identity 동시 콜백은 트랜잭션 advisory lock으로 직렬화한다.
- 다른 provider의 이메일 중복은 savepoint로 복구하며 계정을 자동 병합하지 않는다.
- 회사코드 중복은 ON CONFLICT DO NOTHING으로 재시도한다.
- 과금 상태 및 법률 가이드 판정 로직은 이번 보완 범위에 포함하지 않는다.

## 기존 DB 인원수 점검 / 보정

```sh
npm run db:reconcile-headcounts
```

기본은 읽기 전용이다. .env.local, .env 순으로 연결 정보를 읽으므로 대상 환경을 확인한다.
불일치가 있을 때만, 수정 코드 배포 후 아래 명령으로 보정한다.

```sh
npm run db:reconcile-headcounts -- --apply
```

적용 모드는 회사·소속 테이블 쓰기를 잠시 잠그며 5초 안에 잠금을 얻지 못하면 롤백한다.
변경 전/예상 값을 .local-backups/headcounts-UUID.json에 저장한 뒤 한 트랜잭션으로 갱신한다.
이 디렉터리는 Git에서 제외된다. 실패한 트랜잭션의 백업 파일이 남을 수 있으므로 파일 존재만으로 적용 성공을 판단하지 않는다.
복구가 필요하면 백업과 현재 소속을 대조한 뒤, 신규 가입·퇴사 이후의 값을 덮어쓰지 않도록 별도 검토한다.
새 테이블/컬럼이나 마이그레이션은 필요 없다.

## 이번 검증 범위

- 실제 PostgreSQL: 중복 승인·퇴사, 승인/거부 경쟁, 마지막 관리감독자 동시 변경,
  권한·회사 경계, 초대 단일 사용·만료·다중 회사 경쟁, 규모 경계, OAuth 중복 이메일·동시 콜백.
- PC/모바일 브라우저: 홈 미리보기, 문의 honeypot, 비로그인 접근 차단, health/readiness.
- 실제 OAuth 제공자 로그인, 실 이메일 발송 및 로그인한 브라우저의 전체 가입 흐름은 이번 자동 테스트에 포함하지 않았다.
