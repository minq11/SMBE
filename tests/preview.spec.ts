import { expect, test } from "@playwright/test";
test("contact honeypot silently succeeds without email credentials", async ({
  page,
}, testInfo) => {
  await page.goto("/contact");
  await page.screenshot({
    path: testInfo.outputPath("contact.png"),
    fullPage: true,
  });
  await page.getByLabel("이름", { exact: true }).fill("테스트");
  await page.getByLabel("이메일", { exact: true }).fill("test@example.com");
  await page.getByLabel("메시지", { exact: true }).fill("회귀 테스트 메시지");
  await page
    .locator('input[name="website"]')
    .evaluate((input: HTMLInputElement) => {
      input.value = "spam";
    });
  await page.getByRole("button", { name: "문의 보내기" }).click();
  await expect(
    page.getByRole("heading", { name: "문의가 접수됐어요" }),
  ).toBeVisible();
});

test("public screens carry the business footer and it fits a narrow phone", async ({
  page,
}, testInfo) => {
  // 사업자 표시(전자상거래법)는 로그인 전 화면 하단에만. 320px 에서도 옆으로 안 넘친다.
  await page.setViewportSize({ width: 320, height: 720 });
  for (const route of ["/", "/login", "/guide", "/terms", "/privacy"]) {
    await page.goto(route);
    const footer = page.locator(".site-footer");
    // 상호·대표는 늘 보이고, 나머지는 "사업자 정보" 를 펼쳐야 보인다.
    await expect(
      footer.getByText("상호 패밀리포차 · 대표 윤은희"),
    ).toBeVisible();
    await expect(footer.getByText("202-26-98342")).toBeHidden();
    await footer.getByText("사업자 정보", { exact: true }).click();
    await expect(footer.getByText("202-26-98342")).toBeVisible();
    await expect(footer).toContainText("2026-경기시흥-1007");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("public-footer.png") });
  // 로그인 화면이 가리키는 약관·처리방침이 실제 화면이다.
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "이용약관" })).toBeVisible();
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "개인정보 처리방침" }),
  ).toBeVisible();
  await expect(page.getByText("개인정보 보호책임자")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("privacy.png"),
    fullPage: true,
  });
});

test("anonymous membership and invite pages require login", async ({
  page,
}) => {
  await page.goto("/company/members");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/invite/unused-test-token");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/work-orders");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/work-orders/new");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/inspections");
  await expect(page).toHaveURL(/\/login/);
});

/** 하단(사업자 표시)의 윗선이 첫 화면 바닥 아래이고, 하단 밑에는 더 없다. */
async function footerBelowFold(page: import("@playwright/test").Page) {
  const box = await page.locator("main").evaluate((main) => {
    const footer = main.querySelector(".site-footer") as HTMLElement;
    const top =
      footer.getBoundingClientRect().top -
      main.getBoundingClientRect().top +
      main.scrollTop;
    return {
      clientHeight: main.clientHeight,
      scrollHeight: main.scrollHeight,
      footerTop: top,
      footerHeight: footer.getBoundingClientRect().height,
    };
  });
  expect(box.footerTop).toBeGreaterThanOrEqual(box.clientHeight - 1);
  // 하단 밑에 남는 것은 여백 한 자(16px)뿐.
  expect(
    box.scrollHeight - box.footerTop - box.footerHeight,
  ).toBeLessThanOrEqual(24);
}

