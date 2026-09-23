import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import type { PoolClient } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { saveOrder } from "../src/server/work-order-service";
import { blankDraft, seoulToday } from "../src/features/work-orders/model";
test("location registration and explicit PTW self approval automatically issue work order", async ({
  page,
  context,
}, info) => {
  test.skip(process.env.SMBE_ORDER_UI_TESTS !== "1", "isolated DB only");
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
  if (!/^orders_ui_[a-f0-9]{32}$/.test(schema))
    throw new Error("invalid schema");
  const pool = new Pool({
    connectionString:
      "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
    options: "-c search_path=" + schema + ",public",
  });
  const user = randomUUID(),
    company = randomUUID(),
    order = randomUUID();
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES($1,'허가 관리자')",
      [user],
    );
    await pool.query(
      "INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by) VALUES($1,'허가 테스트 회사','제조업',$2,'UNDER_5','UNDER_5',1,'2026-01-01',0,$3)",
      [company, randomUUID(), user],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$2,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','허가 관리자')",
      [user, company],
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await saveOrder(
        client as unknown as PoolClient,
        { companyId: company, userId: user },
        order,
        0,
        {
          ...blankDraft(),
          name: "용접 작업",
          method: "용접",
          location: "용접장",
          startDate: seoulToday(new Date(Date.now() + 86400000)),
          endDate: seoulToday(new Date(Date.now() + 86400000)),
          startTime: "09:00",
          endTime: "17:00",
          ptwRequired: true,
          safetyInfo: {
            equipment: "용접기",
            materials: "금속",
            environment: "실내",
            history: "없음",
          },
          risks: [
            {
              hazard: "불꽃",
              level: "LOW",
              allowable: "yes",
              measure: "차단",
              responsibleId: user,
              dueDate: "",
            },
          ],
          participantIds: [user],
          assigneeIds: [user],
          tbm: ["보호구"],
          during: ["주변 점검"],
        },
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
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
    await page.goto("/company/locations");
    await page.getByLabel("장소 이름").fill("용접장");
    await page.getByRole("button", { name: "장소 등록" }).click();
    await expect(page.getByRole("status")).toContainText("등록했습니다");
    await page.goto("/work-orders/" + order + "/permit");
    await page
      .getByRole("combobox", { name: "작업 장소", exact: true })
      .selectOption({ label: "용접장" });
    await page
      .getByRole("combobox", { name: "승인자", exact: true })
      .selectOption(user);
    await page.getByLabel("대상 설비").fill("용접기");
    await page.getByLabel("이름", { exact: true }).fill("비상담당");
    await page.getByLabel("전화번호").fill("01012345678");
    await page.locator("input[name=confirm]").check();
    await page.locator("input[name=confirmSelf]").check();
    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.getByRole("button", { name: "신청&승인", exact: true }).click();
    await expect(page.getByText("상태: 승인 · 자가 승인 건")).toBeVisible();
    expect(
      (await pool.query("SELECT status FROM work_orders WHERE id=$1", [order]))
        .rows[0].status,
    ).toBe("ISSUED");
    await page.screenshot({
      path: info.outputPath("ptw-approved.png"),
      fullPage: true,
    });
    await page.goto("/permits?tab=all");
    await expect(
      page.getByRole("link", { name: "용접 작업", exact: true }),
    ).toBeVisible();
  } finally {
    await pool.end();
  }
});
