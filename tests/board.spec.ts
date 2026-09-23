import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";

test("board: manager writes and publishes a notice; popup shows on home and hides for today", async ({
  page,
  context,
}) => {
  test.skip(process.env.SMBE_ORDER_UI_TESTS !== "1");
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
  const pool = new Pool({
    connectionString:
      "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
    options: "-c search_path=" + schema + ",public",
  });
  const user = randomUUID(),
    company = randomUUID();
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES($1,'자료실 관리자')",
      [user],
    );
    await pool.query(
      `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by)
      VALUES($1,'자료실 회사','제조업',$2,'UNDER_5','UNDER_5',1,'2026-01-01',0,$3)`,
      [company, randomUUID(), user],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$2,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','관리자')",
      [user, company],
    );
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: await encode({
          token: { appUserId: user, sub: user },
          secret: "smbe-isolated-browser-test-secret-only",
          salt: "authjs.session-token",
        }),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
      },
    ]);
    await page.goto("/board/notices");
    await page.getByRole("button", { name: "글쓰기" }).click();
    await expect(page).toHaveURL(/\/board\/notices\/[0-9a-f-]+\/edit/);
    await page
      .getByLabel("제목", { exact: true })
      .fill("10월 정기 안전점검 일정");
    await page.getByLabel("본문", { exact: true }).click();
    await page.keyboard.type("10월 5일(월) 오전 9시, 전 라인 정기 점검입니다.");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "글머리 목록" }).click();
    await page.keyboard.type("보호구 착용");
    await page.keyboard.press("Enter");
    await page.keyboard.type("작업 전 TBM 필수");
    await page.getByLabel("구성원이 들어올 때 창으로 띄우기").check();
    await page.getByRole("button", { name: "공지사항 발행" }).click();
    await expect(page).toHaveURL(/\/board\/notices\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { name: "10월 정기 안전점검 일정" }),
    ).toBeVisible();
    await expect(page.getByText("작업 전 TBM 필수")).toBeVisible();
    await page.goto("/board/notices");
    await expect(page.getByText("10월 정기 안전점검 일정")).toBeVisible();
    // 홈에서 팝업
    await page.goto("/");
    const popup = page.locator("dialog.notice-popup");
    await expect(popup).toBeVisible();
    await expect(popup.getByText("보호구 착용")).toBeVisible();
    await popup.getByRole("button", { name: "오늘 하루 안 보기" }).click();
    await expect(popup).toBeHidden();
    await page.reload();
    await expect(page.locator("dialog.notice-popup")).toHaveCount(0);
  } finally {
    await pool.end();
  }
});
