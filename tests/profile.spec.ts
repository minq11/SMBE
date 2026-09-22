import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";

test("own profile saves, membership exit preserves history, last supervisor protected", async ({
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
      "INSERT INTO users(id,display_name,email) VALUES($1,'관리자',$3),($2,'작업자',$4)",
      [manager, worker, manager + "@example.com", worker + "@example.com"],
    );
    await pool.query(
      "INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by) VALUES($1,'프로필 테스트 회사','제조업',$2,'UNDER_5','UNDER_5',2,'2026-01-01',0,$3)",
      [company, randomUUID(), manager],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$3,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','관리자'),($2,$3,'WORKER','ACTIVE','DIRECT_JOIN','이전 이름')",
      [manager, worker, company],
    );
    await login(worker);
    await page.goto("/my-page");
    await expect(
      page.getByRole("heading", { name: "마이페이지", exact: true }),
    ).toBeVisible();
    for (const name of ["새 이름", "최종 이름"]) {
      await page.locator("input[name=displayName]").fill(name);
      await page.locator("input[name=phone]").fill("010-1234-5678");
      await page.getByRole("button", { name: "내 정보 저장" }).click();
      await expect(page.locator(".account-form [role=status]")).toBeVisible();
      await expect(page.locator(".topbar .profile")).toContainText(name);
    }
    await page.reload();
    await expect(page.locator("input[name=displayName]")).toHaveValue(
      "최종 이름",
    );
    expect(
      (await pool.query("SELECT phone,email FROM users WHERE id=$1", [worker]))
        .rows[0],
    ).toEqual({ phone: "01012345678", email: worker + "@example.com" });
    expect(
      (
        await pool.query(
          "SELECT snapshot_display_name FROM company_members WHERE user_id=$1",
          [worker],
        )
      ).rows[0].snapshot_display_name,
    ).toBe("이전 이름");
    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: info.outputPath("profile-320.png"),
      fullPage: true,
    });
    await page.locator("input[name=confirm]").check();
    await page.getByRole("button", { name: "본인 퇴사 처리" }).click();
    await expect(
      page.getByRole("link", { name: "회사 가입·생성" }),
    ).toBeVisible();
    await expect(page.locator(".account-history")).toContainText("소속 종료");
    expect(
      (
        await pool.query(
          "SELECT status FROM company_members WHERE user_id=$1",
          [worker],
        )
      ).rows[0].status,
    ).toBe("RESIGNED");
    expect(
      (
        await pool.query("SELECT active_headcount FROM companies WHERE id=$1", [
          company,
        ])
      ).rows[0].active_headcount,
    ).toBe(1);
    // 회사코드로 들어온 가입 신청은 홈에서 바로 보여야 한다. 관리자가
    // 인원관리를 열어 보기 전에는 신청이 있는 줄도 몰랐던 자리다.
    const applicant = randomUUID();
    await pool.query(
      "INSERT INTO users(id,display_name,email) VALUES($1,'신청자',$2)",
      [applicant, applicant + "@example.com"],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$2,'WORKER','JOIN_PENDING','DIRECT_JOIN','신청자')",
      [applicant, company],
    );
    await login(manager);
    await page.goto("/");
    const pendingRow = page.getByRole("region", { name: "가입 승인 알림" });
    await expect(pendingRow).toContainText("1명");
    await pendingRow.getByRole("link").click();
    await expect(page).toHaveURL(/\/company\/members$/);
    await expect(
      page.getByRole("tab", { name: /가입 승인 대기/ }),
    ).toHaveAttribute("aria-selected", "true");

    await page.goto("/my-page");
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    const navigation = page.getByRole("navigation", {
      name: "주 메뉴",
      exact: true,
    });
    const companyGroup = navigation.getByRole("group", { name: "회사정보" });
    await expect(
      companyGroup.getByRole("link", { name: "인원관리" }),
    ).toBeVisible();
    await expect(
      companyGroup.getByRole("link", { name: "장소관리" }),
    ).toBeVisible();
    await expect(
      companyGroup.getByRole("link", { name: "이용·관리" }),
    ).toBeVisible();
    await expect(navigation.locator('a[href="/my-page"]')).toHaveCount(0);
    await companyGroup.getByRole("link", { name: "장소관리" }).click();
    await expect(page).toHaveURL(/\/company\/locations$/);
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await expect(
      page
        .getByRole("group", { name: "회사정보" })
        .getByRole("link", { name: "장소관리" }),
    ).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "내 정보 · 마이페이지" }).click();
    await expect(page).toHaveURL(/\/my-page$/);
    await expect(
      page.getByRole("button", { name: "본인 퇴사 처리" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "소속 해제 알림" }),
    ).toBeVisible();
    await context.clearCookies();
    await page.goto("/my-page");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await pool.end();
  }
});
