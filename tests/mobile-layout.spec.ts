import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";

test("mobile pages fit narrow screens and navigation stays usable", async ({
  page,
  context,
}, info) => {
  test.skip(
    process.env.SMBE_ORDER_UI_TESTS !== "1" || info.project.name !== "mobile",
    "Uses isolated local DB and mobile viewport",
  );
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
  if (!/^orders_ui_[a-f0-9]{32}$/.test(schema))
    throw new Error("Invalid test schema");
  const pool = new Pool({
    connectionString:
      "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
    options: "-c search_path=" + schema + ",public",
  });
  const user = randomUUID(),
    company = randomUUID();
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES($1,'모바일 테스트 관리자')",
      [user],
    );
    await pool.query(
      `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by)
      VALUES($1,'모바일 화면 검증 회사','제조업',$2,'UNDER_5','UNDER_5',1,'2026-01-01',0,$3)`,
      [company, randomUUID(), user],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$2,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','모바일 관리자')",
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
    const fits = async () => {
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll("main *, .topbar *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.width > 0 &&
              (r.right > innerWidth + 1 || r.left < -1) &&
              // .wo-steps: 작성 단계 탭은 좁은 화면에서 한 줄로 옆으로 미는 띠다.
              !el.closest(
                ".honeypot, [hidden], .wo-table-wrap, .tabs, .wo-steps",
              )
            );
          })
          .slice(0, 8)
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            text: el.textContent?.slice(0, 60),
          })),
      );
      expect(overflow).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
    };
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of [
        "/",
        "/company/members",
        "/work-orders",
        "/work-orders/new",
        "/standards/new",
        "/billing",
        "/inspections",
      ]) {
        await page.goto(route);
        await page.locator("h1").first().waitFor();
        await fits();
        if (route === "/standards/new" && width <= 390) {
          const dueDate = page
            .locator(".std-risk-field input[type=date]")
            .first();
          expect((await dueDate.boundingBox())!.width).toBeGreaterThan(180);
        }
        const tips = page.locator(".help-tip-button");
        if (await tips.count()) {
          await tips.first().click();
          await expect(page.locator(".help-tip-panel")).toBeVisible();
          await fits();
          await page.locator(".help-tip-close").click();
        }
        if (route === "/work-orders/new") {
          for (const label of [/위험성평가/, /일정·인원/, /검토/]) {
            const step = page
              .locator(".wo-steps button")
              .filter({ hasText: label });
            if (await step.count()) {
              await step.click();
              await fits();
            }
          }
        }
        await page.screenshot({
          path: info.outputPath(`${width}-${route.replaceAll("/", "_")}.png`),
          fullPage: true,
        });
      }
      await page
        .getByRole("button", { name: "메뉴 열기", exact: true })
        .click();
      const drawer = page.getByRole("dialog", { name: "주 메뉴" });
      await expect(drawer).toBeVisible();
      await expect(
        drawer.getByRole("button", { name: /메뉴 닫기/ }),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(
        drawer.getByRole("button", { name: "도움말" }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "메뉴 열기", exact: true }),
      ).toBeFocused();
      await expect(page.locator("#mobile-navigation")).toHaveAttribute(
        "inert",
        "",
      );
    }
    await page.setViewportSize({ width: 640, height: 360 });
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "주 메뉴" });
    expect(
      await drawer.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await drawer.getByRole("link", { name: "이용·관리" }).click();
    await expect(page).toHaveURL(/billing/);
    await expect(page.locator("body")).not.toHaveClass(/sidebar-lock/);
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await page
      .getByRole("dialog", { name: "주 메뉴" })
      .getByRole("button", { name: "도움말" })
      .click();
    await expect(page.getByRole("dialog", { name: "주 메뉴" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally {
    await pool.end();
  }
});
