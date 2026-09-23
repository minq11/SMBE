import { expect, test } from "@playwright/test";
test("contact honeypot silently succeeds without email credentials", async ({
  page,
}) => {
  await page.goto("/contact");
  await page.getByLabel("이름", { exact: true }).fill("테스트");
  await page.getByLabel("이메일", { exact: true }).fill("test@example.com");
  await page.getByLabel("메시지", { exact: true }).fill("회귀 테스트 메시지");
  await page
    .locator('input[name="website"]')
    .evaluate((input: HTMLInputElement) => {
      input.value = "spam";
    });
  await page.getByRole("button", { name: "문의 보내기" }).click();
  await expect(
    page.getByRole("heading", { name: "문의가 접수됐어요" }),
  ).toBeVisible();
});

test("anonymous membership and invite pages require login", async ({
  page,
}) => {
  await page.goto("/company/members");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/invite/unused-test-token");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/work-orders");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/work-orders/new");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/inspections");
  await expect(page).toHaveURL(/\/login/);
});

test("preview renders without secrets and only shows preparation dialogs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "심플안전 해야하는 이유" }),
  ).toBeVisible();
  // 로그인 전 화면에는 가짜 데이터를 두지 않는다. 실제로 하는 일과 시작 경로만 있다.
  // 상단바에도 같은 이름의 링크가 있어 본문으로 좁힌다.
  await expect(
    page.locator("#main").getByRole("link", { name: /무료로 시작/ }),
  ).toHaveAttribute("href", "/login");
  await expect(
    page.getByRole("link", { name: /우리회사 안전수준 진단/ }),
  ).toHaveAttribute("href", "/recognition-check");
  // 로그인 전 홈도 한 화면에 들어간다 — 본문이 스크롤될 만큼 길지 않다.
  if (test.info().project.name === "mobile") {
    const main = page.locator("main");
    expect(
      await main.evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(0);
  }
  await expect(
    page.getByRole("heading", { name: /‘시작 요금’ 없는/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /‘앱 설치’ 없는/ }),
  ).toBeVisible();
  // 요금 안내 줄은 없앴다 — 이유 넷이 화면을 채운다. 한 줄 설명은 물음표를
  // 눌러야 펼쳐지고, 2번의 혜택 칩은 펼치기와 무관하게 항상 보인다.
  await expect(page.getByText("요금·도입 문의")).toHaveCount(0);
  const firstDetail = page.getByText("인원 제한 없이 무료.", {
    exact: false,
  });
  await expect(firstDetail).toHaveCount(0);
  await expect(page.getByText("인정 시 3년 감독 유예")).toBeVisible();
  await page.getByRole("button", { name: "자세히 보기" }).first().click();
  await expect(firstDetail).toBeVisible();
  for (const fake of [
    "오늘의 작업 (예시)",
    "오늘 처리할 일",
    "제1공장 프레스 설비 점검",
    "김민수",
  ])
    await expect(page.getByText(fake, { exact: false })).toHaveCount(0);
  // 준비 중 안내는 아직 없는 기능(상단바 알림)에만 뜬다.
  await page.getByRole("button", { name: "알림", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "데이터는 저장·변경되지 않습니다",
  );
  await page.getByRole("button", { name: "확인했어요" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("health is public; readiness and nonexistent business endpoints are closed", async ({
  request,
}) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/api/health/ready")).status()).toBe(401);
  expect(
    (
      await request.get("/api/health/ready", {
        headers: { authorization: "Bearer invalid" },
      })
    ).status(),
  ).toBe(401);
  expect((await request.post("/api/work-orders", { data: {} })).status()).toBe(
    404,
  );
});
