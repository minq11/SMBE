import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";

test("board: manager writes and publishes a notice; popup shows on home and hides for today", async ({
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
  const user = randomUUID(),
    company = randomUUID();
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES($1,'자료실 관리자')",
      [user],
    );
    await pool.query(
      `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by)
      VALUES($1,'자료실 회사','제조업',$2,'UNDER_5','UNDER_5',1,'2026-01-01',0,$3)`,
      [company, randomUUID(), user],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$2,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','관리자')",
      [user, company],
    );
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: await encode({
          token: { appUserId: user, sub: user },
          secret: "smbe-isolated-browser-test-secret-only",
          salt: "authjs.session-token",
        }),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
      },
    ]);
    await page.goto("/board/notices");
    await page.getByRole("button", { name: "글쓰기" }).click();
    await expect(page).toHaveURL(/\/board\/notices\/[0-9a-f-]+\/edit/);
    await page
      .getByLabel("제목", { exact: true })
      .fill("10월 정기 안전점검 일정");
    await page.getByLabel("본문", { exact: true }).click();
    await page.keyboard.type("10월 5일(월) 오전 9시, 전 라인 정기 점검입니다.");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "글머리 목록" }).click();
    await page.keyboard.type("보호구 착용");
    await page.keyboard.press("Enter");
    await page.keyboard.type("작업 전 TBM 필수");
    await page.getByLabel("구성원이 들어올 때 창으로 띄우기").check();
    await page.getByRole("button", { name: "발행" }).click();
    await expect(page).toHaveURL(/\/board\/notices\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { name: "10월 정기 안전점검 일정" }),
    ).toBeVisible();
    await expect(page.getByText("작업 전 TBM 필수")).toBeVisible();
    // 고치기 → 저장은 글 화면으로 돌아온다.
    await page.getByRole("link", { name: "고치기" }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await page
      .getByLabel("제목", { exact: true })
      .fill("10월 정기 안전점검 일정 (변경)");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page).toHaveURL(/\/board\/notices\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { name: "10월 정기 안전점검 일정 (변경)" }),
    ).toBeVisible();
    await page.goto("/board/notices");
    await expect(
      page.getByText("10월 정기 안전점검 일정 (변경)"),
    ).toBeVisible();
    // 홈에서 팝업
    await page.goto("/");
    const popup = page.locator("dialog.notice-popup");
    await expect(popup).toBeVisible();
    await expect(popup.getByText("보호구 착용")).toBeVisible();
    await popup.getByRole("button", { name: "오늘 하루 안 보기" }).click();
    // 같은 실행의 다른 시험이 올린 안전소식(모든 회사에 뜬다)이 뒤에 올 수 있다.
    // 이 공지는 다시 안 보이면 된다.
    await expect(popup.getByText("보호구 착용")).toHaveCount(0);
    await dismissPopups(page);
    await page.reload();
    await expect(
      page.locator("dialog.notice-popup").getByText("보호구 착용"),
    ).toHaveCount(0);
    await dismissPopups(page);
    // 홈의 공지사항 칸에 최신 글, 전체 보기는 게시판으로.
    const homeNotices = page.getByRole("region", { name: "공지사항" });
    await expect(homeNotices).toContainText("10월 정기 안전점검 일정 (변경)");
    await expect(
      homeNotices.getByRole("link", { name: /전체 보기/ }),
    ).toHaveAttribute("href", "/board/notices");
  } finally {
    await pool.end();
  }
});

/** 남은 팝업(안전소식 등)을 모두 닫는다. */
async function dismissPopups(page: import("@playwright/test").Page) {
  const popup = page.locator("dialog.notice-popup");
  for (let i = 0; i < 6 && (await popup.isVisible()); i++)
    await popup.getByRole("button", { name: "닫기" }).click();
  await expect(popup).toBeHidden();
}

