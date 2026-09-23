import { test, expect } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

/**
 * 표준서를 화면으로 만들고, 고치고, 평가 회차를 더한다. 세 폼이 서버 스키마와
 * 같은 모양을 보내는지 여기서 잡는다 — 만들기 폼이 스텝을 문자열로 보내다
 * 스키마가 객체로 바뀐 뒤 이틀 동안 깨져 있었다.
 */
test("standard: create, edit, add a seeded assessment round", async ({
  page,
  context,
}) => {
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
    company = randomUUID();
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES ($1,'표준 관리자'),($2,'표준 작업자')",
      [manager, worker],
    );
    await pool.query(
      `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,
      active_headcount,business_start_date,expected_annual_revenue_manwon,created_by)
      VALUES ($1,'표준서 검증 회사','제조업',$2,'UNDER_5','UNDER_5',2,'2026-01-01',0,$3)`,
      [company, randomUUID(), manager],
    );
    for (const [id, role, name] of [
      [manager, "MANAGER_SUPERVISOR", "표준 관리자"],
      [worker, "WORKER", "표준 작업자"],
    ]) {
      await pool.query(
        `INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name)
        VALUES ($1,$2,$3,'ACTIVE','DIRECT_JOIN',$4)`,
        [id, company, role, name],
      );
    }
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: await encode({
          token: { appUserId: manager, sub: manager, name: "표준 관리자" },
          secret: "smbe-isolated-browser-test-secret-only",
          salt: "authjs.session-token",
        }),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
      },
    ]);

    // 1) 만들기
    await page.goto("/standards/new");
    await page.getByLabel("표준서명").fill("프레스 금형 교체");
    await page.getByLabel("작업방법 요약").fill("전원 차단 후 금형 분리");
    await page
      .locator("#std-method-section input[placeholder='1단계']")
      .fill("전원 차단");
    const checks = page.locator("#std-checklist input[type=text]");
    await checks.nth(0).fill("전원 차단 확인");
    await checks.nth(1).fill("잠금장치 유지");
    await page.getByLabel("유해·위험요인", { exact: true }).fill("끼임");
    await page
      .getByRole("radiogroup", { name: "위험성 수준" })
      .getByLabel("중", { exact: true })
      .check();
    await page
      .getByRole("radiogroup", { name: "허용 가능 여부" })
      .getByLabel(/^허용 불가/)
      .check();
    await page.getByLabel("감소대책", { exact: true }).fill("방호덮개 설치");
    for (const label of ["설비", "물질", "주변 환경", "재해·아차사고 정보"])
      await page.getByLabel(label, { exact: true }).fill("확인함");
    await page
      .getByRole("checkbox", { name: "표준 작업자", exact: true })
      .check();
    await page
      .getByRole("button", { name: "표준서 저장 · 승인", exact: true })
      .click();
    await expect(page).toHaveURL(/\/standards\/[a-f0-9-]{36}$/);
    const id = new URL(page.url()).pathname.split("/")[2];
    await expect(page.locator("#main")).toContainText("프레스 금형 교체");
    await expect(page.locator("#main")).toContainText("전원 차단");
    await expect(page.locator("#main")).toContainText("끼임");

    // 2) 고치기 → 저장하면 상세로 돌아온다
    await page.getByRole("link", { name: "수정", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(id + "/edit$"));
    await page.getByLabel("표준서명").fill("프레스 금형 교체 (개정)");
    await page
      .getByRole("button", { name: "변경사항 저장", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp("/standards/" + id + "$"));
    await expect(page.locator("#main")).toContainText(
      "프레스 금형 교체 (개정)",
    );

    // 3) 평가 회차 추가 — 지난 회차 값이 채워져 있고, 저장하면 회차가 둘
    await page
      .getByRole("link", { name: "평가 회차 추가", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(id + "/assessments/new$"));
    await expect(page.getByLabel("유해·위험요인", { exact: true })).toHaveValue(
      "끼임",
    );
    await expect(
      page
        .getByRole("radiogroup", { name: "허용 가능 여부" })
        .getByLabel(/^허용 불가/),
    ).toBeChecked();
    await page
      .getByRole("checkbox", { name: "표준 작업자", exact: true })
      .check();
    await page.getByRole("button", { name: "평가 저장", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/standards/" + id + "$"));
    await expect(page.locator("#main")).toContainText("회차 이력 (2건)");
  } finally {
    await pool.end();
  }
});