test("preview renders without secrets and only shows preparation dialogs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "심플안전 해야합니다." }),
  ).toBeVisible();
  // 로그인 전 화면에는 가짜 데이터를 두지 않는다. 실제로 하는 일과 시작 경로만 있다.
  // 상단바에도 같은 이름의 링크가 있어 본문으로 좁힌다.
  // 같은 이름의 단추가 머리와 맨 아래 FAQ 끝에 하나씩 — 머리 것부터.
  await expect(
    page.locator("#main").getByRole("link", { name: /무료로 시작/ }).first(),
  ).toHaveAttribute("href", "/login");
  await expect(
    page.getByRole("link", { name: /우리회사 안전수준 진단/ }),
  ).toHaveAttribute("href", "/recognition-check");
  // 로그인 전 홈도 한 화면에 들어간다 — 사업자 표시 하단(법정)은 첫 화면 밖에서
  // 시작하고, 그 밑에는 아무것도 없다.
  if (test.info().project.name === "mobile") await footerBelowFold(page);
  await expect(
    page.getByRole("heading", { name: /‘시작 요금’ 없는/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /‘앱 설치’ 없는/ }),
  ).toBeVisible();
  // 요금 안내 줄은 없앴다 — 이유 넷이 화면을 채운다. 한 줄 설명과 혜택 칩은
  // 카드에 늘 보이고, 자세한 설명은 카드를 누르면 창으로 뜬다.
  await expect(page.getByText("요금·도입 문의")).toHaveCount(0);
  await expect(page.getByText("인원 제한 없이 무료.")).toBeVisible();
  // 혜택 칩은 문구 개편(9-23)으로 빠졌다. 한 줄 설명이 카드에 보이면 된다.
  await expect(
    page.getByText("중처법/산안법 요구사항 대비", { exact: false }),
  ).toBeVisible();
  const dialog = page.locator("dialog.reason-dialog");
  const firstDetail = page.getByText("문의·협의 없이 가입 즉시", {
    exact: false,
  });
  await expect(firstDetail).toBeHidden();
  await page.getByRole("button", { name: /‘시작 요금’ 없는/ }).click();
  await expect(dialog).toBeVisible();
  await expect(firstDetail).toBeVisible();
  // 창 안의 확인 단추로 닫힌다.
  await dialog.getByRole("button", { name: "확인" }).click();
  await expect(dialog).toBeHidden();
  await expect(firstDetail).toBeHidden();
  // 여전히 한 화면 — 창이 카드 배치를 밀어내지 않는다.
  if (test.info().project.name === "mobile") await footerBelowFold(page);
  // 첫 화면 밑: 대표 업무 4단계(미리보기 왼쪽·오른쪽 번갈아) → 법 대응 표 → 요금 →
  // FAQ 6개. 좁은 화면에서는 패널 하나가 한 화면이고, 내리면 떠오른다(AOS).
  const panels = page.locator(".public-panel");
  await expect(panels).toHaveCount(7);
  await expect(page.locator(".public-step[data-side='left']")).toHaveCount(2);
  await expect(page.locator(".public-step[data-side='right']")).toHaveCount(2);
  if (test.info().project.name === "mobile") {
    const main = page.locator("main");
    const clientHeight = await main.evaluate((m) => m.clientHeight);
    const heights = await panels.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).offsetHeight),
    );
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(clientHeight - 1);
  }
  const shot = panels.nth(0).locator(".public-step-shot");
  await shot.scrollIntoViewIfNeeded();
  await expect(shot).toHaveClass(/aos-animate/);
  await expect(shot).toContainText("예시 화면");
  for (let i = 0; i < 7; i++) {
    await panels.nth(i).scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.screenshot({
      path: test.info().outputPath(`public-panel-${i + 1}.png`),
    });
  }
  await expect(page.locator(".public-law")).toContainText("산안법 54조 · 57조");
  await expect(page.locator(".public-price")).toContainText("33,000");
  await expect(page.locator(".public-price")).toContainText("인원 제한 없음");
  const faq = page.locator(".public-faq");
  await expect(faq).toHaveCount(6);
  await faq.first().locator("summary").click();
  await expect(faq.first()).toHaveAttribute("open", "");
  await expect(faq.first()).toContainText("앱처럼 씁니다");
  // 하단은 여전히 맨 끝, 그 밑에는 여백뿐.
  if (test.info().project.name === "mobile") await footerBelowFold(page);
  await page.evaluate(() => {
    document.querySelector("main")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  });
  for (const fake of [
    "오늘의 작업 (예시)",
    "오늘 처리할 일",
    "제1공장 프레스 설비 점검",
    "김민수",
  ])
    await expect(page.getByText(fake, { exact: false })).toHaveCount(0);
  // 알림은 로그인 전에는 없다.
  await expect(page.getByRole("button", { name: "알림" })).toHaveCount(0);
  // 사이드바의 메뉴는 모두 실제 화면이다 — "준비 중" 창이 남은 항목은 없다.
  // 좁은 화면은 서랍을 먼저 연다.
  if (test.info().project.name === "mobile") {
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  }
  await expect(
    page.getByRole("link", { name: "안전사고", exact: true }),
  ).toHaveAttribute("href", "/incidents");
  if (test.info().project.name === "mobile") {
    await page.locator(".sidebar-close").click();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("health is public; readiness and nonexistent business endpoints are closed", async ({
  request,
}) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/api/health/ready")).status()).toBe(401);
  expect(
    (
      await request.get("/api/health/ready", {
        headers: { authorization: "Bearer invalid" },
      })
    ).status(),
  ).toBe(401);
  expect((await request.post("/api/work-orders", { data: {} })).status()).toBe(
    404,
  );
});
