import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";
import { seoulToday } from "../src/features/work-orders/model";

test("annual policy writes, restores, copies without overwriting, worker reads and printing is paid", async ({
  page,
  context,
}, info) => {
  test.skip(process.env.SMBE_ORDER_UI_TESTS !== "1", "isolated DB only");
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
  if (!/^orders_ui_[a-f0-9]{32}$/.test(schema))
    throw new Error("Invalid schema");
  const pool = new Pool({
    connectionString:
      "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
    options: "-c search_path=" + schema + ",public",
  });
  const manager = randomUUID(),
    worker = randomUUID(),
    company = randomUUID();
  const year = Number(seoulToday().slice(0, 4));
  const login = async (id: string) => {
    await context.clearCookies();
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: await encode({
          token: { appUserId: id, sub: id },
          secret: "smbe-isolated-browser-test-secret-only",
          salt: "authjs.session-token",
        }),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
      },
    ]);
  };
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES($1,'방침 관리자'),($2,'방침 작업자')",
      [manager, worker],
    );
    await pool.query(
      "INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by) VALUES($1,'소규모 제조 테스트','제조업',$2,'UNDER_5','UNDER_5',2,'2026-01-01',0,$3)",
      [company, randomUUID(), manager],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$3,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','관리자'),($2,$3,'WORKER','ACTIVE','DIRECT_JOIN','작업자')",
      [manager, worker, company],
    );
    await login(manager);
    await page.goto("/company/safety-policy");
    await page.getByRole("link", { name: `${year}년 작성` }).click();
    await expect(
      page.getByLabel("안전보건 방침", { exact: true }),
    ).toHaveValue(/최우선/);
    await page.getByLabel("연간 안전보건 목표").fill("TBM 매일 실시");
    await page.getByLabel("대표자명").fill("홍대표");
    await page.reload();
    await page
      .getByRole("button", { name: "이어서 작성", exact: true })
      .click();
    await expect(page.getByLabel("연간 안전보건 목표")).toHaveValue(
      "TBM 매일 실시",
    );
    await page.screenshot({ path: info.outputPath("policy-form.png") });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`safety-policy\\?year=${year}$`));
    await expect(page.locator(".policy-document")).toContainText("홍대표");
    await page.getByRole("button", { name: "게시용 인쇄" }).click();
    await expect(
      page.getByText("방침·목표 인쇄는 유료 요금제에서 씁니다.", {
        exact: false,
      }),
    ).toBeVisible();
    await page.goto(`/company/safety-policy/print?year=${year}`);
    await expect(page).toHaveURL(new RegExp(`safety-policy\\?year=${year}$`));
    await page.goto(`/company/safety-policy/edit?year=${year + 1}`);
    await page.getByRole("button", { name: "작년 내용 가져오기" }).click();
    await page.getByRole("button", { name: "가져오기", exact: true }).click();
    await expect(page.getByLabel("연간 안전보건 목표")).toHaveValue(
      "TBM 매일 실시",
    );
    await page.getByLabel("연간 안전보건 목표").fill("위험요인 7일 안에 조치");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator(".policy-document")).toContainText(
      "위험요인 7일 안에 조치",
    );
    await page.getByLabel("연도", { exact: true }).selectOption(String(year));
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await expect(page.locator(".policy-document")).toContainText(
      "TBM 매일 실시",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath("policy-detail.png") });
    await pool.query(
      "UPDATE companies SET pro_state='PRO_VOLUNTARY' WHERE id=$1",
      [company],
    );
    await page.reload();
    await page.getByRole("link", { name: "게시용 인쇄" }).click();
    await expect(
      page.getByRole("button", { name: "인쇄 / PDF 저장" }),
    ).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".policy-document")).toBeVisible();
    await expect(page.locator(".topbar")).toBeHidden();
    await page.screenshot({
      path: info.outputPath("policy-print.png"),
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });
    await login(worker);
    await page.goto(`/company/safety-policy?year=${year}`);
    await expect(page.locator(".policy-document")).toContainText(
      "TBM 매일 실시",
    );
    await expect(
      page.getByRole("link", { name: "수정", exact: true }),
    ).toHaveCount(0);
    await page.goto(`/company/safety-policy/edit?year=${year}`);
    await expect(page).toHaveURL(/\/work-orders$/);
  } finally {
    await pool.query(
      "DELETE FROM company_safety_policies WHERE company_id=$1",
      [company],
    );
    await pool.query("DELETE FROM company_members WHERE company_id=$1", [
      company,
    ]);
    await pool.query("DELETE FROM company_risk_levels WHERE company_id=$1", [
      company,
    ]);
    await pool.query("DELETE FROM companies WHERE id=$1", [company]);
    await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
      [manager, worker],
    ]);
    await pool.end();
  }
});
