import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";
import { seoulToday } from "../src/features/work-orders/model";
import { halfOf, periodLabel } from "../src/features/half-year-check/model";

/**
 * 경영책임자 반기 점검 (중처법 시행령 4조 2·4·7·8호, 5조). 숫자는 우리 기록에서
 * 채워지고, 대표자는 몇 줄 적고 확정한다. 확정하면 못 고치고 인쇄는 멤버십.
 */
test("half-year check: auto-filled facts, draft, confirm, immutable, paid print", async ({
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
  const { year, half } = halfOf(seoulToday());
  const label = periodLabel(year, half);
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
      "INSERT INTO users(id,display_name) VALUES($1,'점검 관리자'),($2,'점검 작업자')",
      [manager, worker],
    );
    await pool.query(
      "INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by) VALUES($1,'반기 점검 회사','제조업',$2,'FROM_5_TO_19','FROM_5_TO_19',7,'2026-01-01',0,$3)",
      [company, randomUUID(), manager],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name,duty_note) VALUES($1,$3,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','관리자','안전보건관리담당자 (2026-01-05 선임)'),($2,$3,'WORKER','ACTIVE','DIRECT_JOIN','작업자','')",
      [manager, worker, company],
    );
    // 이 반기의 아차사고 신고 하나 — 7호 숫자에 잡힌다.
    await pool.query(
      `INSERT INTO incidents(company_id,kind,occurred_at,location,occurrence_type,description,grade,reported_by,reported_via,updated_by,retention_until)
       VALUES ($1,'NEAR_MISS', now(), '프레스실', 'CAUGHT', '손 끼일 뻔', 'NEAR_MISS', $2, 'WORKER', $2, (now() + interval '3 years')::date)`,
      [company, worker],
    );
    await login(manager);

    // 1) 보기: 아직 기록이 없어도 지금 숫자로 채운 문서가 보인다.
    await page.goto("/company/half-year-check");
    const doc = page.locator(".hyc-document");
    await expect(doc).toContainText(label);
    await expect(doc).toContainText("작성 중");
    await expect(doc).toContainText("아차사고 신고");
    await expect(doc).toContainText("안전보건관리담당자 (2026-01-05 선임)");
    await expect(doc).toContainText("아직 확정하지 않았습니다");
    await page.screenshot({ path: info.outputPath("check-empty.png") });

    // 2) 작성: 줄마다 한 줄, 관리감독자 평가, 점검함. 임시저장은 대표자명 없이 된다.
    await page.getByRole("link", { name: "점검 작성" }).click();
    await expect(page).toHaveURL(
      /half-year-check\/edit\?year=\d{4}&half=[12]$/,
    );
    await expect(page.locator(".hyc-facts").first()).toContainText("남은 조치");
    await page.getByLabel("남은 조치 계획").fill("끼임 대책은 다음 달까지");
    await page
      .getByRole("radiogroup", { name: "점검 관리자 평가" })
      .getByLabel("충실", { exact: true })
      .check();
    await page.getByLabel("절차와 비상연락처를 읽고 점검함").check();
    await page.getByLabel("의견에 대한 조치").fill("프레스 안전블록 추가");
    await page.screenshot({
      path: info.outputPath("check-form.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "임시저장", exact: true }).click();
    await expect(page).toHaveURL(/half-year-check\?year=\d{4}&half=[12]$/);
    await expect(doc).toContainText("끼임 대책은 다음 달까지");
    await expect(doc).toContainText("충실");
    await expect(doc).toContainText("절차와 연락처를 점검함");
    await expect(page.getByRole("link", { name: "이어서 작성" })).toBeVisible();

    // 3) 확정: 대표자명이 있어야 한다. 확정하면 문서가 잠기고 편집 주소는 보기로 돌아온다.
    await page.getByRole("link", { name: "이어서 작성" }).click();
    await expect(page.getByLabel("남은 조치 계획")).toHaveValue(
      "끼임 대책은 다음 달까지",
    );
    await page.getByRole("button", { name: "확정", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "확정", exact: true })
      .click();
    const errorDialog = page.getByRole("alertdialog");
    await expect(errorDialog).toContainText("대표자명을 입력하세요");
    await errorDialog.getByRole("button", { name: "확인" }).click();
    await page.getByLabel("대표자명").fill("홍대표");
    await page.getByRole("button", { name: "확정", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "확정", exact: true })
      .click();
    await expect(page).toHaveURL(/half-year-check\?year=\d{4}&half=[12]$/);
    await expect(doc).toContainText("확정");
    await expect(doc).toContainText("대표자 홍대표");
    await expect(doc).toContainText(`확인일 ${seoulToday()}`);
    await expect(page.getByRole("link", { name: "이어서 작성" })).toHaveCount(
      0,
    );
    await page.screenshot({
      path: info.outputPath("check-confirmed.png"),
      fullPage: true,
    });
    await page.goto(`/company/half-year-check/edit?year=${year}&half=${half}`);
    await expect(page).toHaveURL(/half-year-check\?year=\d{4}&half=[12]$/);
    const row = (
      await pool.query(
        "SELECT status, facts->'opinions'->>'near_misses' AS near, notes->>'hazard' AS hazard FROM company_half_year_checks WHERE company_id=$1",
        [company],
      )
    ).rows[0];
    expect(row).toEqual({
      status: "CONFIRMED",
      near: "1",
      hazard: "끼임 대책은 다음 달까지",
    });

    // 4) 인쇄는 멤버십. 무료는 토스트, 주소로 가도 돌아온다.
    await page.getByRole("button", { name: "인쇄" }).click();
    await expect(
      page.getByText("반기 점검 인쇄는 멤버십에 가입된 회사만", {
        exact: false,
      }),
    ).toBeVisible();
    await page.goto(`/company/half-year-check/print?year=${year}&half=${half}`);
    await expect(page).toHaveURL(/half-year-check\?year=\d{4}&half=[12]$/);
    await pool.query(
      "UPDATE companies SET pro_state='PRO_VOLUNTARY', plan='BASIC', plan_started_at=now() WHERE id=$1",
      [company],
    );
    await page.reload();
    await page.getByRole("link", { name: "인쇄" }).click();
    await expect(
      page.getByRole("button", { name: "인쇄 / PDF 저장" }),
    ).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".topbar")).toBeHidden();
    await page.screenshot({
      path: info.outputPath("check-print.png"),
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });

    // 5) 반기를 고르면 바로 간다. 지난 반기는 빈 초안으로 열린다.
    await page.goto(`/company/half-year-check?year=${year}&half=${half}`);
    const prev = half === 1 ? `${year - 1}-2` : `${year}-1`;
    await page.getByLabel("반기", { exact: true }).selectOption(prev);
    await expect(page).toHaveURL(
      new RegExp(
        `half-year-check\\?year=${prev.split("-")[0]}&half=${prev.split("-")[1]}$`,
      ),
    );
    await expect(doc).toContainText("아직 확정하지 않았습니다");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    // 6) 위험성평가 화면의 카드는 반기 점검으로 보낸다. 작업자는 못 들어온다.
    await page.goto("/assessments");
    const card = page.getByRole("region", { name: "경영책임자 반기 점검" });
    await card.getByRole("link", { name: "반기 점검 열기" }).click();
    await expect(page).toHaveURL(/\/company\/half-year-check/);
    await login(worker);
    await page.goto("/company/half-year-check");
    await expect(page).toHaveURL(/\/work-orders$/);
  } finally {
    await pool.query(
      "DELETE FROM company_half_year_checks WHERE company_id=$1",
      [company],
    );
    await pool.query("DELETE FROM audit_logs WHERE company_id=$1", [company]);
    await pool.query("DELETE FROM incidents WHERE company_id=$1", [company]);
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
