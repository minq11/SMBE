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

// ---------------------------------------------------------------------------
// 4. 알림이 갈 주소가 없는 채로 가입되지 않는다
// ---------------------------------------------------------------------------

/**
 * 카카오처럼 이메일을 넘기지 않는 provider 로 가입하면 users.email 이 비어 있다.
 * 그 사람이 '알림 받을 메일' 까지 비우면 알림 쿼리들이
 * COALESCE(contact_email, email) IS NOT NULL 로 걸러서 **아무 오류 없이**
 * 그 사람에게만 메일이 안 간다. 그래서 그 경우에만 필수로 받는다.
 */
test("로그인 계정에 메일이 없으면 회사 만들기에서 알림 메일을 받아 둔다", async ({
  page,
}) => {
  const pool = isolatedPool();
  try {
    // 회사 없이 사용자만 — 이메일 없는 계정 (카카오 미동의와 같은 상태).
    const userId = randomUUID();
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES ($1,'카카오 사용자')",
      [userId],
    );
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

    await page.goto("/onboarding/create-company");
    const email = page.getByLabel("알림 받을 메일", { exact: true });
    // "(선택)" 이 아니라 필수로 뜬다.
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute("required", "");
    await expect(email).toHaveValue("");

    // 화면의 required 를 우회해도 서버가 막는다.
    await page.locator("#name").fill("메일없는 회사");
    await page.locator("#business_type").fill("제조업");
    await page.selectOption("#initial_employee_size_band", "UNDER_5");
    await page.locator("#business_start_date").fill("2026-01-01");
    await page.locator("#expected_annual_revenue_manwon").fill("10000");
    await email.evaluate((el: HTMLInputElement) => el.removeAttribute("required"));
    await page.getByRole("button", { name: "회사 만들기" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("알림 받을 메일");
    await dialog.getByRole("button", { name: "확인" }).click();

    // 저장이 막혔다고 입력이 날아가면 안 된다. React 19 는 form action 이
    // 끝나면 폼을 초기화하는데, 이 폼의 칸은 비제어라 그대로 두면 안내와 함께
    // 빈 폼을 보게 된다 (onSubmit 에서 기본 제출을 막는 이유).
    await expect(page.locator("#name")).toHaveValue("메일없는 회사");
    await expect(page.locator("#business_type")).toHaveValue("제조업");
    await expect(page.locator("#business_start_date")).toHaveValue("2026-01-01");
    await expect(page.locator("#expected_annual_revenue_manwon")).toHaveValue(
      "10000",
    );

    // 회사는 만들어지지 않았다. desktop·mobile 두 프로젝트가 같은 스키마를
    // 쓰므로 이름이 아니라 이 사용자로 좁혀 본다.
    const blocked = await pool.query(
      "SELECT id FROM companies WHERE created_by = $1",
      [userId],
    );
    expect(blocked.rows.length).toBe(0);

    // 주소를 넣으면 통과하고, 그 주소가 저장된다.
    await email.fill("kakao.user@example.com");
    await page.getByRole("button", { name: "회사 만들기" }).click();
    await expect(page).toHaveURL(/\/$|\/company/);
    const saved = await pool.query(
      "SELECT contact_email FROM users WHERE id=$1",
      [userId],
    );
    expect(saved.rows[0].contact_email).toBe("kakao.user@example.com");
  } finally {
    await pool.end();
  }
});

test("로그인 계정에 메일이 있으면 알림 메일은 그대로 선택 입력", async ({
  page,
}) => {
  const pool = isolatedPool();
  try {
    const userId = randomUUID();
    const loginEmail = `google-${randomUUID()}@example.com`;
    await pool.query(
      "INSERT INTO users(id,display_name,email) VALUES ($1,'구글 사용자',$2)",
      [userId, loginEmail],
    );
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

    await page.goto("/onboarding/create-company");
    const email = page.getByLabel("알림 받을 메일 (선택)");
    await expect(email).toBeVisible();
    await expect(email).toHaveValue(loginEmail);
    await expect(email).not.toHaveAttribute("required", "");
  } finally {
    await pool.end();
  }
});
