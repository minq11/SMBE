/**
 * 회사 정보 화면(/company). 사이드바 맨 위 회사 카드가 연다.
 *
 * 관리감독자: 기본 정보·회사코드·인원(접힘)·요금제가 한 장에, 수정하면 저장 뒤 이 화면으로.
 * 안전관리자: 보기만. 작업자: 기본 정보만.
 */
import { test, expect, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

function isolatedPool() {
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
  if (!/^orders_ui_[a-f0-9]{32}$/.test(schema))
    throw new Error("Invalid isolated test schema");
  return new Pool({
    connectionString:
      "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
    options: "-c search_path=" + schema + ",public",
  });
}

async function loginAs(page: Page, userId: string) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: await encode({
        token: { appUserId: userId, sub: userId },
        secret: "smbe-isolated-browser-test-secret-only",
        salt: "authjs.session-token",
      }),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
    },
  ]);
}

const code = () =>
  "C" + randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase();

async function companyWith(pool: Pool) {
  const ids = {
    supervisor: randomUUID(),
    safety: randomUUID(),
    worker: randomUUID(),
    company: randomUUID(),
  };
  await pool.query(
    `INSERT INTO users(id,display_name) VALUES ($1,'김감독'),($2,'이안전'),($3,'박작업')`,
    [ids.supervisor, ids.safety, ids.worker],
  );
  await pool.query(
    `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,
       current_employee_size_band,active_headcount,business_start_date,
       expected_annual_revenue_manwon,created_by)
     VALUES ($1,'심플제조','제조업',$2,'UNDER_5','UNDER_5',3,'2026-01-01',125000,$3)`,
    [ids.company, code(), ids.supervisor],
  );
  for (const [id, role, name] of [
    [ids.supervisor, "MANAGER_SUPERVISOR", "김감독"],
    [ids.safety, "MANAGER_SAFETY", "이안전"],
    [ids.worker, "WORKER", "박작업"],
  ])
    await pool.query(
      `INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name)
       VALUES ($1,$2,$3,'ACTIVE','DIRECT_JOIN',$4)`,
      [id, ids.company, role, name],
    );
  return ids;
}

test.beforeEach(() => {
  test.skip(
    process.env.SMBE_ORDER_UI_TESTS !== "1",
    "Run npm run test:orders-ui against isolated local PostgreSQL.",
  );
});

test("관리감독자: 회사 카드 → 회사 정보, 인원 접힘·인원관리·요금 안내, 수정하면 돌아온다", async ({
  page,
}, testInfo) => {
  const pool = isolatedPool();
  try {
    const ids = await companyWith(pool);
    await loginAs(page, ids.supervisor);

    await page.goto("/company/members");
    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await page.locator("a.workspace-picker").first().click();
    await expect(page).toHaveURL(/\/company$/);
    await expect(page.getByRole("heading", { name: "회사 정보" })).toBeVisible();

    const facts = page.locator(".wo-facts").first();
    await expect(facts).toContainText("심플제조");
    await expect(facts).toContainText("12억 5,000만 원");
    await expect(facts.locator(".company-code")).toBeVisible();

    // 인원은 접혀 있다가 펴면 이름과 역할이 보인다.
    const fold = page.locator("details.std-fold");
    await expect(fold.locator("summary")).toContainText("구성원 3명");
    await expect(fold.getByText("박작업")).toBeHidden();
    await fold.locator("summary").click();
    await expect(fold.getByText("박작업")).toBeVisible();
    await expect(page.getByRole("link", { name: "인원관리" })).toHaveAttribute(
      "href",
      "/company/members",
    );
    await expect(page.getByRole("link", { name: "요금 안내" })).toHaveAttribute(
      "href",
      "/billing",
    );
    await page.screenshot({ path: testInfo.outputPath("company.png"), fullPage: true });

    // 수정 → 저장 → 회사 정보로 돌아온다. 소문자 코드는 대문자로.
    await page.getByRole("link", { name: "수정" }).click();
    await expect(page).toHaveURL(/\/company\/edit$/);
    const newCode = code().toLowerCase();
    await page.locator("#name").fill("심플정밀");
    await page.locator("#expected_annual_revenue_manwon").fill("80000");
    await page.locator("#company_code").fill(newCode);
    await page.screenshot({ path: testInfo.outputPath("company-edit.png"), fullPage: true });
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page).toHaveURL(/\/company\?saved=1$/);
    await expect(page.getByRole("status").filter({ hasText: "저장했습니다" })).toBeVisible();
    await expect(page.locator(".wo-facts").first()).toContainText("심플정밀");
    await expect(page.locator(".wo-facts").first()).toContainText("8억 원");
    await expect(page.locator(".company-code")).toHaveText(newCode.toUpperCase());

    // 다른 회사가 쓰는 코드로 바꾸면 막히고, 고친 값은 그대로 남는다.
    const other = code();
    await pool.query(
      `INSERT INTO companies(name,business_type,company_code,initial_employee_size_band,
         active_headcount,business_start_date,expected_annual_revenue_manwon,created_by)
       VALUES ('남의 회사','제조업',$1,'UNDER_5',0,'2026-01-01',0,$2)`,
      [other, ids.supervisor],
    );
    await page.goto("/company/edit");
    await page.locator("#business_type").fill("정밀가공");
    await page.locator("#company_code").fill(other);
    await page.getByRole("button", { name: "저장" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("이미 다른 회사가 쓰는 회사코드");
    await dialog.getByRole("button", { name: "확인" }).click();
    await expect(page.locator("#business_type")).toHaveValue("정밀가공");
    await expect(page.locator("#company_code")).toHaveValue(other);
  } finally {
    await pool.end();
  }
});

test("안전관리자는 보기만, 작업자는 기본 정보만", async ({ page }) => {
  const pool = isolatedPool();
  try {
    const ids = await companyWith(pool);

    await loginAs(page, ids.safety);
    await page.goto("/company");
    await expect(page.getByRole("link", { name: "수정" })).toHaveCount(0);
    await expect(page.getByText("회사 정보는 관리감독자가 고칩니다.")).toBeVisible();
    await expect(page.locator(".company-code")).toBeVisible();
    await page.goto("/company/edit");
    await expect(page).toHaveURL(/\/company$/);

    await loginAs(page, ids.worker);
    await page.goto("/company");
    await expect(page.locator(".wo-facts").first()).toContainText("심플제조");
    await expect(page.locator(".company-code")).toHaveCount(0);
    await expect(page.locator("details.std-fold")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "요금 안내" })).toHaveCount(0);
  } finally {
    await pool.end();
  }
});
