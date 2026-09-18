# 개발 뼈대 · 2026-09-18

## 이번 결정

사용자 결정: 1인+AI 개발, TypeScript 통일, 개발 DB Neon, 서버 Lightsail, 파일 S3. 메인 화면까지만 구현하고 실제 업무 연결은 제외.

구현 선택: Next.js 단일 앱에 React 화면과 Route Handler API를 함께 둡니다. PC와 모바일은 공용 반응형 웹입니다. 공개 페이지도 추후 같은 앱에 추가할 수 있습니다. 지금 별도 백엔드 서버, Redis, 큐, ORM, 로그인 제공자 설정은 도입하지 않습니다.

```text
브라우저 → Lightsail Caddy (80/443) → Next.js (내부 3000)
                                      ├─ Neon PostgreSQL (TLS / 진단만)
                                      └─ 비공개 S3 (AWS SDK / 진단만)
```

UI는 정적 예시만 사용합니다. 명령형 업무 버튼은 준비 중 안내를 열고 네트워크 쓰기 요청을 보내지 않습니다. 미확정 안전점수 대신 시작 가이드를 표시합니다. 표준서·PTW·평가 등은 메뉴 진입 안내만 제공합니다.

## 후속 업무 전에 결정할 사항

- 소셜 로그인 제공자 및 계정 연결·회사 권한 정책
- 평가 승인과 PTW 이력 등 design 내 미결정 정책
- 마이그레이션 도구와 최초 업무 스키마
- 실사용 시작 전 개발·운영 DB 분리와 복구 목표
- 파일별 권한 확인 뒤 S3 업로드/다운로드 서명 발급 정책

서버 비밀값은 환경변수에서 런타임에 읽습니다. 빌드 시 비밀값을 요구하지 않으며 Docker 이미지에도 포함하지 않습니다. `src/server/infrastructure.ts`가 웹앱의 server-only 진입점입니다. 연결 모듈은 CLI와 공유하며 클라이언트 컴포넌트에서 가져오지 않습니다.

TypeScript는 정적 타입을 공유하기 쉽지만 외부 입력을 검증해주지는 않습니다. 현재 설정은 Zod로 검증하며 후속 API도 런타임 검증을 적용합니다. 무거운 PDF 생성·배치는 실제 요구가 생기면 분리합니다.

도구 호환성: ESLint 10은 현재 Next.js 설정의 React 플러그인과 실행 오류가 있어 검증된 9.39.5를 사용합니다. 런타임 의존성이 아닌 개발 도구이며, 플러그인 호환성 확보 시 함께 갱신합니다. npm lockfile로 설치 버전을 고정합니다.

공식 참고: [Next.js 자체 호스팅](https://nextjs.org/docs/app/guides/self-hosting), [Neon 드라이버](https://neon.com/docs/serverless/serverless-driver), [Lightsail 방화벽](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html).
