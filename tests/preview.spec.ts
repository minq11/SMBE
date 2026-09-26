import { expect, test } from "@playwright/test";
test("contact honeypot silently succeeds without email credentials", async ({
  page,
}, testInfo) => {
  await page.goto("/contact");
  await page.screenshot({
    path: testInfo.outputPath("contact.png"),
    fullPage: true,
  });
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

test("public screens carry the business footer and it fits a narrow phone", async ({
  page,
}, testInfo) => {
  // 사업자 표시(전자상거래법)는 로그인 전 화면 하단에만. 320px 에서도 옆으로 안 넘친다.
  await page.setViewportSize({ width: 320, height: 720 });
  for (const route of ["/", "/login", "/guide"]) {
    await page.goto(route);
    const footer = page.locator(".site-footer");
    await expect(footer).toContainText("202-26-98342");
    await expect(footer).toContainText("패밀리포차");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("public-footer.png") });
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
    page.getByRole("heading", { name: "심플안전 해야합니다." }),
  ).toBeVisible();
  // 로그인 전 화면에는 가짜 데이터를 두지 않는다. 실제로 하는 일과 시작 경로만 있다.
  // 상단바에도 같은 이름의 링크가 있어 본문으로 좁힌다.
  await expect(
    page.locator("#main").getByRole("link", { name: /무료로 시작/ }),
  ).toHaveAttribute("href", "/login");
  await expect(
    page.getByRole("link", { name: /우리회사 안전수준 진단/ }),
  ).toHaveAttribute("href", "/recognition-check");
  // 로그인 전 홈도 한 화면에 들어간다 — 접힌 아래에는 사업자 표시 하단(법정)만 있다.
  // 본문이 넘치는 만큼은 그 하단의 높이 이하여야 한다.
  if (test.info().project.name === "mobile") {
    const main = page.locator("main");
    const footer = await page
      .locator(".site-footer")
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(
      await main.evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(footer + 1);
  }
  await expect(
    page.getByRole("heading", { name: /‘시작 요금’ 없는/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /‘앱 설치’ 없는/ }),
  ).toBeVisible();
  // 요금 안내 줄은 없앴다 — 이유 넷이 화면을 채운다. 한 줄 설명과 혜택 칩은
  // 카드에 늘 보이고, 자세한 설명은 카드를 누르면 창으로 뜬다.
  await expect(page.getByText("요금·도입 문의")).toHaveCount(0);
  await expect(page.getByText("인원 제한 없이 무료.")).toBeVisible();
  // 혜택 칩은 문구 개편(9-23)으로 빠졌다. 한 줄 설명이 카드에 보이면 된다.
  await expect(
    page.getByText("중처법/산안법 요구사항 대비", { exact: false }),
  ).toBeVisible();
  const dialog = page.locator("dialog.reason-dialog");
  const firstDetail = page.getByText("문의·협의 없이 가입 즉시", {
    exact: false,
  });
  await expect(firstDetail).toBeHidden();
  await page.getByRole("button", { name: /‘시작 요금’ 없는/ }).click();
  await expect(dialog).toBeVisible();
  await expect(firstDetail).toBeVisible();
  // 창 안의 확인 단추로 닫힌다.
  await dialog.getByRole("button", { name: "확인" }).click();
  await expect(dialog).toBeHidden();
  await expect(firstDetail).toBeHidden();
  // 여전히 한 화면 — 창이 카드 배치를 밀어내지 않는다 (접힌 아래는 사업자 표시뿐).
  if (test.info().project.name === "mobile") {
    const main = page.locator("main");
    const footer = await page
      .locator(".site-footer")
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(
      await main.evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(footer + 1);
  }
  for (const fake of [
    "오늘의 작업 (예시)",
    "오늘 처리할 일",
    "제1공장 프레스 설비 점검",
    "김민수",
  ])
    await expect(page.getByText(fake, { exact: false })).toHaveCount(0);
  // 알림은 로그인 전에는 없다.
  await expect(page.getByRole("button", { name: "알림" })).toHaveCount(0);
  // 준비 중 안내는 아직 없는 기능(사이드바의 안전사고 등)에만 뜬다.
  // 좁은 화면은 서랍을 먼저 연다.
  if (test.info().project.name === "mobile") {
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  }
  await page.getByRole("button", { name: "안전사고", exact: true }).click();
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
