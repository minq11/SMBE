# 심플안전 (SMBE) — 작업 규칙

이 파일은 세션이 시작될 때 자동으로 읽힌다. 짧게 유지한다.

## 화면을 만들거나 고치기 전에

1. `docs/design-constitution.md` (디자인 헌법) 를 **먼저 읽는다.** 어기려면 문서를
   먼저 고친다.
2. `docs/dev-log.md` 맨 위 서너 개 항목을 읽어 최근 결정을 안다.

## 새 화면 체크리스트 (커밋 전에 하나씩 확인)

- [ ] 자식 화면이 있는 폴더마다 `loading.tsx` 재수출 (`export { default } from "@/app/loading"`)
- [ ] 저장하면 온 곳으로 돌아간다 (편집 화면에 "저장했습니다" 로 머물지 않는다)
- [ ] 브라우저 `confirm`/`alert`/`prompt` 없음 — `useConfirm`, 화면 안 입력
- [ ] 좁은 화면(390px)에서 단추 글자가 안 쪼개지고, 누르는 것은 44px 이상
- [ ] 색은 `var(--…)` 토큰만. 면책·단서 문구 없음 (공개 화면은 파는 글)
- [ ] 모바일·데스크톱 스크린샷을 눈으로 봤다. 테스트가 통과해도 이상하면 이상한 것
- [ ] `docs/dev-log.md` 맨 위에 항목 추가 (무엇을, 왜)

## 커밋 전 검사

```sh
npm run lint        # eslint + scripts/check-constitution.mjs (헌법 기계 검사)
npm run typecheck
npm run test:orders-ui -- tests/<관련>.spec.ts tests/mobile-layout.spec.ts tests/preview.spec.ts
```

`test:orders-ui` 는 일회성 PostgreSQL(127.0.0.1:55439, 비밀번호 `smbe-test-only`)
이 필요하다. 끝나면 정리한다. 상세: `docs/regression-testing.md`.

## 브랜치·푸시

- 작업 브랜치에 커밋·푸시한 뒤, 검증이 끝난 것은 `master` 로 fast-forward 푸시한다.
  master 가 앞서 있으면 merge 후 다시 검증하고 푸시한다. PR 은 만들지 않는다.
- 커밋 메시지·코드에 모델 이름을 쓰지 않는다.

## 글쓰기

- 공개 화면·안내 문구는 사장님 시각에서, 짧게, 당기게. 면책·책임 회피 금지
  (헌법 6장). 출처가 필요하면 맨 아래 한 줄.
- 코드 주석은 "왜" 를 적는다. 무엇을 하는지는 코드가 말한다.
