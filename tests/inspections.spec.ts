import { test, expect } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { Pool } from "pg";
import type { PoolClient } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import {
  saveOrder,
  approveAndIssueOrder,
} from "../src/server/work-order-service";
import { blankDraft, seoulToday } from "../src/features/work-orders/model";

test("worker patrol before TBM, manager resolves finding, next TBM shows corrective action", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.skip(
    process.env.SMBE_ORDER_UI_TESTS !== "1",
    "Run npm run test:orders-ui with disposable PostgreSQL.",
  );
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
  if (!/^orders_ui_[a-f0-9]{32}$/.test(schema))
    throw new Error("Invalid test schema");
  const pool = new Pool({
    connectionString:
      "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
    options: "-c search_path=" + schema + ",public",
  });
  const manager = randomUUID(),
    worker = randomUUID(),
    outsider = randomUUID(),
    company = randomUUID(),
    orderId = randomUUID();
  const cookie = async (id: string) => ({
    name: "authjs.session-token",
    value: await encode({
      token: { appUserId: id, sub: id, name: "점검 검증 사용자" },
      secret: "smbe-isolated-browser-test-secret-only",
      salt: "authjs.session-token",
    }),
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    secure: false,
  });
  const workerContext = await browser.newContext({
    ...testInfo.project.use,
    baseURL: "http://127.0.0.1:3100",
  });
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES ($1,'점검 관리자'),($2,'점검 작업자'),($3,'미배정 사용자')",
      [manager, worker, outsider],
    );
    await pool.query(
      `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by)
      VALUES($1,'점검 테스트 회사','제조업',$2,'UNDER_5','UNDER_5',3,'2026-01-01',0,$3)`,
      [company, randomUUID(), manager],
    );
    for (const [id, role] of [
      [manager, "MANAGER_SUPERVISOR"],
      [worker, "WORKER"],
      [outsider, "WORKER"],
    ])
      await pool.query(
        "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$2,$3,'ACTIVE','DIRECT_JOIN','점검 사용자')",
        [id, company, role],
      );
    const start = new Date(Date.now() - 3600000),
      end = new Date(Date.now() + 3 * 3600000);
    const time = (d: Date) =>
      new Date(d.getTime() + 9 * 3600000).toISOString().slice(11, 16);
    const d = {
      ...blankDraft(),
      name: "점검 흐름 검증",
      method: "전원 차단 후 확인",
      location: "검증 구역",
      startDate: seoulToday(start),
      endDate: seoulToday(start),
      startTime: time(start),
      endTime: time(end),
      criteria: "현장 판단 기준",
      participantIds: [worker],
      assigneeIds: [worker],
      safetyInfo: {
        equipment: "프레스",
        materials: "없음",
        environment: "점검 구역",
        history: "없음",
      },
      risks: [
        {
          hazard: "끼임 위험",
          level: "HIGH" as const,
          allowable: "no" as const,
          measure: "동력 차단 및 방호장치 확인",
          responsibleId: manager,
          dueDate: seoulToday(),
        },
      ],
      tbm: ["방호장치 상태 확인"],
      during: ["가드 닫힘 확인"],
    };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await saveOrder(
        client as unknown as PoolClient,
        { companyId: company, userId: manager },
        orderId,
        0,
        d,
      );
      await approveAndIssueOrder(
        client as unknown as PoolClient,
        { companyId: company, userId: manager },
        orderId,
        1,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const path = "/work-orders/" + orderId;
    await workerContext.addCookies([await cookie(worker)]);
    const workerPage = await workerContext.newPage();
    await workerPage.goto(path + "?via=qr");
    await expect(
      workerPage.getByText("TBM 0/1명 확인", { exact: false }),
    ).toBeVisible();
    await workerPage
      .getByRole("link", { name: "작업 중 점검하기", exact: true })
      .click();
    await expect(workerPage).toHaveURL(/type=DURING_WORK&via=qr/);
    await expect(
      workerPage.getByText("TBM 미확인이어도 점검할 수 있습니다.", {
        exact: false,
      }),
    ).toBeVisible();
    await workerPage
      .getByRole("radio", { name: "부적합", exact: true })
      .check();
    await workerPage
      .getByLabel("코멘트", { exact: true })
      .fill("가드 잠금장치 이탈");
    await workerPage.getByLabel("알림 대상 관리자").selectOption(manager);
    expect(
      await workerPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await workerPage.screenshot({
      path: testInfo.outputPath("during-inspection.png"),
      fullPage: true,
    });
    await workerPage
      .getByRole("button", { name: "작업 중 점검 저장", exact: true })
      .click();
    await expect(workerPage.getByRole("status")).toContainText(
      "점검 기록을 저장했습니다.",
    );
    await expect(
      workerPage.getByRole("heading", { name: "부적합 조치 · 미조치 1건" }),
    ).toBeVisible();
    await expect(
      workerPage.getByRole("button", { name: "조치완료", exact: true }),
    ).toHaveCount(0);
    const recorded = (
      await pool.query(
        "SELECT i.entry_path,i.inspector_id,i.category FROM inspections i JOIN work_sessions s ON s.id=i.session_id WHERE s.work_order_id=$1",
        [orderId],
      )
    ).rows;
    expect(recorded).toEqual([
      { entry_path: "QR", inspector_id: worker, category: "DURING_WORK" },
    ]);
    await context.addCookies([await cookie(manager)]);
    await page.goto("/");
    await page.getByRole("link", { name: /부적합 조치 확인/ }).click();
    await expect(
      page.getByRole("heading", { name: "내 부적합 알림함 · 1건" }),
    ).toBeVisible();
    await page
      .getByLabel("조치 내용", { exact: true })
      .fill("가드 잠금장치 교체 후 동작 확인");
    await page.getByRole("button", { name: "조치완료", exact: true }).click();
    await expect(page.getByText("처리할 부적합이 없습니다.")).toBeVisible();
    // Advance the fixture to the next daily session without changing application clocks.
    await pool.query(
      "UPDATE work_sessions SET work_date=work_date-1,starts_at=starts_at-interval '1 day',ends_at=ends_at-interval '1 day' WHERE work_order_id=$1",
      [orderId],
    );
    await pool.query("SELECT create_work_sessions($1)", [orderId]);
    await workerPage.goto(path + "?via=link");
    await workerPage
      .getByRole("link", { name: "TBM 확인하기", exact: true })
      .click();
    await expect(workerPage.getByRole("dialog")).toBeVisible();
    await expect(workerPage.getByRole("dialog")).toContainText(
      "가드 잠금장치 교체 후 동작 확인",
    );
    await workerPage
      .getByRole("button", { name: "조치 내용 확인", exact: true })
      .click();
    await expect(workerPage.getByRole("dialog")).not.toBeVisible();
    await expect(
      workerPage.getByText("끼임 위험", { exact: true }),
    ).toBeVisible();
    await expect(
      workerPage.getByText("동력 차단 및 방호장치 확인", { exact: true }),
    ).toBeVisible();
    await workerPage.getByRole("radio", { name: "적합", exact: true }).check();
    await workerPage
      .getByRole("checkbox", { name: /위험요인·감소대책/ })
      .check();
    await workerPage.screenshot({
      path: testInfo.outputPath("tbm-inspection.png"),
      fullPage: true,
    });
    await workerPage
      .getByRole("button", { name: "TBM 확인 저장", exact: true })
      .click();
    await expect(
      workerPage.getByText("내 TBM 확인 완료", { exact: true }),
    ).toBeVisible();
    await workerPage.goto(path + "/inspections?type=TBM");
    await expect(
      workerPage.getByRole("button", { name: "TBM 확인 저장", exact: true }),
    ).toHaveCount(0);
    await workerPage
      .getByRole("link", { name: "작업 중 점검하기", exact: true })
      .click();
    await workerPage
      .getByRole("radio", { name: "해당없음", exact: true })
      .check();
    await workerPage
      .getByRole("button", { name: "작업 중 점검 저장", exact: true })
      .click();
    await expect(workerPage.getByText(/오늘 회차: .*오늘/)).toBeVisible();
    await workerPage.screenshot({
      path: testInfo.outputPath("inspection-complete.png"),
      fullPage: true,
    });
    // 회사 전체 점검 기록 (I-01) — 작업지시를 하나씩 열지 않고 누락을 찾는다.
    await page.goto("/inspections");
    await expect(
      page.getByRole("heading", { name: /점검 기록 · 회차/ }),
    ).toBeVisible();
    const logRow = page.locator(".wo-log-row").filter({
      hasText: "점검 흐름 검증",
    });
    await expect(logRow.first()).toBeVisible();
    await page.getByLabel("작업명").fill("있을 리 없는 작업");
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await expect(page.getByText("조건에 맞는 회차가 없습니다.")).toBeVisible();
    await page.getByRole("link", { name: "초기화", exact: true }).click();

    // 관리자 사후 입력: 어제 회차의 작업자 TBM 을 대신 넣는다.
    await logRow.first().getByRole("link").click();
    await expect(page).toHaveURL(/\/inspections\?session=/);
    // 이 회차의 작업자 TBM 은 이미 있으므로, 순회점검으로 참여한 관리자 기록을 넣는다.
    const backfill = page.locator("form.wo-backfill");
    await backfill.getByLabel("누구의 점검인가").selectOption(manager);
    await backfill.getByRole("radio", { name: "적합", exact: true }).check();
    await expect(async () => {
      await backfill
        .getByRole("button", { name: "사후 입력으로 저장", exact: true })
        .click();
      await expect(backfill.getByRole("status")).toContainText("사후 입력", {
        timeout: 2000,
      });
    }).toPass({ timeout: 20000 });
    await page.reload();
    // 현장 입력으로 위장되지 않는다 — 펼치지 않아도 사후 입력이라고 보인다.
    const record = page
      .locator("details.inspection-record")
      .filter({ hasText: "사후 입력" })
      .first();
    await expect(record.locator(".wo-backfill-tag")).toBeVisible();
    await record.locator("summary").first().click();
    await expect(
      record.getByText("사후 입력 · 입력자", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("inspection-backfill.png"),
      fullPage: true,
    });

    // 점검 모니터링 (I-04) — 유료 기능이라 무료 회사에는 안내만 뜬다.
    await page.goto("/monitoring");
    await expect(
      page.getByRole("heading", { name: "유료 요금제 기능입니다" }),
    ).toBeVisible();
    await expect(
      page.getByText("무료 요금제에서도 막히지 않는 것", { exact: false }),
    ).toBeVisible();
    await pool.query(
      "UPDATE companies SET pro_state='PRO_VOLUNTARY',plan='BASIC',plan_started_at=now() WHERE id=$1",
      [company],
    );
    await page.reload();
    await expect(page.getByText("TBM 미확인", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /작업 \d+건/ }),
    ).toBeVisible();
    await expect(
      page.locator(".monitor-row").filter({ hasText: "점검 흐름 검증" }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("inspection-monitoring.png"),
      fullPage: true,
    });
    await pool.query(
      "UPDATE companies SET pro_state='FREE',plan=NULL,plan_started_at=NULL WHERE id=$1",
      [company],
    );

    // 주간 안전점검 회의 (I-03) — 열기 → 참석자 기록 → 완료 → 잠금.
    await page.goto("/meetings");
    await expect(
      page.getByRole("heading", { name: "주간 안전점검 회의" }),
    ).toBeVisible();
    await expect(page.getByText(/발굴 \d+건/)).toBeVisible();
    const thisWeek = page.locator(".meeting-week").first();
    await expect(thisWeek).toContainText("미실시");
    await expect(async () => {
      await thisWeek.getByRole("button", { name: "회의 열기" }).click();
      await expect(page).toHaveURL(/\/meetings\/\d{4}-\d{2}-\d{2}$/, {
        timeout: 2000,
      });
    }).toPass({ timeout: 20000 });
    await expect(
      page.getByRole("heading", { name: /수집 항목/ }),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: "점검 관리자" }).check();
    await expect(async () => {
      await page
        .getByRole("button", { name: "회의 완료", exact: true })
        .click();
      await expect(
        page.getByText("완료한 회의는 수정할 수 없습니다.", { exact: false }),
      ).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await page.screenshot({
      path: testInfo.outputPath("safety-meeting.png"),
      fullPage: true,
    });
    await page.goto("/meetings");
    await expect(page.locator(".meeting-week").first()).toContainText(
      "실시 완료",
    );

    await workerContext.clearCookies();
    await workerContext.addCookies([await cookie(outsider)]);
    await workerPage.goto(path + "/inspections?type=TBM");
    await expect(
      workerPage.getByText("SMBE / 404", { exact: true }),
    ).toBeVisible();
  } finally {
    await workerContext.close();
    await pool.end();
  }
});
