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

test("PTW fields inside the work-order form: 지금 발급하기 requests, self-approves and issues in one go", async ({
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
    worker = randomUUID(),
    company = randomUUID();
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES($1,'허가 관리자'),($2,'허가 작업자')",
      [user, worker],
    );
    await pool.query(
      "INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by) VALUES($1,'허가 폼 회사','제조업',$2,'UNDER_5','UNDER_5',2,'2026-01-01',0,$3)",
      [company, randomUUID(), user],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$2,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','허가 관리자'),($3,$2,'WORKER','ACTIVE','DIRECT_JOIN','허가 작업자')",
      [user, company, worker],
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
    await page.goto("/company/locations");
    await page.getByLabel("장소 이름").fill("도장장");
    await page.getByRole("button", { name: "장소 등록" }).click();
    await expect(page.getByRole("status")).toContainText("등록했습니다");

    await page.goto("/work-orders/new");
    await page.getByRole("button", { name: /표준서 없이 진행/ }).click();
    await page.getByLabel("작업명", { exact: true }).fill("도장 작업");
    await page.getByLabel("작업 단계·방법").fill("스프레이 도장");
    // PTW 필요 → 허가 항목이 폼 안에 나온다. 승인자·작업책임자는 본인이 기본값.
    await page
      .getByRole("radiogroup", { name: "위험작업허가(PTW)" })
      .getByLabel("필요", { exact: true })
      .check();
    const permit = page.getByRole("group", { name: "위험작업허가 항목" });
    await expect(permit.getByLabel("허가 승인자")).toHaveValue(user);
    await expect(permit.getByLabel("작업책임자")).toHaveValue(user);
    await permit.getByLabel("허가 장소 (등록된 장소)").selectOption({
      label: "도장장",
    });
    await permit.getByLabel("대상 설비").fill("도장 부스");
    await permit.getByLabel("이름 1", { exact: true }).fill("비상담당");
    await permit.getByLabel("휴대폰 1", { exact: true }).fill("01012345678");
    await page.screenshot({
      path: info.outputPath("permit-fields.png"),
      fullPage: true,
    });

    await page.getByLabel("유해·위험요인", { exact: true }).fill("유기용제");
    await page.getByLabel("현재 안전조치", { exact: true }).fill("환기");
    await page
      .getByRole("radiogroup", { name: "위험성 수준" })
      .getByLabel("하", { exact: true })
      .check();
    await page.getByLabel("감소대책", { exact: true }).fill("송기마스크");
    for (const label of [
      "기계·기구·설비 사양",
      "취급 유해물질·MSDS 정보",
      "공정·작업 주변 환경",
      "과거 재해·아차사고 이력",
    ])
      await page.getByLabel(label, { exact: true }).fill("확인");
    await page
      .locator("#wo-risk")
      .getByRole("checkbox", { name: "허가 작업자", exact: true })
      .check();
    const tomorrow = seoulToday(new Date(Date.now() + 86400000));
    await page.getByRole("button", { name: "작업 회차 만들기" }).click();
    await page.getByRole("dialog").getByLabel("시작일").fill(tomorrow);
    await page.getByRole("dialog").getByLabel("마감일").fill(tomorrow);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "회차 만들기" })
      .click();
    await expect(page.locator(".wo-session-row")).toHaveCount(1);
    await page.getByLabel("작업 장소", { exact: true }).fill("도장장");
    await page
      .locator("#wo-schedule")
      .getByRole("button", { name: /^작업자 선택/ })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("checkbox", { name: "허가 작업자", exact: true })
      .check();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "완료", exact: true })
      .click();
    await page.getByLabel("TBM · 작업 전 항목 1", { exact: true }).fill("환기");
    await page.getByLabel("작업 중 항목 1", { exact: true }).fill("마스크");

    // 임시저장 없이 바로 발급. 허가 신청·자가 승인·발급이 한 번에.
    await page
      .getByRole("button", { name: "지금 발급하기", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("자가 승인");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "발급", exact: true })
      .click();
    await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]{36}\?tab=qr$/);
    const row = (
      await pool.query(
        `SELECT w.status, p.status AS permit_status, p.self_approval,
                p.details->>'equipment' AS equipment
           FROM work_orders w JOIN work_permits p ON p.work_order_id = w.id
          WHERE w.company_id = $1`,
        [company],
      )
    ).rows[0];
    expect(row.status).toBe("ISSUED");
    expect(row.permit_status).toBe("APPROVED");
    expect(row.self_approval).toBe(true);
    expect(row.equipment).toBe("도장 부스");
  } finally {
    await pool.end();
  }
});
