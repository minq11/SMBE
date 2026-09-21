import { test, expect } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { seoulToday } from "../src/features/work-orders/model";

test("manager authors, self-approves and issues; worker reads; copy resets; cancellation blocks QR", async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.skip(
    process.env.SMBE_ORDER_UI_TESTS !== "1",
    "Run npm run test:orders-ui against isolated local PostgreSQL.",
  );
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
  if (!/^orders_ui_[a-f0-9]{32}$/.test(schema))
    throw new Error("Invalid isolated test schema");
  const pool = new Pool({
    connectionString:
      "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
    options: "-c search_path=" + schema + ",public",
  });
  const manager = randomUUID(),
    worker = randomUUID(),
    outsider = randomUUID(),
    company = randomUUID();
  const cookie = async (id: string) => ({
    name: "authjs.session-token",
    value: await encode({
      token: { appUserId: id, sub: id, name: "검증 사용자" },
      secret: "smbe-isolated-browser-test-secret-only",
      salt: "authjs.session-token",
    }),
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    secure: false,
  });
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES ($1,'검증 관리자'),($2,'검증 작업자'),($3,'미배정 작업자')",
      [manager, worker, outsider],
    );
    await pool.query(
      `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,
      active_headcount,business_start_date,expected_annual_revenue_manwon,created_by)
      VALUES ($1,'화면검증 회사','제조업',$2,'UNDER_5','UNDER_5',3,'2026-01-01',0,$3)`,
      [company, randomUUID(), manager],
    );
    for (const [id, role] of [
      [manager, "MANAGER_SUPERVISOR"],
      [worker, "WORKER"],
      [outsider, "WORKER"],
    ]) {
      await pool.query(
        `INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name)
        VALUES ($1,$2,$3,'ACTIVE','DIRECT_JOIN','검증 사용자')`,
        [id, company, role],
      );
    }
    await context.addCookies([await cookie(manager)]);
    await page.goto("/work-orders/new");
    await expect(
      page.getByRole("heading", { name: "새 작업지시" }),
    ).toBeVisible();
    // 표준서가 없는 회사라 시작 방식을 먼저 고른다. 고르기 전에는
    // 작업 정보 입력칸이 렌더링되지 않는다 (work-order-form.tsx: mode !== "idle").
    await page.getByRole("button", { name: /표준서 없이 진행/ }).click();
    await page
      .getByLabel("작업명", { exact: true })
      .fill("화면검증 작업 " + testInfo.project.name);
    await page.getByLabel("작업 단계·방법").fill("테스트 전용 작업방법");
    await page.screenshot({
      path: testInfo.outputPath("work-order-new.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "다음", exact: true }).click();
    // 판단 기준은 회사가 정한 값이 자동으로 적용된다 (회사정보 > 위험성 판단 기준).
    await expect(
      page.getByRole("heading", { name: "적용한 위험성 수준 판단 기준" }),
    ).toBeVisible();
    await page
      .getByLabel("유해·위험요인", { exact: true })
      .fill("테스트 위험요인");
    await page.getByLabel("위험성 수준", { exact: true }).selectOption("LOW");
    await page.getByLabel("허용 가능 여부").selectOption("yes");
    await page.getByLabel("감소대책", { exact: true }).fill("테스트 감소대책");
    for (const label of [
      "기계·기구·설비 사양",
      "취급 유해물질·MSDS 정보",
      "공정·작업 주변 환경",
      "과거 재해·아차사고 이력",
    ]) {
      await page.getByLabel(label, { exact: true }).fill("테스트 정보");
    }
    await page
      .getByRole("checkbox", { name: "검증 작업자", exact: true })
      .check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const tomorrow = seoulToday(new Date(Date.now() + 86400_000));
    await page.getByLabel("작업 시작일").fill(tomorrow);
    await page.getByLabel("작업 종료일").fill(tomorrow);
    await page.getByLabel("작업 장소", { exact: true }).fill("테스트 구역");
    await page
      .getByRole("checkbox", { name: "검증 작업자", exact: true })
      .check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page
      .getByLabel("TBM · 작업 전 항목 1", { exact: true })
      .fill("테스트 TBM");
    await page
      .getByLabel("작업 중 항목 1", { exact: true })
      .fill("테스트 점검");
    await page.getByRole("button", { name: "임시저장", exact: true }).click();
    // 임시저장은 계속 작성할 수 있도록 편집 화면에 머문다 (actions.ts saveDraftAction).
    await expect(page).toHaveURL(/\/work-orders\/[a-f0-9-]{36}\/edit$/);
    const id = new URL(page.url()).pathname.split("/")[2];
    const path = "/work-orders/" + id;
    // 편집 화면은 첫 단계부터 다시 시작하므로 검토 단계까지 이동한다.
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "다음", exact: true }).click();
    }
    page.on("dialog", (dialog) => dialog.accept());
    // 저장 → 본인 평가 승인 → 발급 → 링크 전송을 한 번에 처리한다.
    await page
      .getByRole("button", { name: "지금 발급하기", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(id + "$"));
    await expect(
      page.getByRole("heading", { name: "작업지시 QR", exact: true }),
    ).toBeVisible();
    await expect(page.getByAltText("이 작업지시를 여는 QR 코드")).toBeVisible();
    await expect(
      page.getByText("관리자 본인 평가 승인 기록이 있습니다.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "편집", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("work-order-issued.png"),
      fullPage: true,
    });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.getByAltText("이 작업지시를 여는 QR 코드")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("work-order-print.png"),
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });
    const row = (
      await pool.query("SELECT status,revision FROM work_orders WHERE id=$1", [
        id,
      ])
    ).rows[0];
    expect(row.status).toBe("ISSUED");
    expect(
      (
        await pool.query(
          "SELECT status FROM work_order_outputs WHERE work_order_id=$1",
          [id],
        )
      ).rows[0].status,
    ).toBe("SKIPPED");
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_logs WHERE target_id=$1 AND action='APPROVE_ASSESSMENT' AND is_self_approval",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
    await page.goto("/work-orders");
    await expect(
      page.getByRole("link", {
        name: "화면검증 작업 " + testInfo.project.name,
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /화면검증 작업/ }),
    ).toBeVisible();
    await page.goto(path);
    await page.getByRole("link", { name: "복사", exact: true }).click();
    await page.getByRole("button", { name: /일정·인원/ }).click();
    await expect(page.getByLabel("작업 시작일")).toHaveValue("");
    await expect(
      page.getByRole("checkbox", { name: "검증 작업자", exact: true }),
    ).toBeChecked();

    const workerContext = await browser.newContext({
      ...testInfo.project.use,
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      await workerContext.addCookies([await cookie(worker)]);
      const workerPage = await workerContext.newPage();
      await workerPage.goto(path + "?via=qr");
      await expect(
        workerPage.getByRole("heading", {
          name: "화면검증 작업 " + testInfo.project.name,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        workerPage.getByRole("button", { name: "지시서 취소", exact: true }),
      ).toHaveCount(0);
      await expect(
        workerPage.getByRole("link", { name: "편집", exact: true }),
      ).toHaveCount(0);
      await workerContext.addCookies([await cookie(outsider)]);
      await workerPage.goto(path);
      // 배정되지 않은 작업자는 not-found 를 본다 (work-order-service readOrder).
      // 루트 loading.tsx 때문에 응답이 먼저 스트리밍되어 상태코드는 200 으로 고정되므로,
      // 상태코드가 아니라 내용이 막혔는지를 확인한다.
      await expect(
        workerPage.getByRole("heading", {
          name: "아직 준비되지 않은 페이지예요.",
        }),
      ).toBeVisible();
      await expect(
        workerPage.getByText("화면검증 작업 " + testInfo.project.name),
      ).toHaveCount(0);
    } finally {
      await workerContext.close();
    }
    await page.goto(path);
    // 루트 loading.tsx 로 스트리밍되는 화면이라, 하이드레이션 전에 채우면 값이 지워진다.
    // 값이 남을 때까지 다시 채운다 (required 가 빈 값이면 제출 자체가 막힌다).
    const reason = page.getByLabel("취소 사유");
    await expect(async () => {
      await reason.fill("화면검증 종료");
      await expect(reason).toHaveValue("화면검증 종료", { timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await page
      .getByRole("button", { name: "지시서 취소", exact: true })
      .click();
    await expect(
      page.getByText("취소된 지시서입니다.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByAltText("이 작업지시를 여는 QR 코드")).toHaveCount(
      0,
    );
  } finally {
    await pool.end();
  }
});
