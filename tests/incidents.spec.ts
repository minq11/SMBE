import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";

test("incidents: manager registers an injury, duties appear with deadlines, closing needs every duty done", async ({
  page,
  context,
}) => {
  test.skip(process.env.SMBE_ORDER_UI_TESTS !== "1");
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
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
      "INSERT INTO users(id,display_name) VALUES($1,'사고 관리자'),($2,'다친 작업자')",
      [manager, worker],
    );
    // 5인 이상 — 중처법 적용 회사라 경영책임자 확인 할 일이 생긴다.
    await pool.query(
      `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by)
      VALUES($1,'사고 회사','제조업',$2,'FROM_5_TO_19','FROM_5_TO_19',8,'2026-01-01',0,$3)`,
      [company, randomUUID(), manager],
    );
    await pool.query(
      `INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name)
       VALUES($1,$3,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','관리자'),($2,$3,'WORKER','ACTIVE','DIRECT_JOIN','작업자')`,
      [manager, worker, company],
    );
    await pool.query(
      "INSERT INTO work_locations(company_id,name,depth,path_cache) VALUES($1,'2공장 프레스실',1,'2공장 프레스실')",
      [company],
    );
    const cookieFor = async (id: string) => ({
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
    });

    // 작업자가 먼저 신고한다 — 세 칸. 홈의 단추가 신고 화면으로 간다.
    await context.addCookies([await cookieFor(worker)]);
    await page.goto("/");
    await page.getByRole("link", { name: /아차사고·사고 신고/ }).click();
    await expect(page).toHaveURL(/\/incidents\/report$/);
    await page.getByRole("radio", { name: "다칠 뻔했다" }).check();
    await page.getByLabel("무슨 일", { exact: true }).fill("지게차가 후진하다 나를 못 봤다");
    await page.getByLabel("어디").fill("출하장 앞");
    await page.getByRole("button", { name: "신고 보내기" }).click();
    await expect(
      page.getByRole("heading", { name: "접수됐습니다" }),
    ).toBeVisible();
    // 작업자에게 안전사고 메뉴는 신고 화면이다.
    await page.goto("/incidents");
    await expect(page).toHaveURL(/\/incidents\/report$/);
    await expect(page.getByText("내가 신고한 사고")).toBeVisible();
    await expect(page.getByText("출하장 앞")).toBeVisible();

    await context.clearCookies();
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: await encode({
          token: { appUserId: manager, sub: manager },
          secret: "smbe-isolated-browser-test-secret-only",
          salt: "authjs.session-token",
        }),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
      },
    ]);

    // 관리자 홈의 처리할 일 허브에 작업자 신고가 올라와 있다.
    await page.goto("/");
    const hub = page.getByRole("region", { name: "처리할 일" });
    await expect(hub).toContainText("사고 뒤 할 일");
    await hub.getByRole("link", { name: /사고 뒤 할 일/ }).click();
    await expect(page).toHaveURL(/\/incidents$/);
    await expect(page.locator(".row-list")).toContainText("기타 아차사고");
    await page.getByRole("link", { name: /기타 아차사고/ }).click();
    await expect(page.locator(".wo-facts").first()).toContainText("작업자 신고");
    await page.goto("/incidents");
    await page.getByRole("link", { name: "사고 등록" }).click();
    await expect(page).toHaveURL(/\/incidents\/new$/);

    // 무슨 일
    await page.getByRole("radio", { name: /재해 \(부상/ }).check();
    await page.getByLabel("발생일").fill("2026-09-20");
    await page.getByLabel("발생 시각").fill("10:30");
    await page
      .getByLabel("장소 선택")
      .selectOption({ label: "2공장 프레스실" });
    await page.getByLabel("상세 위치").fill("2호기 금형 교체 중");
    await page.getByRole("radio", { name: "끼임" }).check();
    await page
      .getByLabel("사고 내용")
      .fill("금형 교체 중 슬라이드가 내려와 오른손이 끼였다.");
    // 다친 사람 — 휴업 5일이면 보고 대상 (조사표 D+30)
    await page.getByLabel("구성원").selectOption({ label: "다친 작업자" });
    await page.getByLabel("다친 부위").fill("오른손 검지");
    await page.getByLabel("부상·질병", { exact: true }).fill("골절");
    await page.getByLabel("예상 휴업일 (일)").fill("5");
    await expect(page.getByText("이대로 저장하면 등급은")).toContainText(
      "보고 대상",
    );
    // 바로 한 조치 · 원인 · 대책
    await page.getByRole("checkbox", { name: /작업을 중지했다/ }).check();
    await page.getByLabel("응급조치·바로 한 일").fill("119 신고, 병원 이송");
    await page
      .getByLabel("원인")
      .fill("안전블록을 끼우지 않고 금형을 교체했다.");
    await page
      .getByLabel("대책")
      .fill("금형 교체 시 안전블록 삽입을 체크리스트에 넣는다.");
    await page.getByLabel("담당").selectOption({ label: "사고 관리자" });
    await page.getByLabel("기한").fill("2026-10-10");
    await page.getByRole("button", { name: "사고 등록" }).click();

    // 상세: 등급·할 일
    await expect(page).toHaveURL(/\/incidents\/[0-9a-f-]+$/);
    const url = page.url();
    await expect(
      page.getByRole("heading", { name: "끼임 재해" }),
    ).toBeVisible();
    const strip = page.locator(".stat-strip");
    await expect(strip).toContainText("보고 대상");
    await expect(strip).toContainText("처리 중");
    const duties = page.locator(".inc-duties");
    await expect(duties).toContainText("작업 중지 · 대피 · 위험요인 제거");
    await expect(duties).toContainText("산업재해조사표 제출");
    await expect(duties).toContainText("기한 10. 20."); // 발생일 + 30일
    await expect(duties).toContainText("경영책임자 확인");
    await expect(duties).not.toContainText("노동부 즉시 보고");
    await expect(page.locator(".inc-duty")).toHaveCount(6);
    // 남은 일이 있으면 종결 단추는 눌리지 않는다.
    await expect(page.getByRole("button", { name: "종결" })).toBeDisabled();

    // 할 일 하나 끝내기 — 증빙 메모와 함께.
    const first = page.locator(".inc-duty").first();
    await first.getByRole("button", { name: "끝내기" }).click();
    await first.getByLabel("증빙 메모").fill("10:35 라인 정지, 전원 차단.");
    await first.getByRole("button", { name: "끝냈습니다" }).click();
    await expect(first).toHaveClass(/is-done/);
    await expect(first).toContainText("10:35 라인 정지");
    await expect(strip).toContainText("5개");

    // 대책 완료 → "재발방지대책 이행" 할 일이 저절로 끝난다.
    const action = page.locator(".inc-card", { hasText: "대책 1" });
    await action.getByRole("button", { name: "완료 적기" }).click();
    await action.getByLabel("실제 조치 내용").fill("체크리스트에 항목 추가함.");
    await action.getByRole("button", { name: "완료했습니다" }).click();
    await expect(action).toHaveClass(/is-done/);
    await expect(
      page.locator(".inc-duty", { hasText: "재발방지대책 이행" }),
    ).toHaveClass(/is-done/);

    // 목록: 숫자와 행
    await page.goto("/incidents");
    await expect(page.locator(".asmt-tiles")).toContainText("1건");
    await expect(page.getByRole("link", { name: /끼임 재해/ })).toBeVisible();
    await expect(page.locator(".row-list")).toContainText("할 일 4");

    // 산업재해조사표: 무료면 안내, 유료면 우리 기록으로 채운 서식.
    await page.goto(url);
    await page.getByRole("link", { name: "산업재해조사표" }).click();
    await expect(page).toHaveURL(/\/survey$/);
    const sheet = page.locator(".survey-sheet");
    await expect(sheet).toContainText("사고 회사");
    await expect(sheet).toContainText("다친 작업자");
    await expect(sheet).toContainText("휴업 5일");
    await expect(sheet).toContainText("안전블록");
    await page.getByRole("button", { name: /조사표 인쇄/ }).click();
    await expect(
      page.getByText("유료 요금제에서 이용할 수 있습니다"),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("survey.png"),
      fullPage: true,
    });

    // 대응 절차: 기본 문안이 들어 있고 고칠 수 있다.
    await page.goto("/company/incident-manual");
    await expect(page.getByLabel("대응 절차")).toHaveValue(/작업 중지/);
    await page
      .getByLabel("대응 절차")
      .fill("1. 작업 중지\n2. 대피\n- 경영책임자: 010-0000-0000");
    await page.getByRole("button", { name: "대응 절차 저장" }).click();
    await expect(page.getByText("저장했습니다.")).toBeVisible();

    // 나머지 할 일 끝내고 종결
    await page.goto(url);
    for (let i = 0; i < 4; i++) {
      const row = page.locator(".inc-duty:not(.is-done)").first();
      await row.getByRole("button", { name: "끝내기" }).click();
      await row.getByLabel("증빙 메모").fill("처리함");
      await row.getByRole("button", { name: "끝냈습니다" }).click();
      await expect(page.locator(".inc-duty.is-done")).toHaveCount(3 + i);
    }
    await page.getByRole("button", { name: "종결" }).click();
    await page
      .locator("dialog.confirm-dialog")
      .getByRole("button", { name: "종결" })
      .click();
    await expect(strip).toContainText("종결");
    await expect(page.getByRole("link", { name: "고치기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 열기" })).toBeVisible();
    // 종결 뒤 편집 주소는 상세로 돌아온다.
    await page.goto(url + "/edit");
    await expect(page).toHaveURL(url);
    await expect(
      page.getByRole("heading", { name: "끼임 재해" }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("incident-detail.png"),
      fullPage: true,
    });
    await page.goto("/incidents");
    await expect(page.getByRole("link", { name: /끼임 재해/ })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("incident-list.png"),
      fullPage: true,
    });
  } finally {
    await pool.end();
  }
});
