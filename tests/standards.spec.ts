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

    // 0) 회사 판단 기준을 등급별로 고친다. 이후 평가는 이 값을 들고 간다.
    await page.goto("/company/criteria");
    const mid = page.getByRole("group", { name: "중" });
    await mid.getByLabel("정의").fill("병원 치료가 필요한 부상");
    await mid
      .getByRole("radiogroup", { name: "허용 여부" })
      .getByLabel("허용 불가", { exact: true })
      .check();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("저장했습니다");
    await page.reload();
    await expect(
      page.getByRole("group", { name: "중" }).getByLabel("정의"),
    ).toHaveValue("병원 치료가 필요한 부상");

    // 1) 만들기. 이름만 쓰고 저장하면 오류가 위의 띠가 아니라 안내 창으로 뜬다.
    await page.goto("/standards/new");
    await page.getByLabel("표준서명").fill("프레스 금형 교체");
    await page
      .getByRole("button", { name: "표준서 저장 · 확정", exact: true })
      .click();
    const errorDialog = page.getByRole("alertdialog");
    await expect(errorDialog).toBeVisible();
    await expect(errorDialog).toContainText("작업 단계");
    await errorDialog.getByRole("button", { name: "확인" }).click();
    await expect(errorDialog).toBeHidden();
    // 구간 머리의 물음표 → 무엇·어떻게·왜 세 줄
    await page.getByRole("button", { name: "위험성평가 안내" }).click();
    await expect(page.locator("dialog.help-dialog[open]")).toContainText(
      "36조",
    );
    await page
      .locator("dialog.help-dialog[open]")
      .getByRole("button", { name: "확인" })
      .click();
    await page.getByLabel("작업방법 요약").fill("전원 차단 후 금형 분리");
    // 빈칸의 예시가 곧 안내다. 단계·체크리스트는 두 칸씩 미리 있다.
    await page
      .getByPlaceholder("예: 전원 차단 후 잠금장치 걸기")
      .fill("전원 차단");
    await page
      .getByPlaceholder("예: 보호구(장갑·보안경) 착용 확인")
      .fill("전원 차단 확인");
    await page.getByPlaceholder("예: 회전부 덮개 유지").fill("잠금장치 유지");
    await page.getByLabel("유해·위험요인", { exact: true }).fill("끼임");
    // 3단계 판단법 양식의 둘째 칸: 지금 하고 있는 것.
    await page
      .getByLabel("현재 안전조치", { exact: true })
      .fill("작업자 주의, 장갑 착용");
    // 수준 옆 물음표가 회사 판단 기준을 보여 준다.
    const levelHelp = page
      .getByRole("button", { name: "위험성 판단 기준 안내" })
      .first();
    // 물음표는 "위험성 수준" 글자에 붙어 있어야 한다 (헌법 1-6). 라벨에서 떼어
    // 카드 오른쪽 끝에 띄우면 무엇에 대한 물음인지 사라지고 좁은 화면에서 잘린다.
    {
      const help = (await levelHelp.boundingBox())!;
      const label = (await page
        .locator(".risk-card .seg-label")
        .first()
        .boundingBox())!;
      const card = (await page.locator(".risk-card").first().boundingBox())!;
      expect(help.x).toBeLessThan(label.x + label.width + 24);
      expect(help.x + help.width).toBeLessThanOrEqual(card.x + card.width);
    }
    await levelHelp.click();
    await expect(page.locator("dialog.help-dialog[open]")).toContainText(
      "회사가 정한 기준",
    );
    await expect(
      page.locator("dialog.help-dialog[open] .criteria-row").nth(1),
    ).toContainText("병원 치료가 필요한 부상허용 불가");
    await page
      .locator("dialog.help-dialog[open]")
      .getByRole("button", { name: "확인" })
      .click();
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
      .getByRole("button", { name: "표준서 저장 · 확정", exact: true })
      .click();
    await expect(page).toHaveURL(/\/standards\/[a-f0-9-]{36}$/);
    const id = new URL(page.url()).pathname.split("/")[2];
    await expect(page.locator("#main")).toContainText("프레스 금형 교체");
    await expect(page.locator("#main")).toContainText("전원 차단");
    await expect(page.locator("#main")).toContainText("끼임");
    await expect(page.locator("#main")).toContainText(
      "현재 조치: 작업자 주의, 장갑 착용",
    );
    // 상세의 판단 기준은 평가에 복사된 사본이다.
    await expect(page.locator("#main .criteria-list")).toContainText(
      "병원 치료가 필요한 부상",
    );

    // 2) 확정된 판은 못 고친다. 개정 시작 → 복사된 초안을 고쳐 → 확정 → 2판.
    await expect(page.locator("#main")).toContainText("1판");
    await page.getByRole("button", { name: "개정 시작", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(id + "/edit$"));
    await expect(page.getByRole("heading", { name: "2판 개정" })).toBeVisible();
    // 초안은 현재 판의 복사본이다.
    await expect(
      page.locator("#std-steps input[placeholder='1단계']"),
    ).toHaveValue("전원 차단");
    await page.getByLabel("표준서명").fill("프레스 금형 교체 (개정)");
    await page
      .locator("#std-steps input[placeholder='1단계']")
      .fill("전원 차단 후 잠금");
    await page.getByLabel("무엇을 왜 바꿨나요").fill("잠금장치 추가");
    // 초안 저장은 상세로 돌아오고, 현재 판은 아직 1판이다.
    await page.getByRole("button", { name: "초안 저장", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/standards/" + id + "$"));
    await expect(page.locator("#main")).toContainText("2판 개정 작성 중");
    await expect(page.locator("#main")).not.toContainText("전원 차단 후 잠금");
    // 이대로 확정 → 2판이 현재 판, 1판은 지난 판으로 남는다.
    await page
      .getByRole("button", { name: "이대로 확정", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "확정", exact: true })
      .click();
    await expect(page.locator("#main")).toContainText(
      "프레스 금형 교체 (개정)",
    );
    await expect(page.locator("#main")).toContainText("전원 차단 후 잠금");
    await expect(page.locator("#main")).toContainText("개정 이력 (2판)");
    await expect(page.locator("#main")).toContainText("잠금장치 추가");
    const current = await pool.query(
      `SELECT r.revision_no FROM standards s
         JOIN standard_revisions r ON r.id = s.current_revision_id WHERE s.id = $1`,
      [id],
    );
    expect(current.rows[0].revision_no).toBe(2);
    // 지난 판은 그대로 읽힌다.
    await page.goto(`/standards/${id}/revisions/1`);
    await expect(page.locator("#main")).toContainText("1판 · 지난 판");
    await expect(page.locator("#main")).toContainText("전원 차단");
    await expect(page.locator("#main")).not.toContainText("전원 차단 후 잠금");
    await page.goto(`/standards/${id}`);

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
    // 지난 회차의 현재 안전조치도 채워져 온다.
    await expect(page.getByLabel("현재 안전조치", { exact: true })).toHaveValue(
      "작업자 주의, 장갑 착용",
    );
    await page.getByRole("button", { name: "평가 저장", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/standards/" + id + "$"));
    await expect(page.locator("#main")).toContainText("회차 이력 (2건)");

    // 4) 경영책임자 반기 점검 (중처법 시행령 4조 3호): 숫자를 보고 서명한다.
    await page.goto("/assessments");
    const review = page.getByRole("region", { name: "경영책임자 반기 점검" });
    await expect(review).toContainText("아직 점검 전");
    await expect(review).toContainText("남은 조치");
    await review.getByRole("button", { name: "점검 확인 서명" }).click();
    await review.getByLabel("점검 의견 (선택)").fill("끼임 조치는 이달 안에");
    await review.getByRole("button", { name: "서명", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "서명", exact: true })
      .click();
    await expect(review).toContainText("점검 완료");
    await expect(review).toContainText("끼임 조치는 이달 안에");

    // 5) 실시규정: 기본 문안이 있고 고쳐 저장된다.
    await page.goto("/company/criteria");
    const policy = page.getByLabel("실시규정", { exact: true });
    await expect(policy).toHaveValue(/3단계 판단법/);
    await policy.fill("1. 목적: 테스트 규정");
    await page
      .getByRole("button", { name: "실시규정 저장", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "실시규정을 저장했습니다",
    );

    // 6) 지시서는 표준서를 고를 때 그 판을 보여 주고 초안에 들고 간다.
    await page.goto(`/work-orders/new?standard=${id}`);
    await expect(page.locator("#main")).toContainText(
      "프레스 금형 교체 (개정) 2판",
    );
    await page.screenshot({
      path: testInfo.outputPath("work-order-picker-revision.png"),
      fullPage: true,
    });

    // 7) 개정 초안이 있는 채로는 폐기되지 않는다 — 먼저 버리거나 확정하라고 안내.
    //    초안을 버린 뒤에야 폐기된다.
    await page.goto(`/standards/${id}`);
    await page.getByRole("button", { name: "개정 시작", exact: true }).click();
    await expect(page.getByRole("heading", { name: "3판 개정" })).toBeVisible();
    await page.goto(`/standards/${id}`);
    await expect(page.locator("#main")).toContainText("3판 개정 작성 중");
    await page.screenshot({
      path: testInfo.outputPath("standard-detail-draft.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "폐기", exact: true }).click();
    const blocked = page.getByRole("alertdialog");
    await expect(blocked).toContainText("폐기할 수 없습니다");
    await expect(blocked).toContainText("먼저 초안을 버리거나 확정한 뒤");
    await page.screenshot({
      path: testInfo.outputPath("standard-archive-blocked.png"),
      fullPage: true,
    });
    await blocked.getByRole("button").first().click();
    await expect(page.locator("#main")).toContainText("3판 개정 작성 중");
    await page.getByRole("button", { name: "버리기", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "버리기", exact: true })
      .click();
    await expect(page.locator("#main")).not.toContainText("3판 개정 작성 중");
    await page.getByRole("button", { name: "폐기", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "폐기", exact: true })
      .click();
    await expect(page.locator("#main")).toContainText("개정 이력 (2판)");
    const after = await pool.query(
      `SELECT s.status,
              (SELECT count(*)::int FROM standard_revisions
                WHERE standard_id = s.id AND status = 'DRAFT') AS drafts
         FROM standards s WHERE s.id = $1`,
      [id],
    );
    expect(after.rows[0].status).toBe("ARCHIVED");
    expect(after.rows[0].drafts).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath("standard-detail-archived.png"),
      fullPage: true,
    });
  } finally {
    await pool.end();
  }
});
