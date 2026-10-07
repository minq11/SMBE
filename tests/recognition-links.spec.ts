import { test, expect } from "@playwright/test";
import { QUESTIONS } from "../src/features/recognition-check/questions";

test("diagnosis result keeps maximum gain and links participation and sharing", async ({ page }, testInfo) => {
  const answers = Object.fromEntries(QUESTIONS.map(q => [q.id, q.choices[0].key]));
  await page.addInitScript((answers) => {
    sessionStorage.setItem("smbe.recognition-check.v2", JSON.stringify({
      targeting: { industry: "manufacturing", sizeBand: "UNDER_5" }, answers,
    }));
  }, answers);
  await page.goto("/recognition-check");
  await page.getByRole("button", { name: "이어서 하기", exact: true }).click();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: "결과 보기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "진단 결과", exact: true })).toBeVisible();
  await expect(page.locator(".check-smbe-summary")).toContainText("종합 점수 최대");
  await expect(page.getByRole("link", { name: "평가 참여·의견 기록", exact: true }))
    .toHaveAttribute("href", "/login?next=%2Fassessments");
  const sharing = page.locator(".check-result-item").filter({ hasText: "관리감독자가 이행 여부를 확인하고" });
  await expect(sharing.getByRole("link")).toHaveCount(2);
  await expect(sharing.getByRole("link", { name: "주간회의 기록", exact: true }))
    .toHaveAttribute("href", "/login?next=%2Fmeetings");
  await sharing.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("recognition-links.png") });
});
