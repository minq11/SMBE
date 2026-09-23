import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";

test("mobile pages fit narrow screens and navigation stays usable", async ({
  page,
  context,
}, info) => {
  test.skip(
    process.env.SMBE_ORDER_UI_TESTS !== "1" || info.project.name !== "mobile",
    "Uses isolated local DB and mobile viewport",
  );
  // 화면 11개 × 너비 3개를 한 번에 돈다. 기본 30초로는 모자란다.
  test.slow();
  const schema = process.env.SMBE_ORDER_UI_SCHEMA ?? "";
  if (!/^orders_ui_[a-f0-9]{32}$/.test(schema))
    throw new Error("Invalid test schema");
  const pool = new Pool({
    connectionString:
      "postgresql://postgres:smbe-test-only@127.0.0.1:55439/smbe_regression",
    options: "-c search_path=" + schema + ",public",
  });
  const user = randomUUID(),
    company = randomUUID();
  try {
    await pool.query(
      "INSERT INTO users(id,display_name) VALUES($1,'모바일 테스트 관리자')",
      [user],
    );
    await pool.query(
      `INSERT INTO companies(id,name,business_type,company_code,initial_employee_size_band,current_employee_size_band,active_headcount,business_start_date,expected_annual_revenue_manwon,created_by)
      VALUES($1,'모바일 화면 검증 회사','제조업',$2,'UNDER_5','UNDER_5',1,'2026-01-01',0,$3)`,
      [company, randomUUID(), user],
    );
    await pool.query(
      "INSERT INTO company_members(user_id,company_id,role,status,joined_via,snapshot_display_name) VALUES($1,$2,'MANAGER_SUPERVISOR','ACTIVE','DIRECT_JOIN','모바일 관리자')",
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
    const fits = async () => {
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll("main *, .topbar *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.width > 0 &&
              (r.right > innerWidth + 1 || r.left < -1) &&
              // .jump-nav: 좁은 화면에서 한 줄로 옆으로 미는 띠다.
              !el.closest(
                ".honeypot, [hidden], .wo-table-wrap, .tabs, .jump-nav",
              ) &&
              // 접힌 <details> 속은 그려지지 않는데도 크기가 잡힌다.
              !(el.closest("details:not([open])") && !el.closest("summary"))
            );
          })
          .slice(0, 8)
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            text: el.textContent?.slice(0, 60),
          })),
      );
      expect(overflow).toEqual([]);
      // 손가락으로 누르는 것은 40px 은 돼야 한다 (iOS 44pt, Android 48dp 권고).
      // 본문 속 글자 링크는 제외하고, 버튼·입력칸·카드형 링크만 본다.
      const small = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            [
              "main button",
              "main input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file])",
              "main select",
              "main textarea",
              "main a.btn-primary",
              "main a.btn-secondary",
              "main a.row",
              "main a.action-card",
              "main a.today-tile",
              "main .wo-tabs a",
              "main .wo-doc-tabs a",
              "main .wo-presets a",
              ".topbar button",
              ".topbar a",
            ].join(","),
          ),
        ]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            if (el.closest("[hidden], .honeypot, [inert]")) return false;
            // 접힌 <details> 속은 그려지지 않는데도 크기가 잡힌다.
            const closed = el.closest("details:not([open])");
            if (closed && !el.closest("summary")) return false;
            return r.height < 40 || r.width < 40;
          })
          .slice(0, 8)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              tag: el.tagName,
              cls: el.className,
              text: el.textContent?.slice(0, 40),
              size: `${Math.round(r.width)}x${Math.round(r.height)}`,
            };
          }),
      );
      expect(small).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
    };
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of [
        "/",
        "/board/notices",
        "/board/resources",
        "/company/members",
        "/work-orders",
        "/work-orders/new",
        "/standards/new",
        "/assessments",
        "/assessments/new",
        "/billing",
        "/inspections",
      ]) {
        await page.goto(route);
        await page.locator("h1").first().waitFor();
        await fits();
        if (route === "/standards/new" && width <= 390) {
          // 담당·예정일은 접혀 있다. 펴서 날짜 칸이 눌리지 않았는지 잰다.
          await page.locator(".risk-card-more summary").first().click();
          const dueDate = page.locator(".risk-card input[type=date]").first();
          expect((await dueDate.boundingBox())!.width).toBeGreaterThan(180);
          // 긴 폼의 저장 줄은 작업지시 작성과 같이 화면 아래에 붙어 있어야
          // 한다 — 맨 위에 있어도 저장 버튼이 보여야 다시 내려가지 않는다.
          const save = page.locator(".std-form-actions");
          const box = (await save.boundingBox())!;
          expect(box.y + box.height).toBeLessThanOrEqual(
            (await page.evaluate(() => innerHeight)) + 1,
          );
        }
        // "어떤 작업이 해당되나요?" 글 단추 → 시트로 뜨는 설명 (help-dialog.tsx).
        const help = page.locator(".help-dialog-trigger");
        if (await help.count()) {
          await help.first().click();
          const sheet = page.locator("dialog.help-dialog[open]");
          await expect(sheet).toBeVisible();
          await fits();
          await sheet.getByRole("button", { name: "확인" }).click();
          await expect(sheet).toHaveCount(0);
        }
        // 아래에 붙는 띠는 스크롤 중에 화면 바닥에 **정확히** 붙어 있어야 한다.
        // 본문(main)의 아래 padding 만큼 띄워지면 그 밑으로 내용이 지나간다.
        const barFlush = async () => {
          if (width > 390) return;
          const bar = page.locator(".wo-actions, .std-form-actions").first();
          // 폼이 화면보다 짧으면 띠는 제자리(내용 끝)에 있다. 스크롤될 때만 잰다.
          const scrollable = await page.evaluate(() => {
            const main = document.getElementById("main")!;
            return main.scrollHeight - main.clientHeight;
          });
          if (!(await bar.count()) || scrollable <= 100) return;
          await page.evaluate(() =>
            document.getElementById("main")?.scrollTo({ top: 80 }),
          );
          const box = (await bar.boundingBox())!;
          const viewportHeight = await page.evaluate(() => window.innerHeight);
          expect(
            Math.abs(box.y + box.height - viewportHeight),
          ).toBeLessThanOrEqual(1);
          await page.evaluate(() =>
            document.getElementById("main")?.scrollTo({ top: 0 }),
          );
        };
        await barFlush();
        // 키보드가 열린 동안(html[data-keyboard=open], viewport-height.tsx)
        // 아래 띠는 고정을 풀어야 한다. 헤드리스에는 키보드가 없으니 표시만 흉내낸다.
        {
          const bar = page.locator(".wo-actions, .std-form-actions").first();
          if (await bar.count()) {
            await page.evaluate(() => {
              document.documentElement.dataset.keyboard = "open";
            });
            expect(
              await bar.evaluate((el) => getComputedStyle(el).position),
            ).toBe("static");
            await page.evaluate(() => {
              delete document.documentElement.dataset.keyboard;
            });
          }
        }
        if (route === "/work-orders/new") {
          // 표준서가 없는 회사라 시작 방식을 먼저 고른다. 그러면 한 장 폼이
          // 다 펼쳐지고 구간 칩이 생긴다.
          await page.getByRole("button", { name: /표준서 없이 진행/ }).click();
          for (const label of [
            "위험성평가",
            "일정·인원",
            "체크리스트",
            "발급",
          ]) {
            await page.locator(".jump-nav a", { hasText: label }).click();
            await fits();
          }
          // 내려간 구간의 칩이 켜져 있다 (jump-nav.tsx).
          await expect(page.locator(".jump-nav a[aria-current]")).toHaveText(
            "발급",
          );
          // 펼쳐진 뒤에야 저장·발급 띠가 있다. 그 띠도 바닥에 붙어야 한다.
          await barFlush();
        }
        await page.screenshot({
          path: info.outputPath(`${width}-${route.replaceAll("/", "_")}.png`),
          fullPage: true,
        });
      }
      await page
        .getByRole("button", { name: "메뉴 열기", exact: true })
        .click();
      const drawer = page.getByRole("dialog", { name: "주 메뉴" });
      await expect(drawer).toBeVisible();
      await expect(
        drawer.getByRole("button", { name: /메뉴 닫기/ }),
      ).toBeFocused();
      // 서랍의 마지막 조작은 로그아웃이다 (상단바에서 서랍 아래로 옮겼다).
      await page.keyboard.press("Shift+Tab");
      await expect(
        drawer.getByRole("button", { name: "로그아웃", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "메뉴 열기", exact: true }),
      ).toBeFocused();
      await expect(page.locator("#mobile-navigation")).toHaveAttribute(
        "inert",
        "",
      );
    }
    await page.setViewportSize({ width: 640, height: 360 });
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "주 메뉴" });
    expect(
      await drawer.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    // 회사정보는 접힌 채로 열린다. 펴야 그 안의 화면으로 갈 수 있다.
    await drawer.getByRole("button", { name: "회사정보" }).click();
    await drawer.getByRole("link", { name: "이용·관리" }).click();
    await expect(page).toHaveURL(/billing/);
    await expect(page.locator("body")).not.toHaveClass(/sidebar-lock/);
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await page
      .getByRole("dialog", { name: "주 메뉴" })
      .getByRole("button", { name: "도움말" })
      .click();
    await expect(page.getByRole("dialog", { name: "주 메뉴" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally {
    await pool.end();
  }
});
