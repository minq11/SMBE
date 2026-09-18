import { expect, test } from "@playwright/test";
test("preview renders without secrets and only shows preparation dialogs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Safety must be easy." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /구성원 초대/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    "업무 데이터는 저장하거나 변경하지 않습니다",
  );
  await page.getByRole("button", { name: "확인했어요" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "빈 화면 보기" }).click();
  await expect(page.getByText("처리할 일이 없습니다.")).toBeVisible();
  await expect(page.getByText("첫 작업을 시작해볼까요?")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "예시 화면 보기" }).click();
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
