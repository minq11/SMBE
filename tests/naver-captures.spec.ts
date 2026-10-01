/**
 * 네이버 로그인 검수용 화면 캡처.
 *
 * 네이버는 요청한 제공 정보(회원이름·이메일 주소)가 **실제로 쓰이는 화면**과
 * **로그인 이용 절차**를 캡처해 올리라고 한다. 손으로 찍으면 화면이 바뀔 때마다
 * 다시 찍어야 하고 찍는 사람마다 크기가 달라지므로, 격리 환경에서 같은 데이터로
 * 다시 뽑을 수 있게 스펙으로 둔다.
 *
 * 돌리는 법 (일회성 PostgreSQL 이 떠 있어야 한다 — docs/regression-testing.md):
 *   npm run test:orders-ui -- tests/naver-captures.spec.ts --project=desktop
 *
  * 결과는 tests/captures/<desktop|mobile>/ 에 PNG 로 떨어진다. 이 폴더는 커밋하지
 * (제출용으로 한 번 쓰고 버리는 산출물이다).
 *
 * 캡처에 쓰는 이름·이메일은 네이버가 넘겨준 값이 들어가는 자리를 보여주기 위한
 * 예시다. 실제 사용자 정보가 아니다.
 */
import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

// desktop·mobile 두 프로젝트가 같은 파일을 덮어쓰지 않게 폴더를 나눈다.
// 제출용은 desktop, 좁은 화면 눈으로 보기는 mobile.
const outDir = (project: string) => `tests/captures/${project}`;

// 네이버 동의창에서 받는 값이 그대로 들어가는 자리를 보여주는 예시 계정.
const SAMPLE_NAME = "김안전";
const SAMPLE_EMAIL = "safety.kim@example.com";

test("네이버 검수 제출용 화면 캡처", async ({ page, context }) => {
  test.skip(process.env.SMBE_ORDER_UI_TESTS !== "1", "isolated DB only");
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
  if (!/^orders_ui_[a-f0-9]{32}$/.test(schema))
    throw new Error("Invalid schema");

  const OUT = outDir(test.info().project.name);
  await mkdir(OUT, { recursive: true });
  const pool = new Pool({
    connectionString:
      "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
    options: "-c search_path=" + schema + ",public",
  });

  try {
    // 1) 로그인 화면 — "네이버로 시작하기" 가 보이는 상태 (이용 절차 1단계)
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: /네이버로 시작하기/ }),
    ).toBeVisible();
    await page.screenshot({
      path: `${OUT}/1-로그인화면.png`,
      fullPage: true,
    });

    // 2) 네이버로 가입한 사용자를 만든다. 동의창을 거쳐 돌아온 직후의 상태와
    //    같다 — resolveIdentity 가 users 행과 user_identities(NAVER) 행을 남긴다.
    const userId = randomUUID();
    // 캡처에 찍히는 이메일이라 고정값을 쓴다. desktop·mobile 두 프로젝트가 같은
    // 스키마를 쓰므로 두 번째 실행이 users.email 유니크에 걸린다 — 먼저 비운다.
    // user_identities 는 ON DELETE CASCADE 라 같이 지워진다.
    await pool.query("DELETE FROM users WHERE email = $1", [SAMPLE_EMAIL]);
    await pool.query(
      "INSERT INTO users (id, display_name, email) VALUES ($1, $2, $3)",
      [userId, SAMPLE_NAME, SAMPLE_EMAIL],
    );
    await pool.query(
      "INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, 'NAVER', $2)",
      [userId, randomUUID()],
    );

    await context.addCookies([
      {
        name: "authjs.session-token",
        value: await encode({
          token: { appUserId: userId, sub: userId, email: SAMPLE_EMAIL },
          secret: "smbe-isolated-browser-test-secret-only",
          salt: "authjs.session-token",
        }),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
      },
    ]);

    // 3) 마이페이지 — [로그인 계정] 에 네이버 연결과 이메일, [내 정보] 에 이름.
    //    요청한 두 항목이 한 화면에 모두 보인다.
    await page.goto("/my-page");
    await expect(
      page.getByRole("heading", { name: "로그인 계정" }),
    ).toBeVisible();
    await expect(page.getByText(SAMPLE_EMAIL, { exact: true })).toBeVisible();
    await expect(page.getByText("네이버", { exact: true })).toBeVisible();
    await expect(page.getByLabel("이름")).toHaveValue(SAMPLE_NAME);
    await page.screenshot({
      path: `${OUT}/2-마이페이지-이름과이메일.png`,
      fullPage: true,
    });

    // 4) 회사 만들기(가입 완료) 화면 — 네이버에서 받은 이메일이 '알림 받을 메일'
    //    기본값으로 채워진다. "이메일을 어디에 쓰는가" 에 대한 답이라 같이 낸다.
    //    /onboarding 자체는 갈림길 화면이라 입력칸이 없어 쓰지 않는다.
    await page.goto("/onboarding/create-company");
    // loading.tsx 가 걷히기 전에 찍으면 로고만 나온 그림이 남는다. 폼이 보일
    // 때까지 기다린 뒤 찍는다.
    await expect(page.getByRole("heading", { name: "회사 만들기" })).toBeVisible();
    await expect(page.getByLabel(/알림 받을 메일/)).toHaveValue(SAMPLE_EMAIL);
    await page.screenshot({
      path: `${OUT}/3-가입화면-이메일사용처.png`,
      fullPage: true,
    });
  } finally {
    await pool.end();
  }
});

// 회사코드 참여 화면도 같은 구간 나누기를 쓴다. 두 화면이 나란히 있어
// 모양이 달라지면 안 되므로 같이 찍어 눈으로 본다.
test("가입 폼 구간 나누기 확인용 캡처", async ({ page, context }) => {
  test.skip(process.env.SMBE_ORDER_UI_TESTS !== "1", "isolated DB only");
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
  if (!/^orders_ui_[a-f0-9]{32}$/.test(schema))
    throw new Error("Invalid schema");

  const OUT = outDir(test.info().project.name);
  await mkdir(OUT, { recursive: true });
  const pool = new Pool({
    connectionString:
      "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
    options: "-c search_path=" + schema + ",public",
  });
  try {
    const userId = randomUUID();
    await pool.query(
      "INSERT INTO users (id, display_name, email) VALUES ($1, $2, $3)",
      [userId, SAMPLE_NAME, `join-${randomUUID()}@example.com`],
    );
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: await encode({
          token: { appUserId: userId, sub: userId },
          secret: "smbe-isolated-browser-test-secret-only",
          salt: "authjs.session-token",
        }),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
      },
    ]);
    await page.goto("/onboarding/join");
    await expect(
      page.getByRole("heading", { name: "회사코드로 참여" }),
    ).toBeVisible();
    await page.screenshot({ path: `${OUT}/4-회사코드참여.png`, fullPage: true });
  } finally {
    await pool.end();
  }
});
