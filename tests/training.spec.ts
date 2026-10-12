import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";

/**
 * 안전보건교육 (산안법 29조). 사람별 현황이 인원·TBM·PTW 기록에서 채워지고,
 * 교육을 등록하면 명부가 되며, 교육일지 인쇄는 멤버십이다.
 */
test("training: needs from records, TBM credit, register, detail, delete, paid print", async ({
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
    company = randomUUID(),
    order = randomUUID();
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
      "INSERT INTO users(id,display_name) VALUES($1,'교육 관리자'),($2,'교육 작업자')",
      [manager, worker],
    );
    await pool.query(
      "INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by) VALUES($1,'교육 회사','제조업',$2,'FROM_5_TO_19','FROM_5_TO_19',7,'2026-01-01',0,$3)",
      [company, randomUUID(), manager],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$3,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','관리자'),($2,$3,'WORKER','ACTIVE','DIRECT_JOIN','작업자')",
      [manager, worker, company],
    );
    // PTW 작업에 배정된 작업자 — 특별교육 확인 대상. TBM 두 번 — 산입 대상.
    await pool.query(
      `INSERT INTO work_orders(id,company_id,name,ptw_required,status,draft_data,issued_at,created_by)
       VALUES ($1,$2,'고소 작업',true,'DRAFT','{}'::jsonb,now(),$3)`,
      [order, company, manager],
    );
    await pool.query(
      `INSERT INTO work_order_assignments(work_order_id,user_id,snapshot_display_name) VALUES ($1,$2,'작업자')`,
      [order, worker],
    );
    for (const day of [1, 2]) {
      const session = randomUUID();
      await pool.query(
        `INSERT INTO work_sessions(id,company_id,work_order_id,work_date,starts_at,ends_at,expected_assignees)
         VALUES ($1,$2,$3,(now() AT TIME ZONE 'Asia/Seoul')::date - $4::int,
                 now() - make_interval(days => $4::int),
                 now() - make_interval(days => $4::int) + interval '8 hours','[]'::jsonb)`,
        [session, company, order, day],
      );
      await pool.query(
        `INSERT INTO inspections(id,session_id,inspector_id,inspector_name,inspector_role,category,entry_path,confirmed,submitted_at,recorded_by,recorded_by_name)
         VALUES ($1,$2,$3,'작업자','WORKER','TBM','WEB',true,now() - make_interval(days => $4::int),$3,'작업자')`,
        [randomUUID(), session, worker, day],
      );
    }
    await login(manager);

    // 1) 현황: 둘 다 막 들어와 채용 시 교육 필요, 작업자는 특별교육 확인.
    await page.goto("/training");
    const tiles = page.locator(".asmt-tiles");
    await expect(tiles).toContainText("정기교육 부족");
    await expect(tiles.locator(".asmt-tile").first()).toContainText("2명");
    await expect(tiles).toContainText("2명채용 시 교육 필요");
    await expect(tiles).toContainText("1명특별교육 확인");
    const workerRow = page.locator(".training-table tr", {
      hasText: "교육 작업자",
    });
    await expect(workerRow).toContainText("0시간 / 12시간");
    await expect(workerRow).toContainText("확인");
    await page.screenshot({
      path: info.outputPath("training-empty.png"),
      fullPage: true,
    });

    // 2) TBM 산입을 켜면 작업자의 TBM 두 번이 정기교육 시간에 들어간다.
    await page.getByLabel("TBM 산입", { exact: true }).selectOption("15");
    await expect(page.getByRole("status")).toContainText("저장했습니다");
    await page.reload();
    await expect(workerRow).toContainText("0.5시간 / 12시간");
    await expect(workerRow).toContainText("TBM 2회 포함");

    // 3) 등록: 정기 4시간, 둘 다 참석. 저장하면 목록으로 돌아온다.
    await page.getByRole("link", { name: "교육 등록" }).click();
    await expect(page).toHaveURL(/\/training\/new$/);
    await page.getByLabel("시간", { exact: true }).fill("4");
    await page.getByLabel("교육 내용").fill("프레스 끼임 예방");
    await page.getByLabel("강사 (선택)").fill("김반장");
    // 참석자 없이 저장하면 어느 칸인지 말해 준다 (내용·시간은 브라우저가 먼저 막는다).
    await page.getByRole("button", { name: "교육 저장" }).click();
    const errorDialog = page.getByRole("alertdialog");
    await expect(errorDialog).toContainText("참석자를 한 명 이상 고르세요");
    await errorDialog.getByRole("button", { name: "확인" }).click();
    await page.getByRole("button", { name: /^인원 선택/ }).click();
    const picker = page.getByRole("dialog");
    await picker
      .getByRole("checkbox", { name: "교육 작업자", exact: true })
      .check();
    await picker
      .getByRole("checkbox", { name: "교육 관리자", exact: true })
      .check();
    await picker.getByRole("button", { name: "완료", exact: true }).click();
    await page.screenshot({
      path: info.outputPath("training-form.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "교육 저장" }).click();
    await expect(page).toHaveURL(/\/training$/);
    await expect(workerRow).toContainText("4.5시간 / 12시간");
    await expect(workerRow).toContainText("7.5시간 부족");
    const row = page.getByRole("link", { name: /프레스 끼임 예방/ });
    await expect(row).toContainText("정기 · 4시간 · 참석 2명 · 김반장");

    // 4) 채용 시 교육을 작업자만 — 작업자 줄은 이수, 관리자는 아직 필요.
    await page.goto("/training/new?kind=HIRE");
    await expect(page.getByRole("radio", { name: "채용 시" })).toBeChecked();
    await page.getByLabel("시간", { exact: true }).fill("8");
    await page.getByLabel("교육 내용").fill("입사 안전교육");
    await page.getByRole("button", { name: /^인원 선택/ }).click();
    await picker
      .getByRole("checkbox", { name: "교육 작업자", exact: true })
      .check();
    await picker.getByRole("button", { name: "완료", exact: true }).click();
    await page.getByRole("button", { name: "교육 저장" }).click();
    await expect(page).toHaveURL(/\/training$/);
    await expect(tiles).toContainText("1명채용 시 교육 필요");
    await expect(workerRow).toContainText("이수");
    await page.screenshot({
      path: info.outputPath("training-list.png"),
      fullPage: true,
    });

    // 5) 상세·인쇄(멤버십)·삭제.
    await row.click();
    await expect(page).toHaveURL(/\/training\/[0-9a-f-]{36}$/);
    const id = new URL(page.url()).pathname.split("/")[2];
    await expect(page.getByRole("region", { name: "참석자" })).toContainText(
      "참석자 2명",
    );
    await page.getByRole("button", { name: "교육일지 인쇄" }).click();
    await expect(
      page.getByText("교육일지 인쇄는 멤버십에 가입된 회사만", {
        exact: false,
      }),
    ).toBeVisible();
    await page.goto(`/training/${id}/print`);
    await expect(page).toHaveURL(new RegExp(`/training/${id}$`));
    await pool.query(
      "UPDATE companies SET pro_state='PRO_VOLUNTARY', plan='BASIC', plan_started_at=now() WHERE id=$1",
      [company],
    );
    await page.reload();
    await page.getByRole("link", { name: "교육일지 인쇄" }).click();
    await expect(page.locator(".training-sign-table").last()).toContainText(
      "교육 작업자",
    );
    await page.emulateMedia({ media: "print" });
    await page.screenshot({
      path: info.outputPath("training-print.png"),
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });
    await page.goto(`/training/${id}`);
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await expect(page).toHaveURL(/\/training$/);
    await expect(
      page.getByRole("link", { name: /프레스 끼임 예방/ }),
    ).toHaveCount(0);
    await expect(workerRow).toContainText("0.5시간 / 12시간");

    // 6) 반기 점검 5조 줄에 교육 숫자가 들어온다. 작업자는 교육 메뉴에 못 들어온다.
    await page.goto("/company/half-year-check");
    await expect(page.locator(".hyc-document")).toContainText("이 반기 교육");
    await expect(page.locator(".hyc-document")).toContainText(
      "채용 시 교육 필요",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await login(worker);
    await page.goto("/training");
    await expect(page).toHaveURL(/\/work-orders$/);
  } finally {
    await pool.query("DELETE FROM training_sessions WHERE company_id=$1", [
      company,
    ]);
    await pool.query("DELETE FROM audit_logs WHERE company_id=$1", [company]);
    await pool.query(
      "DELETE FROM inspections WHERE session_id IN (SELECT id FROM work_sessions WHERE company_id=$1)",
      [company],
    );
    await pool.query("DELETE FROM work_sessions WHERE company_id=$1", [
      company,
    ]);
    await pool.query(
      "DELETE FROM work_order_assignments WHERE work_order_id=$1",
      [order],
    );
    await pool.query("DELETE FROM work_orders WHERE company_id=$1", [company]);
    await pool.query(
      "DELETE FROM company_half_year_checks WHERE company_id=$1",
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
