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
    // 한 장 폼이다: 구간 칩으로 내려가고, 뒤 구간이 숨지 않는다.
    await page
      .locator(".jump-nav")
      .getByRole("link", { name: "위험성평가", exact: true })
      .click();
    // 판단 기준은 회사가 정한 값이 자동으로 적용된다. 폼에 펼치지 않고 수준 옆
    // 물음표가 보여 준다 (risk-level-picker.tsx).
    await expect(
      page
        .locator("#wo-risk")
        .getByRole("button", { name: "위험성 판단 기준 안내" })
        .first(),
    ).toBeVisible();
    await page
      .getByLabel("유해·위험요인", { exact: true })
      .fill("테스트 위험요인");
    await page.getByLabel("현재 안전조치", { exact: true }).fill("없음");
    await page
      .getByRole("radiogroup", { name: "위험성 수준" })
      .getByLabel("하", { exact: true })
      .check();
    // 하는 기본 기준에서 허용 가능 — 고르지 않아도 판정이 붙는다.
    await expect(page.locator("#wo-risk .risk-verdict").first()).toContainText(
      "하 → 허용 가능",
    );
    await page.getByLabel("감소대책", { exact: true }).fill("테스트 감소대책");
    for (const label of [
      "기계·기구·설비 사양",
      "취급 유해물질·MSDS 정보",
      "공정·작업 주변 환경",
      "과거 재해·아차사고 이력",
    ]) {
      await page.getByLabel(label, { exact: true }).fill("테스트 정보");
    }
    // 같은 이름의 사람이 평가 참여자와 작업자 배정 두 곳에 있다. 구간으로 가른다.
    await page
      .locator("#wo-risk")
      .getByRole("checkbox", { name: "검증 작업자", exact: true })
      .check();
    const tomorrow = seoulToday(new Date(Date.now() + 86400_000));
    // 회차는 팝업에서 기간을 적어 만들고, 화면에서 하나씩 고치고 지우고 더한다.
    await page.getByRole("button", { name: "작업 회차 만들기" }).click();
    const rangeDialog = page.getByRole("dialog");
    await rangeDialog.getByLabel("시작일").fill(tomorrow);
    await rangeDialog.getByLabel("마감일").fill(tomorrow);
    await expect(rangeDialog.getByRole("status")).toContainText("1회차");
    await page.screenshot({
      path: testInfo.outputPath("session-dialog.png"),
    });
    await rangeDialog.getByRole("button", { name: "회차 만들기" }).click();
    await expect(page.locator(".wo-session-row")).toHaveCount(1);
    await page.getByRole("button", { name: "회차 추가", exact: true }).click();
    await expect(page.locator(".wo-session-row")).toHaveCount(2);
    await page
      .locator(".wo-sessions")
      .screenshot({ path: testInfo.outputPath("session-list.png") });
    await page.getByRole("button", { name: "회차 2 삭제" }).click();
    await expect(page.locator(".wo-session-row")).toHaveCount(1);
    await expect(page.getByLabel("회차 1 날짜")).toHaveValue(tomorrow);
    // 요일 힌트는 날짜 글자 그대로 (시간대로 하루가 밀리지 않는다).
    const [, mm, dd] = tomorrow.split("-");
    await expect(page.locator(".wo-session-hint").first()).toContainText(
      `${Number(mm)}/${Number(dd)} (`,
    );
    await page.getByLabel("장소", { exact: true }).fill("테스트 구역");
    // 작업자 배정은 팝업에서 고른다. 고른 사람은 칩으로 남는다.
    await page
      .locator("#wo-schedule")
      .getByRole("button", { name: /^작업자 선택/ })
      .click();
    // 구성원 초대는 이 창 안에 있다 (새 탭). 폼에는 따로 없다.
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "구성원 초대" }),
    ).toHaveAttribute("href", "/company/members");
    await expect(page.getByText("새 구성원이 합류하면")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("assignee-dialog.png") });
    await page
      .getByRole("dialog")
      .getByRole("checkbox", { name: "검증 작업자", exact: true })
      .check();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "완료", exact: true })
      .click();
    await expect(
      page
        .locator("#wo-schedule")
        .getByRole("button", { name: "검증 작업자 빼기" }),
    ).toBeVisible();
    await page
      .getByLabel("TBM · 작업 전 항목 1", { exact: true })
      .fill("테스트 TBM");
    await page
      .getByLabel("작업 중 항목 1", { exact: true })
      .fill("테스트 점검");
    await page.getByRole("button", { name: "임시저장", exact: true }).click();
    // 임시저장은 계속 작성할 수 있도록 편집 화면에 머문다 (actions.ts saveDraftAction).
    await expect(page).toHaveURL(/\/work-orders\/[a-f0-9-]{36}\/edit$/);
    // 저장 뒤 편집 화면: 검토·이력은 접혀 있고 임시저장·발급 띠가 맨 아래에 있다.
    await page
      .getByRole("button", { name: "지금 발급하기", exact: true })
      .waitFor();
    await expect(page.locator(".wo-review-fold")).toHaveCount(1);
    await expect(page.locator(".wo-review-fold[open]")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("work-order-edit.png"),
      fullPage: true,
    });
    const id = new URL(page.url()).pathname.split("/")[2];
    const path = "/work-orders/" + id;
    // 작성 중인 지시서는 조회가 아니라 편집으로 열린다 ([id]/page.tsx redirect).
    // 초안에는 삭제 버튼이 있고 취소가 없다. 발급 뒤에는 반대가 된다.
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(id + "/edit$"));
    await expect(
      page.getByRole("button", { name: /초안 .* 삭제/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "지시서 취소", exact: true }),
    ).toHaveCount(0);
    // 저장 → 본인 평가 승인 → 발급 → 링크 전송을 한 번에 처리한다.
    // 확인은 브라우저 confirm 이 아니라 앱 안의 확인 창이다 (confirm-dialog.tsx).
    await page
      .getByRole("button", { name: "지금 발급하기", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "발급", exact: true })
      .click();
    // 발급 직후에는 할 일(QR·링크 전달)이 있는 구간으로 바로 간다.
    await expect(page).toHaveURL(new RegExp(id + "#qr$"));
    await expect(
      page.getByRole("heading", { name: "작업지시 QR", exact: true }),
    ).toBeVisible();
    await expect(page.getByAltText("이 작업지시를 여는 QR 코드")).toBeVisible();
    // 발급 직후 ← 는 방금 지나온 작성 폼이 아니라 목록이다 (parent-path.ts).
    // 루트 loading.tsx 로 스트리밍되는 화면이라 하이드레이션 전 클릭은 삼켜진다.
    await expect(async () => {
      await page.getByRole("button", { name: "뒤로 가기" }).first().click();
      await expect(page).toHaveURL(/\/work-orders$/, { timeout: 3000 });
    }).toPass({ timeout: 20000 });
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "작업지시 QR", exact: true }),
    ).toBeVisible();
    // 복사하는 주소에는 들어온 길(via=link)이 붙는다. 그 길로 열면 "보는" 화면이다.
    await expect(page.getByLabel("작업 링크", { exact: true })).toHaveValue(
      /\?via=link$/,
    );
    // 무료 회사: 출력 버튼은 보이지만 눌러도 안내만 뜨고 출력물이 만들어지지 않는다.
    // 루트 loading.tsx 로 스트리밍되는 화면이라 하이드레이션 전 클릭은 삼켜진다.
    const notice = page.getByRole("alert").filter({
      hasText: "지시서 출력물은 유료 요금제에서",
    });
    await expect(async () => {
      await page
        .getByRole("button", { name: "지시서 인쇄 / PDF 저장", exact: true })
        .click();
      await expect(notice).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await expect(page.locator(".wo-sheet")).toHaveCount(0);
    // 발급된 지시서는 탭이 아니라 한 장이다. 작업 정보·위험성평가·회차가 QR 과
    // 같은 화면에 있고, 위의 구간 칩은 내려가기만 한다.
    for (const name of ["작업 정보", "위험성평가", "일정·인원", "체크리스트"])
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    await expect(page.locator("#info dl.wo-facts")).toContainText("작업방법");
    // 위험성평가·일정·인원·체크리스트는 접혀 있다. 머리의 요약이 안을 말한다.
    await expect(page.locator("#schedule > summary")).toContainText("1회차");
    await expect(page.locator(".wo-session-list li").first()).toBeHidden();
    await page.locator("#schedule > summary").click();
    await expect(page.locator(".wo-session-list li").first()).toBeVisible();
    // 발급된 지시서는 고칠 수 없고(편집 화면은 조회로 되돌려 보낸다), 지울 수도
    // 없다. 수단은 취소뿐이다.
    await page.goto(path + "/edit");
    await expect(page).toHaveURL(new RegExp(id + "$"));
    await expect(
      page.getByRole("button", { name: /초안 .* 삭제/ }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByText("오늘 회차", { exact: false })).toBeVisible();
    // QR·링크로 들어오면 관리자라도 지시서를 "보는" 것이다. 복사·취소·QR·전달 상태는 없다.
    await page.goto(path + "?via=qr");
    await expect(page.getByText("오늘 회차", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "복사 후 재발행", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "지시서 취소", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "작업지시 QR", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "작업 정보", exact: true }),
    ).toBeVisible();
    await page.goto(path);
    await expect(page.getByText("오늘 회차", { exact: false })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("work-order-issued.png"),
      fullPage: true,
    });
    // 유료로 바꾸면 현장 게시용 A4 한 장이 생긴다. 인쇄물은 화면 문서 전체가
    // 아니라 이 한 장이며, 어느 탭을 보고 있든 같은 것이 나간다.
    await pool.query(
      "UPDATE companies SET pro_state='PRO_VOLUNTARY',plan='BASIC',plan_started_at=now() WHERE id=$1",
      [company],
    );
    await page.reload();
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    const sheet = page.locator(".wo-sheet");
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByAltText("이 작업지시를 여는 QR 코드"),
    ).toBeVisible();
    await expect(sheet.getByText("테스트 TBM", { exact: true })).toBeVisible();
    await expect(sheet.getByText("테스트 점검", { exact: true })).toBeVisible();
    await expect(page.locator(".wo-print")).toBeHidden();
    await expect(page.locator(".sidebar")).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath("work-order-print.png"),
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });
    // 이후 흐름은 무료 회사 기준을 그대로 쓴다.
    await pool.query(
      "UPDATE companies SET pro_state='FREE',plan=NULL,plan_started_at=NULL WHERE id=$1",
      [company],
    );
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
    // 좁은 화면에서 목록은 가로 스크롤이 아니라 카드로 접힌다.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("work-order-list.png"),
      fullPage: true,
    });
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /화면검증 작업/ }),
    ).toBeVisible();
    // 새 작업지시 화면에서 이전 지시서를 골라도 같은 복사다 (?copy=).
    await page.goto("/work-orders/new");
    const pastDialog = page.getByRole("dialog");
    await expect(async () => {
      await page
        .getByRole("button", { name: "이전 지시서 불러오기", exact: true })
        .click();
      await expect(pastDialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await page.screenshot({ path: testInfo.outputPath("past-orders.png") });
    await pastDialog.getByRole("link", { name: /화면검증 작업/ }).click();
    await expect(page).toHaveURL(new RegExp("/work-orders/new\\?copy=" + id));
    await page.goto(path);
    await page
      .getByRole("link", { name: "복사 후 재발행", exact: true })
      .click();
    await page
      .locator(".jump-nav")
      .getByRole("link", { name: "일정·인원·장소", exact: true })
      .click();
    await expect(page.locator(".wo-session-row")).toHaveCount(0);
    await expect(
      page
        .locator("#wo-schedule")
        .getByRole("button", { name: "검증 작업자 빼기" }),
    ).toBeVisible();

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
    // 취소는 머리의 단추 하나. 누르면 창이 열리고 사유를 적어 확인한다.
    // 루트 loading.tsx 로 스트리밍되는 화면이라 하이드레이션 전 클릭은 삼켜진다.
    const cancelDialog = page.getByRole("dialog");
    await expect(async () => {
      await page
        .getByRole("button", { name: "지시서 취소", exact: true })
        .click();
      await expect(cancelDialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await cancelDialog.getByLabel("취소 사유").fill("화면검증 종료");
    await page.screenshot({ path: testInfo.outputPath("cancel-dialog.png") });
    await cancelDialog
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