test("board: operator publishes safety news that every company reads on home and as a popup", async ({
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
  const operator = randomUUID(),
    reader = randomUUID(),
    ownCompany = randomUUID(),
    otherCompany = randomUUID();
  const login = async (userId: string, email?: string) => {
    await context.clearCookies();
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: await encode({
          token: { appUserId: userId, sub: userId, email },
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
    for (const [id, name] of [
      [operator, "심플안전 운영자"],
      [reader, "다른 회사 관리자"],
    ])
      await pool.query("INSERT INTO users(id,display_name) VALUES($1,$2)", [
        id,
        name,
      ]);
    for (const [id, name, owner] of [
      [ownCompany, "운영사", operator],
      [otherCompany, "고객사", reader],
    ]) {
      await pool.query(
        `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by)
        VALUES($1,$2,'제조업',$3,'UNDER_5','UNDER_5',1,'2026-01-01',0,$4)`,
        [id, name, randomUUID(), owner],
      );
      await pool.query(
        "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$2,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN',$3)",
        [owner, id, name],
      );
    }

    // 운영자(SMBE_OPERATOR_EMAILS)만 글쓰기 단추가 있다. 흐름은 공지사항과 같다.
    await login(operator, "operator@test.local");
    await page.goto("/board/news");
    await page.getByRole("button", { name: "글쓰기" }).click();
    await expect(page).toHaveURL(/\/board\/news\/[0-9a-f-]+\/edit/);
    await page
      .getByLabel("제목", { exact: true })
      .fill("지게차 후진 사고, 이렇게 막습니다");
    await page.getByLabel("본문", { exact: true }).click();
    await page.keyboard.type("후진 경보기와 후방 카메라를 매일 확인하세요.");
    await page.getByLabel("구성원이 들어올 때 창으로 띄우기").check();
    await page.getByRole("button", { name: "발행" }).click();
    await expect(page).toHaveURL(/\/board\/news\/[0-9a-f-]+$/);
    const postUrl = page.url();
    await expect(
      page.getByRole("heading", { name: "지게차 후진 사고, 이렇게 막습니다" }),
    ).toBeVisible();
    // 작성자는 사람 이름이 아니라 심플안전.
    await expect(page.locator(".board-post-meta")).toContainText("심플안전");
    await expect(page.getByRole("link", { name: "고치기" })).toBeVisible();

    // 다른 회사의 관리자: 읽기만. 글쓰기·고치기 없음, 편집 화면은 없는 주소.
    await login(reader);
    await page.goto("/board/news");
    await expect(page.getByRole("button", { name: "글쓰기" })).toHaveCount(0);
    // 같은 제목이 다른 실행(데스크톱·모바일)에서도 올라온다 — 최신 것이 맨 위.
    await page
      .getByRole("link", { name: /지게차 후진 사고/ })
      .first()
      .click();
    await expect(page).toHaveURL(postUrl);
    await expect(page.getByText("후진 경보기와 후방 카메라")).toBeVisible();
    await expect(page.getByRole("link", { name: "고치기" })).toHaveCount(0);
    // 편집 화면은 없는 주소다 (loading 틀이 먼저 나가 상태 코드는 200).
    await page.goto(postUrl + "/edit");
    await expect(
      page.getByRole("heading", { name: "아직 준비되지 않은 페이지예요." }),
    ).toBeVisible();
    await expect(page.getByLabel("제목", { exact: true })).toHaveCount(0);

    // 홈: 안전소식 칸에 보이고, 팝업으로도 뜬다. 우리 회사 공지는 아직 없다.
    await page.goto("/");
    const popup = page.locator("dialog.notice-popup");
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("오늘의 안전소식");
    await expect(
      popup.getByRole("link", { name: "소식 화면에서 보기" }),
    ).toHaveAttribute("href", new URL(postUrl).pathname);
    await dismissPopups(page);
    const news = page.getByRole("region", { name: "오늘의 안전소식" });
    await expect(news).toContainText("지게차 후진 사고, 이렇게 막습니다");
    await expect(news.getByRole("link", { name: /전체 보기/ })).toHaveAttribute(
      "href",
      "/board/news",
    );
    await expect(page.getByRole("region", { name: "공지사항" })).toContainText(
      "아직 올라온 공지가 없습니다.",
    );
    await page.screenshot({
      path: test.info().outputPath("home-boards.png"),
      fullPage: true,
    });
  } finally {
    await pool.end();
  }
});
