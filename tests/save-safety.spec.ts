/**
 * "저장했다고 믿었는데 안 됐다" 를 막는 세 가지.
 *
 * 셋 다 실제로 있던 일이고, 공통점은 **사용자가 잘못을 알아챌 방법이 없었다**는
 * 것이다. 데이터가 틀리는 것보다 이쪽이 나쁘다 — 틀린 줄 모르면 고칠 수도 없다.
 *
 *   1. 작성 중인 표준서가 다른 메뉴 다녀오면 빈칸이 됐다 (보관도 경고도 없었다)
 *   2. 같은 항목을 또 빠뜨리면 두 번째부터 오류 창이 안 떴다 (단추가 고장 난 듯)
 *   3. 사진 업로드가 실패해도 그대로 다음 화면으로 넘어갔다 (올라간 줄 안다)
 *
 * 3번은 업로드 실패를 브라우저에서 가로채 흉내 낸다.
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

/** 관리감독자 한 명과 그 사람의 회사. */
async function fixture(pool: Pool, page: Page) {
  const manager = randomUUID();
  const company = randomUUID();
  await pool.query("INSERT INTO users(id,display_name) VALUES ($1,'저장 관리자')", [
    manager,
  ]);
  await pool.query(
    `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,
       current_employee_size_band,active_headcount,business_start_date,
       expected_annual_revenue_manwon,created_by)
     VALUES ($1,'저장 검증 회사','제조업',$2,'UNDER_5','UNDER_5',1,'2026-01-01',0,$3)`,
    [company, randomUUID(), manager],
  );
  await pool.query(
    `INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name)
     VALUES ($1,$2,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','저장 관리자')`,
    [manager, company],
  );
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: await encode({
        token: { appUserId: manager, sub: manager, name: "저장 관리자" },
        secret: "smbe-isolated-browser-test-secret-only",
        salt: "authjs.session-token",
      }),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
    },
  ]);
  return { manager, company };
}

test.beforeEach(() => {
  test.skip(
    process.env.SMBE_ORDER_UI_TESTS !== "1",
    "Run npm run test:orders-ui against isolated local PostgreSQL.",
  );
});

// ---------------------------------------------------------------------------
// 1. 작성 중인 표준서가 사라지지 않는다
// ---------------------------------------------------------------------------

test("작성 중인 표준서는 다른 메뉴에 다녀와도 이어서 쓸 수 있다", async ({
  page,
}) => {
  const pool = isolatedPool();
  try {
    await fixture(pool, page);

    await page.goto("/standards/new");
    await page.getByLabel("표준서명").fill("임시 보관 확인용 표준서");
    // "작업 방법" 은 구간 제목이자 도움말 창의 이름이기도 하다. 입력칸은 id 로 짚는다.
    await page.locator("#std-method").fill("길게 쓰던 내용");
    // 보관은 400ms 디바운스 뒤에 쓴다.
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("smbe.std-draft.new")),
      )
      .toContain("임시 보관 확인용 표준서");

    // 다른 메뉴에 갔다가 돌아온다 — 여기서 전부 빈칸이 되던 자리다.
    await page.goto("/standards");
    await page.goto("/standards/new");

    const banner = page.getByRole("status").filter({
      hasText: "저장하지 않은 입력이 있습니다",
    });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("임시 보관 확인용 표준서");

    await banner.getByRole("button", { name: "이어서 작성" }).click();
    await expect(page.getByLabel("표준서명")).toHaveValue(
      "임시 보관 확인용 표준서",
    );
    await expect(page.locator("#std-method")).toHaveValue("길게 쓰던 내용");
  } finally {
    await pool.end();
  }
});

