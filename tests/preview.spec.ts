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
    page.getByRole("heading", { name: "Safety must be easy." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /구성원 초대/ })).toHaveAttribute(
    "href",
    "/company/members",
  );
  await expect(
    page.getByRole("link", { name: /오늘의 작업 지시하기/ }),
  ).toHaveAttribute("href", "/work-orders/new");
  await page.getByRole("button", { name: /위험작업허가 승인/ }).click();
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
