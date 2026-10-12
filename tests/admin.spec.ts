import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";

/**
 * 운영자 회사 화면. 요금제 열은 지금 규칙(무료는 인원 제한 없음, 멤버십은 계약
 * 인원)대로 보이고, 요금제를 바꾸면 새로고침 없이 그 자리에서 바뀐다.
 */
test("admin: company list and plan change refresh in place", async ({
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
  const operator = randomUUID(),
    owner = randomUUID(),
    company = randomUUID();
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES($1,'운영자'),($2,'운영 검증 대표')",
      [operator, owner],
    );
    await pool.query(
      "INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by) VALUES($1,'운영 검증 회사','제조업',$2,'FROM_20_TO_49','FROM_20_TO_49',1,'2026-01-01',0,$3)",
      [company, randomUUID(), owner],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$2,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','대표')",
      [owner, company],
    );
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: await encode({
          token: {
            appUserId: operator,
            sub: operator,
            email: "operator@test.local",
          },
          secret: "smbe-isolated-browser-test-secret-only",
          salt: "authjs.session-token",
        }),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
      },
    ]);

    await page.goto("/admin?q=운영 검증 회사");
    const row = page.locator("tr", { hasText: "운영 검증 회사" });
    await expect(row).toContainText("무료");
    // 예전 "무료 한도 10명 / 초과" 는 없다.
    await expect(page.locator("thead")).not.toContainText("무료 한도");
    await row.getByRole("link", { name: "상세" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/companies/${company}$`));
    const meta = page.locator(".meta-strip");
    await expect(meta).toContainText("무료");
    await expect(meta).not.toContainText("한도 초과");
    await expect(
      page.getByRole("heading", { name: "운영자 조정" }),
    ).toHaveCount(0);

    // 요금제를 올리면 새로고침 없이 요금제·결제 기준일이 바뀐다.
    await page.getByLabel("구간", { exact: true }).selectOption("BASIC");
    await page.getByRole("button", { name: "변경", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("BASIC 구간으로 변경");
    await expect(meta).toContainText("멤버십 · Basic");
    await expect(meta).toContainText("계약 19명");
    await expect(meta).toContainText("결제 기준일");
    await page.screenshot({
      path: info.outputPath("admin-company.png"),
      fullPage: true,
    });
    const saved = (
      await pool.query("SELECT pro_state, plan FROM companies WHERE id=$1", [
        company,
      ])
    ).rows[0];
    expect(saved).toEqual({ pro_state: "PRO_VOLUNTARY", plan: "BASIC" });

    await page.goto("/admin?q=운영 검증 회사");
    await expect(row).toContainText("멤버십 · Basic");
    await expect(row).toContainText("~19인");
  } finally {
    await pool.query("DELETE FROM company_members WHERE company_id=$1", [
      company,
    ]);
    await pool.query("DELETE FROM company_risk_levels WHERE company_id=$1", [
      company,
    ]);
    await pool.query("DELETE FROM companies WHERE id=$1", [company]);
    await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
      [operator, owner],
    ]);
    await pool.end();
  }
});