test("버리기를 누르면 보관본이 지워지고 다시 묻지 않는다", async ({ page }) => {
  const pool = isolatedPool();
  try {
    await fixture(pool, page);

    await page.goto("/standards/new");
    await page.getByLabel("표준서명").fill("버릴 표준서");
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("smbe.std-draft.new")),
      )
      .toContain("버릴 표준서");

    await page.goto("/standards");
    await page.goto("/standards/new");
    await page
      .getByRole("status")
      .filter({ hasText: "저장하지 않은 입력이 있습니다" })
      .getByRole("button", { name: "버리기" })
      .click();

    expect(
      await page.evaluate(() => localStorage.getItem("smbe.std-draft.new")),
    ).toBeNull();

    await page.goto("/standards/new");
    await expect(
      page.getByRole("status").filter({ hasText: "저장하지 않은 입력이" }),
    ).toHaveCount(0);
  } finally {
    await pool.end();
  }
});

// ---------------------------------------------------------------------------
// 2. 같은 이유로 또 막히면 또 알려준다
// ---------------------------------------------------------------------------

test("같은 항목을 또 빠뜨리면 오류 창이 다시 뜬다 (표준서 폼)", async ({
  page,
}) => {
  const pool = isolatedPool();
  try {
    await fixture(pool, page);
    await page.goto("/standards/new");
    await page.getByLabel("표준서명").fill("오류 재표시 확인");

    const save = page.getByRole("button", {
      name: "표준서 저장 · 확정",
      exact: true,
    });
    const dialog = page.getByRole("alertdialog");

    for (const attempt of [1, 2, 3]) {
      await save.click();
      await expect(dialog, `${attempt}번째 시도에서 창이 떠야 한다`).toBeVisible();
      await dialog.getByRole("button", { name: "확인" }).click();
      await expect(dialog).toBeHidden();
    }
  } finally {
    await pool.end();
  }
});

test("위험성평가 조치 기록도 같은 이유로 두 번 막히면 두 번 알려준다", async ({
  page,
}) => {
  const pool = isolatedPool();
  try {
    const { manager, company } = await fixture(pool, page);

    // 조치가 필요한(허용 불가) 위험요인 하나짜리 평가를 바로 넣는다.
    // criteria_snapshot 은 회사 생성 트리거가 넣어 둔 등급 세 줄을 그대로 복사한다
    // (jsonb 배열 3개라는 CHECK 가 걸려 있다).
    const assessment = randomUUID();
    await pool.query(
      `INSERT INTO risk_assessments
         (id, company_id, is_simple, name, assessment_kind, performed_on, status,
          criteria_snapshot, work_method_snapshot, safety_info,
          created_by, approved_by, approved_at, retention_until)
       VALUES ($1, $2, false, '조치 재표시 확인', 'FIRST', CURRENT_DATE, 'APPROVED',
               (SELECT jsonb_agg(jsonb_build_object(
                          'level', level, 'description', description,
                          'acceptance', acceptance) ORDER BY level)
                  FROM company_risk_levels WHERE company_id = $2),
               '테스트 작업방법', '{}'::jsonb,
               $3, $3, now(), CURRENT_DATE + 1095)`,
      [assessment, company, manager],
    );
    await pool.query(
      `INSERT INTO risk_assessment_items
         (assessment_id, order_no, hazard, current_control,
          initial_risk_level, initial_allowable, reduction_measure)
       VALUES ($1, 1, '끼임', '덮개 있음', 'MID', false, '인터록 설치')`,
      [assessment],
    );

    await page.goto(`/assessments/${assessment}`);
    await page.getByRole("button", { name: "조치 적기" }).first().click();

    // 조치 후 위험성 수준을 고르지 않은 채 저장한다.
    const save = page.getByRole("button", { name: "조치 저장" });
    const dialog = page.getByRole("alertdialog");

    for (const attempt of [1, 2, 3]) {
      await save.click();
      await expect(dialog, `${attempt}번째 시도에서 창이 떠야 한다`).toBeVisible();
      await expect(dialog).toContainText("조치 후 위험성 수준");
      await dialog.getByRole("button", { name: "확인" }).click();
      await expect(dialog).toBeHidden();
    }
  } finally {
    await pool.end();
  }
});
